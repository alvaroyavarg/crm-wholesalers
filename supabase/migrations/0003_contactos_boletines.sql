-- 0003: Contactos claves, origen de boletines (KOA/KOE), bucket de storage
-- y vs LY del mes en resumen_cartera.

-- Contactos claves por cliente
create table contactos (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nombre     text not null,
  cargo      text,
  correo     text,
  telefono   text,
  creado_at  timestamptz not null default now()
);
create index contactos_cliente_idx on contactos (cliente_id);

alter table contactos enable row level security;
create policy "autenticado total" on contactos for all to authenticated using (true) with check (true);

-- Origen del boletín: embotellador KOA (Coca-Cola Andina) o KOE (Coca-Cola Embonor)
alter table boletines add column origen text not null default 'KOA'
  check (origen in ('KOA', 'KOE'));

-- Bucket privado para los archivos de boletines
insert into storage.buckets (id, name, public)
values ('boletines', 'boletines', false)
on conflict (id) do nothing;

create policy "boletines lectura autenticado" on storage.objects
  for select to authenticated using (bucket_id = 'boletines');
create policy "boletines escritura autenticado" on storage.objects
  for insert to authenticated with check (bucket_id = 'boletines');
create policy "boletines borrado autenticado" on storage.objects
  for delete to authenticated using (bucket_id = 'boletines');

-- resumen_cartera ahora incluye el mismo mes del FY anterior (mes_ly_eus)
drop function if exists resumen_cartera(int, int);

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
  ultima_visita      timestamptz,
  mes_ly_eus         numeric
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
     where n.cliente_id = c.id and n.tipo in ('visita', 'llamada')),
    coalesce(sum(v.eus) filter (where fy_de(v.periodo) = p_fy - 1 and periodo_de(v.periodo) = p_periodo), 0)
  from clientes c
  left join ventas v on v.cliente_id = c.id
  where c.activo
  group by c.id
  order by 7 desc
$$;
