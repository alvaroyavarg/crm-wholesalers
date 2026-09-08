"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { FACTOR_UC_EU } from "@/lib/importar/unidades";
import { formatEUs } from "@/lib/metrics";

// Unidad de visualización (EU o UC) compartida por la tabla y los KPIs.
// Todo se guarda y calcula en EUs; UC es solo presentación (factor estándar).
export type Unidad = "EU" | "UC";
const CLAVE_UNIDAD = "crm.meta.unidad";
export function formatoUnidad(eus: number, unidad: Unidad): string {
  return unidad === "UC" ? formatEUs(eus / FACTOR_UC_EU) : formatEUs(eus);
}

// Resumen grande de la vista Meta (meta, pedidos por estado y brecha). Lo
// publica la tabla, que tiene las cifras vivas (metas editadas, pedidos
// cambiados desde el panel y la fórmula de brecha elegida).

export interface ResumenAvance {
  meta: number;
  comprometido: number;
  ingresado: number;
  facturado: number;
  brecha: number;
  etiquetaBrecha: string; // ej. "Meta − Fact. − Ingr."
  conVentaReal: number; // cuentas cuyo bottler ya cargó el mes
  cuentas: number;
}

const Ctx = createContext<{
  resumen: ResumenAvance | null;
  setResumen: (r: ResumenAvance) => void;
  unidad: Unidad;
  setUnidad: (u: Unidad) => void;
} | null>(null);

export function MetaAvanceProvider({ children }: { children: ReactNode }) {
  const [resumen, setResumen] = useState<ResumenAvance | null>(null);
  const [unidad, setUnidadState] = useState<Unidad>("EU");
  useEffect(() => {
    try {
      const u = localStorage.getItem(CLAVE_UNIDAD);
      if (u === "UC" || u === "EU") setUnidadState(u);
    } catch { /* sin preferencia */ }
  }, []);
  const setUnidad = (u: Unidad) => {
    setUnidadState(u);
    try { localStorage.setItem(CLAVE_UNIDAD, u); } catch { /* sin storage */ }
  };
  return <Ctx.Provider value={{ resumen, setResumen, unidad, setUnidad }}>{children}</Ctx.Provider>;
}

export function usePublicarAvance() {
  return useContext(Ctx)?.setResumen ?? null;
}
export function useUnidad(): { unidad: Unidad; setUnidad: (u: Unidad) => void } {
  const c = useContext(Ctx);
  return { unidad: c?.unidad ?? "EU", setUnidad: c?.setUnidad ?? (() => {}) };
}

// Switch EU / UC (segmentado)
export function SwitchUnidad() {
  const { unidad, setUnidad } = useUnidad();
  const b = (u: Unidad) =>
    `px-2.5 py-1 text-xs font-medium transition ${unidad === u ? "bg-verde text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`;
  return (
    <div className="flex overflow-hidden rounded-lg border border-gray-200" title="Unidad de los números: EUs (estándar Diageo) o UC (cajas del bottler, factor 5,678/9)">
      <button onClick={() => setUnidad("EU")} className={b("EU")}>EU</button>
      <button onClick={() => setUnidad("UC")} className={`${b("UC")} border-l border-gray-200`}>UC</button>
    </div>
  );
}

// KPIs de tendencia (los 4 períodos + meta), en la unidad elegida
export function KpisTendencia({ valores, sinMeta }: {
  valores: { etiqueta: string; eus: number; suave?: boolean }[];
  sinMeta: number;
}) {
  const { unidad } = useUnidad();
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
      {valores.map((v, i) => (
        <div key={v.etiqueta} className="flex items-center gap-3 rounded-(--radius-card) bg-white p-4 shadow-card sm:gap-4 sm:p-5">
          <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-verde-suave text-lg sm:flex">
            {i === valores.length - 1 ? "🎯" : "📦"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-gray-500 sm:text-sm">{v.etiqueta}</p>
            <p className="font-display text-lg font-semibold text-gray-900 sm:text-2xl">
              {v.eus > 0 || i < valores.length - 1 ? `${formatoUnidad(v.eus, unidad)} ${unidad}s` : "—"}
            </p>
            {i === valores.length - 1 && (
              <div className="mt-0.5 text-xs">
                {sinMeta > 0 ? <span className="text-ambar">{sinMeta} cuentas sin meta</span> : <span className="text-verde">todas con meta</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KpisAvance({ etiquetaMes }: { etiquetaMes: string }) {
  const resumen = useContext(Ctx)?.resumen ?? null;
  const { unidad } = useUnidad();
  const formatEUs = (n: number) => formatoUnidad(n, unidad);
  const r = resumen ?? { meta: 0, comprometido: 0, ingresado: 0, facturado: 0, brecha: 0, etiquetaBrecha: "Meta − Fact.", conVentaReal: 0, cuentas: 0 };
  const pct = (v: number) => (r.meta > 0 ? `${Math.round((v / r.meta) * 100)}% de la meta` : "");
  const cubierta = r.brecha <= 0 && r.meta > 0;

  const tarjetas: { etiqueta: string; valor: string; detalle?: string; tono?: "verde" | "ambar" | "azul" | "gris" }[] = [
    { etiqueta: `Meta ${etiquetaMes}`, valor: r.meta > 0 ? formatEUs(r.meta) : "—", detalle: r.cuentas ? `${r.cuentas} cuentas` : undefined, tono: "verde" },
    { etiqueta: "Comprometido", valor: formatEUs(r.comprometido), detalle: pct(r.comprometido), tono: "gris" },
    { etiqueta: "Ingresado", valor: formatEUs(r.ingresado), detalle: pct(r.ingresado), tono: "azul" },
    {
      etiqueta: "Facturado",
      valor: formatEUs(r.facturado),
      detalle: r.conVentaReal > 0 ? `${pct(r.facturado)} · venta real en ${r.conVentaReal} cuentas` : pct(r.facturado),
      tono: "verde",
    },
    { etiqueta: r.etiquetaBrecha, valor: r.meta > 0 ? formatEUs(r.brecha) : "—", detalle: cubierta ? "meta cubierta" : r.meta > 0 ? "por cubrir" : "sin meta", tono: cubierta ? "verde" : "ambar" },
  ];
  const punto = { verde: "bg-verde", ambar: "bg-ambar", azul: "bg-azul", gris: "bg-gray-300" };

  return (
    <div className={`mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5 ${resumen ? "" : "opacity-60"}`}>
      {tarjetas.map((t) => (
        <div key={t.etiqueta} className="rounded-(--radius-card) bg-white p-4 shadow-card sm:p-5">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${punto[t.tono ?? "gris"]}`} />
            <p className="truncate text-xs text-gray-500 sm:text-sm">{t.etiqueta}</p>
          </div>
          <p className={`mt-1 font-display text-2xl font-semibold sm:text-3xl ${t.tono === "ambar" ? "text-ambar" : "text-gray-900"}`}>
            {t.valor}
            {t.valor !== "—" && <span className="ml-1 text-sm font-normal text-gray-400">{unidad}s</span>}
          </p>
          {t.detalle && <p className="mt-0.5 text-[11px] text-gray-400">{t.detalle}</p>}
        </div>
      ))}
    </div>
  );
}
