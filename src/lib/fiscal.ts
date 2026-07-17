// Calendario fiscal Diageo: FY de julio a junio.
// P1 = julio ... P12 = junio. FY27 = jul 2026 - jun 2027.

export interface PuntoFiscal {
  fy: number;
  periodo: number; // 1..12
}

export const MESES_P = [
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
];

export function aFiscal(fecha: Date): PuntoFiscal {
  const m = fecha.getMonth(); // 0 = enero
  const y = fecha.getFullYear();
  return m >= 6 ? { fy: y + 1, periodo: m - 5 } : { fy: y, periodo: m + 7 };
}

// Primer día del mes calendario que corresponde a un período fiscal.
export function inicioPeriodo(fy: number, periodo: number): Date {
  const mes = periodo <= 6 ? periodo + 5 : periodo - 7;
  const anio = periodo <= 6 ? fy - 1 : fy;
  return new Date(anio, mes, 1);
}

export function fiscalActual(): PuntoFiscal {
  return aFiscal(new Date());
}

export function etiquetaFY(fy: number): string {
  return `FY${String(fy).slice(-2)}`;
}

export function etiquetaPeriodo(p: number): string {
  return `P${p}`;
}

export function mesDePeriodo(p: number): string {
  return MESES_P[p - 1];
}

export function quarterDe(p: number): number {
  return Math.ceil(p / 3);
}

export function halfDe(p: number): number {
  return p <= 6 ? 1 : 2;
}
