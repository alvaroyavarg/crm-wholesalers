"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const TIPOS = ["estrategia", "politica"] as const;

export async function guardarConocimiento(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "estrategia");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const contenido = String(formData.get("contenido") ?? "").trim();

  if (!titulo || !contenido) {
    throw new Error("Falta el título o el contenido.");
  }
  const tipoValido = TIPOS.includes(tipo as (typeof TIPOS)[number])
    ? tipo
    : "estrategia";

  const supabase = await createClient();
  const fila = {
    tipo: tipoValido,
    titulo,
    contenido,
    actualizado_at: new Date().toISOString(),
  };

  const { error } = id
    ? await supabase.from("conocimiento").update(fila).eq("id", id)
    : await supabase.from("conocimiento").insert(fila);
  if (error) throw new Error(`guardarConocimiento: ${error.message}`);

  revalidatePath("/estrategia");
}

export async function eliminarConocimiento(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("conocimiento").delete().eq("id", id);
  if (error) throw new Error(`eliminarConocimiento: ${error.message}`);

  revalidatePath("/estrategia");
}
