// Núcleo del importador de la base de ventas (hoja BBDD del Excel del canal).
// Lo usan el script CLI (scripts/importar-base.ts) y la página Datos.
//
// Diseño:
// - Matching de clientes por "Cod cliente" (tabla cliente_codigos).
// - Varias razones sociales / códigos → un cliente (FUSIONES + mismo nombre).
// - Clientes nuevos: si están en CARTERA quedan activos con segmento y nombre
//   corto; el resto queda inactivo (cola larga, cuenta para métricas de canal).
// - Import idempotente: reemplaza por completo los períodos presentes en el
//   archivo (delete + insert), así el mismo archivo actualizado sirve mes a mes.

import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoriaDe } from "./categorias";
import { CARTERA, FUSIONES } from "./cartera";

export interface FilaBase {
  cod: string;
  nombre: string;
  bottler: string;
  region: string;
  marcaL3: string;
  varianteL5: string;
  formatoL6: string;
  fy: number; // año fiscal completo, ej. 2026
  periodo: number; // 1..12
  eus: number;
}

export interface ResultadoImport {
  filasLeidas: number;
  filasVentas: number;
  periodos: string[];
  clientesNuevos: number;
  clientesTotal: number;
  porFY: Record<string, number>;
}

const COLUMNAS_REQUERIDAS = [
  "Cod cliente",
  "Nombre cliente",
  "Fiscal Year",
  "Fiscal Month",
  "SO Volume (EUs)",
];

function normalizarNombre(n: string): string {
  return n.trim().replace(/\s+/g, " ").toUpperCase();
}

// P1 (julio) → fecha del primer día del mes calendario correspondiente
function fechaPeriodo(fy: number, periodo: number): string {
  const mes = periodo <= 6 ? periodo + 6 : periodo - 6;
  const anio = periodo <= 6 ? fy - 1 : fy;
  return `${anio}-${String(mes).padStart(2, "0")}-01`;
}

export function parsearBase(buffer: Buffer | ArrayBuffer): FilaBase[] {
  const wb = XLSX.read(buffer);

  // Detectar la hoja con la base plana (headers de BBDD)
  let hoja: XLSX.WorkSheet | null = null;
  for (const nombre of wb.SheetNames) {
    const filas: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[nombre], {
      header: 1,
      range: 0,
      raw: true,
    });
    const headers = (filas[0] ?? []).map(String);
    if (COLUMNAS_REQUERIDAS.every((c) => headers.includes(c))) {
      hoja = wb.Sheets[nombre];
      break;
    }
  }
  if (!hoja) {
    throw new Error(
      `No encontré una hoja con la base plana. Se esperan las columnas: ${COLUMNAS_REQUERIDAS.join(", ")}. Hojas del archivo: ${wb.SheetNames.join(", ")}`,
    );
  }

  interface FilaCruda {
    "Cod cliente": string | number;
    "Nombre cliente": string;
    Bottler?: string;
    "Región"?: string;
    "L3 - Brand"?: string;
    "L5 - Individual Variant"?: string;
    "L6 - Volume"?: string;
    "Fiscal Year": string | number;
    "Fiscal Month": string;
    "SO Volume (EUs)": number | string;
  }

  const crudas: FilaCruda[] = XLSX.utils.sheet_to_json(hoja, { raw: true });
  const filas: FilaBase[] = [];

  for (const f of crudas) {
    const fyCorto = Number(f["Fiscal Year"]);
    const mesMatch = String(f["Fiscal Month"] ?? "").match(/(\d+)/);
    const eus = Number(f["SO Volume (EUs)"] ?? 0);
    if (!fyCorto || !mesMatch) continue;
    const periodo = Number(mesMatch[1]);
    if (periodo < 1 || periodo > 12) continue;

    filas.push({
      cod: String(f["Cod cliente"]).trim(),
      nombre: normalizarNombre(String(f["Nombre cliente"] ?? "")),
      bottler: String(f.Bottler ?? "").trim(),
      region: String(f["Región"] ?? "").trim(),
      marcaL3: String(f["L3 - Brand"] ?? "").trim(),
      varianteL5: String(f["L5 - Individual Variant"] ?? "").trim() || "Sin variante",
      formatoL6: String(f["L6 - Volume"] ?? "").trim(),
      fy: fyCorto < 100 ? 2000 + fyCorto : fyCorto,
      periodo,
      eus: Number.isFinite(eus) ? eus : 0,
    });
  }

  return filas;
}

