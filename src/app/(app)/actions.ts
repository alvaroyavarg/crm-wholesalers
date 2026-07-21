"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analizarBoletin as analizarBoletinIA } from "@/lib/boletines/analizar";

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
  if (!id || !["aceptada", "descartada"].includes(estado)) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("recomendaciones")
    .update({ estado })
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
