-- 0005: Detalle de compras por cliente (pivot dinámico de la ficha).
-- Devuelve UN jsonb con todos los SKUs del cliente para un FY y su LY:
-- así no topamos con el límite de 1000 filas de PostgREST y la app puede
-- pivotear por categoría / marca / SKU sin más viajes a la base.

create or replace function detalle_cliente(p_cliente uuid, p_fy int)
returns jsonb
language sql stable as $$
  with base as (
    select
      v.categoria,
      v.marca,
      coalesce(v.formato, '') as formato,
      periodo_de(v.periodo) as p,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy)     as eus,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy - 1) as eus_ly
    from ventas v
    where v.cliente_id = p_cliente
      and fy_de(v.periodo) in (p_fy, p_fy - 1)
    group by 1, 2, 3, 4
  ),
  items as (
    select
      categoria,
      marca,
      formato,
      -- {"1": [eus, eus_ly], "2": [...], ...} solo para períodos con movimiento
      jsonb_object_agg(p, jsonb_build_array(coalesce(eus, 0), coalesce(eus_ly, 0))) as meses,
      sum(coalesce(eus, 0))    as total,
      sum(coalesce(eus_ly, 0)) as total_ly
    from base
    group by 1, 2, 3
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'categoria', categoria,
        'marca', marca,
        'formato', formato,
        'meses', meses,
        'total', total,
        'total_ly', total_ly
      )
      order by total desc, total_ly desc
    ),
    '[]'::jsonb
  )
  from items
$$;
