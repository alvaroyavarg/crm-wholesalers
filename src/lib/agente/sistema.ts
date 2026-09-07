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
- Para planificar la META de un mes (qué SKU ofrecer), parte por get_historia_sku_meta: trae la compra por SKU de los 3 meses previos y el mismo mes LY, la meta actual y los pedidos ya registrados. Los compromisos de la bitácora (tipo compromiso, sin cerrada_at) son pendientes reales: tenlos en cuenta.
- Cruza oportunidades con los escalones/descuentos de los boletines vigentes cuando sea relevante (ej: "para el escalón de 300 cajas de JW Red a $8.090 le faltan X").
- Sé concreto: cifras, SKU y próximos pasos para la visita. Evita relleno.

REGLAS DURAS (no las rompas nunca):
1. BOTTLER: cada cliente compra a UN embotellador (campo bottler: KOA o KOE). Al cruzar con boletines, usa SOLO los del bottler de ese cliente. Jamás recomiendes una promo KOE a un cliente KOA ni viceversa.
2. STOCK: antes de proponer recompra o volumen de un SKU, revisa la compra reciente en serie_mensual (mes actual y anterior). Si el cliente acaba de comprar fuerte —muy por sobre su ritmo mensual habitual— está stockeado: no le recomiendes más de lo mismo; considera otro SKU, categoría o simplemente dar espacio.
3. FEEDBACK DEL KAM: si abajo hay recomendaciones descartadas con motivo, ese feedback es ley. No repitas recomendaciones del mismo tipo de error.`;

export async function construirSistema(
  supabase: SupabaseClient,
): Promise<string> {
  const { fy, periodo } = fiscalActual();

  const [conocimientoRes, clientesRes, descartesRes] = await Promise.all([
    supabase
      .from("conocimiento")
      .select("tipo, titulo, contenido")
      .order("tipo", { ascending: true }),
    supabase
      .from("clientes")
      .select("id, nombre, nombre_corto, segmento, bottler")
      .eq("activo", true)
      .order("segmento", { ascending: true })
      .order("nombre", { ascending: true }),
    supabase
      .from("recomendaciones")
      .select("texto, motivo_descarte, clientes(nombre, nombre_corto)")
      .eq("estado", "descartada")
      .not("motivo_descarte", "is", null)
      .order("creada_at", { ascending: false })
      .limit(10),
  ]);

  const conocimiento = (conocimientoRes.data ?? [])
    .map((c) => `### ${c.titulo} (${c.tipo})\n${c.contenido}`)
    .join("\n\n");

  const roster = (clientesRes.data ?? [])
    .map(
      (c) =>
        `- ${c.nombre_corto ?? c.nombre} [${c.segmento} · bottler: ${c.bottler ?? "?"}] — ${c.nombre} — id: ${c.id}`,
    )
    .join("\n");

  // Feedback del KAM: descartes con motivo (defensivo si la migración 0008
  // aún no corre — en ese caso descartesRes.error existe y se omite).
  const descartes = descartesRes.error
    ? []
    : (descartesRes.data ?? []).map((d) => {
        const rel = d.clientes as
          | { nombre: string; nombre_corto: string | null }
          | { nombre: string; nombre_corto: string | null }[]
          | null;
        const cli = Array.isArray(rel) ? rel[0] : rel;
        const texto =
          d.texto.length > 180 ? `${d.texto.slice(0, 180)}…` : d.texto;
        return `- [${cli?.nombre_corto ?? cli?.nombre ?? "?"}] "${texto}" → DESCARTADA porque: ${d.motivo_descarte}`;
      });
  const seccionFeedback =
    descartes.length > 0
      ? `\n\n## Feedback del KAM — recomendaciones descartadas (no repitas estos errores)\n${descartes.join("\n")}`
      : "";

  const fecha = `Hoy trabajamos en ${etiquetaPeriodo(periodo)} (${mesDePeriodo(periodo)}) de ${etiquetaFY(fy)}. Año fiscal julio–junio: P1=julio … P12=junio.`;

  return `${ROL}

## Contexto temporal
${fecha}

## Estrategia y políticas del canal
${conocimiento || "(Sin estrategia cargada todavía.)"}

## Cuentas clave activas (usa el id para las herramientas)
${roster || "(Sin cuentas activas.)"}${seccionFeedback}`;
}
