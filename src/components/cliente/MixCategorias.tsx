"use client";

import { useState } from "react";
import { formatEUs } from "@/lib/metrics";
import type { MixCategoriaRow, MixSkuRow, Segmento } from "@/lib/types";

// Mix por categoría (últimos 12 meses): barra = share del cliente,
// marca vertical = share del benchmark (segmento para CLAVE, canal completo
// para TOP3 porque son solo 3 cuentas).
// Clic en una categoría → desglose por SKU, incluyendo los que el cliente
// NO compra pero sus pares sí (oportunidad de portafolio).
export function MixCategorias({
  mix,
  skus,
  segmento,
}: {
  mix: MixCategoriaRow[];
  skus: MixSkuRow[] | null;
  segmento: Segmento;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);

  const benchDe = (r: { eus_segmento: number; eus_cartera?: number; eus_canal?: number }) =>
    Number(segmento === "TOP3" ? (r.eus_cartera ?? r.eus_canal ?? 0) : r.eus_segmento);

  const totalCliente = mix.reduce((a, r) => a + Number(r.eus_cliente), 0);
  const totalBench = mix.reduce((a, r) => a + benchDe(r), 0);

  if (totalCliente === 0) {
    return (
      <p className="text-sm text-gray-400">Sin ventas en los últimos 12 meses.</p>
    );
  }

  const filas = mix
    .map((r) => ({
      categoria: r.categoria,
      pctCliente: (Number(r.eus_cliente) / totalCliente) * 100,
      pctBench: totalBench > 0 ? (benchDe(r) / totalBench) * 100 : 0,
    }))
    .sort((a, b) => b.pctCliente - a.pctCliente);

  const max = Math.max(...filas.map((f) => Math.max(f.pctCliente, f.pctBench)), 1);

  function desgloseDe(categoria: string) {
    if (!skus) return null;
    const deLaCategoria = skus.filter((s) => s.categoria === categoria);
    const totCliente = deLaCategoria.reduce((a, s) => a + Number(s.eus_cliente), 0);
    const totBench = deLaCategoria.reduce((a, s) => a + benchDe(s), 0);
    return deLaCategoria
      .map((s) => ({
        sku: `${s.marca}${s.formato ? ` · ${s.formato}` : ""}`,
        eus: Number(s.eus_cliente),
        pctCliente: totCliente > 0 ? (Number(s.eus_cliente) / totCliente) * 100 : 0,
        pctBench: totBench > 0 ? (benchDe(s) / totBench) * 100 : 0,
      }))
      .filter((s) => s.eus > 0 || s.pctBench >= 1)
      .sort((a, b) => b.eus - a.eus || b.pctBench - a.pctBench);
  }

  return (
    <div className="space-y-3">
      {filas.map((f) => {
        const gap = f.pctCliente - f.pctBench;
        const abiertaEsta = abierta === f.categoria;
        const desglose = abiertaEsta ? desgloseDe(f.categoria) : null;
        return (
          <div key={f.categoria}>
            <button
              onClick={() => setAbierta(abiertaEsta ? null : f.categoria)}
              className="block w-full text-left"
              title={abiertaEsta ? "Cerrar desglose" : "Ver desglose por SKU"}
            >
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="font-medium text-gray-700">
                  <span className="mr-1 inline-block w-3 text-gray-400">
                    {abiertaEsta ? "▾" : "▸"}
                  </span>
                  {f.categoria}
                </span>
                <span className="text-gray-400">
                  {f.pctCliente.toFixed(1)}%{" "}
                  <span className={gap >= 0 ? "text-verde" : "text-rojo"}>
                    ({gap >= 0 ? "+" : ""}
                    {gap.toFixed(1)} pp vs pares)
                  </span>
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-verde/80"
                  style={{ width: `${(f.pctCliente / max) * 100}%` }}
                />
                <div
                  className="absolute top-[-2px] h-[16px] w-[2px] rounded bg-azul"
                  style={{ left: `${(f.pctBench / max) * 100}%` }}
                />
              </div>
            </button>

            {abiertaEsta && (
              <div className="ml-4 mt-2 rounded-xl bg-gray-50/80 px-3 py-2">
                {desglose === null ? (
                  <p className="py-1 text-xs text-ambar">
                    Falta ejecutar la migración 0006 (mix_skus) en Supabase para
                    ver el desglose.
                  </p>
                ) : desglose.length === 0 ? (
                  <p className="py-1 text-xs text-gray-400">
                    Sin movimiento en esta categoría.
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400">
                        <th className="py-1 font-medium">SKU</th>
                        <th className="py-1 text-right font-medium">EUs 12m</th>
                        <th className="py-1 text-right font-medium">
                          % en la categoría
                        </th>
                        <th className="py-1 text-right font-medium">vs pares</th>
                      </tr>
                    </thead>
                    <tbody>
                      {desglose.map((s) => {
                        const gapSku = s.pctCliente - s.pctBench;
                        const noCompra = s.eus === 0;
                        return (
                          <tr
                            key={s.sku}
                            className="border-t border-gray-100/80"
                          >
                            <td className="py-1.5 pr-2 text-gray-700">
                              {s.sku}
                              {noCompra && (
                                <span className="ml-2 rounded-full bg-ambar-suave px-1.5 py-0.5 text-[10px] font-medium text-ambar">
                                  No compra · pares sí
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-gray-900">
                              {noCompra ? "—" : formatEUs(s.eus)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-gray-500">
                              {noCompra ? "—" : `${s.pctCliente.toFixed(1)}%`}
                            </td>
                            <td
                              className={`py-1.5 text-right tabular-nums ${
                                gapSku >= 0 ? "text-verde" : "text-rojo"
                              }`}
                              title={`Pares: ${s.pctBench.toFixed(1)}% de la categoría`}
                            >
                              {gapSku >= 0 ? "+" : ""}
                              {gapSku.toFixed(1)} pp
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-gray-400">
        Barra verde: mix del cliente · Marca azul: promedio{" "}
        {segmento === "TOP3" ? "del canal completo" : "del segmento CLAVE"}{" "}
        (últimos 12 meses) · Clic en una categoría para el desglose por SKU
      </p>
    </div>
  );
}
