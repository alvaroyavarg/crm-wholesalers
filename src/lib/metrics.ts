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

// ---- Ritmo del mes en curso ----

export interface RitmoMes {
  diasMes: number;
  diasConDatos: number;
  pctTranscurrido: number;
  proyeccion: number;
  proyeccionPct: number | null;
  avancePct: number | null;
  alRitmo: boolean;
  /** true si el ritmo se estimó con la fecha de hoy por falta de corte registrado. */
  corteEstimado: boolean;
}

/**
 * Ritmo y proyección del mes.
 *
 * Clave: los días transcurridos salen de la FECHA DE CORTE de la data cargada,
 * no de hoy. Si el archivo del bottler llega al 17 y hoy es 20, dividir por 20
 * subestima el run-rate y marca "bajo el ritmo" sin motivo.
 *
 * @param inicioMes   primer día del mes calendario del período fiscal
 * @param fechaCorte  último día con venta cargada (ISO). null → se asume hoy.
 */
export function ritmoMes(
  inicioMes: Date,
  fechaCorte: string | null,
  realEus: number,
  planEus: number,
): RitmoMes {
  const anio = inicioMes.getFullYear();
  const mes = inicioMes.getMonth();
  const diasMes = new Date(anio, mes + 1, 0).getDate();

  const corte = fechaCorte ? new Date(`${fechaCorte}T00:00:00`) : new Date();
  const mismoMes = corte.getFullYear() === anio && corte.getMonth() === mes;

  // Fuera del mes: si el corte quedó atrás, no hay días; si lo pasó, mes completo.
  const diasConDatos = mismoMes
    ? corte.getDate()
    : corte < inicioMes
      ? 0
      : diasMes;

  const pctTranscurrido = (diasConDatos / diasMes) * 100;
  const proyeccion = diasConDatos > 0 ? (realEus / diasConDatos) * diasMes : 0;

  return {
    diasMes,
    diasConDatos,
    pctTranscurrido,
    proyeccion,
    proyeccionPct: planEus > 0 ? (proyeccion / planEus) * 100 : null,
    avancePct: planEus > 0 ? (realEus / planEus) * 100 : null,
    alRitmo: planEus > 0 && (realEus / planEus) * 100 >= pctTranscurrido,
    corteEstimado: fechaCorte == null,
  };
}
