// Conversión de unidades de volumen entre los bottlers y Diageo.
//
// Los bottlers (Andina / Embonor) reportan en UC (unit case), la caja estándar
// del sistema Coca-Cola. Diageo mide en EU (caja equivalente). La conversión es
// de litros a litros:
//
//   1 UC = 5,678 litros
//   1 EU = 9 litros
//   => EU = UC × 5,678 / 9
//
// Excepción: Smirnoff Ice se contabiliza a un décimo.
//
//   => EU = UC × 5,678 / 9 / 10

export const LITROS_POR_UC = 5.678;
export const LITROS_POR_EU = 9;

/** Factor base UC → EU (≈ 0,630889). */
export const FACTOR_UC_EU = LITROS_POR_UC / LITROS_POR_EU;

/** Divisor extra que aplica solo a Smirnoff Ice. */
export const DIVISOR_SMIRNOFF_ICE = 10;

/** Normaliza para comparar sin tildes, mayúsculas ni espacios de más. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Smirnoff Ice, en cualquiera de las formas en que lo nombran los bottlers.
 * No alcanza con buscar "smirnoff ice": cada uno abrevia distinto y en la
 * data real esa forma completa aparece en 1 de cada 430 filas.
 *
 *   Andina  → "VODKA SMIR. ICE ORIGINAL LT355CC"   (marca abreviada)
 *   Embonor → "SMICE G APPLE 355X6"                (todo contraído, y con
 *                                                   `Marca SKU` vacío)
 *
 * Debe seguir devolviendo false para el vodka Smirnoff, que no lleva el
 * divisor: "SMIRNOFF 21", "SMIR BITE CIT", "VODKA SMIRNOFF RED".
 *
 * Se busca sobre la concatenación de todas las partes del nombre porque cada
 * archivo lo reparte en columnas distintas.
 */
export function esSmirnoffIce(...partesDelNombre: string[]): boolean {
  const t = normalizar(partesDelNombre.join(" "));
  // "SMICE" y variantes contraídas
  if (/\bsmice/.test(t)) return true;
  // "smirnoff ice", "smir. ice": marca abreviada + "ice" como palabra
  return /smir/.test(t) && /\bice\b/.test(t);
}

/**
 * Convierte UC a EU aplicando la excepción de Smirnoff Ice.
 *
 * @param uc              volumen en unit cases
 * @param partesDelNombre marca y/o variante del producto, en cualquier orden
 */
export function ucAEus(uc: number, ...partesDelNombre: string[]): number {
  if (!Number.isFinite(uc)) return 0;
  const eus = uc * FACTOR_UC_EU;
  return esSmirnoffIce(...partesDelNombre) ? eus / DIVISOR_SMIRNOFF_ICE : eus;
}
