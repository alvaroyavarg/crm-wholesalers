// Mapeo marca (L3) + variante (L5) → categoría del negocio.
// Segmentación whisky definida por el usuario:
//   Primary: Sandy Mac, Vat 69, White Horse, J&B, Bell's
//   Estándar: JW Red
//   Premium: JW Black, JW Double Black, Buchanan's, Old Parr
//   Reserve: Bulleit, The Singleton y JW sobre Black (Green, Gold, 18, Blue…)

const POR_MARCA: Record<string, string> = {
  "Sandy Mac": "Whisky Primary",
  "Vat 69": "Whisky Primary",
  "White Horse": "Whisky Primary",
  "J&B": "Whisky Primary",
  "Bell's": "Whisky Primary",
  "Buchanan's": "Whisky Premium",
  "Old Parr": "Whisky Premium",
  Bulleit: "Whisky Reserve",
  "The Singleton": "Whisky Reserve",
  Smirnoff: "Vodka",
  Ciroc: "Vodka",
  Tanqueray: "Gin",
  "Gordon's": "Gin",
  Cacique: "Ron",
  Pampero: "Ron",
  Zacapa: "Ron",
  "Don Julio": "Tequila",
  Baileys: "Licores",
  "Sheridan's": "Licores",
};

export function categoriaDe(marcaL3: string, varianteL5: string): string {
  if (marcaL3 === "Johnnie Walker") {
    const v = varianteL5.toLowerCase();
    if (v.includes("red")) return "Whisky Estándar";
    if (v.includes("black")) return "Whisky Premium"; // Black y Double Black
    return "Whisky Reserve"; // Green, Gold, 18, Blue, etc.
  }
  return POR_MARCA[marcaL3] ?? "Otros";
}
