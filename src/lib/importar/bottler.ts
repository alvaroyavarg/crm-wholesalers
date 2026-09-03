// Importador de la data de venta de los bottlers (Andina/Embonor).
//
// Formatos reales, muy distintos entre sí:
//   KOA (Andina):  Año | Día | ... | cliente_id | ... | SKU | Marca |
//                  Categoría | ... | Empaque | Volumen UC | Ingreso | ...
//                  — el mes NO viene en el archivo (hay que indicarlo).
//                  cliente_id llega con ceros a la izquierda ("0500269810").
//   KOE (Embonor): Fecha - Año | Fecha - Mes | Fecha - Día | ... |
//                  CodigoCliente | Marca SKU | Producto |
//                  Total Ventas (UC) | Total Ventas ($) | ...
//                  — fecha completa, mes en español como texto.
//
// Ambos exports terminan con una fila "Total" y otra "Applied filters: ..."
// que hay que descartar (sumar el archivo completo da el doble del real).

import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aFiscal } from "../fiscal";
import { normalizarProductoBottler } from "./bottler-productos";
import { ucAEus } from "./unidades";

export type OrigenBottler = "KOA" | "KOE";

export interface FilaBottlerNormalizada {
  codBottler: string; // código del cliente TAL COMO viene en el archivo
  dia: number; // día del mes (1..31)
  marca: string;
  formato: string;
  categoria: string;
  eus: number;
  valor: number;
}

export interface ResultadoImportBottler {
  origen: OrigenBottler;
  fecha: string; // YYYY-MM-01 (primer día del mes calendario)
  fechaCorte: string; // YYYY-MM-DD (último día con datos en el archivo)
  filasLeidas: number;
  filasDescartadas: number; // footer, o código no reconocido en absoluto
  eusTotal: number;
  clientesReconocidos: { nombreCorto: string; eus: number }[];
  // Cuentas activas cuyo bottler_principal ES este origen y sin embargo no
  // aparecieron en el archivo — el hueco no debe verse como "vendieron 0".
  clientesEsperadosAusentes: string[];
  productosSinMapeo: string[];
}

const MESES_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

function normalizarCod(valor: unknown): string {
  return String(valor ?? "").trim().replace(/^0+(?=\d)/, "");
}

// ---------- KOA (Andina) ----------

export function parsearKOA(
  buffer: Buffer | ArrayBuffer,
  mesCalendario: number, // 1..12, no viene en el archivo
  anioCalendario: number,
): { filas: FilaBottlerNormalizada[]; descartadas: number; sinMapeo: Set<string> } {
  const wb = XLSX.read(buffer);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja);

  const resultado: FilaBottlerNormalizada[] = [];
  const sinMapeo = new Set<string>();
  let descartadas = 0;

  for (const f of filas) {
    const dia = Number(f["Día"]);
    // Filas de pie de página del export ("Total", "Applied filters: ...")
    if (!Number.isFinite(dia) || dia < 1 || dia > 31) {
      descartadas++;
      continue;
    }
    const codBottler = normalizarCod(f["cliente_id"]);
    if (!codBottler) {
      descartadas++;
      continue;
    }

    const uc = Number(f["Volumen UC"]) || 0;
    const marcaTxt = String(f["Marca"] ?? "");
    const skuTxt = String(f["SKU"] ?? "");
    const empaqueTxt = String(f["Empaque"] ?? "");
    const { marca, formato, categoria } = normalizarProductoBottler(marcaTxt, skuTxt, empaqueTxt);
    if (categoria === "Otros" && marca !== "Sin identificar") {
      // igual se carga (no se pierde venta), pero se reporta para revisar
      sinMapeo.add(`${marcaTxt} / ${skuTxt}`.trim());
    }

    resultado.push({
      codBottler,
      dia,
      marca,
      formato,
      categoria,
      eus: ucAEus(uc, marcaTxt, skuTxt),
      valor: Number(f["Ingreso"]) || 0,
    });
  }

  return { filas: resultado, descartadas, sinMapeo };
}

// ---------- KOE (Embonor) ----------

export function parsearKOE(
  buffer: Buffer | ArrayBuffer,
): {
  filas: FilaBottlerNormalizada[];
  descartadas: number;
  sinMapeo: Set<string>;
  mes: number;
  anio: number;
} {
  const wb = XLSX.read(buffer);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja);

  const resultado: FilaBottlerNormalizada[] = [];
  const sinMapeo = new Set<string>();
  let descartadas = 0;
  let mes = 0;
  let anio = 0;

  for (const f of filas) {
    const dia = Number(f["Fecha - Día"]);
    if (!Number.isFinite(dia) || dia < 1 || dia > 31) {
      descartadas++;
      continue;
    }
    const anioFila = Number(f["Fecha - Año"]);
    const mesFila = MESES_ES[
      String(f["Fecha - Mes"] ?? "").trim().toLowerCase().replace(/\.$/, "")
    ];
    if (!anioFila || !mesFila) {
      descartadas++;
      continue;
    }
    if (!mes) {
      mes = mesFila;
      anio = anioFila;
    }

    const codBottler = normalizarCod(f["CodigoCliente"]);
    if (!codBottler) {
      descartadas++;
      continue;
    }

    const uc = Number(f["Total Ventas (UC)"]) || 0;
    const marcaTxt = String(f["Marca SKU"] ?? "");
    const productoTxt = String(f["Producto"] ?? "");
    const { marca, formato, categoria } = normalizarProductoBottler(marcaTxt, productoTxt);
    if (categoria === "Otros" && marca !== "Sin identificar") {
      sinMapeo.add(`${marcaTxt} / ${productoTxt}`.trim());
    }

    resultado.push({
      codBottler,
      dia,
      marca,
      formato,
      categoria,
      eus: ucAEus(uc, marcaTxt, productoTxt),
      valor: Number(f["Total Ventas ($)"]) || 0,
    });
  }

  return { filas: resultado, descartadas, sinMapeo, mes, anio };
}

