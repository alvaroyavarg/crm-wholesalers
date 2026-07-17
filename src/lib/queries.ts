import { createClient } from "@/lib/supabase/server";
import { fiscalActual } from "./fiscal";
import type {
  CeldaPlanRow,
  Cliente,
  MixCategoriaRow,
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

export async function fichaCliente(id: string) {
  const supabase = await createClient();
  const { fy, periodo } = fiscalActual();

  const [clienteRes, perfilRes, notasRes, mixRes, serieRes, resumenRes] =
    await Promise.all([
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
  };
}

export async function planMatriz() {
  const supabase = await createClient();
  const { fy, periodo } = fiscalActual();

  const { data, error } = await supabase.rpc("plan_matriz", { p_fy: fy });
  if (error) throw new Error(`plan_matriz: ${error.message}`);

  return { fy, periodo, celdas: (data ?? []) as CeldaPlanRow[] };
}
