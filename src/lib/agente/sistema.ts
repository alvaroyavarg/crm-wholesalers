import type { SupabaseClient } from "@supabase/supabase-js";
import { etiquetaFY, etiquetaPeriodo, fiscalActual, mesDePeriodo } from "@/lib/fiscal";

// Arma el system prompt del copiloto: rol + estrategia del canal (tabla
// conocimiento) + roster de cuentas activas. Se cachea (prompt caching) porque
// es estable entre requests de la misma sesión.

const ROL = `Eres el copiloto comercial de un Key Account Manager (KAM) de Diageo Chile que gestiona ~25 cuentas clave del canal mayorista (las que concentran el 80% de la venta). Hablas español chileno, directo y accionable. El volumen se mide en EUs (unidades equivalentes, estándar Diageo), no en cajas.

Cómo trabajas:
- Antes de recomendar, consulta la data con tus herramientas (ventas, comparación con pares, perfil, notas, boletines vigentes). Los números ya vienen calculados: no los recalcules ni inventes.
- Para preguntas sobre VARIAS cuentas ("qué clientes…", "quién tiene espacio…"), parte SIEMPRE por get_resumen_cartera para escanear la cartera, elige los 2-4 candidatos más relevantes y profundiza solo en ellos.
- Toda recomendación que crees con crear_recomendacion DEBE llevar evidencia con su tipo (ventas, memoria o boletin) y detalle concreto. Sin evidencia, no la crees.
- Cuando el KAM registre una nota de visita, evalúa si algo cambia el perfil del comprador (nuevo decisor, cambio de estilo, un rechazo o un acuerdo) y actualízalo con actualizar_perfil.
- Cruza oportunidades con los escalones/descuentos de los boletines vigentes cuando sea relevante (ej: "para el escalón de 300 cajas de JW Red a $8.090 le faltan X").
- Sé concreto: cifras, SKU y próximos pasos para la visita. Evita relleno.`;

export async function construirSistema(
  supabase: SupabaseClient,
): Promise<string> {
  const { fy, periodo } = fiscalActual();

  const [conocimientoRes, clientesRes] = await Promise.all([
    supabase
      .from("conocimiento")
      .select("tipo, titulo, contenido")
      .order("tipo", { ascending: true }),
    supabase
      .from("clientes")
      .select("id, nombre, nombre_corto, segmento")
      .eq("activo", true)
      .order("segmento", { ascending: true })
      .order("nombre", { ascending: true }),
  ]);

  const conocimiento = (conocimientoRes.data ?? [])
    .map((c) => `### ${c.titulo} (${c.tipo})\n${c.contenido}`)
    .join("\n\n");

  const roster = (clientesRes.data ?? [])
    .map(
      (c) =>
        `- ${c.nombre_corto ?? c.nombre} [${c.segmento}] — ${c.nombre} — id: ${c.id}`,
    )
    .join("\n");

  const fecha = `Hoy trabajamos en ${etiquetaPeriodo(periodo)} (${mesDePeriodo(periodo)}) de ${etiquetaFY(fy)}. Año fiscal julio–junio: P1=julio … P12=junio.`;

  return `${ROL}

## Contexto temporal
${fecha}

## Estrategia y políticas del canal
${conocimiento || "(Sin estrategia cargada todavía.)"}

## Cuentas clave activas (usa el id para las herramientas)
${roster || "(Sin cuentas activas.)"}`;
}
