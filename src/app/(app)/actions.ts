"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
