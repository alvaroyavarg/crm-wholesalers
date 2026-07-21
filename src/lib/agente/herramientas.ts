import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { fiscalActual, mesDePeriodo } from "@/lib/fiscal";
import type { ItemDetalle, MixCategoriaRow, MixSkuRow, SeriePeriodoRow } from "@/lib/types";

// Herramientas del copiloto. Cada ejecutor devuelve un insight COMPACTO y ya
// calculado (tendencias, mix, gaps, escalones), nunca data cruda masiva.
// Los cálculos numéricos viven acá / en SQL, no en el modelo.

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b ? r1(((a - b) / b) * 100) : null);

// ---- Esquemas para la API de Anthropic ----
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_resumen_cartera",
    description:
      "Vista panorámica de TODA la cartera activa (~24 cuentas): por cliente, YTD vs LY, mes en curso (MTD) vs mismo mes LY, plan del mes, días de inventario, crédito disponible, señales de oportunidad y última visita. Úsala SIEMPRE que la pregunta sea sobre varias cuentas ('qué clientes…', 'quién tiene espacio…', 'dónde hay oportunidades…') y después profundiza cliente a cliente.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_ventas_cliente",
    description:
      "Serie de ventas del cliente (EUs) del año fiscal actual vs el anterior: YTD, vs LY, desglose por categoría con su variación, y los SKU que más crecen o caen. Úsalo para entender cómo viene comprando.",
    input_schema: {
      type: "object",
      properties: {
        cliente_id: { type: "string", description: "UUID del cliente" },
      },
      required: ["cliente_id"],
    },
  },
  {
    name: "comparar_con_pares",
    description:
      "Compara el mix del cliente contra su segmento (o el canal completo si es TOP3): gaps por categoría en puntos porcentuales, y SKU que sus pares compran y el cliente NO (o compra subindexado). Es la base para detectar oportunidades de portafolio.",
    input_schema: {
      type: "object",
      properties: {
        cliente_id: { type: "string", description: "UUID del cliente" },
      },
      required: ["cliente_id"],
    },
  },
  {
    name: "get_perfil_cliente",
    description:
      "Perfil del comprador: decisor, estilo de negociación, frecuencia de compra, marcas afines, rechazos, acuerdos y resumen.",
    input_schema: {
      type: "object",
      properties: { cliente_id: { type: "string" } },
      required: ["cliente_id"],
    },
  },
  {
    name: "get_notas_cliente",
    description: "Últimas notas de visita/llamada/acuerdo/rechazo del cliente.",
    input_schema: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        limit: { type: "integer", description: "Máximo de notas (default 10)" },
      },
      required: ["cliente_id"],
    },
  },
  {
    name: "get_boletines_vigentes",
    description:
      "Boletines comerciales vigentes hoy (KOA/KOE) con sus promociones por SKU: escalones, mejor costo y descuento máximo. Úsalo para cruzar oportunidades con precios/escalones vigentes.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "guardar_nota",
    description:
      "Guarda una nota del cliente (visita, llamada, acuerdo, rechazo o nota).",
    input_schema: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        tipo: {
          type: "string",
          enum: ["visita", "llamada", "acuerdo", "rechazo", "nota"],
        },
        contenido: { type: "string" },
      },
      required: ["cliente_id", "tipo", "contenido"],
    },
  },
  {
    name: "actualizar_perfil",
    description:
      "Actualiza el perfil del comprador. Solo envía los campos que cambian (decisor, estilo_negociacion, frecuencia_compra, marcas_afines, resumen).",
    input_schema: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        decisor: { type: "string" },
        estilo_negociacion: { type: "string" },
        frecuencia_compra: { type: "string" },
        marcas_afines: { type: "array", items: { type: "string" } },
        resumen: { type: "string" },
      },
      required: ["cliente_id"],
    },
  },
  {
    name: "crear_recomendacion",
    description:
      "Crea una recomendación accionable para el cliente. DEBE incluir evidencia (al menos un ítem) con su tipo (ventas, memoria o boletin) y el detalle. Sin evidencia no se crea.",
    input_schema: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        texto: { type: "string", description: "La recomendación, concreta y accionable" },
        evidencia: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tipo: { type: "string", enum: ["ventas", "memoria", "boletin"] },
              detalle: { type: "string" },
            },
            required: ["tipo", "detalle"],
          },
        },
      },
      required: ["cliente_id", "texto", "evidencia"],
    },
  },
];

