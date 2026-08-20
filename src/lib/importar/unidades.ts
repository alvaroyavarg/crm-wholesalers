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
 * Smirnoff Ice, en cualquiera de las formas en que lo nombran los bottlers
 * ("SMIRNOFF ICE", "Smirnoff Ice Original", "SMIRNOFF-ICE 275ML"…).
 * Se busca en la concatenación de marca y variante porque cada archivo parte
 * el nombre del producto de manera distinta.
 */
export function esSmirnoffIce(...partesDelNombre: string[]): boolean {
  const t = normalizar(partesDelNombre.join(" "));
  return t.includes("smirnoff") && /\bice\b/.test(t);
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
