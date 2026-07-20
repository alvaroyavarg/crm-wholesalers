import { createClient } from "@/lib/supabase/server";
import { aFiscal, fiscalActual } from "./fiscal";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Boletin,
  CeldaPlanRow,
  Cliente,
  Conocimiento,
  Contacto,
  ItemDetalle,
  MixCategoriaRow,
  MixSkuRow,
  Nota,
  Perfil,
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
  ] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", id).single(),
      supabase.from("perfiles").select("*").eq("cliente_id", id).maybeSingle(),
      supabase
        .from("notas")
        .select("id, cliente_id, fecha, tipo, contenido_raw, creado_por_agente")
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
  };
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
