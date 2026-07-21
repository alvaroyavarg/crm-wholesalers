import { anthropic, MODELO_RAPIDO } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";

// Post-proceso de una nota recién guardada (Fase 4, regla del prompt maestro):
// Haiku estructura el texto libre (acuerdos, rechazos, próximos pasos) y decide
// si algo modifica el perfil del comprador (nuevo decisor, cambio de estilo…).
// Corre después de responder al usuario (via after()), best-effort.

interface EstructuraNota {
  resumen_nota: string;
  acuerdos: string[];
  rechazos: string[];
  proximos_pasos: string[];
  cambios_perfil: {
    hay_cambios: boolean;
    decisor: string;
    estilo_negociacion: string;
    frecuencia_compra: string;
    marcas_afines_agregar: string[];
    resumen: string;
  };
}

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resumen_nota", "acuerdos", "rechazos", "proximos_pasos", "cambios_perfil"],
  properties: {
    resumen_nota: { type: "string" },
    acuerdos: { type: "array", items: { type: "string" } },
    rechazos: { type: "array", items: { type: "string" } },
    proximos_pasos: { type: "array", items: { type: "string" } },
    cambios_perfil: {
      type: "object",
      additionalProperties: false,
      required: [
        "hay_cambios",
        "decisor",
        "estilo_negociacion",
        "frecuencia_compra",
        "marcas_afines_agregar",
        "resumen",
      ],
      properties: {
        hay_cambios: { type: "boolean" },
        decisor: { type: "string" },
        estilo_negociacion: { type: "string" },
        frecuencia_compra: { type: "string" },
        marcas_afines_agregar: { type: "array", items: { type: "string" } },
        resumen: { type: "string" },
      },
    },
  },
} as const;

const SYSTEM = `Estructuras notas de visita de un KAM de Diageo Chile (canal mayorista). Recibes la nota en texto libre y el perfil actual del comprador.

Devuelve:
- resumen_nota: 1 línea con lo esencial.
- acuerdos / rechazos / proximos_pasos: solo los que la nota menciona explícitamente (frases cortas). Vacío si no hay.
- cambios_perfil: hay_cambios=true SOLO si la nota revela algo nuevo o distinto del perfil actual (nuevo decisor, cambio de estilo de negociación, frecuencia de compra, marcas que le interesan). Los campos que no cambian van como "" (o [] en marcas_afines_agregar). "resumen" es el resumen del comprador actualizado (solo si amerita reescribirlo; si no, "").
No inventes datos que la nota no diga.`;

export async function estructurarNota(notaId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: nota } = await admin
    .from("notas")
    .select("id, cliente_id, tipo, contenido_raw, contenido_estructurado")
    .eq("id", notaId)
    .single();
  if (!nota || nota.contenido_estructurado) return;

  const [{ data: cliente }, { data: perfil }] = await Promise.all([
    admin
      .from("clientes")
      .select("nombre, nombre_corto")
      .eq("id", nota.cliente_id)
      .single(),
    admin
      .from("perfiles")
      .select("decisor, estilo_negociacion, frecuencia_compra, marcas_afines, resumen, rechazos, acuerdos")
      .eq("cliente_id", nota.cliente_id)
      .maybeSingle(),
  ]);

  const respuesta = await anthropic().messages.create({
    model: MODELO_RAPIDO,
    max_tokens: 1500,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: ESQUEMA } },
    messages: [
      {
        role: "user",
        content:
          `Cliente: ${cliente?.nombre_corto ?? cliente?.nombre}\n` +
          `Tipo de nota: ${nota.tipo}\n` +
          `Perfil actual: ${JSON.stringify(perfil ?? "sin perfil")}\n\n` +
          `Nota:\n${nota.contenido_raw}`,
      },
    ],
  });

  const bloque = respuesta.content.find((b) => b.type === "text");
  if (!bloque || bloque.type !== "text") return;
  const e = JSON.parse(bloque.text) as EstructuraNota;

  // 1. Guardar la estructura en la nota
  await admin
    .from("notas")
    .update({
      contenido_estructurado: {
        resumen: e.resumen_nota,
        acuerdos: e.acuerdos,
        rechazos: e.rechazos,
        proximos_pasos: e.proximos_pasos,
      },
    })
    .eq("id", notaId);

  // 2. Actualizar el perfil si corresponde
  const hoy = new Date().toISOString().slice(0, 10);
  const acuerdosPrevios = Array.isArray(perfil?.acuerdos) ? perfil.acuerdos : [];
  const rechazosPrevios = Array.isArray(perfil?.rechazos) ? perfil.rechazos : [];

  const cambios: Record<string, unknown> = {
    cliente_id: nota.cliente_id,
    actualizado_at: new Date().toISOString(),
  };
  let hayAlgo = false;

  if (e.acuerdos.length > 0) {
    cambios.acuerdos = [
      ...acuerdosPrevios,
      ...e.acuerdos.map((a) => ({ fecha: hoy, detalle: a })),
    ];
    hayAlgo = true;
  }
  if (e.rechazos.length > 0) {
    cambios.rechazos = [
      ...rechazosPrevios,
      ...e.rechazos.map((r) => ({ fecha: hoy, detalle: r })),
    ];
    hayAlgo = true;
  }
  if (e.cambios_perfil.hay_cambios) {
    const c = e.cambios_perfil;
    if (c.decisor) (cambios.decisor = c.decisor), (hayAlgo = true);
    if (c.estilo_negociacion)
      (cambios.estilo_negociacion = c.estilo_negociacion), (hayAlgo = true);
    if (c.frecuencia_compra)
      (cambios.frecuencia_compra = c.frecuencia_compra), (hayAlgo = true);
    if (c.resumen) (cambios.resumen = c.resumen), (hayAlgo = true);
    if (c.marcas_afines_agregar.length > 0) {
      const previas = Array.isArray(perfil?.marcas_afines)
        ? perfil.marcas_afines
        : [];
      cambios.marcas_afines = [
        ...new Set([...previas, ...c.marcas_afines_agregar]),
      ];
      hayAlgo = true;
    }
  }

  if (hayAlgo) {
    await admin.from("perfiles").upsert(cambios, { onConflict: "cliente_id" });
  }
}
