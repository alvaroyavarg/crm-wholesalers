// Normalización de producto para la data de los bottlers (Andina/Embonor).
//
// Cada bottler nombra sus SKUs distinto entre sí, y ninguno como el Excel
// base de Diageo que ya está cargado. Los nombres canónicos de acá son la
// "variante L5" y el formato L6 TAL COMO están en `ventas.marca`/`formato`
// (catálogo real de junio 2026: "JW Red Label", "Buchanan's DeLuxe Aged 12
// Years", "Sandy Mac Blended Whisky", "1.0L"...), para que la venta del
// bottler se apile en la misma fila que el histórico en el mix por categoría
// y en el detalle por SKU. Los productos sin histórico (Bell's, Pampero,
// packs mixtos...) usan un nombre consistente entre ambos bottlers.

export interface ProductoCanonico {
  marca: string;
  formato: string;
  categoria: string;
}

// ---- Formato: de "750 ML" / "1 LTR" / "0.75L" del bottler → convención L6 ----
const FORMATOS: [RegExp, string][] = [
  // Los bottlers escriben el formato de mil formas: "750 ML", "750CC",
  // "1X750", "1X 750 40°", "1 LTR", "1X1LT", "1750", "200X6", "6X473".
  // Se busca el número aislado de otros dígitos (para no leer "750" dentro
  // del código de SKU "126750") en orden de mayor a menor ambigüedad.
  [/(?<!\d)1[.,]?75\s*l|(?<!\d)1750(?!\d)/i, "1.75L"],
  [/(?<!\d)1[.,]5\s*l/i, "1.5L"],
  [/(?<!\d)1\s*(l\b|lt\b|ltr|lt\d)|1x\s*1\s*l/i, "1.0L"],
  [/(?<!\d)750(?!\d)/, "0.75L"],
  [/(?<!\d)700(?!\d)/, "0.7L"],
  [/(?<!\d)473(?!\d)/, "0.473L"],
  [/(?<!\d)375(?!\d)/, "0.375L"],
  [/(?<!\d)355(?!\d)/, "0.355L"],
  [/(?<!\d)200(?!\d)/, "0.2L"],
  [/(?<!\d)50\s*(cc|ml)/i, "0.05L"],
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

  // ---- Vodka / RTD (antes que JW: "SMIRNOFF RED" y "CIROC RED BERRY"
  //      caerían en la regla de JW Red) ----
  // OJO: el divisor de Smirnoff Ice se aplica en unidades.ts (esSmirnoffIce),
  // acá solo se decide la categoría (RTD) y el nombre canónico.
  [/smice\s*g|green\s*apple|manzana/i, "Smirnoff Ice Green Apple(RTD)", "RTD"],
  [/smir.*ice|smice/i, "Smirnoff Ice(RTD)", "RTD"],
  [/bite|bitter/i, "Smirnoff Bitter Citric Grapefruit&Lime", "Vodka"],
  [/smirnoff|smir\b/i, "Smirnoff No.21 Red Vodka", "Vodka"],
  [/ciroc?.*red\s*berry|ciro\s*red/i, "Ciroc Red Berry", "Vodka"],
  [/ciroc?.*pineapple|ciro\s*pin/i, "Ciroc Pineapple", "Vodka"],
  [/ciroc/i, "Ciroc Vodka", "Vodka"],

  // ---- Johnnie Walker ----
  [/white\s*walker/i, "JW White Walker", "Whisky Reserve"],
  [/\bswing\b/i, "JW Swing", "Whisky Reserve"],
  [/got\s*fire|song\s*of\s*fire|jw\s*got\b/i, "JW A Song of Fire", "Whisky Reserve"],
  [/doble?\s*black|double\s*black|doblac/i, "JW Double Black", "Whisky Premium"],
  // Exige contexto JW: "SINGL 18Y" (Singleton 18) también dice "18Y".
  [/(jw|johnnie|walker).*(?<!\d)18\s*(y\b|years|años)|jw\s*18\b/i, "JW Aged 18 Years", "Whisky Reserve"],
  [/\bblue\b/i, "JW Blue Label", "Whisky Reserve"],
  [/\bgreen\b/i, "JW Green Label", "Whisky Reserve"],
  [/\bgold\b/i, "JW Gold Label Reserve", "Whisky Reserve"],
  [/blonde|jw\s*blon\b/i, "Johnnie Walker Blonde", "Whisky Reserve"],
  [/sherry/i, "Johnnie Walker Black Label Sherry Finish", "Whisky Premium"],
  [/\bblack\b|jwb\b|jw\s*bla\b/i, "JW Black Label", "Whisky Premium"],
  [/\bred\b|jwr\b/i, "JW Red Label", "Whisky Estándar"],

  // ---- Buchanan's ----
  [/buchan.*pi.a|bucha\s*pin/i, "Buchanan's Pineapple", "Whisky Premium"],
  [/buchan.*(?<!\d)18(?!\d)/i, "Buchanan's Special Reserve Aged 18 Years", "Whisky Premium"],
  [/buchan/i, "Buchanan's DeLuxe Aged 12 Years", "Whisky Premium"],

  // ---- Otros whiskies ----
  [/white\s*hor|whorse/i, "White Horse Fine Old Blended Whisky", "Whisky Primary"],
  [/sandy\s*m/i, "Sandy Mac Blended Whisky", "Whisky Primary"],
  [/vat\s*69.*honey/i, "Vat 69 Wild Honey (Spirit drink)", "Whisky Primary"],
  [/vat\s*69/i, "Vat 69", "Whisky Primary"],
  [/old\s*parr/i, "Old Parr Aged 12 Years", "Whisky Premium"],
  [/bulle[il]t/i, "Bulleit Bourbon", "Whisky Reserve"],
  [/bell'?s/i, "Bell's", "Whisky Primary"],
  [/j\s*&\s*b/i, "J&B", "Whisky Primary"],
  [/singleton.*(?<!\d)18(?!\d)|singl\.?\s*18(?!\d)/i, "The Singleton of Dufftown 18YO", "Whisky Reserve"],
  [/singleton.*(?<!\d)15(?!\d)|singl\.?\s*15(?!\d)/i, "The Singleton of Dufftown 15YO", "Whisky Reserve"],
  [/singleton.*(?<!\d)12(?!\d)|singl\.?\s*12(?!\d)/i, "The Singleton of Dufftown 12YO", "Whisky Reserve"],
  [/singleton|singl\b/i, "The Singleton", "Whisky Reserve"],

  // ---- Gin ----
  [/tanq.*bossa|tqy\s*bsnva/i, "Tanqueray Bossa Nova", "Gin"],
  [/tanq.*roy/i, "Tanqueray Dark Berry Royale", "Gin"],
  [/tanq.*sevi/i, "Tanqueray Flor De Sevilla Gin", "Gin"],
  [/tanq.*ten/i, "Tanqueray No. Ten Gin", "Gin"],
  [/tanq|tqray/i, "Tanqueray London Dry Gin", "Gin"],
  [/gordon.*pink/i, "Gordon's Pink Gin", "Gin"],
  [/gordon/i, "Gordon's Dry Gin", "Gin"],

  // ---- Tequila ----
  [/1942/, "Don Julio 1942", "Tequila"],
  [/don\s*julio.*(?<!\d)70(?!\d)|d\.?j\.?\s*70(?!\d)/i, "Don Julio 70 Anejo", "Tequila"],
  [/don\s*julio.*a.ejo|d\.?j\.?\s*aj\b/i, "Don Julio Anejo", "Tequila"],
  [/don\s*julio.*repo|d\.?j\.?\s*re/i, "Don Julio Reposado", "Tequila"],
  [/don\s*julio|d\.?j\.?\s*bla|tq\s*julio/i, "Don Julio Blanco", "Tequila"],

  // ---- Ron ----
  [/zaca.*xo/i, "Zacapa Centenario XO Rum", "Ron"],
  [/zaca.*(?<!\d)23(?!\d)|zacapa.*solera/i, "Zacapa Solera Gran Reserva (Rum)", "Ron"],
  [/zac.*amb/i, "Zacapa Centenario Ambar", "Ron"],
  [/pampero.*selec|pam\s*se\b/i, "Pampero Selección", "Ron"],
  [/pampero.*espec|pam\s*es\b/i, "Pampero Especial", "Ron"],
  [/pampero|pam\s*b\d/i, "Pampero Blanco", "Ron"],
  [/cacique/i, "Cacique", "Ron"],

  // ---- Licores ----
  [/baileys.*ex/i, "Baileys Espresso Creme", "Licores"],
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
