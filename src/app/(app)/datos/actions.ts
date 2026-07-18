"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fiscalActual } from "@/lib/fiscal";
import { importarBase, parsearBase } from "@/lib/importar/core";

export interface EstadoImport {
  ok: boolean;
  mensaje: string;
}

export async function importarVentasAction(
  _prev: EstadoImport,
  formData: FormData,
): Promise<EstadoImport> {
  // Solo usuarios autenticados pueden gatillar el import (la escritura usa service role)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensaje: "Sesión expirada. Vuelve a ingresar." };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: "Selecciona el archivo Excel de la base." };
  }
  const regenerarPlan = formData.get("regenerar_plan") === "on";

  try {
    const filas = parsearBase(await archivo.arrayBuffer());
    const admin = createAdminClient();
    const { fy } = fiscalActual();
    const r = await importarBase(admin, filas, {
      regenerarPlan,
      fyPlan: fy,
    });

    revalidatePath("/");
    revalidatePath("/plan");
    revalidatePath("/", "layout");

    return {
      ok: true,
      mensaje:
        `Importadas ${r.filasVentas.toLocaleString("es-CL")} filas de venta en ` +
        `${r.periodos.length} períodos (${r.periodos[0]} → ${r.periodos[r.periodos.length - 1]}). ` +
        `Clientes: ${r.clientesTotal} (${r.clientesNuevos} nuevos). ` +
        Object.entries(r.porFY)
          .map(([k, v]) => `${k}: ${Math.round(v).toLocaleString("es-CL")} EUs`)
          .join(" · ") +
        (regenerarPlan ? " · Plan regenerado desde LY." : ""),
    };
  } catch (e) {
    return {
      ok: false,
      mensaje: e instanceof Error ? e.message : "Error desconocido al importar",
    };
  }
}
