"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { etiquetaFY } from "@/lib/fiscal";
import { formatEUs, formatPct, pctVsLY } from "@/lib/metrics";
import type { Segmento } from "@/lib/types";

export interface FilaPlan {
  cliente_id: string;
  nombre: string;
  segmento: Segmento;
  lyTotal: number;
  planTotal: number;
  realYtd: number;
  planYtd: number;
}

interface Totales {
  ly: number;
  plan: number;
  realYtd: number;
  planYtd: number;
}

export function TablaPlanCartera({
  filas,
  fy,
  totales,
  resto,
  hayResto,
  canalRealYtd,
}: {
  filas: FilaPlan[];
  fy: number;
  totales: Totales;
  resto: Totales;
  hayResto: boolean;
  canalRealYtd: number;
}) {
  const [busqueda, setBusqueda] = useState("");

  const filtradas = useMemo(() => {
    const terminos = busqueda.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terminos.length === 0) return filas;
    return filas.filter((f) =>
      terminos.every((t) => f.nombre.toLowerCase().includes(t)),
    );
  }, [filas, busqueda]);

  const buscando = busqueda.trim().length > 0;

  const totalFiltro = useMemo<Totales>(
    () =>
      filtradas.reduce(
        (a, f) => ({
          ly: a.ly + f.lyTotal,
          plan: a.plan + f.planTotal,
          realYtd: a.realYtd + f.realYtd,
          planYtd: a.planYtd + f.planYtd,
        }),
        { ly: 0, plan: 0, realYtd: 0, planYtd: 0 },
      ),
    [filtradas],
  );

  const celda = "px-3 py-3 text-right tabular-nums";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <h2 className="font-display text-base font-semibold text-gray-900">
          Cartera completa
        </h2>
        <div className="relative w-full max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
            🔍
          </span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente…"
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-9 pr-8 text-sm outline-none focus:border-verde focus:ring-2 focus:ring-verde-suave"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Limpiar"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
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
            <th className="px-3 py-3 text-right font-medium">Real YTD</th>
            <th className="px-3 py-3 text-right font-medium">Cumplimiento YTD</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {filtradas.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-6 text-center text-gray-400">
                Sin clientes que coincidan con “{busqueda}”.
              </td>
            </tr>
          )}
          {filtradas.map((f) => {
            const cumplimiento =
              f.planYtd > 0 ? (f.realYtd / f.planYtd) * 100 : null;
            return (
              <tr
                key={f.cliente_id}
                className="border-b border-gray-50 transition hover:bg-gray-50/60"
              >
                <td className="px-5 py-3">
                  <span className="font-medium text-gray-900">{f.nombre}</span>{" "}
                  <Chip variante={f.segmento === "TOP3" ? "verde" : "azul"}>
                    {f.segmento}
                  </Chip>
                </td>
                <td className={`${celda} text-gray-500`}>
                  {formatEUs(f.lyTotal)}
                </td>
                <td className={`${celda} font-medium text-gray-900`}>
                  {formatEUs(f.planTotal)}
                </td>
                <td className={celda}>
                  <Chip variante={f.planTotal - f.lyTotal >= 0 ? "verde" : "rojo"}>
                    {formatPct(pctVsLY(f.planTotal, f.lyTotal))}
                  </Chip>
                </td>
                <td className={`${celda} text-gray-900`}>
                  {formatEUs(f.realYtd)}
                </td>
                <td
                  className={`${celda} font-medium ${
                    cumplimiento == null
                      ? "text-gray-300"
                      : cumplimiento >= 95
                        ? "text-verde"
                        : cumplimiento >= 80
                          ? "text-ambar"
                          : "text-rojo"
                  }`}
                >
                  {cumplimiento == null ? "—" : `${Math.round(cumplimiento)}%`}
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
          {buscando ? (
            <tr className="bg-gray-50/60 font-semibold text-gray-900">
              <td className="px-5 py-3">Total filtrado ({filtradas.length})</td>
              <td className={celda}>{formatEUs(totalFiltro.ly)}</td>
              <td className={celda}>{formatEUs(totalFiltro.plan)}</td>
              <td className={celda}>
                {formatPct(pctVsLY(totalFiltro.plan, totalFiltro.ly))}
              </td>
              <td className={celda}>{formatEUs(totalFiltro.realYtd)}</td>
              <td className={celda}>
                {totalFiltro.planYtd > 0
                  ? `${Math.round((totalFiltro.realYtd / totalFiltro.planYtd) * 100)}%`
                  : "—"}
              </td>
              <td />
            </tr>
          ) : (
            <>
              <tr className="bg-gray-50/60 font-semibold text-gray-900">
                <td className="px-5 py-3">Total cartera</td>
                <td className={celda}>{formatEUs(totales.ly)}</td>
                <td className={celda}>{formatEUs(totales.plan)}</td>
                <td className={celda}>
                  {formatPct(pctVsLY(totales.plan, totales.ly))}
                </td>
                <td className={celda}>{formatEUs(totales.realYtd)}</td>
                <td className={celda}>
                  {totales.planYtd > 0
                    ? `${Math.round((totales.realYtd / totales.planYtd) * 100)}%`
                    : "—"}
                </td>
                <td />
              </tr>
              {hayResto && (
                <>
                  <tr className="text-gray-500">
                    <td className="px-5 py-3">
                      Resto del canal (cola larga)
                      <span className="ml-2 text-xs text-gray-400">
                        meta = empatar LY
                      </span>
                    </td>
                    <td className={celda}>{formatEUs(resto.ly)}</td>
                    <td className={celda}>{formatEUs(resto.plan)}</td>
                    <td className={celda}>—</td>
                    <td className={celda}>{formatEUs(resto.realYtd)}</td>
                    <td className={celda}>
                      {resto.planYtd > 0
                        ? `${Math.round((resto.realYtd / resto.planYtd) * 100)}%`
                        : "—"}
                    </td>
                    <td />
                  </tr>
                  <tr className="border-t-2 border-gray-200 bg-verde-suave/40 font-semibold text-gray-900">
                    <td className="px-5 py-3">Total canal completo</td>
                    <td className={celda}>{formatEUs(totales.ly + resto.ly)}</td>
                    <td className={celda}>
                      {formatEUs(totales.plan + resto.plan)}
                    </td>
                    <td className={celda}>
                      {formatPct(
                        pctVsLY(totales.plan + resto.plan, totales.ly + resto.ly),
                      )}
                    </td>
                    <td className={celda}>{formatEUs(canalRealYtd)}</td>
                    <td className={celda}>
                      {totales.planYtd + resto.planYtd > 0
                        ? `${Math.round((canalRealYtd / (totales.planYtd + resto.planYtd)) * 100)}%`
                        : "—"}
                    </td>
                    <td />
                  </tr>
                </>
              )}
            </>
          )}
        </tfoot>
      </table>
      </div>
    </div>
  );
}
