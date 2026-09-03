"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fiscalActual } from "@/lib/fiscal";
import { importarBase, parsearBase } from "@/lib/importar/core";
import { importarBottler, parsearKOA, parsearKOE } from "@/lib/importar/bottler";

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
  detalle?: {
    eusTotal: number;
    filasLeidas: number;
    filasDescartadas: number;
    clientesReconocidos: { nombreCorto: string; eus: number }[];
    clientesEsperadosAusentes: string[];
    productosSinMapeo: string[];
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

  try {
    const buffer = await archivo.arrayBuffer();
    const admin = createAdminClient();

    let mes: number;
    let anio: number;
    let filas: Awaited<ReturnType<typeof parsearKOA>>["filas"];
    let descartadas: number;
    let sinMapeo: Set<string>;

    if (origen === "KOA") {
      const mesForm = Number(formData.get("mes"));
      const anioForm = Number(formData.get("anio"));
      if (!mesForm || mesForm < 1 || mesForm > 12 || !anioForm) {
        return { ok: false, mensaje: "El archivo de Andina no trae el mes: indícalo." };
      }
      mes = mesForm;
      anio = anioForm;
      const r = parsearKOA(buffer, mes, anio);
      filas = r.filas;
      descartadas = r.descartadas;
      sinMapeo = r.sinMapeo;
    } else {
      const r = parsearKOE(buffer);
      if (!r.mes) {
        return { ok: false, mensaje: "No se pudo leer el mes/año del archivo de Embonor." };
      }
      mes = r.mes;
      anio = r.anio;
      filas = r.filas;
      descartadas = r.descartadas;
      sinMapeo = r.sinMapeo;
    }

    if (filas.length === 0) {
      return { ok: false, mensaje: "El archivo no tiene filas de venta reconocibles." };
    }

    const resultado = await importarBottler(
      admin,
      origen,
      filas,
      mes,
      anio,
      descartadas,
      sinMapeo,
      archivo.name,
    );

    revalidatePath("/");
    revalidatePath("/mtd");
    revalidatePath("/meta");
    revalidatePath("/plan");
    revalidatePath("/", "layout");

    const nombreOrigen = origen === "KOA" ? "Andina" : "Embonor";
    return {
      ok: true,
      mensaje:
        `${nombreOrigen} · ${resultado.filasLeidas.toLocaleString("es-CL")} filas leídas, ` +
        `${resultado.eusTotal.toLocaleString("es-CL")} EUs cargados en ` +
        `${resultado.clientesReconocidos.length} cuentas.` +
        (resultado.filasDescartadas > 0
          ? ` ${resultado.filasDescartadas.toLocaleString("es-CL")} filas fuera de la cartera (otros canales / cola larga).`
          : ""),
      detalle: {
        eusTotal: resultado.eusTotal,
        filasLeidas: resultado.filasLeidas,
        filasDescartadas: resultado.filasDescartadas,
        clientesReconocidos: resultado.clientesReconocidos,
        clientesEsperadosAusentes: resultado.clientesEsperadosAusentes,
        productosSinMapeo: resultado.productosSinMapeo,
      },
    };
  } catch (e) {
    return {
      ok: false,
      mensaje: e instanceof Error ? e.message : "Error desconocido al importar",
    };
  }
}
