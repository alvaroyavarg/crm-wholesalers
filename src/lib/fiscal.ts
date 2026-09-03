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

// ---- Aritmética de períodos ----

/** Desplaza (fy, periodo) por `delta` períodos, cruzando el límite de FY. */
export function sumarPeriodos(
  fy: number,
  periodo: number,
  delta: number,
): PuntoFiscal {
  const n = fy * 12 + (periodo - 1) + delta;
  return { fy: Math.floor(n / 12), periodo: (n % 12) + 1 };
}

// Meses del calendario para etiquetas tipo "jul-26" (no confundir con
// MESES_P, que está ordenado por período fiscal P1..P12).
const MESES_CALENDARIO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sept", "oct", "nov", "dic",
];

/** Etiqueta de mes calendario + año corto, ej. "jul-26", "sept-25". */
export function etiquetaMesCalendario(fy: number, periodo: number): string {
  const fecha = inicioPeriodo(fy, periodo);
  const mes = MESES_CALENDARIO[fecha.getMonth()];
  const anio = String(fecha.getFullYear()).slice(-2);
  return `${mes}-${anio}`;
}