// ---------- Matching contra la cartera + escritura ----------

export async function importarBottler(
  supabase: SupabaseClient,
  origen: OrigenBottler,
  filas: FilaBottlerNormalizada[],
  mesCalendario: number,
  anioCalendario: number,
  descartadasParseo: number,
  sinMapeo: Set<string>,
  archivo: string,
): Promise<ResultadoImportBottler> {
  const fecha = `${anioCalendario}-${String(mesCalendario).padStart(2, "0")}-01`;

  // Códigos del sistema de este bottler → cliente
  const { data: codigos, error: errCod } = await supabase
    .from("cliente_codigos")
    .select("cod_cliente, cliente_id, clientes(nombre_corto, nombre, bottler)")
    .eq("sistema", origen);
  if (errCod) throw new Error(`cliente_codigos: ${errCod.message}`);

  const codACliente = new Map<string, { id: string; nombre: string }>();
  for (const c of codigos ?? []) {
    const cli = Array.isArray(c.clientes) ? c.clientes[0] : c.clientes;
    if (cli) codACliente.set(c.cod_cliente, { id: c.cliente_id, nombre: cli.nombre_corto ?? cli.nombre });
  }

  // Agregar por (cliente, marca, formato) — mismo criterio que el importador base
  interface Agregado {
    cliente_id: string;
    nombre: string;
    marca: string;
    formato: string;
    categoria: string;
    eus: number;
    valor: number;
  }
  const agregados = new Map<string, Agregado>();
  let filasDescartadas = descartadasParseo;
  let diaMax = 1;

  for (const f of filas) {
    diaMax = Math.max(diaMax, f.dia);
    const cliente = codACliente.get(f.codBottler);
    if (!cliente) {
      filasDescartadas++; // código fuera de la cartera de 23 (cola larga u otro canal)
      continue;
    }
    const clave = `${cliente.id}|${f.marca}|${f.formato}`;
    let a = agregados.get(clave);
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
      agregados.set(clave, a);
    }
    a.eus += f.eus;
    a.valor += f.valor;
  }

  // Reemplazar SOLO este origen + este período (no tocar el otro bottler
  // del mismo mes, ni Diageo).
  const { error: errDel } = await supabase
    .from("ventas")
    .delete()
    .eq("periodo", fecha)
    .eq("bottler", origen);
  if (errDel) throw new Error(`delete ventas: ${errDel.message}`);

  const filasVentas = [...agregados.values()]
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
    const { error: errIns } = await supabase.from("ventas").insert(filasVentas.slice(i, i + 1000));
    if (errIns) throw new Error(`insert ventas: ${errIns.message}`);
  }

  // Totales por cliente (para el resumen)
  const porCliente = new Map<string, { nombre: string; eus: number }>();
  for (const a of agregados.values()) {
    const acc = porCliente.get(a.cliente_id) ?? { nombre: a.nombre, eus: 0 };
    acc.eus += a.eus;
    porCliente.set(a.cliente_id, acc);
  }
  // Solo los que tienen venta real: los de EUs = 0 quedan en
  // clientesEsperadosAusentes para no listarlos en dos lados a la vez.
  const clientesReconocidos = [...porCliente.values()]
    .filter((c) => c.eus !== 0)
    .map((c) => ({ nombreCorto: c.nombre, eus: Math.round(c.eus) }))
    .sort((a, b) => b.eus - a.eus);

  // Cuentas activas cuyo bottler principal es ESTE origen y no aparecieron.
  const { data: activos, error: errAct } = await supabase
    .from("clientes")
    .select("nombre_corto, nombre, bottler")
    .eq("activo", true)
    .eq("bottler", origen);
  if (errAct) throw new Error(`clientes: ${errAct.message}`);
  // Un cliente con filas en el archivo pero EUs = 0 (ej. solo notas de
  // crédito que se cancelan entre sí) es el mismo hueco que uno que no
  // aparece del todo: en ambos casos no hay venta real que mostrar, así
  // que debe marcarse como ausente, no como "reconocido con 0".
  const reconocidosSet = new Set(
    [...porCliente.values()].filter((c) => c.eus !== 0).map((c) => c.nombre),
  );
  const clientesEsperadosAusentes = (activos ?? [])
    .map((c) => c.nombre_corto ?? c.nombre)
    .filter((n) => !reconocidosSet.has(n));

  const eusTotal = filasVentas.reduce((s, f) => s + f.eus, 0);

  // Log de la importación (fecha_corte alimenta el ritmo del MTD). El
  // período fiscal se deriva del mes calendario, igual que en el resto de
  // la app (aFiscal de fiscal.ts), no se recibe como parámetro aparte para
  // no poder quedar desalineado.
  const { fy, periodo } = aFiscal(new Date(anioCalendario, mesCalendario - 1, 1));
  const fechaCorte = `${anioCalendario}-${String(mesCalendario).padStart(2, "0")}-${String(diaMax).padStart(2, "0")}`;
  const { error: errLog } = await supabase.from("importaciones").insert({
    origen,
    anio_fiscal: fy,
    periodo,
    fecha_corte: fechaCorte,
    filas: filasVentas.length,
    eus: Math.round(eusTotal),
    archivo,
  });
  if (errLog) throw new Error(`importaciones: ${errLog.message}`);

  return {
    origen,
    fecha,
    fechaCorte,
    filasLeidas: filas.length,
    filasDescartadas,
    eusTotal: Math.round(eusTotal),
    clientesReconocidos,
    clientesEsperadosAusentes,
    productosSinMapeo: [...sinMapeo],
  };
}
