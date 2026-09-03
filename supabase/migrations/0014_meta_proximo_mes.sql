-- 0014: Meta del próximo mes — tabla de trabajo con 3 columnas de referencia
--
-- Vista de planificación: 2 meses recientes de tendencia + el mismo mes del
-- año pasado, para fijar la meta del mes que viene. Los 3 períodos de
-- referencia y el período meta llegan como parámetros ya resueltos desde TS
-- (sumarPeriodos en fiscal.ts) — el SQL solo agrega, no calcula calendario.

-- =========================
-- 1. Resumen por cliente
-- =========================
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
    -- subconsulta, no join: clientes con más de un código (Henríquez) no
    -- deben fanoutear filas ni duplicar los EUs agregados abajo.
    (select string_agg(cc.cod_cliente, ' / ' order by cc.cod_cliente)
       from cliente_codigos cc
       where cc.cliente_id = c.id and cc.sistema = 'DIAGEO'),
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
  where c.activo
  order by c.nombre_corto nulls last, c.nombre
$$;

comment on function resumen_meta_periodo is
  'Tabla de trabajo para fijar la meta de un mes: 2 columnas de tendencia
   reciente + el mismo mes LY + la meta ya guardada en plan_ventas (si existe).';

-- =========================
-- 2. Drill-down por SKU (mismos 3 períodos, un cliente)
-- =========================
create or replace function detalle_meta_cliente(
  p_cliente uuid,
  p_fy_a int, p_periodo_a int,
  p_fy_b int, p_periodo_b int,
  p_fy_c int, p_periodo_c int
)
returns jsonb
language sql stable as $$
  with base as (
    select
      v.categoria,
      v.marca,
      coalesce(v.formato, '') as formato,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy_a and periodo_de(v.periodo) = p_periodo_a) as eus_a,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy_b and periodo_de(v.periodo) = p_periodo_b) as eus_b,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy_c and periodo_de(v.periodo) = p_periodo_c) as eus_c
    from ventas v
    where v.cliente_id = p_cliente
    group by 1, 2, 3
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'categoria', categoria,
        'marca', marca,
        'formato', formato,
        'eus_a', coalesce(eus_a, 0),
        'eus_b', coalesce(eus_b, 0),
        'eus_c', coalesce(eus_c, 0)
      )
      order by coalesce(eus_a, 0) + coalesce(eus_b, 0) + coalesce(eus_c, 0) desc
    ),
    '[]'::jsonb
  )
  from base
  -- se omiten SKUs sin movimiento en ninguno de los 3 períodos
  where coalesce(eus_a, 0) <> 0 or coalesce(eus_b, 0) <> 0 or coalesce(eus_c, 0) <> 0
$$;
