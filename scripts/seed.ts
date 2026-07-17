/**
 * Seed de data ficticia realista.
 *
 * - 25 clientes: 3 TOP3 (~54k EUs/FY, ~28% de la cartera) + 22 CLAVE (~138k EUs/FY)
 * - Ventas mensuales por marca: FY22 a FY26 completos + P1 de FY27 (5 años de historia)
 * - Estacionalidad chilena: peak P3 (sept, fiestas patrias) y P6 (dic, navidad)
 * - Plan FY27 pre-cargado = real FY26 mes a mes ("empatar LY")
 * - Perfiles y notas de ejemplo
 *
 * ⚠️ Borra la data existente de clientes (cascade). Pensado para ambiente de desarrollo.
 *
 * Uso: npm run seed  (requiere .env.local con URL + SERVICE_ROLE_KEY)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------- env ----------
function cargarEnvLocal() {
  try {
    const contenido = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const linea of contenido.split("\n")) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // sin .env.local: se esperan variables en el entorno
  }
}
cargarEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------- RNG determinista ----------
function mulberry32(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260717);
const entre = (min: number, max: number) => min + rng() * (max - min);
const elegir = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

// ---------- calendario fiscal ----------
// P1 = julio ... P12 = junio. FY27 = jul 2026 - jun 2027.
function inicioPeriodo(fy: number, periodo: number): string {
  const mes = periodo <= 6 ? periodo + 6 : periodo - 6; // 1-based: P1->7(jul), P7->1(ene)
  const anio = periodo <= 6 ? fy - 1 : fy;
  return `${anio}-${String(mes).padStart(2, "0")}-01`;
}

// ---------- catálogo ----------
interface Marca {
  marca: string;
  categoria: string;
  share: number; // share típico del portafolio
  precioEU: number; // CLP por EU aprox
}

const MARCAS: Marca[] = [
  { marca: "Johnnie Walker Red", categoria: "Whisky", share: 0.27, precioEU: 68000 },
  { marca: "Smirnoff", categoria: "Vodka", share: 0.16, precioEU: 42000 },
  { marca: "Johnnie Walker Black", categoria: "Whisky", share: 0.12, precioEU: 118000 },
  { marca: "Buchanan's", categoria: "Whisky", share: 0.09, precioEU: 125000 },
  { marca: "Tanqueray", categoria: "Gin", share: 0.08, precioEU: 72000 },
  { marca: "Old Parr", categoria: "Whisky", share: 0.06, precioEU: 110000 },
  { marca: "Baileys", categoria: "Licores", share: 0.06, precioEU: 58000 },
  { marca: "Smirnoff Ice", categoria: "RTD", share: 0.06, precioEU: 24000 },
  { marca: "Ron Pampero", categoria: "Ron", share: 0.05, precioEU: 38000 },
  { marca: "Don Julio", categoria: "Tequila", share: 0.05, precioEU: 160000 },
];

// Estacionalidad P1..P12 (promedio 1.0): P3 = sept (18), P6 = dic (navidad)
const ESTACIONALIDAD = [0.92, 0.9, 1.25, 0.98, 1.05, 1.55, 0.78, 0.75, 0.92, 0.95, 0.95, 1.0];

// Factor por FY relativo al base (FY26 = 1.0); FY27 se define por cliente (tendencia)
const FACTOR_FY: Record<number, number> = {
  2022: 0.82,
  2023: 0.9,
  2024: 0.96,
  2025: 0.99,
  2026: 1.0,
};

interface ClienteSeed {
  nombre: string;
  comuna: string;
  segmento: "TOP3" | "CLAVE";
  baseAnualEUs: number; // volumen FY26
}

const CLIENTES: ClienteSeed[] = [
  // TOP3 (~54k EUs)
  { nombre: "Comercial Santa Elena", comuna: "San Bernardo", segmento: "TOP3", baseAnualEUs: 20000 },
  { nombre: "Distribuidora El Trébol", comuna: "Quilicura", segmento: "TOP3", baseAnualEUs: 18000 },
  { nombre: "Mayorista Pérez y Cía.", comuna: "Estación Central", segmento: "TOP3", baseAnualEUs: 16000 },
  // CLAVE (~138k EUs)
  { nombre: "Distribuidora Los Andes", comuna: "Puente Alto", segmento: "CLAVE", baseAnualEUs: 11500 },
  { nombre: "Comercial Vega Norte", comuna: "Recoleta", segmento: "CLAVE", baseAnualEUs: 10500 },
  { nombre: "Abarrotes San Miguel", comuna: "San Miguel", segmento: "CLAVE", baseAnualEUs: 10000 },
  { nombre: "Distribuidora Central Sur", comuna: "La Cisterna", segmento: "CLAVE", baseAnualEUs: 9500 },
  { nombre: "Comercial Doña Rosa", comuna: "Maipú", segmento: "CLAVE", baseAnualEUs: 9000 },
  { nombre: "Mayorista El Sol", comuna: "Pudahuel", segmento: "CLAVE", baseAnualEUs: 8500 },
  { nombre: "Distribuidora Cordillera", comuna: "La Florida", segmento: "CLAVE", baseAnualEUs: 8000 },
  { nombre: "Comercial Portales", comuna: "Santiago", segmento: "CLAVE", baseAnualEUs: 7500 },
  { nombre: "Súper Mayorista Ñuñoa", comuna: "Ñuñoa", segmento: "CLAVE", baseAnualEUs: 7000 },
  { nombre: "Distribuidora Pacífico", comuna: "Cerrillos", segmento: "CLAVE", baseAnualEUs: 6500 },
  { nombre: "Comercial Hermanos Díaz", comuna: "Renca", segmento: "CLAVE", baseAnualEUs: 6000 },
  { nombre: "Abarrotes La Frontera", comuna: "Independencia", segmento: "CLAVE", baseAnualEUs: 5500 },
  { nombre: "Distribuidora Norte Grande", comuna: "Conchalí", segmento: "CLAVE", baseAnualEUs: 5000 },
  { nombre: "Comercial Las Palmas", comuna: "Peñalolén", segmento: "CLAVE", baseAnualEUs: 4800 },
  { nombre: "Mayorista Río Claro", comuna: "San Joaquín", segmento: "CLAVE", baseAnualEUs: 4500 },
  { nombre: "Distribuidora Aconcagua", comuna: "Quinta Normal", segmento: "CLAVE", baseAnualEUs: 4200 },
  { nombre: "Comercial El Roble", comuna: "El Bosque", segmento: "CLAVE", baseAnualEUs: 4000 },
  { nombre: "Abarrotes Santa Marta", comuna: "Lo Espejo", segmento: "CLAVE", baseAnualEUs: 3800 },
  { nombre: "Distribuidora Mirador", comuna: "Macul", segmento: "CLAVE", baseAnualEUs: 3500 },
  { nombre: "Comercial San Cristóbal", comuna: "Huechuraba", segmento: "CLAVE", baseAnualEUs: 3200 },
  { nombre: "Mayorista Tres Puentes", comuna: "Cerro Navia", segmento: "CLAVE", baseAnualEUs: 3000 },
  { nombre: "Distribuidora Bellavista", comuna: "Providencia", segmento: "CLAVE", baseAnualEUs: 2800 },
];

const DECISORES = [
  "Manuel Rojas", "Carolina Fuentes", "Pedro Salazar", "Ana María Torres",
  "Jorge Castillo", "Patricia Vega", "Luis Morales", "Claudia Herrera",
  "Rodrigo Espinoza", "Marcela Núñez", "Héctor Gallardo", "Verónica Paredes",
];
const ESTILOS = [
  "Negociador duro, foco en precio",
  "Relacional, valora la visita",
  "Analítico, pide data y márgenes",
  "Rápido, decide en la primera reunión",
  "Conservador, evita quiebres de stock",
];
const FRECUENCIAS = ["Semanal", "Quincenal", "Mensual"];

function rutFicticio(i: number): string {
  const num = 76000000 + i * 13579;
  return `${String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${elegir(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "K"])}`;
}

// ---------- main ----------
async function main() {
  console.log("→ Limpiando data existente…");
  const del = await supabase.from("clientes").delete().not("id", "is", null);
  if (del.error) throw new Error(`delete clientes: ${del.error.message}`);

  console.log("→ Insertando 25 clientes…");
  const clientesRows = CLIENTES.map((c, i) => ({
    nombre: c.nombre,
    rut: rutFicticio(i),
    comuna: c.comuna,
    cliente_desde: `${2010 + Math.floor(entre(0, 12))}-0${1 + Math.floor(entre(0, 8))}-01`,
    segmento: c.segmento,
    activo: true,
    dias_inventario: Math.round(entre(12, 65)),
    credito_disponible: rng() < 0.6 ? Math.round(entre(2, 45)) * 1000000 : 0,
  }));

  const ins = await supabase.from("clientes").insert(clientesRows).select("id, nombre");
  if (ins.error) throw new Error(`insert clientes: ${ins.error.message}`);
  const idPorNombre = new Map(ins.data.map((r) => [r.nombre, r.id as string]));

  console.log("→ Generando ventas FY22–FY26 + P1 FY27…");
  interface VentaRow {
    cliente_id: string;
    periodo: string;
    marca: string;
    categoria: string;
    eus: number;
    valor: number;
  }
  const ventas: VentaRow[] = [];
  // plan FY27 = real FY26 por cliente/período
  const fy26PorClientePeriodo = new Map<string, number>();

  for (const c of CLIENTES) {
    const id = idPorNombre.get(c.nombre)!;

    // Portafolio del cliente: TOP3 lleva todo; CLAVE chico pierde 0-3 marcas chicas
    const nDrop = c.segmento === "TOP3" ? 0 : Math.floor(entre(0, 3.99));
    const portafolio = MARCAS.slice(0, MARCAS.length - nDrop).map((m) => ({
      ...m,
      share: m.share * entre(0.75, 1.3),
    }));
    const sumaShare = portafolio.reduce((a, m) => a + m.share, 0);

    // Tendencia FY27 por cliente: ~40% con caída (oportunidad de gap), resto plano/subiendo
    const tendenciaFY27 = rng() < 0.4 ? entre(0.8, 0.97) : entre(0.99, 1.12);

    for (const fy of [2022, 2023, 2024, 2025, 2026, 2027]) {
      const periodos = fy === 2027 ? [1] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const factorFY = fy === 2027 ? tendenciaFY27 : FACTOR_FY[fy];

      for (const p of periodos) {
        for (const m of portafolio) {
          const eusBase =
            (c.baseAnualEUs * factorFY * (m.share / sumaShare) * ESTACIONALIDAD[p - 1]) / 12;
          const eus = Math.max(0, eusBase * entre(0.86, 1.14));
          if (eus < 0.5) continue;
          const eusRed = Math.round(eus * 10) / 10;

          ventas.push({
            cliente_id: id,
            periodo: inicioPeriodo(fy, p),
            marca: m.marca,
            categoria: m.categoria,
            eus: eusRed,
            valor: Math.round(eusRed * m.precioEU * entre(0.96, 1.04)),
          });

          if (fy === 2026) {
            const k = `${id}|${p}`;
            fy26PorClientePeriodo.set(k, (fy26PorClientePeriodo.get(k) ?? 0) + eusRed);
          }
        }
      }
    }
  }

  console.log(`→ Insertando ${ventas.length} filas de ventas…`);
  for (let i = 0; i < ventas.length; i += 500) {
    const lote = ventas.slice(i, i + 500);
    const r = await supabase.from("ventas").insert(lote);
    if (r.error) throw new Error(`insert ventas (lote ${i / 500}): ${r.error.message}`);
    process.stdout.write(`\r   ${Math.min(i + 500, ventas.length)}/${ventas.length}`);
  }
  console.log();

  console.log("→ Pre-cargando plan FY27 = real FY26 (empatar LY)…");
  const planRows: {
    cliente_id: string;
    anio_fiscal: number;
    periodo: number;
    eus_plan: number;
  }[] = [];
  for (const c of CLIENTES) {
    const id = idPorNombre.get(c.nombre)!;
    for (let p = 1; p <= 12; p++) {
      planRows.push({
        cliente_id: id,
        anio_fiscal: 2027,
        periodo: p,
        eus_plan: Math.round(fy26PorClientePeriodo.get(`${id}|${p}`) ?? 0),
      });
    }
  }
  const planRes = await supabase.from("plan_ventas").insert(planRows);
  if (planRes.error) throw new Error(`insert plan: ${planRes.error.message}`);

  console.log("→ Perfiles y notas de ejemplo…");
  const perfiles = CLIENTES.map((c) => ({
    cliente_id: idPorNombre.get(c.nombre)!,
    decisor: elegir(DECISORES),
    estilo_negociacion: elegir(ESTILOS),
    frecuencia_compra: elegir(FRECUENCIAS),
    marcas_afines: [elegir(MARCAS).marca, elegir(MARCAS).marca].filter(
      (v, i, a) => a.indexOf(v) === i,
    ),
    resumen: null,
  }));
  const perfRes = await supabase.from("perfiles").insert(perfiles);
  if (perfRes.error) throw new Error(`insert perfiles: ${perfRes.error.message}`);

  const PLANTILLAS_NOTAS: { tipo: string; texto: string }[] = [
    { tipo: "visita", texto: "Visita de rutina. Bodega con quiebre parcial en JW Red 750cc. Interesado en promo de sept." },
    { tipo: "visita", texto: "Revisamos exhibición. Pide mejor precio por volumen en Smirnoff para el 18." },
    { tipo: "llamada", texto: "Llamada de seguimiento: confirmó pedido pendiente, pide despacho antes del viernes." },
    { tipo: "acuerdo", texto: "Acordamos pallet adicional de Baileys con dcto. 8% para campaña de fin de año." },
    { tipo: "rechazo", texto: "Rechazó incorporar Don Julio: dice que su cliente final no rota tequila premium." },
    { tipo: "nota", texto: "Ojo: competencia directa le ofreció ron a precio agresivo. Monitorear share de Pampero." },
  ];
  const ahora = Date.now();
  const notas = CLIENTES.filter(() => rng() < 0.8).flatMap((c) => {
    const id = idPorNombre.get(c.nombre)!;
    const n = 1 + Math.floor(entre(0, 2.99));
    return Array.from({ length: n }, () => {
      const plantilla = elegir(PLANTILLAS_NOTAS);
      return {
        cliente_id: id,
        fecha: new Date(ahora - entre(1, 90) * 24 * 3600 * 1000).toISOString(),
        tipo: plantilla.tipo,
        contenido_raw: plantilla.texto,
        creado_por_agente: false,
      };
    });
  });
  const notasRes = await supabase.from("notas").insert(notas);
  if (notasRes.error) throw new Error(`insert notas: ${notasRes.error.message}`);

  console.log("✔ Seed listo:");
  console.log(`   ${CLIENTES.length} clientes · ${ventas.length} filas de venta · ${planRows.length} celdas de plan · ${notas.length} notas`);
}

main().catch((e) => {
  console.error("\n✖ Error en seed:", e.message ?? e);
  process.exit(1);
});
