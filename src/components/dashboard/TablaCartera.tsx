"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { etiquetaFY, etiquetaPeriodo } from "@/lib/fiscal";
import { formatEUs, formatFecha, formatPct } from "@/lib/metrics";
import type { Segmento, Senal } from "@/lib/types";

// Tabla de cartera ordenable por columna (clic en el encabezado).
export interface FilaCartera {
  id: string;
  nombre: string;
  nombreCompleto: string;
  segmento: Segmento;
  ytd: number;
  vsLy: number | null;
  mtd: number;
  mesLy: number;
  avance: number | null;
  senales: Senal[];
  ultimaVisita: string | null;
}

type Columna = "nombre" | "ytd" | "vsLy" | "mtd" | "mesLy" | "avance" | "ultimaVisita";

export function TablaCartera({
  filas,
  fy,
  periodo,
}: {
  filas: FilaCartera[];
  fy: number;
  periodo: number;
}) {
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({
    col: "ytd",
    asc: false,
  });
  const [busqueda, setBusqueda] = useState("");

  const filtradas = useMemo(() => {
    const terminos = busqueda.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terminos.length === 0) return filas;
    return filas.filter((f) => {
      const nombre = `${f.nombre} ${f.nombreCompleto}`.toLowerCase();
      return terminos.every((t) => nombre.includes(t));
    });
  }, [filas, busqueda]);

  function ordenarPor(col: Columna) {
    setOrden((prev) =>
      prev.col === col ? { col, asc: !prev.asc } : { col, asc: col === "nombre" },
    );
  }

  const ordenadas = useMemo(() => {
    const dir = orden.asc ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      const va = a[orden.col];
      const vb = b[orden.col];
      if (typeof va === "string" || typeof vb === "string") {
        return String(va ?? "").localeCompare(String(vb ?? ""), "es") * dir;
      }
      // nulls siempre al final, independiente de la dirección
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (Number(va) - Number(vb)) * dir;
    });
  }, [filtradas, orden]);

  const columnas: { col: Columna; etiqueta: string; alinear?: "right" }[] = [
    { col: "nombre", etiqueta: "Cliente" },
    { col: "ytd", etiqueta: `YTD ${etiquetaFY(fy)}`, alinear: "right" },
    { col: "vsLy", etiqueta: "vs LY", alinear: "right" },
    { col: "mtd", etiqueta: `MTD ${etiquetaPeriodo(periodo)}`, alinear: "right" },
    {
      col: "mesLy",
      etiqueta: `${etiquetaPeriodo(periodo)} ${etiquetaFY(fy - 1)}`,
      alinear: "right",
    },
    { col: "avance", etiqueta: `Avance ${etiquetaPeriodo(periodo)}` },
  ];

  return (
    <div>
      <div className="border-b border-gray-100 px-5 py-3">
        <div className="relative max-w-sm">
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
      <table className="w-full min-w-[860px] text-sm">
        <thead>
        <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
          {columnas.map((c) => (
            <th
              key={c.col}
              className={`px-3 py-3 font-medium first:pl-5 ${
                c.alinear === "right" ? "text-right" : ""
              }`}
            >
              <button
                onClick={() => ordenarPor(c.col)}
                className="inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-verde"
              >
                {c.etiqueta}
                <span className="text-[9px]">
                  {orden.col === c.col ? (orden.asc ? "▲" : "▼") : "↕"}
                </span>
              </button>
            </th>
          ))}
          <th className="px-3 py-3 font-medium">Oportunidades</th>
          <th className="px-5 py-3 font-medium">
            <button
              onClick={() => ordenarPor("ultimaVisita")}
              className="inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-verde"
            >
              Última visita
              <span className="text-[9px]">
                {orden.col === "ultimaVisita" ? (orden.asc ? "▲" : "▼") : "↕"}
              </span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {ordenadas.length === 0 && (
          <tr>
            <td colSpan={8} className="px-5 py-6 text-center text-gray-400">
              Sin clientes que coincidan con “{busqueda}”.
            </td>
          </tr>
        )}
        {ordenadas.map((c) => (
          <tr
            key={c.id}
            className="border-b border-gray-50 transition hover:bg-gray-50/60"
          >
            <td className="px-3 py-3 first:pl-5">
              <Link
                href={`/clientes/${c.id}`}
                className="font-medium text-gray-900 hover:text-verde"
                title={c.nombreCompleto}
              >
                {c.nombre}
              </Link>
              <div className="mt-0.5">
                <Chip variante={c.segmento === "TOP3" ? "verde" : "azul"}>
                  {c.segmento}
                </Chip>
              </div>
            </td>
            <td className="px-3 py-3 text-right font-medium tabular-nums text-gray-900">
              {formatEUs(c.ytd)}
            </td>
            <td className="px-3 py-3 text-right">
              <Chip
                variante={c.vsLy == null ? "gris" : c.vsLy >= 0 ? "verde" : "rojo"}
              >
                {formatPct(c.vsLy)}
              </Chip>
            </td>
            <td className="px-3 py-3 text-right font-medium tabular-nums text-gray-900">
              {formatEUs(c.mtd)}
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-gray-500">
              {formatEUs(c.mesLy)}
            </td>
            <td className="px-3 py-3">
              <BarraAvance pct={c.avance} />
            </td>
            <td className="px-3 py-3">
              <div className="flex flex-wrap gap-1">
                {c.senales.length === 0 ? (
                  <span className="text-xs text-gray-300">—</span>
                ) : (
                  c.senales.map((s) => (
                    <Chip key={s.tipo} variante="ambar" title={s.detalle}>
                      {s.etiqueta}
                    </Chip>
                  ))
                )}
              </div>
            </td>
            <td className="px-5 py-3 text-xs text-gray-500">
              {formatFecha(c.ultimaVisita)}
            </td>
          </tr>
        ))}
      </tbody>
      </table>
      </div>
    </div>
  );
}
