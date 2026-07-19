-- 0006: Desglose por SKU para el drill-down del mix por categoría.
-- Misma ventana que mix_categorias (últimos 12 meses) para que el desglose
-- cuadre con las barras: cliente vs segmento (solo activos) vs canal completo.

create or replace function mix_skus(p_cliente uuid)
returns table (
  categoria    text,
  marca        text,
  formato      text,
  eus_cliente  numeric,
  eus_segmento numeric,
  eus_canal    numeric
)
language sql stable as $$
  select
    v.categoria,
    v.marca,
    coalesce(v.formato, ''),
    coalesce(sum(v.eus) filter (where v.cliente_id = p_cliente), 0),
    coalesce(sum(v.eus) filter (where c.activo and c.segmento = (select segmento from clientes where id = p_cliente)), 0),
    coalesce(sum(v.eus), 0)
  from ventas v
  join clientes c on c.id = v.cliente_id
  where v.periodo >= (date_trunc('month', now()) - interval '12 months')::date
  group by 1, 2, 3
  order by 4 desc, 6 desc
$$;
