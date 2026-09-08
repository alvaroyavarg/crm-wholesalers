-- 0023: la meta del cliente es SIEMPRE la suma de sus metas por SKU
--
-- plan_ventas deja de escribirse a mano desde Meta: un trigger la recalcula
-- cada vez que cambia plan_ventas_sku. Las metas que existían solo como
-- total (sin desglose) se conservan como una línea "Sin desglose" que el
-- KAM reparte entre SKU cuando quiera; así ningún total se pierde.

-- 1. Conservar totales sin desglose como una línea SKU
insert into plan_ventas_sku (cliente_id, anio_fiscal, periodo, marca, formato, eus_plan)
select pv.cliente_id, pv.anio_fiscal, pv.periodo, 'Sin desglose', '', pv.eus_plan
from plan_ventas pv
where pv.eus_plan > 0
  and not exists (
    select 1 from plan_ventas_sku s
    where s.cliente_id = pv.cliente_id and s.anio_fiscal = pv.anio_fiscal and s.periodo = pv.periodo
  )
on conflict (cliente_id, anio_fiscal, periodo, marca, formato) do nothing;

-- 2. Trigger: plan_ventas = sum(plan_ventas_sku) para ese cliente / mes
create or replace function sync_plan_desde_sku()
returns trigger
language plpgsql as $$
declare
  v_cliente uuid := coalesce(new.cliente_id, old.cliente_id);
  v_fy int := coalesce(new.anio_fiscal, old.anio_fiscal);
  v_periodo int := coalesce(new.periodo, old.periodo);
  v_total numeric;
begin
  select coalesce(sum(eus_plan), 0) into v_total
  from plan_ventas_sku
  where cliente_id = v_cliente and anio_fiscal = v_fy and periodo = v_periodo;

  insert into plan_ventas (cliente_id, anio_fiscal, periodo, eus_plan, actualizado_at)
  values (v_cliente, v_fy, v_periodo, v_total, now())
  on conflict (cliente_id, anio_fiscal, periodo)
  do update set eus_plan = excluded.eus_plan, actualizado_at = now();

  -- si cambió cliente/mes en un update (raro), recalcular también el origen
  if tg_op = 'UPDATE' and (old.cliente_id <> new.cliente_id or old.anio_fiscal <> new.anio_fiscal or old.periodo <> new.periodo) then
    insert into plan_ventas (cliente_id, anio_fiscal, periodo, eus_plan, actualizado_at)
    select old.cliente_id, old.anio_fiscal, old.periodo, coalesce(sum(eus_plan), 0), now()
    from plan_ventas_sku
    where cliente_id = old.cliente_id and anio_fiscal = old.anio_fiscal and periodo = old.periodo
    on conflict (cliente_id, anio_fiscal, periodo)
    do update set eus_plan = excluded.eus_plan, actualizado_at = now();
  end if;
  return null;
end $$;

drop trigger if exists trg_sync_plan_desde_sku on plan_ventas_sku;
create trigger trg_sync_plan_desde_sku
after insert or update or delete on plan_ventas_sku
for each row execute function sync_plan_desde_sku();

-- Verificación: no debe devolver filas
-- select pv.cliente_id, pv.anio_fiscal, pv.periodo, pv.eus_plan, coalesce(s.suma, 0)
-- from plan_ventas pv left join (select cliente_id, anio_fiscal, periodo, sum(eus_plan) suma from plan_ventas_sku group by 1,2,3) s using (cliente_id, anio_fiscal, periodo)
-- where round(pv.eus_plan) <> round(coalesce(s.suma, 0));
