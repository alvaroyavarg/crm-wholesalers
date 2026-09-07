-- 0018: la tabla de Meta muestra los 3 meses anteriores al objetivo + el
-- mismo mes del año anterior (antes: 2 meses + LY). Columnas a, b, c = M-3,
-- M-2, M-1; d = LY.

drop function if exists resumen_meta_periodo(int, int, int, int, int, int, int, int);
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
    eus_cliente_periodo(c.id, p_fy_a, p_periodo_a),
    eus_cliente_periodo(c.id, p_fy_b, p_periodo_b),
    eus_cliente_periodo(c.id, p_fy_c, p_periodo_c),
    eus_cliente_periodo(c.id, p_fy_d, p_periodo_d),
    coalesce((select pv.eus_plan from plan_ventas pv
              where pv.cliente_id = c.id and pv.anio_fiscal = p_fy_meta and pv.periodo = p_periodo_meta), 0),
    coalesce((select sum(ps.eus_plan) from plan_ventas_sku ps
              where ps.cliente_id = c.id and ps.anio_fiscal = p_fy_meta and ps.periodo = p_periodo_meta), 0)
  from clientes c
  left join bottlers_cliente b on b.cliente_id = c.id
  where c.activo
  order by c.es_otros, c.nombre_corto nulls last, c.nombre
$$;

drop function if exists detalle_meta_cliente(uuid, int, int, int, int, int, int, int, int);
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
  vv as (
    select v.*
    from cli, ventas v
    where v.cliente_id = cli.id
       or (cli.es_otros and v.bottler = cli.bottler
           and v.cliente_id in (select id from clientes where not activo and not es_otros))
  ),
  hist as (
    select v.categoria, v.marca, coalesce(v.formato, '') as formato,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy_a and periodo_de(v.periodo) = p_periodo_a) as eus_a,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy_b and periodo_de(v.periodo) = p_periodo_b) as eus_b,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy_c and periodo_de(v.periodo) = p_periodo_c) as eus_c,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy_d and periodo_de(v.periodo) = p_periodo_d) as eus_d
    from vv v group by 1, 2, 3
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

drop function if exists detalle_meta_todos(int, int, int, int, int, int, int, int);
create or replace function detalle_meta_todos(
  p_fy_a int, p_periodo_a int,
  p_fy_b int, p_periodo_b int,
  p_fy_c int, p_periodo_c int,
  p_fy_d int, p_periodo_d int,
  p_fy_meta int, p_periodo_meta int
)
returns table (
  cliente_id uuid, nombre_corto text, nombre text,
  categoria text, marca text, formato text,
  eus_a numeric, eus_b numeric, eus_c numeric, eus_d numeric, meta_eus numeric
)
language sql stable as $$
  select c.id, c.nombre_corto, c.nombre,
         (d->>'categoria'), (d->>'marca'), (d->>'formato'),
         (d->>'eus_a')::numeric, (d->>'eus_b')::numeric, (d->>'eus_c')::numeric,
         (d->>'eus_d')::numeric, (d->>'meta_eus')::numeric
  from clientes c
  cross join lateral jsonb_array_elements(
    detalle_meta_cliente(c.id, p_fy_a, p_periodo_a, p_fy_b, p_periodo_b, p_fy_c, p_periodo_c,
                         p_fy_d, p_periodo_d, p_fy_meta, p_periodo_meta)
  ) as d
  where c.activo
  order by c.es_otros, c.nombre_corto nulls last, c.nombre, 7 desc
$$;
