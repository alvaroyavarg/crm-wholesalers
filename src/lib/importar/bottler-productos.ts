// Normalización de producto para la data de los bottlers (Andina/Embonor).
//
// Cada bottler nombra sus SKUs distinto entre sí (y ninguno como el Excel
// base de Diageo que ya está cargado — ese guarda la "variante L5", ej.
// "JW Red Label"). Sin ver el catálogo exacto de `ventas.marca` no se puede
// garantizar coincidencia carácter por carácter con el histórico; lo que sí
// se puede garantizar es que Andina y Embonor converjan AL MISMO string entre
// sí, para que el mix por categoría y el detalle por SKU no partan un
// producto en dos filas.
//
// Si algún nombre no matchea el histórico, es un ajuste de una línea (ver
// verificarMapeoProductos en el importador) — no hace falta recargar nada.

export interface ProductoCanonico {
  marca: string;
  formato: string;
  categoria: string;
}

// ---- Formato: de "750 ML" / "1 LTR" / "0.75L" del bottler → convención L6 ----
const FORMATOS: [RegExp, string][] = [
  [/1[.,]?75\s*l/i, "1.75L"],
  [/\b1\s*(l\b|lt\b|ltr)/i, "1L"],
  [/700\s*(cc|ml)/i, "0.7L"],
  [/750\s*(cc|ml)/i, "0.75L"],
  [/473/, "0.473L"],
  [/375\s*(cc|ml)/i, "0.375L"],
  [/355\s*(cc|ml)|355x/i, "0.355L"],
  [/200\s*(cc|ml)|200x/i, "0.2L"],
  [/\b50\s*(cc|ml)/i, "0.05L"],
];

function detectarFormato(texto: string): string {
  for (const [re, val] of FORMATOS) if (re.test(texto)) return val;
  return "";
}

