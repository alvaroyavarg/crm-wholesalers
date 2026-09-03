import { createClient } from "@/lib/supabase/server";
import { aFiscal, fiscalActual, sumarPeriodos } from "./fiscal";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Boletin,
  CeldaPlanRow,
  Cliente,
  Conocimiento,
  Contacto,
  DetalleMetaItem,
  Importacion,
  ItemDetalle,
  MetaClienteRow,
  MixCategoriaRow,
  MixSkuRow,
  MtdBottlerRow,
  MtdCategoriaRow,
  MtdClienteRow,
  Nota,
  Perfil,
  Recomendacion,
  ResumenCliente,
  SeriePeriodoRow,
} from "./types";

export async function resumenCartera() {
  const supabase = await createClient();
  const { fy, periodo } = fiscalActual();

  const { data, error } = await supabase.rpc("resumen_cartera", {
    p_fy: fy,
    p_periodo: periodo,
  });
  if (error) throw new Error(`resumen_cartera: ${error.message}`);

  return { fy, periodo, clientes: (data ?? []) as ResumenCliente[] };
}

export async function fichaCliente(id: string, fyDetalleParam?: number) {
  const supabase = await createClient();
  const { fy, periodo } = fiscalActual();

  // Rango de FYs con data del cliente (para el selector del detalle)
  const [minRes, maxRes] = await Promise.all([
    supabase
      .from("ventas")
      .select("periodo")
      .eq("cliente_id", id)
      .order("periodo", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ventas")
      .select("periodo")
      .eq("cliente_id", id)
      .order("periodo", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const fyMin = minRes.data
    ? aFiscal(new Date(`${minRes.data.periodo}T12:00:00`)).fy
    : fy;
  const fyMax = Math.max(
    maxRes.data ? aFiscal(new Date(`${maxRes.data.periodo}T12:00:00`)).fy : fy,
    fy,
  );
  const fys: number[] = [];
  for (let f = fyMax; f >= fyMin; f--) fys.push(f);

  const fyDetalle =
    fyDetalleParam && fys.includes(fyDetalleParam)
      ? fyDetalleParam
      : maxRes.data
        ? aFiscal(new Date(`${maxRes.data.periodo}T12:00:00`)).fy
        : fy;

  const [
    clienteRes,
    perfilRes,
    notasRes,
    mixRes,
    serieRes,
    resumenRes,
    contactosRes,
    detalleRes,
    mixSkusRes,
    recomendacionesRes,
  ] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", id).single(),
      supabase.from("perfiles").select("*").eq("cliente_id", id).maybeSingle(),
      supabase
        .from("notas")
        .select(
          "id, cliente_id, fecha, tipo, contenido_raw, contenido_estructurado, creado_por_agente",
        )
        .eq("cliente_id", id)
        .order("fecha", { ascending: false })
        .limit(10),
      supabase.rpc("mix_categorias", { p_cliente: id }),
      supabase.rpc("serie_cliente", { p_cliente: id, p_fy: fy }),
      supabase.rpc("resumen_cartera", { p_fy: fy, p_periodo: periodo }),
      supabase
        .from("contactos")
        .select("*")
        .eq("cliente_id", id)
        .order("creado_at", { ascending: true }),
      supabase.rpc("detalle_cliente", { p_cliente: id, p_fy: fyDetalle }),
      supabase.rpc("mix_skus", { p_cliente: id }),
      supabase
        .from("recomendaciones")
        .select("id, cliente_id, texto, evidencia, estado, creada_at")
        .eq("cliente_id", id)
        .eq("estado", "nueva")
        .order("creada_at", { ascending: false }),
    ]);

  if (clienteRes.error)
    throw new Error(`cliente: ${clienteRes.error.message}`);

  const resumen = ((resumenRes.data ?? []) as ResumenCliente[]).find(
    (r) => r.cliente_id === id,
  );

  return {
    fy,
    periodo,
    cliente: clienteRes.data as Cliente,
    perfil: (perfilRes.data ?? null) as Perfil | null,
    notas: (notasRes.data ?? []) as Nota[],
    mix: (mixRes.data ?? []) as MixCategoriaRow[],
    serie: (serieRes.data ?? []) as SeriePeriodoRow[],
    resumen: resumen ?? null,
    contactos: (contactosRes.data ?? []) as Contacto[],
    fys,
    fyDetalle,
    // null si la función SQL aún no existe (migración 0005 pendiente)
    detalle: detalleRes.error ? null : ((detalleRes.data ?? []) as ItemDetalle[]),
    // null si la migración 0006 está pendiente
    mixSkus: mixSkusRes.error ? null : ((mixSkusRes.data ?? []) as MixSkuRow[]),
    recomendaciones: (recomendacionesRes.data ?? []) as Recomendacion[],
  };
}

// Recomendaciones nuevas de un cliente (para la ficha).
export async function recomendacionesCliente(clienteId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recomendaciones")
    .select("id, cliente_id, texto, evidencia, estado, creada_at")
    .eq("cliente_id", clienteId)
    .eq("estado", "nueva")
    .order("creada_at", { ascending: false });
  if (error) throw new Error(`recomendaciones: ${error.message}`);
  return (data ?? []) as Recomendacion[];
}

// Feed global de recomendaciones nuevas (para el copiloto), con nombre de cliente.
export async function recomendacionesFeed() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recomendaciones")
    .select("id, cliente_id, texto, evidencia, estado, creada_at, clientes(nombre, nombre_corto)")
    .eq("estado", "nueva")
    .order("creada_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`recomendaciones feed: ${error.message}`);
  return (data ?? []).map((r) => {
    const rel = r.clientes as
      | { nombre: string; nombre_corto: string | null }
      | { nombre: string; nombre_corto: string | null }[]
      | null;
    const cli = Array.isArray(rel) ? rel[0] : rel;
    return {
      id: r.id,
      cliente_id: r.cliente_id,
      texto: r.texto,
      evidencia: r.evidencia,
      estado: r.estado,
      creada_at: r.creada_at,
      cliente_nombre: cli?.nombre_corto ?? cli?.nombre ?? "Cliente",
    } as Recomendacion;
  });
}

export async function listarConocimiento() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conocimiento")
    .select("id, tipo, titulo, contenido, actualizado_at")
    .order("tipo", { ascending: true })
    .order("actualizado_at", { ascending: false });
  if (error) throw new Error(`conocimiento: ${error.message}`);
  return (data ?? []) as Conocimiento[];
}

// Boletines con URL firmada (bucket privado) para ver el archivo.
export async function listarBoletines() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boletines")
    .select(
      "id, titulo, origen, fecha_publicacion, vigente_desde, vigente_hasta, resumen_accionable, archivo_url, promociones, focos, analizado_at",
    )
    .order("vigente_desde", { ascending: false });
  if (error) throw new Error(`boletines: ${error.message}`);

  const admin = createAdminClient();
  const boletines = await Promise.all(
    ((data ?? []) as Boletin[]).map(async (b) => {
      let urlFirmada: string | null = null;
      if (b.archivo_url) {
        const { data: firmada } = await admin.storage
          .from("boletines")
          .createSignedUrl(b.archivo_url, 3600);
        urlFirmada = firmada?.signedUrl ?? null;
      }
      return { ...b, urlFirmada };
    }),
  );

  return boletines;
}

