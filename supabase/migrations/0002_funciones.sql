-- CRM Mayoristas — funciones de agregación (Fase 1)
-- Los cálculos numéricos viven en SQL: la app (y luego las tools del agente)
-- reciben insights ya calculados, nunca data cruda masiva.

-- Año fiscal de una fecha: jul-dic => año+1, ene-jun => año.
-- Ej: 2026-07-15 -> 2027 (FY27)
create or replace function fy_de(fecha date) returns int
language sql immutable as $$
  select case when extract(month from fecha) >= 7
    then extract(year from fecha)::int + 1
    else extract(year from fecha)::int
  end
$$;

-- Período fiscal de una fecha: P1 = julio ... P12 = junio.
create or replace function periodo_de(fecha date) returns int
language sql immutable as $$
  select case when extract(month from fecha) >= 7
    then extract(month from fecha)::int - 6
    else extract(month from fecha)::int + 6
  end
$$;

-- Resumen por cliente para el dashboard: YTD fiscal, vs LY, mes actual vs plan,
-- totales FY y última visita registrada.
create or replace function resumen_cartera(p_fy int, p_periodo int)
returns table (
  cliente_id         uuid,
  nombre             text,
  segmento           segmento_cliente,
  comuna             text,
  dias_inventario    numeric,
  credito_disponible numeric,
  ytd_eus            numeric,
  ytd_ly_eus         numeric,
  plan_ytd_eus       numeric,
  mes_eus            numeric,
  plan_mes_eus       numeric,
  fy_ly_eus          numeric,
  plan_fy_eus        numeric,
  ultima_visita      timestamptz
)
language sql stable as $$
  select
    c.id,
    c.nombre,
    c.segmento,
    c.comuna,
    c.dias_inventario,
    c.credito_disponible,
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy     and periodo_de(v.periodo) <= p_periodo), 0),
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy - 1 and periodo_de(v.periodo) <= p_periodo), 0),
    coalesce((select sum(pv.eus_plan) from plan_ventas pv
              where pv.cliente_id = c.id and pv.anio_fiscal = p_fy and pv.periodo <= p_periodo), 0),
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy and periodo_de(v.periodo) = p_periodo), 0),
    coalesce((select pv.eus_plan from plan_ventas pv
              where pv.cliente_id = c.id and pv.anio_fiscal = p_fy and pv.periodo = p_periodo), 0),
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy - 1), 0),
    coalesce((select sum(pv.eus_plan) from plan_ventas pv
              where pv.cliente_id = c.id and pv.anio_fiscal = p_fy), 0),
    (select max(n.fecha) from notas n
     where n.cliente_id = c.id and n.tipo in ('visita', 'llamada'))
  from clientes c
  left join ventas v on v.cliente_id = c.id
  where c.activo
  group by c.id
  order by 7 desc
$$;

-- Mix por categoría (últimos 12 meses): cliente vs su segmento vs cartera completa.
-- Regla de benchmark: CLAVE se compara con el promedio CLAVE; TOP3 (son solo 3)
-- se compara contra la cartera completa. La app decide qué columna usar.
create or replace function mix_categorias(p_cliente uuid)
returns table (
  categoria    text,
  eus_cliente  numeric,
  eus_segmento numeric,
  eus_cartera  numeric
)
language sql stable as $$
  select
    v.categoria,
    coalesce(sum(v.eus) filter (where v.cliente_id = p_cliente), 0),
    coalesce(sum(v.eus) filter (where c.segmento = (select segmento from clientes where id = p_cliente)), 0),
    coalesce(sum(v.eus), 0)
  from ventas v
  join clientes c on c.id = v.cliente_id
  where v.periodo >= (date_trunc('month', now()) - interval '12 months')::date
  group by v.categoria
  order by 2 desc
$$;

-- Serie mensual P1..P12 de un cliente: FY actual vs FY anterior.
create or replace function serie_cliente(p_cliente uuid, p_fy int)
returns table (periodo int, eus_actual numeric, eus_ly numeric)
language sql stable as $$
  select
    p.periodo,
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy), 0),
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy - 1), 0)
  from generate_series(1, 12) as p(periodo)
  left join ventas v
    on v.cliente_id = p_cliente
   and periodo_de(v.periodo) = p.periodo
   and fy_de(v.periodo) in (p_fy, p_fy - 1)
  group by p.periodo
  order by p.periodo
$$;

-- Matriz del plan de venta: por cliente y período, LY real / plan / real actual.
create or replace function plan_matriz(p_fy int)
returns table (
  cliente_id uuid,
  nombre     text,
  segmento   segmento_cliente,
  periodo    int,
  ly_eus     numeric,
  plan_eus   numeric,
  real_eus   numeric
)
language sql stable as $$
  select
    c.id,
    c.nombre,
    c.segmento,
    p.periodo,
    coalesce((select sum(v.eus) from ventas v
              where v.cliente_id = c.id and fy_de(v.periodo) = p_fy - 1 and periodo_de(v.periodo) = p.periodo), 0),
    coalesce((select pv.eus_plan from plan_ventas pv
              where pv.cliente_id = c.id and pv.anio_fiscal = p_fy and pv.periodo = p.periodo), 0),
    coalesce((select sum(v.eus) from ventas v
              where v.cliente_id = c.id and fy_de(v.periodo) = p_fy and periodo_de(v.periodo) = p.periodo), 0)
  from clientes c
  cross join generate_series(1, 12) as p(periodo)
  where c.activo
  order by c.nombre, p.periodo
$$;
