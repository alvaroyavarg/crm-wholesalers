"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  const { error } = await supabase.from("notas").insert({
    cliente_id: input.clienteId,
    tipo,
    contenido_raw: contenido,
    creado_por_agente: false,
    // contenido_estructurado: lo completa el agente en la Fase 3
  });
  if (error) throw new Error(`crearNota: ${error.message}`);

  revalidatePath("/");
  revalidatePath(`/clientes/${input.clienteId}`);
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

export async function subirBoletin(formData: FormData) {
  const titulo = String(formData.get("titulo") ?? "").trim();
  const origen = String(formData.get("origen") ?? "KOA");
  const vigenteDesde = String(formData.get("vigente_desde") ?? "");
  const vigenteHasta = String(formData.get("vigente_hasta") ?? "");
  const archivo = formData.get("archivo");

  if (!titulo || !vigenteDesde || !vigenteHasta) {
    throw new Error("Faltan título o fechas de vigencia");
  }

  let rutaArchivo: string | null = null;
  if (archivo instanceof File && archivo.size > 0) {
    const extension = archivo.name.split(".").pop()?.toLowerCase() ?? "pdf";
    rutaArchivo = `${crypto.randomUUID()}.${extension}`;
    const admin = createAdminClient();
    const { error: errSubida } = await admin.storage
      .from("boletines")
      .upload(rutaArchivo, archivo, {
        contentType: archivo.type || "application/octet-stream",
      });
    if (errSubida) throw new Error(`subirBoletin (storage): ${errSubida.message}`);
  }

  const supabase = await createClient();
  const { data: nuevo, error } = await supabase
    .from("boletines")
    .insert({
      titulo,
      origen,
      fecha_publicacion: new Date().toISOString().slice(0, 10),
      vigente_desde: vigenteDesde,
      vigente_hasta: vigenteHasta,
      archivo_url: rutaArchivo,
    })
    .select("id")
    .single();
  if (error) throw new Error(`subirBoletin: ${error.message}`);

  // Análisis automático con Haiku (best-effort: si falla, el boletín queda
  // guardado igual y se puede re-analizar desde el botón).
  if (rutaArchivo && nuevo) {
    try {
      await ejecutarAnalisisBoletin(nuevo.id as string);
    } catch (e) {
      console.error("análisis automático falló:", e);
    }
  }

  revalidatePath("/boletines");
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