// Serie mensual del canal completo (cartera + cola larga) — las metas son del canal.
export async function serieCanal() {
  const supabase = await createClient();
  const { fy, periodo } = fiscalActual();

  const { data, error } = await supabase.rpc("serie_canal", { p_fy: fy });
  if (error) throw new Error(`serie_canal: ${error.message}`);

  return { fy, periodo, serie: (data ?? []) as SeriePeriodoRow[] };
}

export async function planMatriz() {
  const supabase = await createClient();
  const { fy, periodo } = fiscalActual();

  const { data, error } = await supabase.rpc("plan_matriz", { p_fy: fy });
  if (error) throw new Error(`plan_matriz: ${error.message}`);

  return { fy, periodo, celdas: (data ?? []) as CeldaPlanRow[] };
}

// ---- MTD (mes en curso) ----

// Todo lo del mes en una sola pasada: cartera, desgloses y fecha de corte.
// La fecha de corte viene de la tabla `importaciones` y es la que manda para
// calcular el ritmo — no la fecha de hoy.
export async function mtdCompleto() {
  const supabase = await createClient();
  const { fy, periodo } = fiscalActual();
  const params = { p_fy: fy, p_periodo: periodo };

  const [cartera, categorias, bottlers, corte, cargas] = await Promise.all([
    supabase.rpc("mtd_cartera", params),
    supabase.rpc("mtd_categorias", params),
    supabase.rpc("mtd_bottlers", params),
    supabase.rpc("fecha_corte_periodo", params),
    supabase
      .from("importaciones")
      .select("*")
      .eq("anio_fiscal", fy)
      .eq("periodo", periodo)
      .order("creado_at", { ascending: false }),
  ]);

  if (cartera.error) throw new Error(`mtd_cartera: ${cartera.error.message}`);
  if (categorias.error) throw new Error(`mtd_categorias: ${categorias.error.message}`);
  if (bottlers.error) throw new Error(`mtd_bottlers: ${bottlers.error.message}`);
  if (corte.error) throw new Error(`fecha_corte_periodo: ${corte.error.message}`);
  if (cargas.error) throw new Error(`importaciones: ${cargas.error.message}`);

  return {
    fy,
    periodo,
    fechaCorte: (corte.data as string | null) ?? null,
    clientes: (cartera.data ?? []) as MtdClienteRow[],
    categorias: (categorias.data ?? []) as MtdCategoriaRow[],
    bottlers: (bottlers.data ?? []) as MtdBottlerRow[],
    cargas: (cargas.data ?? []) as Importacion[],
  };
}

