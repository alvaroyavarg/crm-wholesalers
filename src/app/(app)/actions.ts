"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analizarBoletin as analizarBoletinIA } from "@/lib/boletines/analizar";
import type { DetalleMetaItem } from "@/lib/types";

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Guarda los 12 períodos del plan de un cliente para un año fiscal.
export async function guardarPlan(
  clienteId: string,
  anioFiscal: number,
  valores: number[],
) {
  if (valores.length !== 12) throw new Error("Se esperan 12 períodos");

  const supabase = await createClient();
  const filas = valores.map((eus, i) => ({
    cliente_id: clienteId,
    anio_fiscal: anioFiscal,
    periodo: i + 1,
    eus_plan: Number.isFinite(eus) && eus >= 0 ? eus : 0,
    actualizado_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("plan_ventas")
    .upsert(filas, { onConflict: "cliente_id,anio_fiscal,periodo" });

  if (error) throw new Error(`guardarPlan: ${error.message}`);

  revalidatePath("/plan");
  revalidatePath("/");
}

// ---- Notas / visitas ----

const TIPOS_NOTA = ["visita", "llamada", "acuerdo", "rechazo", "nota"] as const;

export async function crearNota(input: {
  clienteId: string;
  tipo: string;
  contenido: string;
}) {
  const tipo = TIPOS_NOTA.includes(input.tipo as (typeof TIPOS_NOTA)[number])
    ? input.tipo
    : "nota";
  const contenido = input.contenido.trim();
  if (!input.clienteId || !contenido) {
    throw new Error("Falta el cliente o el contenido de la nota");
  }

  const supabase = await createClient();
  const { data: nueva, error } = await supabase
    .from("notas")
    .insert({
      cliente_id: input.clienteId,
      tipo,
      contenido_raw: contenido,
      creado_por_agente: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(`crearNota: ${error.message}`);

  // Post-proceso con Haiku DESPUÉS de responder: estructura la nota
  // (acuerdos/rechazos/próximos pasos) y actualiza el perfil si corresponde.
  if (nueva) {
    after(async () => {
      const { estructurarNota } = await import("@/lib/notas/estructurar");
      await estructurarNota(nueva.id as string).catch((e) =>
        console.error("estructurarNota:", e),
      );
    });
  }

  revalidatePath("/");
  revalidatePath(`/clientes/${input.clienteId}`);
}

// ---- Recomendaciones del copiloto ----

// Gatilla el análisis del copiloto para UNA cuenta desde su ficha:
// cruza ventas vs LY, pares, perfil, notas y boletines vigentes, y crea
// recomendaciones con evidencia. Devuelve un resumen corto.
export async function generarRecomendacionesCliente(clienteId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada. Vuelve a ingresar.");

  const { data: cli } = await supabase
    .from("clientes")
    .select("nombre, nombre_corto")
    .eq("id", clienteId)
    .single();
  const nombre = cli?.nombre_corto ?? cli?.nombre ?? "el cliente";

  const { correrAgente } = await import("@/lib/agente/loop");
  const resultado = await correrAgente(supabase, [
    {
      role: "user",
      content:
        `Analiza a ${nombre} (id: ${clienteId}): ventas vs LY, comparación con pares, perfil, notas y boletines vigentes. ` +
        `Crea hasta 3 recomendaciones concretas y accionables con crear_recomendacion (cada una con su evidencia). ` +
        `Si hay boletines vigentes, cruza las oportunidades con sus escalones y descuentos. ` +
        `Al final responde SOLO con un resumen de 2 a 3 líneas de lo que encontraste y creaste.`,
    },
  ]);

  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/copiloto");
  return { ok: true, resumen: resultado.texto };
}

export async function cambiarEstadoRecomendacion(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "");
  const clienteId = String(formData.get("cliente_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!id || !["aceptada", "descartada"].includes(estado)) return;

  const cambios: Record<string, unknown> = { estado };
  if (estado === "descartada" && motivo) cambios.motivo_descarte = motivo;

  const supabase = await createClient();
  const { error } = await supabase
    .from("recomendaciones")
    .update(cambios)
    .eq("id", id);
  if (error) throw new Error(`cambiarEstadoRecomendacion: ${error.message}`);

  revalidatePath("/copiloto");
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
}

// ---- Contactos claves ----

export async function agregarContacto(formData: FormData) {
  const clienteId = String(formData.get("cliente_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!clienteId || !nombre) return;

  const supabase = await createClient();
  const { error } = await supabase.from("contactos").insert({
    cliente_id: clienteId,
    nombre,
    cargo: String(formData.get("cargo") ?? "").trim() || null,
    correo: String(formData.get("correo") ?? "").trim() || null,
    telefono: String(formData.get("telefono") ?? "").trim() || null,
  });
  if (error) throw new Error(`agregarContacto: ${error.message}`);

  revalidatePath(`/clientes/${clienteId}`);
}

export async function eliminarContacto(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const clienteId = String(formData.get("cliente_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("contactos").delete().eq("id", id);
  if (error) throw new Error(`eliminarContacto: ${error.message}`);

  revalidatePath(`/clientes/${clienteId}`);
}

// ---- Boletines ----

// Paso 1: URL firmada para que el NAVEGADOR suba el archivo directo a Storage.
// (Pasarlo por el server action chocaba con el límite de 4,5 MB de Vercel.)
export async function prepararSubidaBoletin(nombreArchivo: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada. Vuelve a ingresar.");

  const extension = nombreArchivo.split(".").pop()?.toLowerCase() ?? "pdf";
  const ruta = `${crypto.randomUUID()}.${extension}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("boletines")
    .createSignedUploadUrl(ruta);
  if (error) throw new Error(`prepararSubida: ${error.message}`);

  return { ruta, token: data.token };
}

// Paso 2: registrar el boletín (el archivo ya está en Storage) y disparar el
// análisis con Haiku en segundo plano.
export async function registrarBoletin(input: {
  titulo: string;
  origen: string;
  vigenteDesde: string;
  vigenteHasta: string;
  rutaArchivo: string | null;
}) {
  const titulo = input.titulo.trim();
  if (!titulo || !input.vigenteDesde || !input.vigenteHasta) {
    throw new Error("Faltan título o fechas de vigencia");
  }

  const supabase = await createClient();
  const { data: nuevo, error } = await supabase
    .from("boletines")
    .insert({
      titulo,
      origen: input.origen === "KOE" ? "KOE" : "KOA",
      fecha_publicacion: new Date().toISOString().slice(0, 10),
      vigente_desde: input.vigenteDesde,
      vigente_hasta: input.vigenteHasta,
      archivo_url: input.rutaArchivo,
    })
    .select("id")
    .single();
  if (error) throw new Error(`registrarBoletin: ${error.message}`);

  // Análisis con IA DESPUÉS de responder (no bloquea el guardado)
  if (input.rutaArchivo && nuevo) {
    after(async () => {
      await ejecutarAnalisisBoletin(nuevo.id as string).catch((e) =>
        console.error("análisis automático falló:", e),
      );
    });
  }

  revalidatePath("/boletines");
  return { ok: true, analizando: Boolean(input.rutaArchivo) };
}

// Analiza (o re-analiza) un boletín ya guardado con Haiku.
export async function analizarBoletin(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await ejecutarAnalisisBoletin(id);
  revalidatePath("/boletines");
}

async function ejecutarAnalisisBoletin(id: string) {
  const admin = createAdminClient();
  const { data: bol, error } = await admin
    .from("boletines")
    .select("id, titulo, origen, archivo_url")
    .eq("id", id)
    .single();
  if (error || !bol) throw new Error(`boletín no encontrado: ${error?.message}`);
  if (!bol.archivo_url) throw new Error("El boletín no tiene archivo para analizar.");

  const { data: blob, error: errDl } = await admin.storage
    .from("boletines")
    .download(bol.archivo_url as string);
  if (errDl || !blob) throw new Error(`descarga: ${errDl?.message}`);

  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const ext = String(bol.archivo_url).split(".").pop()?.toLowerCase() ?? "";
  const esPdf = ext === "pdf";
  const mediaType =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/png";

  const analisis = await analizarBoletinIA(
    esPdf
      ? { tipo: "pdf", base64 }
      : { tipo: "imagen", base64, mediaType },
    { titulo: String(bol.titulo), origen: String(bol.origen) },
  );

  const update: Record<string, unknown> = {
    resumen_accionable: analisis.resumen_accionable,
    promociones: analisis.promociones,
    focos: analisis.focos,
    analizado_at: new Date().toISOString(),
  };
  // Solo pisar vigencias si el modelo detectó fechas válidas
  if (/^\d{4}-\d{2}-\d{2}$/.test(analisis.vigencia_desde))
    update.vigente_desde = analisis.vigencia_desde;
  if (/^\d{4}-\d{2}-\d{2}$/.test(analisis.vigencia_hasta))
    update.vigente_hasta = analisis.vigencia_hasta;

  const { error: errUp } = await admin
    .from("boletines")
    .update(update)
    .eq("id", id);
  if (errUp) throw new Error(`update boletín: ${errUp.message}`);
}

export async function eliminarBoletin(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const rutaArchivo = String(formData.get("archivo_url") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("boletines").delete().eq("id", id);
  if (error) throw new Error(`eliminarBoletin: ${error.message}`);

  if (rutaArchivo) {
    const admin = createAdminClient();
    await admin.storage.from("boletines").remove([rutaArchivo]);
  }

  revalidatePath("/boletines");
}

// ---- Meta del mes (edición rápida desde MTD) ----

// Edita un solo período del plan. `guardarPlan` reescribe los 12 de una vez;
// desde MTD se ajusta la meta del mes en curso sin tocar el resto del año.
export async function guardarMetaMes(formData: FormData) {
  const clienteId = String(formData.get("clienteId") ?? "");
  const anioFiscal = Number(formData.get("anioFiscal"));
  const periodo = Number(formData.get("periodo"));
  const eus = Number(String(formData.get("eus") ?? "").replace(",", "."));

  if (!clienteId) throw new Error("Falta el cliente");
  if (!Number.isInteger(anioFiscal)) throw new Error("Año fiscal inválido");
  if (!Number.isInteger(periodo) || periodo < 1 || periodo > 12) {
    throw new Error("Período inválido");
  }
  if (!Number.isFinite(eus) || eus < 0) throw new Error("Meta inválida");

  const supabase = await createClient();
  const { error } = await supabase.from("plan_ventas").upsert(
    {
      cliente_id: clienteId,
      anio_fiscal: anioFiscal,
      periodo,
      eus_plan: eus,
      actualizado_at: new Date().toISOString(),
    },
    { onConflict: "cliente_id,anio_fiscal,periodo" },
  );
  if (error) throw new Error(`guardarMetaMes: ${error.message}`);

  revalidatePath("/mtd");
  revalidatePath("/meta");
  revalidatePath("/plan");
  revalidatePath("/");
}

// ---- Detalle por SKU para la tabla de meta (drill-down) ----

export async function obtenerDetalleMeta(
  clienteId: string,
  fyA: number,
  periodoA: number,
  fyB: number,
  periodoB: number,
  fyC: number,
  periodoC: number,
  fyMeta: number,
  periodoMeta: number,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("detalle_meta_cliente", {
    p_cliente: clienteId,
    p_fy_a: fyA,
    p_periodo_a: periodoA,
    p_fy_b: fyB,
    p_periodo_b: periodoB,
    p_fy_c: fyC,
    p_periodo_c: periodoC,
    p_fy_meta: fyMeta,
    p_periodo_meta: periodoMeta,
  });
  if (error) throw new Error(`detalle_meta_cliente: ${error.message}`);
  return (data ?? []) as DetalleMetaItem[];
}

// ---- Meta por SKU ----
// Guarda la meta de un SKU y recalcula la meta total del cliente como la
// suma de sus SKUs (plan_ventas sigue siendo la fuente que leen el
// dashboard, MTD y Plan). Devuelve la nueva meta total.
export async function guardarMetaSku(input: {
  clienteId: string;
  anioFiscal: number;
  periodo: number;
  marca: string;
  formato: string;
  eus: number;
}) {
  const eus = Number.isFinite(input.eus) && input.eus > 0 ? input.eus : 0;
  const supabase = await createClient();

  if (eus === 0) {
    const { error } = await supabase
      .from("plan_ventas_sku")
      .delete()
      .match({
        cliente_id: input.clienteId,
        anio_fiscal: input.anioFiscal,
        periodo: input.periodo,
        marca: input.marca,
        formato: input.formato,
      });
    if (error) throw new Error(`plan_ventas_sku: ${error.message}`);
  } else {
    const { error } = await supabase.from("plan_ventas_sku").upsert(
      {
        cliente_id: input.clienteId,
        anio_fiscal: input.anioFiscal,
        periodo: input.periodo,
        marca: input.marca,
        formato: input.formato,
        eus_plan: eus,
        actualizado_at: new Date().toISOString(),
      },
      { onConflict: "cliente_id,anio_fiscal,periodo,marca,formato" },
    );
    if (error) throw new Error(`plan_ventas_sku: ${error.message}`);
  }

  const { data: filas, error: errSum } = await supabase
    .from("plan_ventas_sku")
    .select("eus_plan")
    .match({ cliente_id: input.clienteId, anio_fiscal: input.anioFiscal, periodo: input.periodo });
  if (errSum) throw new Error(`plan_ventas_sku: ${errSum.message}`);
  const total = (filas ?? []).reduce((s, f) => s + Number(f.eus_plan), 0);

  const { error: errPlan } = await supabase.from("plan_ventas").upsert(
    {
      cliente_id: input.clienteId,
      anio_fiscal: input.anioFiscal,
      periodo: input.periodo,
      eus_plan: total,
      actualizado_at: new Date().toISOString(),
    },
    { onConflict: "cliente_id,anio_fiscal,periodo" },
  );
  if (errPlan) throw new Error(`plan_ventas: ${errPlan.message}`);

  revalidatePath("/meta");
  revalidatePath("/mtd");
  revalidatePath("/plan");
  revalidatePath("/");
  return total;
}