export async function importarBase(
  supabase: SupabaseClient,
  filas: FilaBase[],
  opciones: { regenerarPlan?: boolean; fyPlan?: number } = {},
): Promise<ResultadoImport> {
  if (filas.length === 0) throw new Error("El archivo no tiene filas de datos.");

  // ---- 1. Resolver clientes (agrupar códigos por nombre canónico) ----
  interface GrupoCliente {
    nombreCanonico: string;
    codigos: Map<string, string>; // cod → nombre oficial visto
    bottlers: Map<string, number>;
    region: string;
  }
  const grupos = new Map<string, GrupoCliente>();
  for (const f of filas) {
    const canonico = FUSIONES[f.nombre] ?? f.nombre;
    let g = grupos.get(canonico);
    if (!g) {
      g = { nombreCanonico: canonico, codigos: new Map(), bottlers: new Map(), region: f.region };
      grupos.set(canonico, g);
    }
    g.codigos.set(f.cod, f.nombre);
    g.bottlers.set(f.bottler, (g.bottlers.get(f.bottler) ?? 0) + f.eus);
  }

  // Códigos ya conocidos
  const { data: codigosExistentes, error: errCod } = await supabase
    .from("cliente_codigos")
    .select("cod_cliente, cliente_id");
  if (errCod) throw new Error(`cliente_codigos: ${errCod.message}`);
  const codACliente = new Map(
    (codigosExistentes ?? []).map((r) => [r.cod_cliente as string, r.cliente_id as string]),
  );

  const carteraPorNombre = new Map(CARTERA.map((c) => [c.nombreOficial, c]));
  let clientesNuevos = 0;

  for (const g of grupos.values()) {
    // ¿Algún código del grupo ya está mapeado? → usar ese cliente
    let clienteId: string | null = null;
    for (const cod of g.codigos.keys()) {
      const existente = codACliente.get(cod);
      if (existente) {
        clienteId = existente;
        break;
      }
    }

    if (!clienteId) {
      const cuenta = carteraPorNombre.get(g.nombreCanonico);
      const bottlerPrincipal =
        [...g.bottlers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const { data: nuevo, error: errNuevo } = await supabase
        .from("clientes")
        .insert({
          nombre: g.nombreCanonico,
          nombre_corto: cuenta?.nombreCorto ?? null,
          segmento: cuenta?.segmento ?? "CLAVE",
          activo: Boolean(cuenta),
          region: g.region || null,
          bottler: bottlerPrincipal,
        })
        .select("id")
        .single();
      if (errNuevo) throw new Error(`insert cliente ${g.nombreCanonico}: ${errNuevo.message}`);
      clienteId = nuevo.id as string;
      clientesNuevos++;
    }

    // Registrar códigos faltantes del grupo
    const codigosNuevos = [...g.codigos.entries()]
      .filter(([cod]) => !codACliente.has(cod))
      .map(([cod, nombreOficial]) => ({
        cod_cliente: cod,
        cliente_id: clienteId,
        nombre_oficial: nombreOficial,
      }));
    if (codigosNuevos.length > 0) {
      const { error: errIns } = await supabase.from("cliente_codigos").insert(codigosNuevos);
      if (errIns) throw new Error(`insert codigos: ${errIns.message}`);
      for (const c of codigosNuevos) codACliente.set(c.cod_cliente, clienteId);
    }
  }

  // ---- 2. Agregar ventas por (cliente, período, variante, formato, bottler) ----
  interface Agregado {
    cliente_id: string;
    periodo: string;
    marca: string;
    formato: string;
    bottler: string;
    categoria: string;
    eus: number;
  }
  const agregados = new Map<string, Agregado>();
  const periodosSet = new Set<string>();
  const porFY: Record<string, number> = {};

  for (const f of filas) {
    const canonico = FUSIONES[f.nombre] ?? f.nombre;
    const clienteId = codACliente.get(f.cod);
    if (!clienteId) throw new Error(`Código sin cliente: ${f.cod} (${canonico})`);

    const fecha = fechaPeriodo(f.fy, f.periodo);
    periodosSet.add(fecha);
    porFY[`FY${String(f.fy).slice(-2)}`] = (porFY[`FY${String(f.fy).slice(-2)}`] ?? 0) + f.eus;

    const clave = `${clienteId}|${fecha}|${f.varianteL5}|${f.formatoL6}|${f.bottler}`;
    let a = agregados.get(clave);
    if (!a) {
      a = {
        cliente_id: clienteId,
        periodo: fecha,
        marca: f.varianteL5,
        formato: f.formatoL6 || "",
        bottler: f.bottler || "",
        categoria: categoriaDe(f.marcaL3, f.varianteL5),
        eus: 0,
      };
      agregados.set(clave, a);
    }
    a.eus += f.eus;
  }

  // ---- 3. Reemplazar los períodos presentes en el archivo ----
  const periodos = [...periodosSet].sort();
  for (let i = 0; i < periodos.length; i += 30) {
    const lote = periodos.slice(i, i + 30);
    const { error: errDel } = await supabase.from("ventas").delete().in("periodo", lote);
    if (errDel) throw new Error(`delete ventas: ${errDel.message}`);
  }

  const filasVentas = [...agregados.values()]
    .filter((a) => a.eus !== 0)
    .map((a) => ({
      cliente_id: a.cliente_id,
      periodo: a.periodo,
      marca: a.marca,
      formato: a.formato || null,
      bottler: a.bottler || null,
      categoria: a.categoria,
      eus: Math.round(a.eus * 1000) / 1000,
      valor: 0, // la base no trae CLP
    }));

  for (let i = 0; i < filasVentas.length; i += 1000) {
    const lote = filasVentas.slice(i, i + 1000);
    const { error: errIns } = await supabase.from("ventas").insert(lote);
    if (errIns) throw new Error(`insert ventas (lote ${i / 1000}): ${errIns.message}`);
  }

  // ---- 4. Plan del FY actual = real del FY anterior (empatar LY) ----
  if (opciones.regenerarPlan && opciones.fyPlan) {
    const fyPlan = opciones.fyPlan;
    const { data: activos, error: errAct } = await supabase
      .from("clientes")
      .select("id")
      .eq("activo", true);
    if (errAct) throw new Error(`clientes activos: ${errAct.message}`);

    const lyPorClientePeriodo = new Map<string, number>();
    for (const a of agregados.values()) {
      const [anio, mes] = a.periodo.split("-").map(Number);
      const fyDe = mes >= 7 ? anio + 1 : anio;
      if (fyDe !== fyPlan - 1) continue;
      const p = mes >= 7 ? mes - 6 : mes + 6;
      const clave = `${a.cliente_id}|${p}`;
      lyPorClientePeriodo.set(clave, (lyPorClientePeriodo.get(clave) ?? 0) + a.eus);
    }

    const planRows = (activos ?? []).flatMap((c) =>
      Array.from({ length: 12 }, (_, i) => ({
        cliente_id: c.id as string,
        anio_fiscal: fyPlan,
        periodo: i + 1,
        eus_plan: Math.round(lyPorClientePeriodo.get(`${c.id}|${i + 1}`) ?? 0),
        actualizado_at: new Date().toISOString(),
      })),
    );
    const { error: errPlan } = await supabase
      .from("plan_ventas")
      .upsert(planRows, { onConflict: "cliente_id,anio_fiscal,periodo" });
    if (errPlan) throw new Error(`plan: ${errPlan.message}`);
  }

  return {
    filasLeidas: filas.length,
    filasVentas: filasVentas.length,
    periodos,
    clientesNuevos,
    clientesTotal: grupos.size,
    porFY,
  };
}
