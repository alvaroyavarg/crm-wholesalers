-- 0004: Importación de la base real de ventas (hoja BBDD)
-- - ventas por variante (L5) + formato (L6) + bottler (KOA/KOE)
-- - códigos de cliente (varias razones sociales/códigos → un cliente)
-- - nombre corto para la UI, región y bottler principal por cliente
-- - funciones para el canal completo (cartera activa + cola larga)

-- ventas: marca pasa a ser la variante L5 (ej. "JW Red Label")
alter table ventas add column formato text;   -- L6, ej. "0.75L"
alter table ventas add column bottler text;   -- KOA / KOE
alter table ventas drop constraint ventas_cliente_id_periodo_marca_key;
create unique index ventas_unicidad_idx
  on ventas (cliente_id, periodo, marca, coalesce(formato, ''), coalesce(bottler, ''));

-- clientes
alter table clientes add column nombre_corto text;  -- para la UI ("YDS" vs razón social)
alter table clientes add column region text;
alter table clientes add column bottler text;       -- bottler principal

-- códigos → cliente (matching estable de importaciones)
create table cliente_codigos (
  cod_cliente    text primary key,
  cliente_id     uuid not null references clientes(id) on delete cascade,
  nombre_oficial text,
  creado_at      timestamptz not null default now()
);
create index cliente_codigos_cliente_idx on cliente_codigos (cliente_id);
alter table cliente_codigos enable row level security;
create policy "autenticado total" on cliente_codigos for all to authenticated using (true) with check (true);

-- resumen_cartera: + nombre_corto
drop function if exists resumen_cartera(int, int);
create or replace function resumen_cartera(p_fy int, p_periodo int)
returns table (
  cliente_id         uuid,
  nombre             text,
  nombre_corto       text,
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
  ultima_visita      timestamptz,
  mes_ly_eus         numeric
)
language sql stable as $$
  select
    c.id,
    c.nombre,
    c.nombre_corto,
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
     where n.cliente_id = c.id and n.tipo in ('visita', 'llamada')),
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy - 1 and periodo_de(v.periodo) = p_periodo), 0)
  from clientes c
  left join ventas v on v.cliente_id = c.id
  where c.activo
  group by c.id
  order by 8 desc
$$;

-- plan_matriz: + nombre_corto
drop function if exists plan_matriz(int);
create or replace function plan_matriz(p_fy int)
returns table (
  cliente_id   uuid,
  nombre       text,
  nombre_corto text,
  segmento     segmento_cliente,
  periodo      int,
  ly_eus       numeric,
  plan_eus     numeric,
  real_eus     numeric
)
language sql stable as $$
  select
    c.id,
    c.nombre,
    c.nombre_corto,
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

-- Serie mensual del CANAL COMPLETO (cartera activa + cola larga):
-- las metas se miran a nivel canal.
create or replace function serie_canal(p_fy int)
returns table (periodo int, eus_actual numeric, eus_ly numeric)
language sql stable as $$
  select
    p.periodo,
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy), 0),
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy - 1), 0)
  from generate_series(1, 12) as p(periodo)
  left join ventas v
    on periodo_de(v.periodo) = p.periodo
   and fy_de(v.periodo) in (p_fy, p_fy - 1)
  group by p.periodo
  order by p.periodo
$$;

-- mix_categorias: el benchmark de segmento considera solo cuentas activas;
-- la tercera columna pasa a ser el canal completo.
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
    coalesce(sum(v.eus) filter (where c.activo and c.segmento = (select segmento from clientes where id = p_cliente)), 0),
    coalesce(sum(v.eus), 0)
  from ventas v
  join clientes c on c.id = v.cliente_id
  where v.periodo >= (date_trunc('month', now()) - interval '12 months')::date
  group by v.categoria
  order by 2 desc
$$;