// Orden importa: las reglas más específicas van antes que la genérica de la
// misma marca (ej. "JW Double Black" antes que "JW Black Label").
const REGLAS: [RegExp, string, string][] = [
  // ---- Packs mixtos: ANTES que las reglas de marca individual ----
  // El bottler a veces etiqueta el pack bajo el nombre de una sola marca
  // (ej. Embonor: "Marca SKU" = "JW RED LABEL" para "JWR200X6 + WH200X6",
  // que en realidad es mitad Red mitad White Horse) — si no se detecta acá
  // primero, la regla de esa marca lo captura entero como si fuera 100% suyo.
  [/\+\s*wh\d/i, "JW Mixto", "Whisky Estándar"],
  [/mixt|caj.*jw|jw.*\+.*wh|jw\s*2bl\s*4red/i, "JW Mixto", "Whisky Estándar"],

  // ---- Johnnie Walker ----
  [/white\s*walker/i, "JW White Walker", "Whisky Reserve"],
  [/\bswing\b/i, "JW Swing", "Whisky Reserve"],
  [/doble?\s*black|double\s*black/i, "JW Double Black", "Whisky Premium"],
  [/\b18\s*y|18\s*years|18\s*años/i, "JW 18 Años", "Whisky Reserve"],
  [/\bblue\b/i, "JW Blue Label", "Whisky Reserve"],
  [/\bgreen\b/i, "JW Green Label", "Whisky Reserve"],
  [/\bgold\b/i, "JW Gold Label Reserve", "Whisky Reserve"],
  [/blonde/i, "JW Blonde", "Whisky Reserve"],
  [/\bblack\b|jwb\b|jw\s*sherry/i, "JW Black Label", "Whisky Premium"],
  [/\bred\b|jwr\b/i, "JW Red Label", "Whisky Estándar"],

  // ---- Buchanan's ----
  [/buchan.*pi.a/i, "Buchanan's Piña", "Whisky Premium"],
  [/buchan.*18/i, "Buchanan's 18", "Whisky Premium"],
  [/buchan/i, "Buchanan's 12", "Whisky Premium"],

  // ---- Otros whiskies ----
  [/white\s*hor/i, "White Horse", "Whisky Primary"],
  [/sandy\s*mac/i, "Sandy Mac", "Whisky Primary"],
  [/vat\s*69.*honey/i, "Vat 69 Honey", "Whisky Primary"],
  [/vat\s*69/i, "Vat 69", "Whisky Primary"],
  [/old\s*parr/i, "Old Parr", "Whisky Premium"],
  [/bulleit/i, "Bulleit Bourbon", "Whisky Reserve"],
  [/bell'?s/i, "Bell's", "Whisky Primary"],
  [/j\s*&\s*b/i, "J&B", "Whisky Primary"],
  [/singleton.*18/i, "Singleton 18", "Whisky Reserve"],
  [/singleton.*15|singl\s*15/i, "Singleton 15", "Whisky Reserve"],

  // ---- Vodka / RTD ----
  // OJO: el divisor de Smirnoff Ice se aplica en unidades.ts (esSmirnoffIce),
  // acá solo se decide la categoría (RTD) y el nombre canónico.
  [/smir.*ice|smice/i, "Smirnoff Ice", "RTD"],
  [/smirnoff|smir\b/i, "Smirnoff", "Vodka"],
  [/ciroc.*red\s*berry/i, "Ciroc Red Berry", "Vodka"],
  [/ciroc.*pineapple/i, "Ciroc Pineapple", "Vodka"],
  [/ciroc/i, "Ciroc", "Vodka"],

  // ---- Gin ----
  [/tanq.*bossa|tqy\s*bsnva/i, "Tanqueray Bossa Nova", "Gin"],
  [/tanq.*royal/i, "Tanqueray Royale", "Gin"],
  [/tanq.*sevi/i, "Tanqueray Sevilla", "Gin"],
  [/tanq.*ten/i, "Tanqueray Ten", "Gin"],
  [/tanq|tqray/i, "Tanqueray London Dry", "Gin"],
  [/gordon.*pink/i, "Gordon's Pink", "Gin"],
  [/gordon/i, "Gordon's", "Gin"],

  // ---- Tequila ----
  [/don\s*julio.*70|d\.?j\.?\s*70/i, "Don Julio 70 Años", "Tequila"],
  [/don\s*julio.*repo|d\.?j\.?\s*re/i, "Don Julio Reposado", "Tequila"],
  [/don\s*julio|d\.?j\.?\s*bla|tq\s*julio/i, "Don Julio Blanco", "Tequila"],

  // ---- Ron ----
  [/zacapa.*xo/i, "Zacapa XO", "Ron"],
  [/zacapa.*23|zacapa.*solera/i, "Zacapa 23", "Ron"],
  [/zacapa.*amb/i, "Zacapa Ambar", "Ron"],
  [/pampero.*selec/i, "Pampero Selección", "Ron"],
  [/pampero.*espec/i, "Pampero Especial", "Ron"],
  [/pampero/i, "Pampero Blanco", "Ron"],
  [/cacique/i, "Cacique", "Ron"],

  // ---- Licores ----
  [/baileys.*expres/i, "Baileys Espresso", "Licores"],
  [/baileys/i, "Baileys Original", "Licores"],
  [/sherida/i, "Sheridan's", "Licores"],
];

/**
 * Normaliza el producto de una fila del bottler a {marca, formato, categoria}.
 * Recibe todas las columnas de texto disponibles (SKU, Marca, Empaque,
 * Producto...) y busca sobre su concatenación, porque cada bottler reparte
 * la info en columnas distintas.
 */
export function normalizarProductoBottler(...partesDelNombre: string[]): ProductoCanonico {
  const texto = partesDelNombre.filter(Boolean).join(" ");
  const formato = detectarFormato(texto);
  for (const [re, marca, categoria] of REGLAS) {
    if (re.test(texto)) return { marca, formato, categoria };
  }
  // Sin mapeo conocido: se conserva la primera parte no vacía (para no
  // perder la venta) y se reporta en el resumen del import para revisión.
  const marca = (partesDelNombre.find((p) => p?.trim()) ?? "Sin identificar").trim();
  return { marca, formato, categoria: "Otros" };
}
