// Importador de la data de venta de los bottlers (Andina/Embonor).
//
// Formatos reales, muy distintos entre sí:
//   KOA (Andina):  Año | periodo - Mes | Día | ... | cliente_id | ... | SKU |
//                  Marca | ... | Empaque | Volumen UC | Ingreso | ...
//                  — "periodo - Mes" (texto en español) existe en los exports
//                  recientes; los viejos no lo traían y hay que indicarlo.
//                  cliente_id llega con ceros a la izquierda ("0500269810").
//   KOE (Embonor): Fecha - Año | Fecha - Mes | Fecha - Día | ... |
//                  CodigoCliente | Marca SKU | Producto |
//                  Total Ventas (UC) | Total Ventas ($) | ...
//
// Un archivo puede traer VARIOS meses (ej. julio + agosto): se agrupa por
// (año, mes) y cada mes se reemplaza por separado.
//
// Ambos exports terminan con una fila "Total" y otra "Applied filters: ..."
// que hay que descartar (sumar el archivo completo da el doble del real).

import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aFiscal, fiscalActual } from "../fiscal";
import { normalizarProductoBottler } from "./bottler-productos";
import { ucAEus } from "./unidades";

export type OrigenBottler = "KOA" | "KOE";

export interface FilaBottlerNormalizada {
  codBottler: string; // código del cliente TAL COMO viene en el archivo
  anio: number;
  mes: number; // 1..12 calendario
  dia: number; // 1..31
  marca: string;
  formato: string;
  categoria: string;
  eus: number;
  valor: number;
}

export interface ResultadoMesBottler {
  fecha: string; // YYYY-MM-01
  fechaCorte: string; // YYYY-MM-DD, último día con datos
  filasLeidas: number;
  filasFueraCartera: number; // filas de códigos fuera de la cartera (van a "Otros")
  eusOtros: number; // EUs agrupados en la fila "Otros <bottler>"
  eusTotal: number;
  clientesReconocidos: { nombreCorto: string; eus: number }[];
  // Cuentas activas cuyo bottler principal ES este origen y sin embargo no
  // tienen venta en el mes — el hueco no debe verse como "vendieron 0".
  clientesEsperadosAusentes: string[];
}

export interface ResultadoImportBottler {
  origen: OrigenBottler;
  filasLeidas: number;
  filasPieDePagina: number;
  meses: ResultadoMesBottler[];
  productosSinMapeo: string[];
}

export class HistoricoProtegidoError extends Error {
  constructor(public meses: string[]) {
    super(
      `El archivo trae meses de años fiscales anteriores (${meses.join(", ")}). ` +
        `Cargarlos reemplazaría el histórico que ya está en la base. ` +
        `Si es intencional, marca "Permitir sobrescribir histórico".`,
    );
    this.name = "HistoricoProtegidoError";
  }
}

const MESES_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

function mesDesdeTexto(valor: unknown): number {
  const t = String(valor ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (/^\d+$/.test(t)) return Number(t);
  return MESES_ES[t] ?? 0;
}

function normalizarCod(valor: unknown): string {
  return String(valor ?? "").trim().replace(/^0+(?=\d)/, "");
}

function fechaISO(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

interface Parseado {
  filas: FilaBottlerNormalizada[];
  pieDePagina: number;
  sinMapeo: Set<string>;
}

// ---------- KOA (Andina) ----------

export function parsearKOA(
  buffer: Buffer | ArrayBuffer,
  fallback?: { mes: number; anio: number }, // solo si el archivo no trae el mes
): Parseado {
  const wb = XLSX.read(buffer);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja);

  const filas: FilaBottlerNormalizada[] = [];
  const sinMapeo = new Set<string>();
  let pieDePagina = 0;

  for (const f of crudas) {
    const dia = Number(f["Día"]);
    // Filas de pie de página del export ("Total", "Applied filters: ...")
    if (!Number.isFinite(dia) || dia < 1 || dia > 31) {
      pieDePagina++;
      continue;
    }
    const anio = Number(f["Año"]) || fallback?.anio || 0;
    const mes = mesDesdeTexto(f["periodo - Mes"] ?? f["Mes"]) || fallback?.mes || 0;
    if (!anio || !mes) {
      throw new Error(
        "El archivo de Andina no trae la columna de mes. Indica mes y año en el formulario.",
      );
    }
    const codBottler = normalizarCod(f["cliente_id"]);
    if (!codBottler) {
      pieDePagina++;
      continue;
    }

    const uc = Number(f["Volumen UC"]) || 0;
    const marcaTxt = String(f["Marca"] ?? "");
    const skuTxt = String(f["SKU"] ?? "");
    const empaqueTxt = String(f["Empaque"] ?? "");
    const { marca, formato, categoria } = normalizarProductoBottler(marcaTxt, skuTxt, empaqueTxt);
    if (categoria === "Otros" && marca !== "Sin identificar") {
      sinMapeo.add(`${marcaTxt} / ${skuTxt}`.trim());
    }

    filas.push({
      codBottler,
      anio,
      mes,
      dia,
      marca,
      formato,
      categoria,
      eus: ucAEus(uc, marcaTxt, skuTxt),
      valor: Number(f["Ingreso"]) || 0,
    });
  }

  return { filas, pieDePagina, sinMapeo };
}

// ---------- KOE (Embonor) ----------

export function parsearKOE(buffer: Buffer | ArrayBuffer): Parseado {
  const wb = XLSX.read(buffer);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja);

  const filas: FilaBottlerNormalizada[] = [];
  const sinMapeo = new Set<string>();
  let pieDePagina = 0;

  for (const f of crudas) {
    const dia = Number(f["Fecha - Día"]);
    if (!Number.isFinite(dia) || dia < 1 || dia > 31) {
      pieDePagina++;
      continue;
    }
    const anio = Number(f["Fecha - Año"]);
    const mes = mesDesdeTexto(f["Fecha - Mes"]);
    if (!anio || !mes) {
      pieDePagina++;
      continue;
    }
    const codBottler = normalizarCod(f["CodigoCliente"]);
    if (!codBottler) {
      pieDePagina++;
      continue;
    }

    const uc = Number(f["Total Ventas (UC)"]) || 0;
    const marcaTxt = String(f["Marca SKU"] ?? "");
    const productoTxt = String(f["Producto"] ?? "");
    const { marca, formato, categoria } = normalizarProductoBottler(marcaTxt, productoTxt);
    if (categoria === "Otros" && marca !== "Sin identificar") {
      sinMapeo.add(`${marcaTxt} / ${productoTxt}`.trim());
    }

    filas.push({
      codBottler,
      anio,
      mes,
      dia,
      marca,
      formato,
      categoria,
      eus: ucAEus(uc, marcaTxt, productoTxt),
      valor: Number(f["Total Ventas ($)"]) || 0,
    });
  }

  return { filas, pieDePagina, sinMapeo };
}

