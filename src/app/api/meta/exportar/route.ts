import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { etiquetaMesCalendario } from "@/lib/fiscal";
import { FACTOR_UC_EU } from "@/lib/importar/unidades";
import { detalleMetaTodos, metaProximoMes } from "@/lib/queries";

// Exporta la tabla de Meta a un .xlsx con dos hojas: el resumen por cliente
// (igual a lo que se ve en /meta) y el detalle por SKU de toda la cartera en
// los mismos 3 períodos, para pivotear en Excel.
export async function GET(request: Request) {
  // Misma protección que el resto de la app: solo sesión autenticada.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("No autorizado", { status: 401 });
  }

  const url = new URL(request.url);
  const fyParam = url.searchParams.get("fy");
  const periodoParam = url.searchParams.get("periodo");
  const fy = fyParam ? Number(fyParam) : undefined;
  const periodo = periodoParam ? Number(periodoParam) : undefined;

  const { fyMeta, periodoMeta, columnas, clientes } = await metaProximoMes(fy, periodo);
  const detalle = await detalleMetaTodos(columnas.a, columnas.b, columnas.c, columnas.d, { fy: fyMeta, periodo: periodoMeta });

  const etA = etiquetaMesCalendario(columnas.a.fy, columnas.a.periodo);
  const etB = etiquetaMesCalendario(columnas.b.fy, columnas.b.periodo);
  const etC = etiquetaMesCalendario(columnas.c.fy, columnas.c.periodo);
  const etD = `${etiquetaMesCalendario(columnas.d.fy, columnas.d.periodo)} (LY)`;
  const etiquetaMeta = etiquetaMesCalendario(fyMeta, periodoMeta);

  const etiquetaBottler = (b: string | null) =>
    b === "KOA" ? "Andina" : b === "KOE" ? "Embonor" : b ?? "—";

  const filasResumen = clientes.map((c) => ({
    "ID cliente": c.cod_diageo ?? "",
    Cliente: c.nombre_corto ?? c.nombre,
    Segmento: c.es_otros ? "Otros" : c.segmento,
    Distribuidor:
      etiquetaBottler(c.bottler) + (c.es_frontera ? " (frontera)" : ""),
    Zona: c.zona ?? "",
    Desarrollador: c.desarrollador ?? "",
    [etA]: Math.round(Number(c.eus_a)),
    [etB]: Math.round(Number(c.eus_b)),
    [etC]: Math.round(Number(c.eus_c)),
    [etD]: Math.round(Number(c.eus_d)),
    "Meta EUS": Math.round(Number(c.meta_eus)),
    Comprometido: Math.round(Number(c.ped_comprometido)),
    Ingresado: Math.round(Number(c.ped_ingresado)),
    Facturado: Math.round(c.venta_cargada ? Number(c.venta_real) : Number(c.ped_facturado)),
    "Facturado según": c.venta_cargada ? "venta bottler" : "pedidos",
    Brecha: Math.round(Number(c.meta_eus) - (c.venta_cargada ? Number(c.venta_real) : Number(c.ped_facturado))),
    "Meta UC": Number(c.meta_eus) > 0
      ? Number((Number(c.meta_eus) / FACTOR_UC_EU).toFixed(1))
      : "",
  }));

  const filasDetalle = detalle.map((d) => ({
    Cliente: d.nombre_corto ?? d.nombre,
    Categoría: d.categoria,
    Marca: d.marca,
    Formato: d.formato,
    [etA]: Math.round(Number(d.eus_a)),
    [etB]: Math.round(Number(d.eus_b)),
    [etC]: Math.round(Number(d.eus_c)),
    [etD]: Math.round(Number(d.eus_d)),
    "Meta SKU EUS": Math.round(Number(d.meta_eus)),
  }));

  const wb = XLSX.utils.book_new();
  const hojaResumen = XLSX.utils.json_to_sheet(filasResumen);
  hojaResumen["!cols"] = [
    { wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, hojaResumen, "Resumen");

  const hojaDetalle = XLSX.utils.json_to_sheet(filasDetalle);
  hojaDetalle["!cols"] = [
    { wch: 24 }, { wch: 16 }, { wch: 20 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, hojaDetalle, "Detalle SKU");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nombreArchivo = `meta_${etiquetaMeta.replace(/[^\w-]/g, "")}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
