"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fiscalActual } from "@/lib/fiscal";
import { importarBase, parsearBase } from "@/lib/importar/core";
import {
  HistoricoProtegidoError,
  importarBottler,
  parsearKOA,
  parsearKOE,
} from "@/lib/importar/bottler";

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

// ---- Importador de la data de los bottlers (Andina/Embonor) ----

export interface EstadoImportBottler {
  ok: boolean;
  mensaje: string;
  // Si el archivo trae meses de FYs anteriores y no se autorizó, se listan
  // para que el usuario decida (marcando la casilla y reintentando).
  mesesProtegidos?: string[];
  detalle?: {
    filasLeidas: number;
    filasPieDePagina: number;
    productosSinMapeo: string[];
    meses: {
      fecha: string;
      fechaCorte: string;
      filasLeidas: number;
      filasFueraCartera: number;
      eusTotal: number;
      clientesReconocidos: { nombreCorto: string; eus: number }[];
      clientesEsperadosAusentes: string[];
    }[];
  };
}

export async function importarBottlerAction(
  _prev: EstadoImportBottler,
  formData: FormData,
): Promise<EstadoImportBottler> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensaje: "Sesión expirada. Vuelve a ingresar." };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: "Selecciona el archivo Excel del bottler." };
  }
  const origen = formData.get("origen");
  if (origen !== "KOA" && origen !== "KOE") {
    return { ok: false, mensaje: "Selecciona el distribuidor (Andina o Embonor)." };
  }
  const permitirHistorico = formData.get("permitir_historico") === "on";

  try {
    const buffer = await archivo.arrayBuffer();

    let parseado;
    if (origen === "KOA") {
      // mes/año solo se usan si el archivo no trae la columna de mes
      const mes = Number(formData.get("mes"));
      const anio = Number(formData.get("anio"));
      const fallback = mes >= 1 && mes <= 12 && anio ? { mes, anio } : undefined;
      parseado = parsearKOA(buffer, fallback);
    } else {
      parseado = parsearKOE(buffer);
    }

    const admin = createAdminClient();
    const r = await importarBottler(admin, origen, parseado, archivo.name, {
      permitirHistorico,
    });

    revalidatePath("/");
    revalidatePath("/mtd");
    revalidatePath("/meta");
    revalidatePath("/plan");
    revalidatePath("/", "layout");

    const nombreOrigen = origen === "KOA" ? "Andina" : "Embonor";
    const totalEus = r.meses.reduce((s, m) => s + m.eusTotal, 0);
    return {
      ok: true,
      mensaje:
        `${nombreOrigen} · ${r.meses.length} ${r.meses.length === 1 ? "mes" : "meses"} ` +
        `(${r.meses.map((m) => m.fecha.slice(0, 7)).join(", ")}) · ` +
        `${totalEus.toLocaleString("es-CL")} EUs cargados.`,
      detalle: {
        filasLeidas: r.filasLeidas,
        filasPieDePagina: r.filasPieDePagina,
        productosSinMapeo: r.productosSinMapeo,
        meses: r.meses,
      },
    };
  } catch (e) {
    if (e instanceof HistoricoProtegidoError) {
      return { ok: false, mensaje: e.message, mesesProtegidos: e.meses };
    }
    return {
      ok: false,
      mensaje: e instanceof Error ? e.message : "Error desconocido al importar",
    };
  }
}
