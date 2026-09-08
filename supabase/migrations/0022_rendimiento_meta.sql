-- 0022: rendimiento de Meta y MTD
--
-- resumen_meta_periodo y mtd_cartera llamaban eus_cliente_periodo una vez
-- por cliente y período (4 × 41 llamadas), y cada llamada recorría ventas
-- completa (el OR de "Otros" impedía usar índices y fy_de()/periodo_de()
-- se evaluaban fila a fila). Con la carga de "Otros" la tabla creció y la
-- consulta superó el tope de 8 s de Supabase.
--
-- Ahora la venta de un mes se calcula en UNA pasada por rango de fechas
-- (índice ventas_periodo_idx) para todos los clientes, y las funciones de
-- pantalla solo hacen joins. Mismas firmas y columnas: la app no cambia.

-- Primer día del mes calendario de (fy, periodo). FY julio–junio, P1 = julio.
create or replace function inicio_periodo(p_fy int, p_periodo int)
returns date
language sql immutable as $$
  select make_date(
    case when p_periodo <= 6 then p_fy - 1 else p_fy end,
    ((p_periodo + 5) % 12) + 1,
    1)
$$;

-- Venta de un mes por cliente (EUs), con la regla de "Otros":
--   directo  = ventas con ese cliente_id (incluye lo que el importador ya
--              agrupó en la fila Otros)
--   + otros  = ventas de clientes que dejaron de gestionarse (activo=false)
--              se suman a la fila "Otros <bottler>" de su bottler
-- p_bottler (opcional) restringe a un bottler.
create or replace function eus_por_cliente_mes(p_fy int, p_periodo int, p_bottler text default null)
returns table (cliente_id uuid, eus numeric)
language sql stable as $$
  with vm as (
    select v.cliente_id, v.bottler, v.eus
    from ventas v
    where v.periodo >= inicio_periodo(p_fy, p_periodo)
      and v.periodo <  (inicio_periodo(p_fy, p_periodo) + interval '1 month')::date
      and (p_bottler is null or v.bottler = p_bottler)
  ),
  todo as (
    select vm.cliente_id, vm.eus from vm
    union all
    select o.id, vm.eus
    from vm
    join clientes c on c.id = vm.cliente_id and not c.activo and not c.es_otros
    join clientes o on o.es_otros and o.bottler = vm.bottler
  )
  select todo.cliente_id, sum(todo.eus)
  from todo
  group by todo.cliente_id
$$;

-- Compatibilidad: misma firma, ahora sobre la función por rango.
create or replace function eus_cliente_periodo(
  p_cliente uuid, p_fy int, p_periodo int, p_bottler text default null
)
returns numeric
language sql stable as $$
  select coalesce(
    (select e.eus from eus_por_cliente_mes(p_fy, p_periodo, p_bottler) e where e.cliente_id = p_cliente),
    0)
$$;

-- =========================
-- Meta: resumen por cliente (misma firma y columnas que 0018)
-- =========================
create or replace function resumen_meta_periodo(
  p_fy_a int, p_periodo_a int,
  p_fy_b int, p_periodo_b int,
  p_fy_c int, p_periodo_c int,
  p_fy_d int, p_periodo_d int,
  p_fy_meta int, p_periodo_meta int
)
returns table (
  cliente_id    uuid,
  nombre        text,
  nombre_corto  text,
  segmento      segmento_cliente,
  cod_diageo    text,
  bottler       text,
  es_frontera   boolean,
  zona          text,
  desarrollador text,
  es_otros      boolean,
  eus_a         numeric,
  eus_b         numeric,
  eus_c         numeric,
  eus_d         numeric,
  meta_eus      numeric,
  meta_sku_eus  numeric
)
language sql stable as $$
  select
    c.id, c.nombre, c.nombre_corto, c.segmento,
    (select string_agg(cc.cod_cliente, ' / ' order by cc.cod_cliente)
       from cliente_codigos cc where cc.cliente_id = c.id and cc.sistema = 'DIAGEO'),
    coalesce(b.bottler_principal, c.bottler),
    coalesce(b.es_frontera, false),
    c.zona, c.desarrollador, c.es_otros,
    coalesce(ea.eus, 0),
    coalesce(eb.eus, 0),
    coalesce(ec.eus, 0),
    coalesce(ed.eus, 0),
    coalesce(pv.eus_plan, 0),
    coalesce(ps.eus, 0)
  from clientes c
  left join bottlers_cliente b on b.cliente_id = c.id
  left join eus_por_cliente_mes(p_fy_a, p_periodo_a) ea on ea.cliente_id = c.id
  left join eus_por_cliente_mes(p_fy_b, p_periodo_b) eb on eb.cliente_id = c.id
  left join eus_por_cliente_mes(p_fy_c, p_periodo_c) ec on ec.cliente_id = c.id
  left join eus_por_cliente_mes(p_fy_d, p_periodo_d) ed on ed.cliente_id = c.id
  left join plan_ventas pv
    on pv.cliente_id = c.id and pv.anio_fiscal = p_fy_meta and pv.periodo = p_periodo_meta
  left join (
    select s.cliente_id, sum(s.eus_plan) as eus
    from plan_ventas_sku s
    where s.anio_fiscal = p_fy_meta and s.periodo = p_periodo_meta
    group by s.cliente_id
  ) ps on ps.cliente_id = c.id
  where c.activo
  order by c.es_otros, c.nombre_corto nulls last, c.nombre