// ---- Ejecutores ----
type Input = Record<string, unknown>;

export async function ejecutarHerramienta(
  supabase: SupabaseClient,
  nombre: string,
  input: Input,
): Promise<unknown> {
  switch (nombre) {
    case "get_resumen_cartera":
      return getResumenCartera(supabase);
    case "get_ventas_cliente":
      return getVentasCliente(supabase, String(input.cliente_id));
    case "comparar_con_pares":
      return compararConPares(supabase, String(input.cliente_id));
    case "get_perfil_cliente":
      return getPerfilCliente(supabase, String(input.cliente_id));
    case "get_notas_cliente":
      return getNotasCliente(supabase, String(input.cliente_id), Number(input.limit) || 10);
    case "get_boletines_vigentes":
      return getBoletinesVigentes(supabase);
    case "guardar_nota":
      return guardarNota(supabase, input);
    case "actualizar_perfil":
      return actualizarPerfil(supabase, input);
    case "crear_recomendacion":
      return crearRecomendacion(supabase, input);
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

async function getResumenCartera(supabase: SupabaseClient) {
  const { fy, periodo } = fiscalActual();
  const { data, error } = await supabase.rpc("resumen_cartera", {
    p_fy: fy,
    p_periodo: periodo,
  });
  if (error) return { error: error.message };

  // bottler por cliente (el RPC no lo trae)
  const { data: bottlers } = await supabase
    .from("clientes")
    .select("id, bottler")
    .eq("activo", true);
  const bottlerDe = new Map(
    (bottlers ?? []).map((b) => [b.id as string, b.bottler as string | null]),
  );

  interface Fila {
    cliente_id: string;
    nombre: string;
    nombre_corto: string | null;
    segmento: string;
    ytd_eus: number;
    ytd_ly_eus: number;
    mes_eus: number;
    mes_ly_eus: number;
    plan_mes_eus: number;
    fy_ly_eus: number;
    dias_inventario: number | null;
    credito_disponible: number | null;
    ultima_visita: string | null;
  }

  const clientes = ((data ?? []) as Fila[]).map((c) => {
    const senales: string[] = [];
    const gap = Number(c.ytd_ly_eus) - Number(c.ytd_eus);
    if (Number(c.ytd_ly_eus) > 0 && gap / Number(c.ytd_ly_eus) > 0.05) {
      senales.push(`gap vs LY de ${r0(gap)} EUs`);
    }
    if (c.dias_inventario != null && Number(c.dias_inventario) < 30) {
      senales.push(`inventario bajo (${r0(Number(c.dias_inventario))} días)`);
    }
    if (c.credito_disponible != null && Number(c.credito_disponible) > 0) {
      senales.push(`crédito disponible ($${r0(Number(c.credito_disponible)).toLocaleString("es-CL")})`);
    }
    return {
      cliente_id: c.cliente_id,
      nombre: c.nombre_corto ?? c.nombre,
      segmento: c.segmento,
      bottler: bottlerDe.get(c.cliente_id) ?? null,
      ytd_eus: r0(Number(c.ytd_eus)),
      ytd_ly_eus: r0(Number(c.ytd_ly_eus)),
      ytd_vs_ly_pct: pct(Number(c.ytd_eus), Number(c.ytd_ly_eus)),
      mtd_eus: r0(Number(c.mes_eus)),
      mismo_mes_ly_eus: r0(Number(c.mes_ly_eus)),
      plan_mes_eus: r0(Number(c.plan_mes_eus)),
      fy_ly_total_eus: r0(Number(c.fy_ly_eus)),
      dias_inventario: c.dias_inventario != null ? r0(Number(c.dias_inventario)) : null,
      credito_disponible: c.credito_disponible != null ? r0(Number(c.credito_disponible)) : null,
      ultima_visita: c.ultima_visita?.slice(0, 10) ?? null,
      senales,
    };
  });

  return {
    fy,
    periodo_actual: `P${periodo} (${mesDePeriodo(periodo)})`,
    clientes,
  };
}

async function getVentasCliente(supabase: SupabaseClient, clienteId: string) {
  const { fy, periodo } = fiscalActual();
  const [serieRes, detalleRes] = await Promise.all([
    supabase.rpc("serie_cliente", { p_cliente: clienteId, p_fy: fy }),
    supabase.rpc("detalle_cliente", { p_cliente: clienteId, p_fy: fy }),
  ]);
  const serie = (serieRes.data ?? []) as SeriePeriodoRow[];
  const detalle = (detalleRes.data ?? []) as ItemDetalle[];

  const ytd = serie
    .filter((s) => s.periodo <= periodo)
    .reduce((a, s) => a + Number(s.eus_actual), 0);
  const ytdLy = serie
    .filter((s) => s.periodo <= periodo)
    .reduce((a, s) => a + Number(s.eus_ly), 0);

  // por categoría (FY completo actual vs LY)
  const porCat = new Map<string, { eus: number; eus_ly: number }>();
  for (const it of detalle) {
    const c = porCat.get(it.categoria) ?? { eus: 0, eus_ly: 0 };
    c.eus += Number(it.total);
    c.eus_ly += Number(it.total_ly);
    porCat.set(it.categoria, c);
  }
  const categorias = [...porCat.entries()]
    .map(([categoria, v]) => ({
      categoria,
      eus: r0(v.eus),
      eus_ly: r0(v.eus_ly),
      vs_ly_pct: pct(v.eus, v.eus_ly),
    }))
    .sort((a, b) => b.eus - a.eus);

  // SKU que más caen (gap negativo) y que más crecen
  const skus = detalle
    .map((it) => ({
      sku: `${it.marca}${it.formato ? ` · ${it.formato}` : ""}`,
      eus: r0(it.total),
      eus_ly: r0(it.total_ly),
      delta: r0(it.total - it.total_ly),
    }))
    .filter((s) => s.eus > 0 || s.eus_ly > 0);
  const cayendo = [...skus].sort((a, b) => a.delta - b.delta).slice(0, 5);
  const creciendo = [...skus].sort((a, b) => b.delta - a.delta).slice(0, 5);

  return {
    fy,
    periodo_actual: `P${periodo} (${mesDePeriodo(periodo)})`,
    ytd_eus: r0(ytd),
    ytd_ly_eus: r0(ytdLy),
    ytd_vs_ly_pct: pct(ytd, ytdLy),
    // Serie P1..P12: eus del FY actual y del FY anterior (mismo período).
    // Ej: para ver "P12 (junio) del año pasado", mirar eus_ly en periodo 12.
    serie_mensual: serie.map((s) => ({
      periodo: s.periodo,
      eus: r0(Number(s.eus_actual)),
      eus_ly: r0(Number(s.eus_ly)),
    })),
    categorias,
    sku_cayendo: cayendo,
    sku_creciendo: creciendo,
  };
}

async function compararConPares(supabase: SupabaseClient, clienteId: string) {
  const { data: cli } = await supabase
    .from("clientes")
    .select("segmento, nombre, nombre_corto, bottler")
    .eq("id", clienteId)
    .single();
  const esTop3 = cli?.segmento === "TOP3";

  const [mixRes, skuRes] = await Promise.all([
    supabase.rpc("mix_categorias", { p_cliente: clienteId }),
    supabase.rpc("mix_skus", { p_cliente: clienteId }),
  ]);
  const mix = (mixRes.data ?? []) as MixCategoriaRow[];
  const skus = (skuRes.data ?? []) as MixSkuRow[];

  const bench = (m: { eus_segmento: number; eus_cartera?: number }) =>
    Number(esTop3 ? (m.eus_cartera ?? 0) : m.eus_segmento);

  const totCli = mix.reduce((a, m) => a + Number(m.eus_cliente), 0);
  const totBench = mix.reduce((a, m) => a + bench(m), 0);

  const gapsCategoria = mix
    .map((m) => {
      const shCli = totCli ? (Number(m.eus_cliente) / totCli) * 100 : 0;
      const shBench = totBench ? (bench(m) / totBench) * 100 : 0;
      return { categoria: m.categoria, share_pct: r1(shCli), gap_pp: r1(shCli - shBench) };
    })
    .sort((a, b) => a.gap_pp - b.gap_pp);

  // SKU oportunidad: pares compran (share pares alto) y cliente no / subindexado
  const benchSku = (s: MixSkuRow) =>
    Number(esTop3 ? s.eus_canal : s.eus_segmento);
  const totBenchSku = skus.reduce((a, s) => a + benchSku(s), 0);
  const oportunidades = skus
    .map((s) => ({
      sku: `${s.marca}${s.formato ? ` · ${s.formato}` : ""}`,
      categoria: s.categoria,
      eus_cliente: r0(Number(s.eus_cliente)),
      share_pares_pct: totBenchSku ? r1((benchSku(s) / totBenchSku) * 100) : 0,
    }))
    .filter((s) => s.eus_cliente === 0 && s.share_pares_pct >= 0.5)
    .sort((a, b) => b.share_pares_pct - a.share_pares_pct)
    .slice(0, 8);

  return {
    cliente: cli?.nombre_corto ?? cli?.nombre,
    bottler: cli?.bottler ?? null,
    benchmark: esTop3 ? "canal completo" : "segmento CLAVE",
    gaps_categoria: gapsCategoria,
    sku_oportunidad_no_compra: oportunidades,
  };
}

async function getPerfilCliente(supabase: SupabaseClient, clienteId: string) {
  const { data } = await supabase
    .from("perfiles")
    .select("decisor, estilo_negociacion, frecuencia_compra, marcas_afines, rechazos, acuerdos, resumen")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  return data ?? { mensaje: "Sin perfil registrado todavía." };
}

async function getNotasCliente(supabase: SupabaseClient, clienteId: string, limit: number) {
  const { data } = await supabase
    .from("notas")
    .select("fecha, tipo, contenido_raw")
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: false })
    .limit(Math.min(limit, 30));
  return data ?? [];
}

