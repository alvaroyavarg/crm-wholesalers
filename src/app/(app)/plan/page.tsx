import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PlanGrid } from "@/components/plan/PlanGrid";
import { TablaPlanCartera } from "@/components/plan/TablaPlanCartera";
import { etiquetaFY, etiquetaPeriodo } from "@/lib/fiscal";
import { planMatriz, serieCanal } from "@/lib/queries";
import type { CeldaPlanRow, Segmento } from "@/lib/types";

export const dynamic = "force-dynamic";

interface FilaCliente {
  cliente_id: string;
  nombre: string;
  segmento: Segmento;
  celdas: CeldaPlanRow[];
  lyTotal: number;
  planTotal: number;
  realYtd: number;
  planYtd: number;
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const { cliente: clienteSel } = await searchParams;
  const [{ fy, periodo, celdas }, canal] = await Promise.all([
    planMatriz(),
    serieCanal(),
  ]);

  // Agrupar celdas por cliente
  const porCliente = new Map<string, FilaCliente>();
  for (const c of celdas) {
    let fila = porCliente.get(c.cliente_id);
    if (!fila) {
      fila = {
        cliente_id: c.cliente_id,
        nombre: c.nombre_corto ?? c.nombre,
        segmento: c.segmento,
        celdas: [],
        lyTotal: 0,
        planTotal: 0,
        realYtd: 0,
        planYtd: 0,
      };
      porCliente.set(c.cliente_id, fila);
    }
    fila.celdas.push(c);
    fila.lyTotal += Number(c.ly_eus);
    fila.planTotal += Number(c.plan_eus);
    if (c.periodo <= periodo) {
      fila.realYtd += Number(c.real_eus);
      fila.planYtd += Number(c.plan_eus);
    }
  }
  const filas = [...porCliente.values()].sort((a, b) => b.lyTotal - a.lyTotal);
  const seleccionado = clienteSel ? porCliente.get(clienteSel) : undefined;

  const totales = filas.reduce(
    (acc, f) => ({
      ly: acc.ly + f.lyTotal,
      plan: acc.plan + f.planTotal,
      realYtd: acc.realYtd + f.realYtd,
      planYtd: acc.planYtd + f.planYtd,
    }),
    { ly: 0, plan: 0, realYtd: 0, planYtd: 0 },
  );

  // Resto del canal (cola larga KOA/KOE): meta implícita = empatar su LY.
  const canalLyTotal = canal.serie.reduce((a, p) => a + Number(p.eus_ly), 0);
  const canalRealYtd = canal.serie
    .filter((p) => p.periodo <= periodo)
    .reduce((a, p) => a + Number(p.eus_actual), 0);
  const canalLyYtd = canal.serie
    .filter((p) => p.periodo <= periodo)
    .reduce((a, p) => a + Number(p.eus_ly), 0);
  const resto = {
    ly: canalLyTotal - totales.ly,
    plan: canalLyTotal - totales.ly, // empatar LY
    realYtd: canalRealYtd - totales.realYtd,
    planYtd: canalLyYtd - totales.planYtd > 0 ? canalLyYtd - totales.planYtd : 0,
  };
  const hayResto = resto.ly > 0 || resto.realYtd > 0;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-gray-900">
          Plan de venta {etiquetaFY(fy)}
        </h1>
        <p className="text-sm text-gray-500">
          Meta base: empatar {etiquetaFY(fy - 1)} mes a mes · Vamos en{" "}
          {etiquetaPeriodo(periodo)}
        </p>
      </header>

      {seleccionado ? (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg font-semibold text-gray-900">
                {seleccionado.nombre}
              </h2>
              <Chip
                variante={seleccionado.segmento === "TOP3" ? "verde" : "azul"}
              >
                {seleccionado.segmento}
              </Chip>
            </div>
            <Link
              href="/plan"
              className="text-sm text-gray-400 hover:text-verde"
            >
              ← Toda la cartera
            </Link>
          </div>
          <PlanGrid
            clienteId={seleccionado.cliente_id}
            fy={fy}
            periodoActual={periodo}
            celdas={seleccionado.celdas}
          />
        </Card>
      ) : (
        <Card className="p-0">
          <TablaPlanCartera
            filas={filas.map((f) => ({
              cliente_id: f.cliente_id,
              nombre: f.nombre,
              segmento: f.segmento,
              lyTotal: f.lyTotal,
              planTotal: f.planTotal,
              realYtd: f.realYtd,
              planYtd: f.planYtd,
            }))}
            fy={fy}
            totales={totales}
            resto={resto}
            hayResto={hayResto}
            canalRealYtd={canalRealYtd}
          />
        </Card>
      )}
    </div>
  );
}
