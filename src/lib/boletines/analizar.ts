import { anthropic, MODELO_RAPIDO } from "@/lib/anthropic";

// Estructura que Haiku extrae de un boletín comercial (KOA / KOE).
export interface PromocionBoletin {
  sku: string;
  categoria: string;
  detalle: string; // escalones / condiciones en texto legible
  mejor_costo: string; // ej "$8.090" o ""
  descuento_max: string; // ej "14,9%" o ""
}

export interface AnalisisBoletin {
  resumen_accionable: string;
  vigencia_desde: string; // "YYYY-MM-DD" o ""
  vigencia_hasta: string;
  focos: string[];
  promociones: PromocionBoletin[];
}

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "resumen_accionable",
    "vigencia_desde",
    "vigencia_hasta",
    "focos",
    "promociones",
  ],
  properties: {
    resumen_accionable: { type: "string" },
    vigencia_desde: { type: "string" },
    vigencia_hasta: { type: "string" },
    focos: { type: "array", items: { type: "string" } },
    promociones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sku", "categoria", "detalle", "mejor_costo", "descuento_max"],
        properties: {
          sku: { type: "string" },
          categoria: { type: "string" },
          detalle: { type: "string" },
          mejor_costo: { type: "string" },
          descuento_max: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM = `Eres el asistente de un Key Account Manager de Diageo Chile en el canal mayorista.
Recibes el boletín comercial mensual de un embotellador (KOA = Coca-Cola Andina, o KOE = Coca-Cola Embonor) con precios y escalones de descuento por SKU.

Tu trabajo: extraer lo accionable para que el KAM prepare sus visitas.

Usa EXACTAMENTE esta segmentación de categorías (igual que su base de ventas):
- Whisky Primary: Sandy Mac, Vat 69, White Horse, J&B, Bell's
- Whisky Estándar: Johnnie Walker Red (JW Red)
- Whisky Premium: JW Black, JW Double Black, Buchanan's, Old Parr
- Whisky Reserve: Bulleit, The Singleton, y JW sobre Black (Green, Gold, 18, Blue)
- Vodka: Smirnoff, Ciroc · Gin: Tanqueray, Gordon's · Ron: Cacique, Pampero, Zacapa
- Tequila: Don Julio · Licores: Baileys, Sheridan's · RTD: los ready-to-drink

Reglas:
- "detalle" de cada promoción: resume los escalones en texto corto y claro, ej: "escalón desde 300 cajas x12 a $8.090; base 1 caja $9.063".
- "mejor_costo": el costo unitario más bajo alcanzable (el escalón de mayor volumen), con símbolo $. Si no aplica, "".
- "descuento_max": el % de descuento más alto que aparece para ese SKU, con símbolo %. Si no aparece, "".
- "resumen_accionable": markdown breve (3-6 viñetas) con los focos del mes, mejores oportunidades de escalón y cambios relevantes. Español chileno.
- "focos": lista de marcas/SKU en foco este mes.
- "vigencia_desde"/"vigencia_hasta": formato YYYY-MM-DD si el boletín las indica; si no, "".
- Usa EUs y pesos chilenos tal como aparecen. No inventes datos que no estén en el boletín.`;

type Fuente =
  | { tipo: "pdf"; base64: string }
  | { tipo: "imagen"; base64: string; mediaType: string };

export async function analizarBoletin(
  fuente: Fuente,
  contexto: { titulo: string; origen: string },
): Promise<AnalisisBoletin> {
  const bloqueDoc =
    fuente.tipo === "pdf"
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: fuente.base64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: fuente.mediaType as
              | "image/png"
              | "image/jpeg"
              | "image/webp"
              | "image/gif",
            data: fuente.base64,
          },
        };

  const response = await anthropic().messages.create({
    model: MODELO_RAPIDO,
    max_tokens: 4096,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: ESQUEMA } },
    messages: [
      {
        role: "user",
        content: [
          bloqueDoc,
          {
            type: "text",
            text: `Boletín "${contexto.titulo}" del embotellador ${contexto.origen}. Extrae la información accionable.`,
          },
        ],
      },
    ],
  });

  const texto = response.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") {
    throw new Error("El modelo no devolvió texto estructurado.");
  }
  return JSON.parse(texto.text) as AnalisisBoletin;
}