async function getBoletinesVigentes(supabase: SupabaseClient) {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("boletines")
    .select("titulo, origen, vigente_desde, vigente_hasta, resumen_accionable, focos, promociones")
    .lte("vigente_desde", hoy)
    .gte("vigente_hasta", hoy)
    .order("vigente_desde", { ascending: false });
  return data ?? [];
}

async function guardarNota(supabase: SupabaseClient, input: Input) {
  const { error } = await supabase.from("notas").insert({
    cliente_id: String(input.cliente_id),
    tipo: String(input.tipo),
    contenido_raw: String(input.contenido),
    creado_por_agente: true,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

async function actualizarPerfil(supabase: SupabaseClient, input: Input) {
  const cambios: Record<string, unknown> = {
    cliente_id: String(input.cliente_id),
    actualizado_at: new Date().toISOString(),
  };
  for (const k of ["decisor", "estilo_negociacion", "frecuencia_compra", "resumen"]) {
    if (input[k] != null) cambios[k] = input[k];
  }
  if (Array.isArray(input.marcas_afines)) cambios.marcas_afines = input.marcas_afines;

  const { error } = await supabase
    .from("perfiles")
    .upsert(cambios, { onConflict: "cliente_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

async function crearRecomendacion(supabase: SupabaseClient, input: Input) {
  const evidencia = Array.isArray(input.evidencia) ? input.evidencia : [];
  if (evidencia.length === 0) {
    return { ok: false, error: "La recomendación requiere al menos un ítem de evidencia." };
  }
  const { data, error } = await supabase
    .from("recomendaciones")
    .insert({
      cliente_id: String(input.cliente_id),
      texto: String(input.texto),
      evidencia,
      estado: "nueva",
    })
    .select("id")
    .single();
  return error ? { ok: false, error: error.message } : { ok: true, id: data.id };
}
