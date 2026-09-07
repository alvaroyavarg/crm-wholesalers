"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { aFiscal, etiquetaMesCalendario } from "@/lib/fiscal";
import { FACTOR_UC_EU } from "@/lib/importar/unidades";
import type { DetalleMetaItem, EstadoPedido, Nota, Pedido, PropuestaSku } from "@/lib/types";

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
      .select("id, texto, evidencia, creada_at")
      .eq("cliente_id", clienteId)
      .eq("estado", "nueva")
      .order("creada_at", { ascending: false })
      .limit(3),
  ]);
  if (detRes.error) throw new Error(`detalle_meta_cliente: ${detRes.error.message}`);

  // Última propuesta de SKU guardada (evidencia con tipo 'meta_sku')
  let propuestas: PropuestaSku[] = [];
  let resumenPropuesta = "";
  for (const r of recRes.data ?? []) {
    const ev = Array.isArray(r.evidencia) ? (r.evidencia as { tipo: string; detalle: string; propuestas?: PropuestaSku[] }[]) : [];
    const meta = ev.find((e) => e.tipo === "meta_sku" && Array.isArray(e.propuestas));
    if (meta?.propuestas) {
      propuestas = meta.propuestas;
      resumenPropuesta = r.texto;
      break;
    }
  }

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

// ---- Copiloto: qué SKU ofrecer este mes ----
// Corre el agente con un prompt de planificación y exige un JSON al final.
// La propuesta se guarda como recomendación (estado nueva) para que quede en
// la ficha y en el feed, con las propuestas dentro de la evidencia.
export async function recomendarSkusMeta(input: { clienteId: string; fyMeta: number; periodoMeta: number }) {
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
        `Primero llama a get_historia_sku_meta con fy_meta=${fyMeta} y periodo_meta=${periodoMeta}. ` +
        `Luego get_boletines_vigentes (usa SOLO los de su bottler), get_notas_cliente y get_perfil_cliente. ` +
        `Propón entre 3 y 6 SKU para ir a ofrecer este mes, cada uno con un volumen sugerido en EUs y un motivo corto y concreto ` +
        `(qué muestra su historia, si hay escalón vigente, si hay un compromiso anotado). Prioriza: SKU que compraba LY y dejó de comprar, ` +
        `SKU que caen, escalones de boletín alcanzables y compromisos de la bitácora. Respeta la regla de stock. ` +
        `Usa EXACTAMENTE los nombres de marca y formato como aparecen en get_historia_sku_meta (o "" en formato si no aplica). ` +
        `NO uses crear_recomendacion ni guardar_nota. ` +
        `Responde SOLO con un bloque \`\`\`json con esta forma exacta: ` +
        `{"resumen": "2 líneas con la lectura del cliente", "propuestas": [{"marca": "", "formato": "", "eus": 0, "motivo": "", "evidencia": "ventas|boletin|memoria"}]}`,
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
  const resumen = String(parsed.resumen ?? "").trim();

  if (propuestas.length > 0) {
    const lineas = propuestas.map((p) => `• ${p.marca}${p.formato ? ` ${p.formato}` : ""}: ${p.eus} EUs — ${p.motivo}`);
    await supabase.from("recomendaciones").insert({
      cliente_id: clienteId,
      texto: `Meta ${mes}: ${resumen}\n${lineas.join("\n")}`,
      evidencia: [
        { tipo: "ventas", detalle: `Historia por SKU M-3/M-2/M-1 y LY para ${mes}` },
        { tipo: "meta_sku", detalle: `Propuesta de SKU para ${mes}`, propuestas },
      ],
      estado: "nueva",
    });
    revalidatePath(`/clientes/${clienteId}`);
    revalidatePath("/copiloto");
  }

  return { ok: true as const, resumen, propuestas, texto: resultado.texto };
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
  comentario: string;
}) {
  const supabase = await requerirSesion();
  const marca = input.marca.trim();
  if (!input.clienteId || !marca) throw new Error("Falta el cliente o el SKU del pedido");
  if (!Number.isFinite(input.cantidad) || input.cantidad <= 0) throw new Error("La cantidad debe ser mayor que 0");

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
