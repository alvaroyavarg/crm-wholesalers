"use client";

import { useMemo, useState, useTransition } from "react";
import { guardarPlan } from "@/app/(app)/actions";
import { etiquetaFY, etiquetaPeriodo, MESES_P } from "@/lib/fiscal";
import { formatEUs } from "@/lib/metrics";
import type { CeldaPlanRow } from "@/lib/types";

// Grid editable del plan de un cliente: 12 períodos fiscales.
// Filas: LY real (referencia "empatar"), Plan (editable), Real, Δ Plan vs LY.
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
  const [valores, setValores] = useState<number[]>(
    celdas.map((c) => Math.round(Number(c.plan_eus))),
  );
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState("");
  const [pendiente, startTransition] = useTransition();

  const totalLy = useMemo(
    () => celdas.reduce((a, c) => a + Number(c.ly_eus), 0),
    [celdas],
  );
  const totalPlan = useMemo(() => valores.reduce((a, v) => a + v, 0), [valores]);
  const totalReal = useMemo(
    () => celdas.reduce((a, c) => a + Number(c.real_eus), 0),
    [celdas],
  );

  function setValor(i: number, v: string) {
    const n = Math.max(0, Math.round(Number(v) || 0));
    setValores((prev) => prev.map((x, j) => (j === i ? n : x)));
    setGuardado(false);
  }

  function empatarLY() {
    setValores(celdas.map((c) => Math.round(Number(c.ly_eus))));
    setGuardado(false);
  }

  function guardar() {
    setError("");
    startTransition(async () => {
      try {
        await guardarPlan(clienteId, fy, valores);
        setGuardado(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  const celdaBase = "px-2 py-2 text-right tabular-nums";

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400">
              <th className="py-2 pr-3 font-medium">EUs</th>
              {celdas.map((c) => (
                <th
                  key={c.periodo}
                  className={`${celdaBase} font-medium ${
                    c.periodo === periodoActual ? "text-verde" : ""
                  }`}
                >
                  {etiquetaPeriodo(c.periodo)}
                  <span className="block text-[10px] font-normal">
                    {MESES_P[c.periodo - 1]}
                  </span>
                </th>
              ))}
              <th className={`${celdaBase} font-semibold`}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50">
              <td className="py-2 pr-3 font-medium text-gray-500">
                {etiquetaFY(fy - 1)} real
              </td>
              {celdas.map((c) => (
                <td key={c.periodo} className={`${celdaBase} text-gray-500`}>
                  {formatEUs(Number(c.ly_eus))}
                </td>
              ))}
              <td className={`${celdaBase} font-semibold text-gray-500`}>
                {formatEUs(totalLy)}
              </td>
            </tr>

            <tr className="border-t border-gray-50">
              <td className="py-2 pr-3 font-medium text-gray-900">
                Plan {etiquetaFY(fy)}
              </td>
              {valores.map((v, i) => (
                <td key={i} className="px-1 py-1.5 text-right">
                  <input
                    type="number"
                    min={0}
                    value={v}
                    onChange={(e) => setValor(i, e.target.value)}
                    className="w-16 rounded-md border border-gray-200 px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-verde focus:ring-1 focus:ring-verde-suave"
                  />
                </td>
              ))}
              <td className={`${celdaBase} font-semibold text-gray-900`}>
                {formatEUs(totalPlan)}
              </td>
            </tr>

            <tr className="border-t border-gray-50">
              <td className="py-2 pr-3 font-medium text-gray-900">
                {etiquetaFY(fy)} real
              </td>
              {celdas.map((c, i) => (
                <td
                  key={c.periodo}
                  className={`${celdaBase} font-medium ${
                    c.periodo > periodoActual
                      ? "text-gray-300"
                      : Number(c.real_eus) >= valores[i]
                        ? "text-verde"
                        : "text-rojo"
                  }`}
                >
                  {c.periodo > periodoActual
                    ? "·"
                    : formatEUs(Number(c.real_eus))}
                </td>
              ))}
              <td className={`${celdaBase} font-semibold`}>
                {formatEUs(totalReal)}
              </td>
            </tr>

            <tr className="border-t border-gray-100">
              <td className="py-2 pr-3 font-medium text-gray-400">
                Δ plan vs LY
              </td>
              {celdas.map((c, i) => {
                const d = valores[i] - Number(c.ly_eus);
                return (
                  <td
                    key={c.periodo}
                    className={`${celdaBase} ${
                      d === 0
                        ? "text-gray-300"
                        : d > 0
                          ? "text-verde"
                          : "text-rojo"
                    }`}
                  >
                    {d > 0 ? "+" : ""}
                    {formatEUs(d)}
                  </td>
                );
              })}
              <td
                className={`${celdaBase} font-semibold ${
                  totalPlan - totalLy >= 0 ? "text-verde" : "text-rojo"
                }`}
              >
                {totalPlan - totalLy > 0 ? "+" : ""}
                {formatEUs(totalPlan - totalLy)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={guardar}
          disabled={pendiente}
          className="rounded-lg bg-verde px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar plan"}
        </button>
        <button
          onClick={empatarLY}
          disabled={pendiente}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
        >
          Empatar {etiquetaFY(fy - 1)}
        </button>
        {guardado && <span className="text-sm text-verde">✓ Plan guardado</span>}
        {error && <span className="text-sm text-rojo">{error}</span>}
      </div>
    </div>
  );
}
