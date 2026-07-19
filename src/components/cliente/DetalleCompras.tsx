"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { etiquetaFY, etiquetaPeriodo, MESES_P } from "@/lib/fiscal";
import { formatEUs, formatPct, pctVsLY } from "@/lib/metrics";
import type { ItemDetalle } from "@/lib/types";

// Explorador de compras del cliente: emula la tabla dinámica del Excel.
// Dimensión (Categoría / Marca / SKU) × P1..P12, FY seleccionable,
// comparación celda a celda vs el mismo mes del FY anterior.

type Dimension = "categoria" | "marca" | "sku";

const DIMENSIONES: { valor: Dimension; etiqueta: string }[] = [
  { valor: "categoria", etiqueta: "Categoría" },
  { valor: "marca", etiqueta: "Marca" },
  { valor: "sku", etiqueta: "SKU (marca + formato)" },
];

interface FilaPivot {
  clave: string;
  actual: number[]; // 12 períodos
  ly: number[];
  total: number;
  totalLy: number;
}

export function DetalleCompras({
  clienteId,
  fy,
  fys,
  periodoActual,
  fyActual,
  items,
}: {
  clienteId: string;
  fy: number; // FY mostrado
  fys: number[];
  periodoActual: number;
  fyActual: number; // FY fiscal de hoy
  items: ItemDetalle[] | null;
}) {
  const [dimension, setDimension] = useState<Dimension>("marca");
  const [compararLy, setCompararLy] = useState(true);

  const filas = useMemo<FilaPivot[]>(() => {
    if (!items) return [];
    const mapa = new Map<string, FilaPivot>();
    for (const it of items) {
      const clave =
        dimension === "categoria"
          ? it.categoria
          : dimension === "marca"
            ? it.marca
            : `${it.marca}${it.formato ? ` · ${it.formato}` : ""}`;
      let f = mapa.get(clave);
      if (!f) {
        f = { clave, actual: Array(12).fill(0), ly: Array(12).fill(0), total: 0, totalLy: 0 };
        mapa.set(clave, f);
      }
      for (const [p, [eus, eusLy]] of Object.entries(it.meses)) {
        const i = Number(p) - 1;
        f.actual[i] += Number(eus);
        f.ly[i] += Number(eusLy);
      }
      f.total += Number(it.total);
      f.totalLy += Number(it.total_ly);
    }
    return [...mapa.values()].sort(
      (a, b) => b.total - a.total || b.totalLy - a.totalLy,
    );
  }, [items, dimension]);

  const totalFila = useMemo<FilaPivot>(() => {
    const t: FilaPivot = {
      clave: "Total",
      actual: Array(12).fill(0),
      ly: Array(12).fill(0),
      total: 0,
      totalLy: 0,
    };
    for (const f of filas) {
      for (let i = 0; i < 12; i++) {
        t.actual[i] += f.actual[i];
        t.ly[i] += f.ly[i];
      }
      t.total += f.total;
      t.totalLy += f.totalLy;
    }
    return t;
  }, [filas]);

  if (items === null) {
    return (
      <p className="rounded-xl bg-ambar-suave px-4 py-3 text-sm text-ambar">
        Falta ejecutar la migración 0005 (detalle_cliente) en Supabase para ver
        el detalle de compras.
      </p>
    );
  }

  // Un período es "futuro" solo si estamos mirando el FY fiscal actual
  const esFuturo = (p: number) => fy === fyActual && p > periodoActual;

  function celda(f: FilaPivot, i: number) {
    const v = f.actual[i];
    const ly = f.ly[i];
    if (esFuturo(i + 1)) {
      return <span className="text-gray-300">·</span>;
    }
    if (v === 0 && ly === 0) return <span className="text-gray-200">·</span>;
    const color = !compararLy
      ? "text-gray-700"
      : v >= ly
        ? v > 0
          ? "text-verde"
          : "text-gray-400"
        : "text-rojo";
    return (
      <span className={color} title={`${etiquetaFY(fy - 1)}: ${formatEUs(ly)} EUs`}>
        {v === 0 ? "0" : formatEUs(v)}
      </span>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {DIMENSIONES.map((d) => (
            <button
              key={d.valor}
              onClick={() => setDimension(d.valor)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                dimension === d.valor
                  ? "bg-verde text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {d.etiqueta}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={compararLy}
              onChange={(e) => setCompararLy(e.target.checked)}
              className="accent-verde"
            />
            vs {etiquetaFY(fy - 1)}
          </label>
          <div className="flex gap-1">
            {fys.map((f) => (
              <Link
                key={f}
                href={`/clientes/${clienteId}?fy=${f}`}
                scroll={false}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  f === fy
                    ? "bg-azul text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {etiquetaFY(f)}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="max-h-[26rem] overflow-auto rounded-xl border border-gray-100">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#f3f4f6]">
            <tr className="text-left text-gray-400">
              <th className="sticky left-0 bg-white py-2 pl-3 pr-2 font-medium">
                {DIMENSIONES.find((d) => d.valor === dimension)?.etiqueta}
              </th>
              {MESES_P.map((m, i) => (
                <th
                  key={m}
                  className={`px-1.5 py-2 text-right font-medium ${
                    fy === fyActual && i + 1 === periodoActual ? "text-verde" : ""
                  }`}
                >
                  {etiquetaPeriodo(i + 1)}
                  <span className="block text-[10px] font-normal">{m}</span>
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold text-gray-600">
                Total
              </th>
              <th className="py-2 pl-1.5 pr-3 text-right font-medium">
                vs {etiquetaFY(fy - 1)}
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr
                key={f.clave}
                className="border-t border-gray-50 hover:bg-gray-50/60"
              >
                <td
                  className="sticky left-0 max-w-44 truncate bg-white py-2 pl-3 pr-2 font-medium text-gray-800"
                  title={f.clave}
                >
                  {f.clave}
                </td>
                {MESES_P.map((_, i) => (
                  <td key={i} className="px-1.5 py-2 text-right tabular-nums">
                    {celda(f, i)}
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-gray-900">
                  {formatEUs(f.total)}
                </td>
                <td className="py-2 pl-1.5 pr-3 text-right tabular-nums">
                  <span
                    className={
                      f.totalLy === 0
                        ? "text-gray-300"
                        : f.total >= f.totalLy
                          ? "text-verde"
                          : "text-rojo"
                    }
                    title={`${etiquetaFY(fy - 1)}: ${formatEUs(f.totalLy)} EUs`}
                  >
                    {formatPct(pctVsLY(f.total, f.totalLy), 0)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-gray-50">
            <tr className="border-t border-gray-100 font-semibold text-gray-900">
              <td className="sticky left-0 bg-gray-50 py-2 pl-3 pr-2">Total</td>
              {MESES_P.map((_, i) => (
                <td key={i} className="px-1.5 py-2 text-right tabular-nums">
                  {celda(totalFila, i)}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums">
                {formatEUs(totalFila.total)}
              </td>
              <td className="py-2 pl-1.5 pr-3 text-right tabular-nums">
                {formatPct(pctVsLY(totalFila.total, totalFila.totalLy), 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        Celdas verdes: igual o sobre el mismo mes de {etiquetaFY(fy - 1)} ·
        rojas: por debajo · pasa el mouse para ver el valor LY. La fila Total y
        el % de la derecha comparan el FY completo.
      </p>
    </div>
  );
}
