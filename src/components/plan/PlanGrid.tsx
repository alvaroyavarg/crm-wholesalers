import Link from "next/link";
import { etiquetaFY, MESES_P } from "@/lib/fiscal";
import { formatEUs } from "@/lib/metrics";
import type { CeldaPlanRow } from "@/lib/types";

// Vista anual de un cliente: 12 períodos fiscales, solo lectura.
// La meta de cada mes es la suma de sus metas por SKU y se trabaja en Meta.
export function PlanGrid({
  clienteId,
  fy,
  periodoActual,
  celdas,
}: {
  clienteId: string;
  fy: number;
  periodoActual: number;
  celdas: CeldaPlanRow[]; // 12 filas ordenadas P1..P12
}) {
  const totalLy = celdas.reduce((a, c) => a + Number(c.ly_eus), 0);
  const totalPlan = celdas.reduce((a, c) => a + Number(c.plan_eus), 0);
  const totalReal = celdas.reduce((a, c) => a + Number(c.real_eus), 0);
  const celdaBase = "px-2 py-2 text-right text-xs tabular-nums";

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-xs text-gray-400">
              <th className="py-2 pr-3 text-left font-medium">Período</th>
              {celdas.map((c) => (
                <th key={c.periodo} className="px-2 py-2 text-right font-medium">
                  <Link href={`/meta?fy=${fy}&periodo=${c.periodo}&cliente=${clienteId}`} className="hover:text-verde" title="Trabajar la meta de este mes por SKU">
                    P{c.periodo}
                    <span className="block text-[10px] font-normal">{MESES_P[c.periodo - 1]}</span>
                  </Link>
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-100">
              <td className="py-2 pr-3 font-medium text-gray-500">{etiquetaFY(fy - 1)} real</td>
              {celdas.map((c) => (
                <td key={c.periodo} className={`${celdaBase} text-gray-500`}>{formatEUs(Number(c.ly_eus))}</td>
              ))}
              <td className={`${celdaBase} font-semibold text-gray-500`}>{formatEUs(totalLy)}</td>
            </tr>
            <tr className="border-t border-gray-50">
              <td className="py-2 pr-3 font-medium text-gray-900">Meta {etiquetaFY(fy)}</td>
              {celdas.map((c) => (
                <td key={c.periodo} className={`${celdaBase} font-medium text-gray-900`}>
                  <Link href={`/meta?fy=${fy}&periodo=${c.periodo}&cliente=${clienteId}`} className="rounded px-1 hover:bg-gray-100 hover:text-verde" title="La meta es la suma de metas por SKU: se asigna en Meta">
                    {Number(c.plan_eus) > 0 ? formatEUs(Number(c.plan_eus)) : "—"}
                  </Link>
                </td>
              ))}
              <td className={`${celdaBase} font-semibold text-gray-900`}>{formatEUs(totalPlan)}</td>
            </tr>
            <tr className="border-t border-gray-50">
              <td className="py-2 pr-3 font-medium text-gray-900">{etiquetaFY(fy)} real</td>
              {celdas.map((c) => (
                <td
                  key={c.periodo}
                  className={`${celdaBase} font-medium ${
                    c.periodo > periodoActual ? "text-gray-300" : Number(c.real_eus) >= Number(c.plan_eus) ? "text-verde" : "text-rojo"
                  }`}
                >
                  {c.periodo > periodoActual ? "·" : formatEUs(Number(c.real_eus))}
                </td>
              ))}
              <td className={`${celdaBase} font-semibold`}>{formatEUs(totalReal)}</td>
            </tr>
            <tr className="border-t border-gray-100">
              <td className="py-2 pr-3 font-medium text-gray-400">Δ meta vs LY</td>
              {celdas.map((c) => {
                const d = Number(c.plan_eus) - Number(c.ly_eus);
                return (
                  <td key={c.periodo} className={`${celdaBase} ${d === 0 ? "text-gray-300" : d > 0 ? "text-verde" : "text-rojo"}`}>
                    {d > 0 ? "+" : ""}{formatEUs(d)}
                  </td>
                );
              })}
              <td className={`${celdaBase} font-semibold ${totalPlan - totalLy >= 0 ? "text-verde" : "text-rojo"}`}>
                {totalPlan - totalLy > 0 ? "+" : ""}{formatEUs(totalPlan - totalLy)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-gray-400">
        Solo lectura. La meta de cada mes es la suma de sus metas por SKU: toca un mes para trabajarla en Meta. El mes en curso se compara con la venta cargada hasta la fecha.
      </p>
    </div>
  );
}
