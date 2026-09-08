"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { formatEUs } from "@/lib/metrics";

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

const Ctx = createContext<{ resumen: ResumenAvance | null; setResumen: (r: ResumenAvance) => void } | null>(null);

export function MetaAvanceProvider({ children }: { children: ReactNode }) {
  const [resumen, setResumen] = useState<ResumenAvance | null>(null);
  return <Ctx.Provider value={{ resumen, setResumen }}>{children}</Ctx.Provider>;
}

export function usePublicarAvance() {
  return useContext(Ctx)?.setResumen ?? null;
}

export function KpisAvance({ etiquetaMes }: { etiquetaMes: string }) {
  const resumen = useContext(Ctx)?.resumen ?? null;
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
            {t.valor !== "—" && <span className="ml-1 text-sm font-normal text-gray-400">EUs</span>}
          </p>
          {t.detalle && <p className="mt-0.5 text-[11px] text-gray-400">{t.detalle}</p>}
        </div>
      ))}
    </div>
  );
}
