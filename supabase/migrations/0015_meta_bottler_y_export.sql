-- 0015: columna de distribuidor en la tabla de meta + RPC para exportar
-- el detalle por SKU de TODOS los clientes de una vez (no uno a uno).

-- =========================
-- 1. resumen_meta_periodo + distribuidor
-- =========================
drop function if exists resumen_meta_periodo(int, int, int, int, int, int, int, int);

create or replace function resumen_meta_periodo(
  p_fy_a int, p_periodo_a int,
  p_fy_b int, p_periodo_b int,
  p_fy_c int, p_periodo_c int,
  p_fy_meta int, p_periodo_meta int
)
returns table (
  cliente_id   uuid,
  nombre       text,
  nombre_corto text,
  segmento     segmento_cliente,
  cod_diageo   text,
  bottler      text,
  es_frontera  boolean,
  eus_a        numeric,
  eus_b        numeric,
  eus_c        numeric,
  meta_eus     numeric
)
language sql stable as $$
  select
    c.id,
    c.nombre,
    c.nombre_corto,
    c.segmento,
    (select string_agg(cc.cod_cliente, ' / ' order by cc.cod_cliente)
       from cliente_codigos cc
       where cc.cliente_id = c.id and cc.sistema = 'DIAGEO'),
    coalesce(b.bottler_principal, c.bottler),
    coalesce(b.es_frontera, false),
    coalesce((select sum(v.eus) from ventas v
              where v.cliente_id = c.id
                and fy_de(v.periodo) = p_fy_a and periodo_de(v.periodo) = p_periodo_a), 0),
    coalesce((select sum(v.eus) from ventas v
              where v.cliente_id = c.id
                and fy_de(v.periodo) = p_fy_b and periodo_de(v.periodo) = p_periodo_b), 0),
    coalesce((select sum(v.eus) from ventas v
              where v.cliente_id = c.id
                and fy_de(v.periodo) = p_fy_c and periodo_de(v.periodo) = p_periodo_c), 0),
    coalesce((select pv.eus_plan from plan_ventas pv
              where pv.cliente_id = c.id
                and pv.anio_fiscal = p_fy_meta and pv.periodo = p_periodo_meta), 0)
  from clientes c
  left join bottlers_cliente b on b.cliente_id = c.id
  where c.activo
  order by c.nombre_corto nulls last, c.nombre
$$;

-- =========================
-- 2. Detalle por SKU de TODA la cartera (para exportar a Excel)
-- =========================
create or replace function detalle_meta_todos(
  p_fy_a int, p_periodo_a int,
  p_fy_b int, p_periodo_b int,
  p_fy_c int, p_periodo_c int
)
returns table (
  cliente_id   uuid,
  nombre_corto text,
  nombre       text,
  categoria    text,
  marca        text,
  formato      text,
  eus_a        numeric,
  eus_b        numeric,
  eus_c        numeric
)
language sql stable as $$
  select
    c.id,
    c.nombre_corto,
    c.nombre,
    v.categoria,
    v.marca,
    coalesce(v.formato, ''),
    sum(v.eus) filter (where fy_de(v.periodo) = p_fy_a and periodo_de(v.periodo) = p_periodo_a),
    sum(v.eus) filter (where fy_de(v.periodo) = p_fy_b and periodo_de(v.periodo) = p_periodo_b),
    sum(v.eus) filter (where fy_de(v.periodo) = p_fy_c and periodo_de(v.periodo) = p_periodo_c)
  from clientes c
  join ventas v on v.cliente_id = c.id
  where c.activo
  group by c.id, c.nombre_corto, c.nombre, v.categoria, v.marca, coalesce(v.formato, '')
  having sum(v.eus) filter (where fy_de(v.periodo) = p_fy_a and periodo_de(v.periodo) = p_periodo_a) <> 0
      or sum(v.eus) filter (where fy_de(v.periodo) = p_fy_b and periodo_de(v.periodo) = p_periodo_b) <> 0
      or sum(v.eus) filter (where fy_de(v.periodo) = p_fy_c and periodo_de(v.periodo) = p_periodo_c) <> 0
  order by c.nombre_corto nulls last, c.nombre, 7 desc nulls last
$$;
