"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { aFiscal, etiquetaMesCalendario } from "@/lib/fiscal";
import { FACTOR_UC_EU } from "@/lib/importar/unidades";
import type { DetalleMetaItem, EstadoPedido, EstadoRecomendacion, Nota, Pedido, PropuestaSku } from "@/lib/types";

// Acciones del panel lateral de cliente en /meta: historia por SKU,
// recomendación de SKU del copiloto, bitácora y pedidos ingresados a mano.

interface Periodo {
  fy: number;
  periodo: number;
}

async function requerirSesion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada. Vuelve a ingresar.");
  return supabase;
}

// ---- Carga inicial del panel ----
export async function cargarPanelCliente(input: {
  clienteId: string;
  fyMeta: number;
  periodoMeta: number;
  periodos: { a: Periodo; b: Periodo; c: Periodo; d: Periodo };
}) {
  const supabase = await requerirSesion();
  const { clienteId, fyMeta, periodoMeta, periodos: p } = input;

  const [detRes, notasRes, pedRes, convRes, perfilRes, recRes] = await Promise.all([
    supabase.rpc("detalle_meta_cliente", {
      p_cliente: clienteId,
      p_fy_a: p.a.fy, p_periodo_a: p.a.periodo,
      p_fy_b: p.b.fy, p_periodo_b: p.b.periodo,
      p_fy_c: p.c.fy, p_periodo_c: p.c.periodo,
      p_fy_d: p.d.fy, p_periodo_d: p.d.periodo,
      p_fy_meta: fyMeta, p_periodo_meta: periodoMeta,
    }),
    supabase
      .from("notas")
      .select("id, cliente_id, fecha, tipo, contenido_raw, contenido_estructurado, creado_por_agente, vence, cerrada_at")
      .eq("cliente_id", clienteId)
      .order("fecha", { ascending: false })
      .limit(40),
    supabase
      .from("pedidos")
      .select("*")
      .eq("cliente_id", clienteId)
      .eq("anio_fiscal", fyMeta)
      .eq("periodo", periodoMeta)
      .order("fecha", { ascending: false }),
    supabase
      .from("conversaciones")
      .select("id, mensajes")
      .eq("cliente_id", clienteId)
      .order("actualizada_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("perfiles")
      .select("decisor, estilo_negociacion, frecuencia_compra, resumen")
      .eq("cliente_id", clienteId)
      .maybeSingle(),
    supabase
      .from("recomendaciones")
      .select("id, texto, evidencia, estado, eus_propuestos, eus_final, feedback, creada_at")
      .eq("cliente_id", clienteId)
      .order("creada_at", { ascending: false })
      .limit(40),
  ]);
  if (detRes.error) throw new Error(`detalle_meta_cliente: ${detRes.error.message}`);

  const { propuestas, resumenPropuesta } = propuestasDesdeFilas(recRes.data ?? [], fyMeta, periodoMeta);

  return {
    detalle: (detRes.data ?? []) as DetalleMetaItem[],
    notas: (notasRes.data ?? []) as Nota[],
    pedidos: (pedRes.data ?? []) as Pedido[],
    conversacion: convRes.data
      ? { id: convRes.data.id as string, mensajes: (convRes.data.mensajes ?? []) as { role: "user" | "assistant"; content: string }[] }
      : null,
    perfil: perfilRes.data ?? null,
    propuestas,
    resumenPropuesta,
  };
}

interface FilaReco {
  id: string;
  texto: string;
  evidencia: unknown;
  estado: EstadoRecomendacion;
  eus_propuestos: number | null;
  eus_final: number | null;
  feedback: string | null;
}
interface EvidenciaMetaSku {
  tipo: string;
  detalle: string;
  propuesta?: { marca: string; formato: string; eus: number; motivo: string; evidencia: PropuestaSku["evidencia"]; fy: number; periodo: number; lote: string; resumen?: string };
}

// Propuestas de SKU del mes objetivo: filas de recomendaciones con evidencia
// 'meta_sku'. Se muestra el último lote generado (todas sus filas, con estado).
function propuestasDesdeFilas(filas: FilaReco[], fyMeta: number, periodoMeta: number) {
  const todas: (PropuestaSku & { lote: string; resumen?: string })[] = [];
  for (const r of filas) {
    const ev = Array.isArray(r.evidencia) ? (r.evidencia as EvidenciaMetaSku[]) : [];
    const meta = ev.find((e) => e.tipo === "meta_sku" && e.propuesta);
    const p = meta?.propuesta;
    if (!p || p.fy !== fyMeta || p.periodo !== periodoMeta) continue;
    todas.push({
      id: r.id,
      marca: p.marca,
      formato: p.formato,
      eus: Number(r.eus_propuestos ?? p.eus),
      motivo: p.motivo,
      evidencia: p.evidencia,
      estado: r.estado,
      eus_final: r.eus_final,
      feedback: r.feedback,
      lote: p.lote,
      resumen: p.resumen,
    });
  }
  if (todas.length === 0) return { propuestas: [] as PropuestaSku[], resumenPropuesta: "" };
  const lote = todas[0].lote; // filas vienen ordenadas por creada_at desc
  const delLote = todas.filter((t) => t.lote === lote).reverse();
  return {
    propuestas: delLote.map(({ lote: _l, resumen: _r, ...p }) => p),
    resumenPropuesta: delLote.find((t) => t.resumen)?.resumen ?? "",
  };
}

// ---- Copiloto: qué SKU ofrecer este mes ----
// Corre el agente con un prompt de planificación y exige un JSON al final.
// La propuesta se guarda como recomendación (estado nueva) para que quede en
// la ficha y en el feed, con las propuestas dentro de la evidencia.
export async function recomendarSkusMeta(input: { clienteId: string; fyMeta: number; periodoMeta: number }) {
  // Next oculta el mensaje de los errores lanzados por acciones en
  // producción; acá se devuelven como texto para que el panel los muestre.
  try {
    return await recomendarSkusMetaInterno(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("recomendarSkusMeta:", e);
    return { ok: false as const, error: `No se pudo generar la propuesta: ${msg}`, texto: "" };
  }
}

async function recomendarSkusMetaInterno(input: { clienteId: string; fyMeta: number; periodoMeta: number }) {
  const supabase = await requerirSesion();
  const { clienteId, fyMeta, periodoMeta } = input;

  const { data: cli } = await supabase
    .from("clientes")
    .select("nombre, nombre_corto, bottler")
    .eq("id", clienteId)
    .single();
  const nombre = cli?.nombre_corto ?? cli?.nombre ?? "el cliente";
  const mes = etiquetaMesCalendario(fyMeta, periodoMeta);

  const { correrAgente } = await import("@/lib/agente/loop");
  const resultado = await correrAgente(supabase, [
    {
      role: "user",
      content:
        `Estamos armando la meta de ${mes} para ${nombre} (id: ${clienteId}, bottler ${cli?.bottler ?? "?"}). ` +
        `En UN solo paso llama a las cuatro herramientas a la vez: get_historia_sku_meta (fy_meta=${fyMeta}, periodo_meta=${periodoMeta}), ` +
        `get_boletines_vigentes (usa SOLO los de su bottler), get_notas_cliente y get_perfil_cliente. No hagas más llamadas después. ` +
        `Propón entre 3 y 6 SKU para ir a ofrecer este mes, cada uno con un volumen sugerido en EUs y un motivo corto y concreto. ` +
        `REGLAS PARA EL VOLUMEN: (1) Mira la historia completa del FY anterior de cada SKU (campo historia), no solo los últimos 3 meses: ` +
        `el poder de compra de un SKU es su total del FY anterior, su mayor mes y su promedio por compra. ` +
        `(2) Muchos clientes compran un SKU en ciclos (cada 2-4 meses): un mes en cero NO es abandono ni riesgo de stock; usa cadencia_meses y ` +
        `meses_desde_ultima_compra para decidir si este mes toca reponer, y si toca, propone cerca del promedio por compra o del mayor mes. ` +
        `(3) No bajes la meta de un SKU por debajo de su promedio por compra del FY anterior sin un motivo explícito (compra fuerte hace menos de 2 meses, rechazo o acuerdo anotado). ` +
        `(4) Prioriza: SKU con compras en el FY anterior y sin compra reciente cuando la cadencia indica reposición, SKU que caen, escalones de boletín alcanzables y compromisos de la bitácora. ` +
        `(5) En cada motivo cita cifras: veces que compró en el FY anterior, cuánto sumó, mayor mes, última compra. Máximo 220 caracteres por motivo. ` +
        `Usa EXACTAMENTE los nombres de marca y formato como aparecen en get_historia_sku_meta (o "" en formato si no aplica). ` +
        `NO uses crear_recomendacion ni guardar_nota. ` +
        `Responde SOLO con un bloque \`\`\`json con esta forma exacta: ` +
        `{"resumen": "máximo 2 frases y 280 caracteres con la lectura del cliente; SIN listar SKU aquí, eso va en propuestas", "propuestas": [{"marca": "", "formato": "", "eus": 0, "motivo": "", "evidencia": "ventas|boletin|memoria"}]}`,
    },
  ]);

  const parsed = extraerJson(resultado.texto);
  if (!parsed) {
    return { ok: false as const, error: "El copiloto no devolvió una propuesta legible. Intenta de nuevo.", texto: resultado.texto };
  }
  const propuestas: PropuestaSku[] = (parsed.propuestas ?? [])
    .filter((p) => p && typeof p.marca === "string" && p.marca.trim())
    .map((p) => ({
      marca: String(p.marca).trim(),
      formato: String(p.formato ?? "").trim(),
      eus: Math.max(0, Math.round(Number(p.eus) || 0)),
      motivo: String(p.motivo ?? "").trim(),
      evidencia: (["ventas", "boletin", "memoria"] as const).includes(p.evidencia as "ventas") ? (p.evidencia as PropuestaSku["evidencia"]) : "ventas",
    }));
  const resumen = acortarResumen(String(parsed.resumen ?? ""));

  // Una fila por SKU para que cada una se pueda aceptar / modificar / rechazar
  // con feedback. El lote agrupa las propuestas de una misma corrida.
  const lote = `${Date.now()}`;
  const conId: PropuestaSku[] = [];
  for (const [i, p] of propuestas.entries()) {
    const { data } = await supabase
      .from("recomendaciones")
      .insert({
        cliente_id: clienteId,
        texto: `Meta ${mes} · ${p.marca}${p.formato ? ` ${p.formato}` : ""}: ${p.eus} EUs — ${p.motivo}`,
        evidencia: [
          { tipo: p.evidencia, detalle: p.motivo },
          { tipo: "meta_sku", detalle: `Propuesta de SKU para ${mes}`, propuesta: { ...p, fy: fyMeta, periodo: periodoMeta, lote, resumen: i === 0 ? resumen : undefined } },
        ],
        estado: "nueva",
        eus_propuestos: p.eus,
      })
      .select("id")
      .single();
    conId.push({ ...p, id: (data?.id as string | undefined) ?? undefined, estado: "nueva" });
  }
  if (conId.length > 0) {
    revalidatePath(`/clientes/${clienteId}`);
    revalidatePath("/copiloto");
  }

  return { ok: true as const, resumen, propuestas: conId, texto: resultado.texto };
}

// El modelo a veces mete la lista de SKU dentro del resumen: se corta en el
// primer bullet y se limita a ~2 frases para que el panel quede legible.
function acortarResumen(texto: string): string {
  let t = texto.replace(/\s+/g, " ").trim();
  const bullet = t.search(/\s[•\-–]\s/);
  if (bullet > 40) t = t.slice(0, bullet).trim();
  if (t.length > 320) {
    const corte = t.slice(0, 320).lastIndexOf(". ");
    t = (corte > 120 ? t.slice(0, corte + 1) : t.slice(0, 317) + "…").trim();
  }
  return t;
}

function extraerJson(texto: string): { resumen?: string; propuestas?: Partial<PropuestaSku>[] } | null {
  const bloque = texto.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? texto.match(/```\s*([\s\S]*?)```/)?.[1];
  const candidatos = [bloque, texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1)].filter(
    (c): c is string => !!c && c.trim().startsWith("{"),
  );
  for (const c of candidatos) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj === "object") return obj;
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

// ---- Propuestas de SKU: aceptar / modificar / rechazar / feedback ----
// aceptar y modificar escriben la meta por SKU (plan_ventas_sku) y
// recalculan la meta total; rechazar solo marca la fila. El feedback y el
// volumen final quedan en la fila y alimentan el system prompt del copiloto.
export async function resolverPropuesta(input: {
  id: string;
  clienteId: string;
  fyMeta: number;
  periodoMeta: number;
  marca: string;
  formato: string;
  accion: "aceptar" | "modificar" | "rechazar";
  eus?: number; // para aceptar / modificar
  feedback?: string;
}) {
  const supabase = await requerirSesion();
  const feedback = (input.feedback ?? "").trim() || null;
  let total: number | null = null;

  if (input.accion === "rechazar") {
    const { error } = await supabase
      .from("recomendaciones")
      .update({ estado: "descartada", motivo_descarte: feedback ?? "Rechazada desde el panel de Meta", feedback, resuelta_at: new Date().toISOString() })
      .eq("id", input.id);
    if (error) throw new Error(`resolverPropuesta: ${error.message}`);
  } else {
    const eus = Math.round(Number(input.eus ?? 0));
    if (!Number.isFinite(eus) || eus < 0) throw new Error("Volumen inválido");
    const { guardarMetaSku } = await import("@/app/(app)/actions");
    total = await guardarMetaSku({ clienteId: input.clienteId, anioFiscal: input.fyMeta, periodo: input.periodoMeta, marca: input.marca, formato: input.formato, eus });
    const { error } = await supabase
      .from("recomendaciones")
      .update({ estado: "aceptada", eus_final: eus, feedback, resuelta_at: new Date().toISOString() })
      .eq("id", input.id);
    if (error) throw new Error(`resolverPropuesta: ${error.message}`);
  }
  revalidatePath("/copiloto");
  revalidatePath(`/clientes/${input.clienteId}`);
  return { total };
}

export async function guardarFeedbackPropuesta(id: string, feedback: string) {
  const supabase = await requerirSesion();
  const { error } = await supabase
    .from("recomendaciones")
    .update({ feedback: feedback.trim() || null })
    .eq("id", id);
  if (error) throw new Error(`guardarFeedbackPropuesta: ${error.message}`);
  revalidatePath("/copiloto");
}

// ---- Bitácora: cerrar / reabrir un compromiso ----
export async function cerrarCompromiso(notaId: string, cumplido: boolean) {
  const supabase = await requerirSesion();
  const { error } = await supabase
    .from("notas")
    .update({ cerrada_at: cumplido ? new Date().toISOString() : null })
    .eq("id", notaId);
  if (error) throw new Error(`cerrarCompromiso: ${error.message}`);
  revalidatePath("/meta");
}

// ---- Pedidos ----
export async function crearPedido(input: {
  clienteId: string;
  fecha: string; // YYYY-MM-DD
  bottler: string | null;
  marca: string;
  formato: string;
  cantidad: number;
  unidad: "UC" | "EU";
  estado: EstadoPedido;
  precioBotella: number | null; // CLP por botella (opcional)
  comentario: string;
}) {
  const supabase = await requerirSesion();
  const marca = input.marca.trim();
  if (!input.clienteId || !marca) throw new Error("Falta el cliente o el SKU del pedido");
  if (!Number.isFinite(input.cantidad) || input.cantidad <= 0) throw new Error("La cantidad debe ser mayor que 0");
  const precio = input.precioBotella != null && Number.isFinite(input.precioBotella) && input.precioBotella > 0 ? Math.round(input.precioBotella) : null;

  const [y, m, d] = input.fecha.split("-").map(Number);
  const fecha = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(fecha.getTime())) throw new Error("Fecha inválida");
  const { fy, periodo } = aFiscal(fecha);

  const uc = input.unidad === "UC" ? input.cantidad : input.cantidad / FACTOR_UC_EU;
  const eus = input.unidad === "EU" ? input.cantidad : input.cantidad * FACTOR_UC_EU;

  const { data, error } = await supabase
    .from("pedidos")
    .insert({
      cliente_id: input.clienteId,
      fecha: input.fecha,
      anio_fiscal: fy,
      periodo,
      bottler: input.bottler,
      marca,
      formato: input.formato.trim(),
      uc: Math.round(uc * 10) / 10,
      eus: Math.round(eus * 10) / 10,
      estado: input.estado,
      precio_botella: precio,
      comentario: input.comentario.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`crearPedido: ${error.message}`);
  revalidatePath("/mtd");
  revalidatePath("/meta");
  return data as Pedido;
}

export async function cambiarEstadoPedido(id: string, estado: EstadoPedido) {
  const supabase = await requerirSesion();
  const { error } = await supabase
    .from("pedidos")
    .update({ estado, actualizado_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`cambiarEstadoPedido: ${error.message}`);
  revalidatePath("/mtd");
}

export async function eliminarPedido(id: string) {
  const supabase = await requerirSesion();
  const { error } = await supabase.from("pedidos").delete().eq("id", id);
  if (error) throw new Error(`eliminarPedido: ${error.message}`);
  revalidatePath("/mtd");
}
