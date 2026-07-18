/**
 * Importa la base real de ventas (Excel con hoja BBDD) desde la línea de comandos.
 *
 * Uso:
 *   npm run importar -- "<ruta al .xlsx>" [--limpiar] [--plan]
 *
 *   --limpiar  Borra TODOS los clientes existentes antes (elimina el seed
 *              ficticio y todo lo asociado: ventas, notas, perfiles, contactos).
 *   --plan     Regenera el plan del FY actual = real del FY anterior (empatar LY)
 *              para las cuentas activas.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { importarBase, parsearBase } from "../src/lib/importar/core";

function cargarEnvLocal() {
  try {
    const contenido = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const linea of contenido.split("\n")) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* variables ya en el entorno */
  }
}
cargarEnvLocal();

const args = process.argv.slice(2);
const ruta = args.find((a) => !a.startsWith("--"));
const limpiar = args.includes("--limpiar");
const regenerarPlan = args.includes("--plan");

if (!ruta) {
  console.error('Uso: npm run importar -- "<ruta al .xlsx>" [--limpiar] [--plan]');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  console.log(`→ Leyendo ${ruta}…`);
  const filas = parsearBase(readFileSync(ruta!));
  console.log(`   ${filas.length} filas de la base`);

  if (limpiar) {
    console.log("→ Limpiando data existente (--limpiar)…");
    const del = await supabase.from("clientes").delete().not("id", "is", null);
    if (del.error) throw new Error(`limpiar: ${del.error.message}`);
  }

  // FY actual según fecha de hoy (jul-dic → año+1)
  const hoy = new Date();
  const fyActual = hoy.getMonth() >= 6 ? hoy.getFullYear() + 1 : hoy.getFullYear();

  console.log("→ Importando…");
  const r = await importarBase(supabase, filas, {
    regenerarPlan,
    fyPlan: fyActual,
  });

  console.log("\n✔ Import listo:");
  console.log(`   Clientes: ${r.clientesTotal} en el archivo (${r.clientesNuevos} nuevos)`);
  console.log(`   Ventas: ${r.filasVentas} filas agregadas en ${r.periodos.length} períodos (${r.periodos[0]} → ${r.periodos[r.periodos.length - 1]})`);
  console.log(`   EUs por FY: ${Object.entries(r.porFY).map(([k, v]) => `${k}: ${Math.round(v).toLocaleString("es-CL")}`).join(" · ")}`);
  if (regenerarPlan) console.log(`   Plan FY${String(fyActual).slice(-2)} regenerado = real FY${String(fyActual - 1).slice(-2)} (cuentas activas)`);
}

main().catch((e) => {
  console.error("\n✖ Error:", e.message ?? e);
  process.exit(1);
});
