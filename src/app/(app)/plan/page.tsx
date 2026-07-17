import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PlanGrid } from "@/components/plan/PlanGrid";
import { etiquetaFY, etiquetaPeriodo } from "@/lib/fiscal";
import { formatEUs, formatPct, pctVsLY } from "@/lib/metrics";
import { planMatriz } from "@/lib/queries";
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
  const { fy, periodo, celdas } = await planMatriz();

  // Agrupar celdas por cliente
  const porCliente = new Map<string, FilaCliente>();
  for (const c of celdas) {
    let fila = porCliente.get(c.cliente_id);
    if (!fila) {
      fila = {
        cliente_id: c.cliente_id,
        nombre: c.nombre,
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
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-gray-900">
              Cartera completa
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 text-right font-medium">
                  {etiquetaFY(fy - 1)} real
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  Plan {etiquetaFY(fy)}
                </th>
                <th className="px-3 py-3 text-right font-medium">Δ plan vs LY</th>
                <th className="px-3 py-3 text-right font-medium">
                  Real YTD
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  Cumplimiento YTD
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const cumplimiento =
                  f.planYtd > 0 ? (f.realYtd / f.planYtd) * 100 : null;
                return (
                  <tr
                    key={f.cliente_id}
                    className="border-b border-gray-50 transition hover:bg-gray-50/60"
                  >
                    <td className="px-5 py-3">
                      <span className="font-medium text-gray-900">
                        {f.nombre}
                      </span>{" "}
                      <Chip
                        variante={f.segmento === "TOP3" ? "verde" : "azul"}
                      >
                        {f.segmento}
                      </Chip>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                      {formatEUs(f.lyTotal)}
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums text-gray-900">
                      {formatEUs(f.planTotal)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <Chip
                        variante={
                          f.planTotal - f.lyTotal >= 0 ? "verde" : "rojo"
                        }
                      >
                        {formatPct(pctVsLY(f.planTotal, f.lyTotal))}
                      </Chip>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                      {formatEUs(f.realYtd)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-medium tabular-nums ${
                        cumplimiento == null
                          ? "text-gray-300"
                          : cumplimiento >= 95
                            ? "text-verde"
                            : cumplimiento >= 80
                              ? "text-ambar"
                              : "text-rojo"
                      }`}
                    >
                      {cumplimiento == null
                        ? "—"
                        : `${Math.round(cumplimiento)}%`}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/plan?cliente=${f.cliente_id}`}
                        className="text-sm font-medium text-verde hover:underline"
                      >
                        Editar plan
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50/60 font-semibold text-gray-900">
                <td className="px-5 py-3">Total cartera</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatEUs(totales.ly)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatEUs(totales.plan)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatPct(pctVsLY(totales.plan, totales.ly))}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatEUs(totales.realYtd)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {totales.planYtd > 0
                    ? `${Math.round((totales.realYtd / totales.planYtd) * 100)}%`
                    : "—"}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
