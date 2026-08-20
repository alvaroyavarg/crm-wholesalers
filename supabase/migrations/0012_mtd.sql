-- 0012: MTD (mes en curso) — fecha de corte de la data + desgloses
--
-- Problema que resuelve: el avance del mes se venía calculando contra la fecha
-- de HOY, pero la data de los bottlers tiene su propio corte. Si el archivo
-- llega hasta el 17 y hoy es 20, el run-rate divide por 20 días de venta
-- cuando solo hay 17: subestima el cierre y marca "bajo el ritmo" sin motivo.

-- =========================
-- 1. Registro de importaciones
-- =========================
create table importaciones (
  id           uuid primary key default gen_random_uuid(),
  origen       text not null check (origen in ('DIAGEO', 'KOA', 'KOE')),
  anio_fiscal  int  not null,
  periodo      int  not null check (periodo between 1 and 12),
  fecha_corte  date not null,          -- último día con venta incluida
  filas        int     not null default 0,
  eus          numeric not null default 0,
  archivo      text,
  creado_at    timestamptz not null default now()
);
create index importaciones_periodo_idx on importaciones (anio_fiscal, periodo);
alter table importaciones enable row level security;
create policy "autenticado total" on importaciones
  for all to authenticated using (true) with check (true);

comment on table importaciones is
  'Log de cargas de venta. fecha_corte alimenta el cálculo de ritmo del MTD.';

-- Corte efectivo de un período: el MENOR de los cortes por origen.
-- Si Andina llegó al 18 y Embonor al 15, la foto completa del canal solo
-- está cerrada hasta el 15 — tomar el mayor inflaría el ritmo.
create or replace function fecha_corte_periodo(p_fy int, p_periodo int)
returns date
language sql stable as $$
  select min(fecha_corte)
  from   importaciones
  where  anio_fiscal = p_fy and periodo = p_periodo
$$;

-- =========================
-- 2. MTD por cliente
-- =========================
create or replace function mtd_cartera(p_fy int, p_periodo int)
returns table (
  cliente_id   uuid,
  nombre       text,
  nombre_corto text,
  segmento     segmento_cliente,
  bottler      text,
  mtd_eus      numeric,
  mtd_ly_eus   numeric,
  plan_mes_eus numeric,
  mtd_koa      numeric,
  mtd_koe      numeric
)
language sql stable as $$
  select
    c.id,
    c.nombre,
    c.nombre_corto,
    c.segmento,
    c.bottler,
    coalesce(sum(v.eus) filter (
      where fy_de(v.periodo) = p_fy and periodo_de(v.periodo) = p_periodo), 0),
    coalesce(sum(v.eus) filter (
      where fy_de(v.periodo) = p_fy - 1 and periodo_de(v.periodo) = p_periodo), 0),
    coalesce((select pv.eus_plan from plan_ventas pv
              where pv.cliente_id = c.id
                and pv.anio_fiscal = p_fy
                and pv.periodo = p_periodo), 0),
    coalesce(sum(v.eus) filter (
      where fy_de(v.periodo) = p_fy and periodo_de(v.periodo) = p_periodo
        and v.bottler = 'KOA'), 0),
    coalesce(sum(v.eus) filter (
      where fy_de(v.periodo) = p_fy and periodo_de(v.periodo) = p_periodo
        and v.bottler = 'KOE'), 0)
  from clientes c
  left join ventas v on v.cliente_id = c.id
  where c.activo
  group by c.id
  order by 6 desc
$$;

-- =========================
-- 3. MTD por categoría
-- =========================
create or replace function mtd_categorias(p_fy int, p_periodo int)
returns table (categoria text, eus numeric, eus_ly numeric)
language sql stable as $$
  select
    v.categoria,
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy), 0),
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy - 1), 0)
  from ventas v
  join clientes c on c.id = v.cliente_id
  where c.activo
    and periodo_de(v.periodo) = p_periodo
    and fy_de(v.periodo) in (p_fy, p_fy - 1)
  group by v.categoria
  order by 2 desc
$$;

-- =========================
-- 4. MTD por bottler
-- =========================
create or replace function mtd_bottlers(p_fy int, p_periodo int)
returns table (bottler text, eus numeric, eus_ly numeric, clientes int)
language sql stable as $$
  select
    coalesce(nullif(v.bottler, ''), 'Sin bottler'),
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy), 0),
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy - 1), 0),
    count(distinct v.cliente_id) filter (where fy_de(v.periodo) = p_fy)::int
  from ventas v
  join clientes c on c.id = v.cliente_id
  where c.activo
    and periodo_de(v.periodo) = p_periodo
    and fy_de(v.periodo) in (p_fy, p_fy - 1)
  group by 1
  order by 2 desc
$$;