/** Meses presentes en el archivo, como "YYYY-MM" ordenados. */
export function mesesDe(filas: FilaBottlerNormalizada[]): string[] {
  return [...new Set(filas.map((f) => `${f.anio}-${String(f.mes).padStart(2, "0")}`))].sort();
}

// ---------- Matching contra la cartera + escritura ----------

export async function importarBottler(
  supabase: SupabaseClient,
  origen: OrigenBottler,
  parseado: Parseado,
  archivo: string,
  opciones: { permitirHistorico?: boolean } = {},
): Promise<ResultadoImportBottler> {
  const { filas, pieDePagina, sinMapeo } = parseado;
  if (filas.length === 0) throw new Error("El archivo no tiene filas de venta reconocibles.");

  // ---- Seguro: no pisar meses de FYs anteriores sin autorización ----
  const { fy: fyActual } = fiscalActual();
  const mesesHistoricos = mesesDe(filas).filter((ym) => {
    const [a, m] = ym.split("-").map(Number);
    return aFiscal(new Date(a, m - 1, 1)).fy < fyActual;
  });
  if (mesesHistoricos.length > 0 && !opciones.permitirHistorico) {
    throw new HistoricoProtegidoError(mesesHistoricos);
  }

  // ---- Códigos del sistema de este bottler → cliente ----
  const { data: codigos, error: errCod } = await supabase
    .from("cliente_codigos")
    .select("cod_cliente, cliente_id, clientes(nombre_corto, nombre)")
    .eq("sistema", origen);
  if (errCod) throw new Error(`cliente_codigos: ${errCod.message}`);

  const codACliente = new Map<string, { id: string; nombre: string }>();
  for (const c of codigos ?? []) {
    const cli = Array.isArray(c.clientes) ? c.clientes[0] : c.clientes;
    if (cli) {
      codACliente.set(c.cod_cliente, { id: c.cliente_id, nombre: cli.nombre_corto ?? cli.nombre });
    }
  }

  // Cuentas activas cuyo bottler principal es ESTE origen (para detectar huecos)
  const { data: activos, error: errAct } = await supabase
    .from("clientes")
    .select("nombre_corto, nombre")
    .eq("activo", true)
    .eq("bottler", origen);
  if (errAct) throw new Error(`clientes: ${errAct.message}`);
  const esperados = (activos ?? []).map((c) => c.nombre_corto ?? c.nombre);

  // Fila agregada "Otros <bottler>": recibe todo lo que no es cartera gestionada
  const { data: otrosRow, error: errOtros } = await supabase
    .from("clientes")
    .select("id, nombre_corto, nombre")
    .eq("es_otros", true)
    .eq("bottler", origen)
    .maybeSingle();
  if (errOtros) throw new Error(`clientes (otros): ${errOtros.message}`);
  const otros = otrosRow
    ? { id: otrosRow.id as string, nombre: (otrosRow.nombre_corto ?? otrosRow.nombre) as string }
    : null;

  // ---- Agrupar por mes; dentro del mes por (cliente, marca, formato) ----
  interface Agregado {
    cliente_id: string;
    nombre: string;
    marca: string;
    formato: string;
    categoria: string;
    eus: number;
    valor: number;
  }
  interface Mes {
    anio: number;
    mes: number;
    diaMax: number;
    filasLeidas: number;
    fueraCartera: number;
    agregados: Map<string, Agregado>;
  }
  const meses = new Map<string, Mes>();

  for (const f of filas) {
    const clave = `${f.anio}-${String(f.mes).padStart(2, "0")}`;
    let m = meses.get(clave);
    if (!m) {
      m = { anio: f.anio, mes: f.mes, diaMax: 1, filasLeidas: 0, fueraCartera: 0, agregados: new Map() };
      meses.set(clave, m);
    }
    m.filasLeidas++;
    m.diaMax = Math.max(m.diaMax, f.dia);

    let cliente = codACliente.get(f.codBottler);
    if (!cliente) {
      m.fueraCartera++;
      if (!otros) continue; // sin fila "Otros" (migración 0016 no aplicada): se descarta
      cliente = otros; // cola larga: se agrupa en "Otros <bottler>"
    }
    const k = `${cliente.id}|${f.marca}|${f.formato}`;
    let a = m.agregados.get(k);
    if (!a) {
      a = {
        cliente_id: cliente.id,
        nombre: cliente.nombre,
        marca: f.marca,
        formato: f.formato,
        categoria: f.categoria,
        eus: 0,
        valor: 0,
      };
      m.agregados.set(k, a);
    }
    a.eus += f.eus;
    a.valor += f.valor;
  }

  // ---- Escribir mes a mes: reemplazar SOLO (periodo, bottler) ----
  const resultados: ResultadoMesBottler[] = [];

  for (const clave of [...meses.keys()].sort()) {
    const m = meses.get(clave)!;
    const fecha = fechaISO(m.anio, m.mes, 1);
    const fechaCorte = fechaISO(m.anio, m.mes, m.diaMax);

    const { error: errDel } = await supabase
      .from("ventas")
      .delete()
      .eq("periodo", fecha)
      .eq("bottler", origen);
    if (errDel) throw new Error(`delete ventas ${fecha}: ${errDel.message}`);

    const filasVentas = [...m.agregados.values()]
      .filter((a) => a.eus !== 0)
      .map((a) => ({
        cliente_id: a.cliente_id,
        periodo: fecha,
        marca: a.marca,
        formato: a.formato || null,
        bottler: origen,
        categoria: a.categoria,
        eus: Math.round(a.eus * 1000) / 1000,
        valor: Math.round(a.valor),
      }));

    for (let i = 0; i < filasVentas.length; i += 1000) {
      const { error: errIns } = await supabase
        .from("ventas")
        .insert(filasVentas.slice(i, i + 1000));
      if (errIns) throw new Error(`insert ventas ${fecha}: ${errIns.message}`);
    }

    // Totales por cliente. Un cliente con filas pero EUs = 0 (ej. solo notas
    // de crédito que se cancelan) es el mismo hueco que uno ausente.
    const porCliente = new Map<string, { nombre: string; eus: number }>();
    for (const a of m.agregados.values()) {
      const acc = porCliente.get(a.cliente_id) ?? { nombre: a.nombre, eus: 0 };
      acc.eus += a.eus;
      porCliente.set(a.cliente_id, acc);
    }
    const conVenta = [...porCliente.values()].filter((c) => c.eus !== 0);
    const clientesReconocidos = conVenta
      .map((c) => ({ nombreCorto: c.nombre, eus: Math.round(c.eus) }))
      .sort((a, b) => b.eus - a.eus);
    const reconocidosSet = new Set(conVenta.map((c) => c.nombre));
    const clientesEsperadosAusentes = esperados.filter((n) => !reconocidosSet.has(n));

    const eusTotal = filasVentas.reduce((s, f) => s + f.eus, 0);
    const eusOtros = otros ? (porCliente.get(otros.id)?.eus ?? 0) : 0;

    // Log de la importación (fecha_corte alimenta el ritmo del MTD)
    const { fy, periodo } = aFiscal(new Date(m.anio, m.mes - 1, 1));
    const { error: errLog } = await supabase.from("importaciones").insert({
      origen,
      anio_fiscal: fy,
      periodo,
      fecha_corte: fechaCorte,
      filas: filasVentas.length,
      eus: Math.round(eusTotal),
      archivo,
    });
    if (errLog) throw new Error(`importaciones ${fecha}: ${errLog.message}`);

    resultados.push({
      fecha,
      fechaCorte,
      filasLeidas: m.filasLeidas,
      filasFueraCartera: m.fueraCartera,
      eusOtros: Math.round(eusOtros),
      eusTotal: Math.round(eusTotal),
      clientesReconocidos,
      clientesEsperadosAusentes,
    });
  }

  return {
    origen,
    filasLeidas: filas.length,
    filasPieDePagina: pieDePagina,
    meses: resultados,
    productosSinMapeo: [...sinMapeo],
  };
}
