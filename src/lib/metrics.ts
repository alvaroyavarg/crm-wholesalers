import type { ResumenCliente, Senal } from "./types";

// Umbrales de "Compra Inteligente" (v1)
const UMBRAL_GAP_LY = 0.05; // 5% bajo el YTD del año pasado
const UMBRAL_DIAS_INVENTARIO = 30;
const UMBRAL_CRECIENDO = 3; // % vs LY

export function pctVsLY(actual: number, ly: number): number | null {
  if (!ly) return null;
  return ((actual - ly) / ly) * 100;
}

export function avancePct(real: number, plan: number): number | null {
  if (!plan) return null;
  return (real / plan) * 100;
}

// Señales de oportunidad por cliente. Los cálculos son deterministas (TS/SQL),
// nunca del modelo.
export function senalesCliente(c: ResumenCliente): Senal[] {
  const senales: Senal[] = [];

  const gap = c.ytd_ly_eus - c.ytd_eus;
  if (c.ytd_ly_eus > 0 && gap / c.ytd_ly_eus > UMBRAL_GAP_LY) {
    senales.push({
      tipo: "gap_ly",
      etiqueta: "Gap vs LY",
      detalle: `${formatEUs(gap)} EUs bajo el año pasado`,
    });
  }

  if (c.dias_inventario != null && c.dias_inventario < UMBRAL_DIAS_INVENTARIO) {
    senales.push({
      tipo: "inventario_bajo",
      etiqueta: "Inventario bajo",
      detalle: `${Math.round(c.dias_inventario)} días de inventario`,
    });
  }

  if (c.credito_disponible != null && c.credito_disponible > 0) {
    senales.push({
      tipo: "credito_disponible",
      etiqueta: "Crédito disponible",
      detalle: formatCLP(c.credito_disponible),
    });
  }

  return senales;
}

export function estaCreciendo(c: ResumenCliente): boolean {
  const pct = pctVsLY(c.ytd_eus, c.ytd_ly_eus);
  return pct != null && pct > UMBRAL_CRECIENDO;
}

// ---- Formato es-CL ----

export function formatEUs(n: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n);
}

export function formatCLP(n: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPct(n: number | null, decimales = 1): string {
  if (n == null) return "—";
  const signo = n > 0 ? "+" : "";
  return `${signo}${n.toFixed(decimales)}%`;
}

export function formatFecha(iso: string | null): string {
  if (!iso) return "Sin visitas";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
