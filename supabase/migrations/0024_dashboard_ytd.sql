-- 0024: acumulado del año fiscal por cliente (YTD vs LY) para el dashboard,
-- con la misma regla "Otros" y el mismo patrón por rango de fechas de 0022.
create or replace function ytd_por_cliente(p_fy int, p_periodo int)
returns table (cliente_id uuid, ytd_eus numeric, ytd_ly_eus numeric)
language sql stable as $$
  with rango as (
    select inicio_periodo(p_fy, 1) as d0,
           (inicio_periodo(p_fy, p_periodo) + interval '1 month')::date as d1,
           inicio_periodo(p_fy - 1, 1) as l0,
           (inicio_periodo(p_fy - 1, p_periodo) + interval '1 month')::date as l1
  ),
  vm as (
    select v.cliente_id, v.bottler, v.eus,
           (v.periodo >= r.d0 and v.periodo < r.d1) as actual
    from ventas v, rango r
    where (v.periodo >= r.d0 and v.periodo < r.d1)
       or (v.periodo >= r.l0 and v.periodo < r.l1)
  ),
  todo as (
    select vm.cliente_id, vm.eus, vm.actual from vm
    union all
    select o.id, vm.eus, vm.actual
    from vm
    join clientes c on c.id = vm.cliente_id and not c.activo and not c.es_otros
    join clientes o on o.es_otros and o.bottler = vm.bottler
  )
  select todo.cliente_id,
         coalesce(sum(todo.eus) filter (where todo.actual), 0),
         coalesce(sum(todo.eus) filter (where not todo.actual), 0)
  from todo
  group by todo.cliente_id
$$;