$$;

-- =========================
-- MTD: cartera del mes (misma firma y columnas que 0016)
-- =========================
create or replace function mtd_cartera(p_fy int, p_periodo int)
returns table (
  cliente_id uuid, nombre text, nombre_corto text, segmento segmento_cliente, bottler text,
  mtd_eus numeric, mtd_ly_eus numeric, plan_mes_eus numeric, mtd_koa numeric, mtd_koe numeric
)
language sql stable as $$
  select
    c.id, c.nombre, c.nombre_corto, c.segmento, c.bottler,
    coalesce(m.eus, 0),
    coalesce(ly.eus, 0),
    coalesce(pv.eus_plan, 0),
    coalesce(ka.eus, 0),
    coalesce(ke.eus, 0)
  from clientes c
  left join eus_por_cliente_mes(p_fy, p_periodo) m on m.cliente_id = c.id
  left join eus_por_cliente_mes(p_fy - 1, p_periodo) ly on ly.cliente_id = c.id
  left join eus_por_cliente_mes(p_fy, p_periodo, 'KOA') ka on ka.cliente_id = c.id
  left join eus_por_cliente_mes(p_fy, p_periodo, 'KOE') ke on ke.cliente_id = c.id
  left join plan_ventas pv
    on pv.cliente_id = c.id and pv.anio_fiscal = p_fy and pv.periodo = p_periodo
  where c.activo
  order by 6 desc
$$;

-- =========================
-- Detalle por SKU de un cliente (misma firma que 0018), acotado por fechas
-- =========================
create or replace function detalle_meta_cliente(
  p_cliente uuid,
  p_fy_a int, p_periodo_a int,
  p_fy_b int, p_periodo_b int,
  p_fy_c int, p_periodo_c int,
  p_fy_d int, p_periodo_d int,
  p_fy_meta int, p_periodo_meta int
)
returns jsonb
language sql stable as $$
  with cli as (select * from clientes where id = p_cliente),
  ini as (
    select inicio_periodo(p_fy_a, p_periodo_a) as a,
           inicio_periodo(p_fy_b, p_periodo_b) as b,
           inicio_periodo(p_fy_c, p_periodo_c) as c,
           inicio_periodo(p_fy_d, p_periodo_d) as d
  ),
  vv as (
    select v.*, date_trunc('month', v.periodo)::date as mes
    from cli, ini, ventas v
    where v.periodo >= least(ini.a, ini.b, ini.c, ini.d)
      and v.periodo <  (greatest(ini.a, ini.b, ini.c, ini.d) + interval '1 month')::date
      and (
        v.cliente_id = cli.id
        or (cli.es_otros and v.bottler = cli.bottler
            and v.cliente_id in (select id from clientes where not activo and not es_otros))
      )
  ),
  hist as (
    select v.categoria, v.marca, coalesce(v.formato, '') as formato,
      sum(v.eus) filter (where v.mes = ini.a) as eus_a,
      sum(v.eus) filter (where v.mes = ini.b) as eus_b,
      sum(v.eus) filter (where v.mes = ini.c) as eus_c,
      sum(v.eus) filter (where v.mes = ini.d) as eus_d
    from vv v, ini
    group by 1, 2, 3
  ),
  metas as (
    select marca, formato, eus_plan from plan_ventas_sku
    where cliente_id = p_cliente and anio_fiscal = p_fy_meta and periodo = p_periodo_meta
  ),
  todo as (
    select coalesce(h.categoria, '') as categoria,
           coalesce(h.marca, m.marca) as marca,
           coalesce(h.formato, m.formato) as formato,
           coalesce(h.eus_a, 0) as eus_a, coalesce(h.eus_b, 0) as eus_b,
           coalesce(h.eus_c, 0) as eus_c, coalesce(h.eus_d, 0) as eus_d,
           coalesce(m.eus_plan, 0) as meta_eus
    from hist h
    full join metas m on m.marca = h.marca and m.formato = h.formato
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'categoria', categoria, 'marca', marca, 'formato', formato,
      'eus_a', eus_a, 'eus_b', eus_b, 'eus_c', eus_c, 'eus_d', eus_d, 'meta_eus', meta_eus)
      order by (eus_a + eus_b + eus_c + eus_d + meta_eus) desc), '[]'::jsonb)
  from todo
  where eus_a <> 0 or eus_b <> 0 or eus_c <> 0 or eus_d <> 0 or meta_eus <> 0
$$;

-- Índice de apoyo para los filtros por bottler y mes
create index if not exists ventas_bottler_periodo_idx on ventas (bottler, periodo);