// ---- Meta del próximo mes ----

// Tabla de trabajo para fijar la meta de un mes: por defecto el que sigue al
// actual (hoy Ago-26 → propone Sept-26), con 2 columnas de tendencia
// reciente (los 2 meses anteriores al objetivo) + el mismo mes LY.
// fyParam/periodoParam permiten navegar a otro mes objetivo (prev/next).
export async function metaProximoMes(fyParam?: number, periodoParam?: number) {
  const supabase = await createClient();
  const { fy, periodo } = fiscalActual();

  // Por defecto, el mes actual (no "el siguiente"): a comienzos de mes se
  // suele seguir fijando la meta del mes que recién empieza. Para planificar
  // con anticipación está el selector de mes en la página.
  const meta =
    fyParam != null && periodoParam != null ? { fy: fyParam, periodo: periodoParam } : { fy, periodo };

  const colA = sumarPeriodos(meta.fy, meta.periodo, -2);
  const colB = sumarPeriodos(meta.fy, meta.periodo, -1);
  const colC = { fy: meta.fy - 1, periodo: meta.periodo };

  const { data, error } = await supabase.rpc("resumen_meta_periodo", {
    p_fy_a: colA.fy,
    p_periodo_a: colA.periodo,
    p_fy_b: colB.fy,
    p_periodo_b: colB.periodo,
    p_fy_c: colC.fy,
    p_periodo_c: colC.periodo,
    p_fy_meta: meta.fy,
    p_periodo_meta: meta.periodo,
  });
  if (error) throw new Error(`resumen_meta_periodo: ${error.message}`);

  return {
    fyMeta: meta.fy,
    periodoMeta: meta.periodo,
    columnas: { a: colA, b: colB, c: colC },
    clientes: (data ?? []) as MetaClienteRow[],
  };
}
