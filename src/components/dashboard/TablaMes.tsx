"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { formatEUs } from "@/lib/metrics";

// Tabla de cuentas del dashboard: el avance del mes con la misma verdad que
// /meta (meta = Σ SKU, pedidos por estado, venta real si el bottler cargó).
export interface FilaMes {
  id: string;
  nombre: string;
  esOtros: boolean;
  bottler: string | null;
  meta: number;
  comprometido: number;
  ingresado: number;
  facturado: number;
  ventaCargada: boolean;
  brecha: number; // meta − facturado
  ytd: number | null;
  ytdLy: number | null;
  compromisos: number;
  propuestas: number;
  alRitmo: boolean | null; // null = sin meta o sin datos
}

type Columna = "nombre" | "bottler" | "meta" | "comprometido" | "ingresado" | "facturado" | "brecha" | "ytd";

const etiquetaBottler = (b: string | null) => (b === "KOA" ? "Andina" : b === "KOE" ? "Embonor" : "—");

export function TablaMes({ filas, hayYtd }: { filas: FilaMes[]; hayYtd: boolean }) {
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "brecha", asc: false });
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const base = t ? filas.filter((f) => f.nombre.toLowerCase().includes(t)) : filas;
    const dir = orden.asc ? 1 : -1;
    const val = (f: FilaMes): number | string => {
      switch (orden.col) {
        case "nombre": return f.nombre;
        case "bottler": return etiquetaBottler(f.bottler);
        case "ytd": return f.ytd ?? -1;
        default: return f[orden.col];
      }
    };
    // Otros siempre al final
    return [...base].sort((a, b) => {
      if (a.esOtros !== b.esOtros) return a.esOtros ? 1 : -1;
      const va = val(a), vb = val(b);
      const cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, "es") : Number(va) - Number(vb);
      return cmp * dir;
    });
  }, [filas, busqueda, orden]);

  function ordenarPor(col: Columna) {
    setOrden((p) => (p.col === col ? { col, asc: !p.asc } : { col, asc: col === "nombre" || col === "bottler" }));
  }
  const th = (col: Columna, etiqueta: string, right = true) => (
    <th
      key={col}
      onClick={() => ordenarPor(col)}
      className={`cursor-pointer select-none px-3 py-3 font-medium hover:text-gray-700 ${right ? "text-right" : "text-left"}`}
    >
      {etiqueta}
      <span className={`ml-1 ${orden.col === col ? "text-gray-600" : "text-gray-300"}`}>{orden.col === col ? (orden.asc ? "▲" : "▼") : "⇅"}</span>
    </th>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cuenta…"
          className="w-48 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
        />
        <span className="ml-auto text-xs text-gray-400">{visibles.length} filas · orden por {orden.col === "brecha" ? "brecha" : orden.col}</span>
      </div>

      {/* móvil: tarjetas */}
      <ul className="divide-y divide-gray-100 lg:hidden">
        {visibles.map((f) => (
          <li key={f.id} className={`px-4 py-3 ${f.esOtros ? "bg-gray-50/40" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              {f.esOtros ? (
                <span className="font-medium text-gray-700">{f.nombre} <Chip variante="gris">Otros</Chip></span>
              ) : (
                <Link href={`/meta?cliente=${f.id}`} className="font-medium text-gray-900 hover:text-verde">{f.nombre}</Link>
              )}
              <span className="text-[11px] text-gray-500">{etiquetaBottler(f.bottler)}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-1 text-center text-[11px]">
              {[["Meta", f.meta], ["Fact.", f.facturado], ["Ingr.", f.ingresado], ["Comp.", f.comprometido]].map(([k, v]) => (
                <div key={String(k)} className="rounded-md bg-gray-50 py-1">
                  <p className="text-[10px] text-gray-400">{k}</p>
                  <p className="text-gray-800">{Number(v) > 0 ? formatEUs(Number(v)) : "—"}</p>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[11px]">
              <BarraAvance pct={f.meta > 0 ? Math.min(100, (f.facturado / f.meta) * 100) : null} />
              <span className={`font-medium ${f.meta <= 0 ? "text-gray-300" : f.brecha <= 0 ? "text-verde" : "text-ambar"}`}>
                {f.meta > 0 ? `brecha ${formatEUs(f.brecha)}` : "sin meta"}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* escritorio: tabla */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              {th("nombre", "Cuenta", false)}
              {th("bottler", "Distribuidor", false)}
              {th("meta", "Meta")}
              {th("facturado", "Facturado")}
              {th("ingresado", "Ingresado")}
              {th("comprometido", "Comprometido")}
              {th("brecha", "Brecha")}
              <th className="px-3 py-3 text-left font-medium">Avance</th>
              {hayYtd && th("ytd", "YTD vs LY")}
              <th className="px-3 py-3 text-left font-medium">Pendientes</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const avance = f.meta > 0 ? (f.facturado / f.meta) * 100 : null;
              const vsLy = f.ytd != null && f.ytdLy != null && f.ytdLy > 0 ? ((f.ytd - f.ytdLy) / f.ytdLy) * 100 : null;
              return (
                <tr key={f.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 ${f.esOtros ? "bg-gray-50/40" : ""}`}>
                  <td className="px-3 py-3">
                    {f.esOtros ? (
                      <span className="font-medium text-gray-700">{f.nombre} <span className="ml-1 align-middle"><Chip variante="gris">Otros</Chip></span></span>
                    ) : (
                      <Link href={`/meta?cliente=${f.id}`} className="font-medium text-gray-900 hover:text-verde" title="Abrir en Meta con el panel del cliente">
                        {f.nombre}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-600">{etiquetaBottler(f.bottler)}</td>
                  <td className="px-3 py-3 text-right font-medium text-gray-900">{f.meta > 0 ? formatEUs(f.meta) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-3 text-right text-gray-700" title={f.ventaCargada ? "Venta real del bottler" : "Pedidos facturados (el bottler aún no carga el mes)"}>
                    {f.facturado > 0 ? formatEUs(f.facturado) : "—"}
                    {f.ventaCargada && <span className="ml-1 text-[9px] text-verde">●</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-gray-500">{f.ingresado > 0 ? formatEUs(f.ingresado) : "—"}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{f.comprometido > 0 ? formatEUs(f.comprometido) : "—"}</td>
                  <td className={`px-3 py-3 text-right font-medium ${f.meta <= 0 ? "text-gray-300" : f.brecha <= 0 ? "text-verde" : "text-ambar"}`}>
                    {f.meta > 0 ? formatEUs(f.brecha) : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <BarraAvance pct={avance != null ? Math.min(100, avance) : null} />
                      {f.meta <= 0 ? (
                        <Chip variante="ambar">sin meta</Chip>
                      ) : f.alRitmo == null ? null : (
                        <Chip variante={f.alRitmo ? "verde" : "ambar"}>{f.alRitmo ? "al ritmo" : "atrás"}</Chip>
                      )}
                    </div>
                  </td>
                  {hayYtd && (
                    <td className="px-3 py-3 text-right text-gray-600">
                      {f.ytd != null ? formatEUs(f.ytd) : "—"}
                      {vsLy != null && <span className={`ml-1 text-[11px] ${vsLy >= 0 ? "text-verde" : "text-rojo"}`}>{vsLy >= 0 ? "+" : ""}{Math.round(vsLy)}%</span>}
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {f.compromisos > 0 && <Chip variante="ambar">📌 {f.compromisos}</Chip>}
                      {f.propuestas > 0 && <Chip variante="azul">✨ {f.propuestas}</Chip>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
