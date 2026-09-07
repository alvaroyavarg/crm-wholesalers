-- 0017: metas de septiembre 2026 (FY27 P3) desde "Armado P03 F27"
--
-- El Excel está en UC; acá ya convertido a EUs (× 5,678/9). La meta total
-- = "UC SEPT" (liquidadas + faltantes). El desglose por SKU existe solo para
-- Multi RM y solo sobre lo faltante ("NUEVAS"); lo ya liquidado entra como
-- una línea "Liquidado (sin desglose)" para que la suma de SKUs = total.
-- "Tanqueray Sabores" agrupa Sevilla/Royale/Bossa Nova: el Excel no los
-- separa por cliente.

-- ---- Meta total por cliente ----
-- Si dos códigos del Armado apuntan al mismo cliente en la app (ej. Henríquez
-- o Zapata con código Andina y Embonor), se suman: un upsert por cliente.
with metas as (
select
  coalesce(
    (select cc.cliente_id from cliente_codigos cc where cc.sistema = 'DIAGEO' and cc.cod_cliente = t.cod),
    (select c.id from clientes c where c.es_otros and c.bottler = t.bottler)
  ) as cliente_id,
  t.eus
from (values
    ('934153', 'KOA', 3349),
    ('282155', 'KOA', 1417),
    ('302423', 'KOA', 1563),
    ('357586', 'KOA', 1455),
    ('350683', 'KOA', 653),
    ('717798', 'KOA', 660),
    ('329126', 'KOA', 994),
    ('935111', 'KOA', 320),
    ('903529', 'KOA', 0),
    ('755624', 'KOA', 278),
    ('755119', 'KOA', 182),
    ('879573', 'KOA', 182),
    ('888910', 'KOA', 166),
    ('344100', 'KOA', 520),
    ('332838', 'KOA', 107),
    ('1021085', 'KOA', 169),
    ('1064226', 'KOA', 166),
    ('854586', 'KOA', 233),
    ('1127401', 'KOA', 100),
    ('370862', 'KOA', 280),
    ('280873', 'KOA', 700),
    ('872983', 'KOA', 1544),
    (null, 'KOA', 284),
    ('6518191', 'KOE', 0),
    ('1842360', 'KOE', 300),
    ('1907026', 'KOE', 380),
    ('2034150', 'KOE', 380),
    ('1802114', 'KOE', 380),
    ('1906870', 'KOE', 675),
    ('1003358', 'KOE', 0),
    ('1031480', 'KOE', 757),
    ('1501361', 'KOE', 757),
    ('1407176', 'KOE', 0),
    ('1404611', 'KOE', 864),
    ('49683', 'KOE', 0),
    ('402953', 'KOE', 126),
    ('253368', 'KOE', 126),
    ('217633', 'KOE', 126),
    ('4100851', 'KOE', 2587),
    ('4012669', 'KOE', 0),
    ('227445', 'KOE', 0),
    (null, 'KOE', 1253)
) as t(cod, bottler, eus)
)
insert into plan_ventas (cliente_id, anio_fiscal, periodo, eus_plan, actualizado_at)
select cliente_id, 2027, 3, sum(eus), now()
from metas
where cliente_id is not null
group by cliente_id
on conflict (cliente_id, anio_fiscal, periodo)
do update set eus_plan = excluded.eus_plan, actualizado_at = now();

-- ---- Meta por SKU (Multi RM) ----
insert into plan_ventas_sku (cliente_id, anio_fiscal, periodo, marca, formato, eus_plan)
select cc.cliente_id, 2027, 3, t.marca, t.formato, sum(t.eus)
from (values
    ('934153', 'JW Red Label', '0.75L', 640),
    ('934153', 'JW Red Label', '1.0L', 667),
    ('934153', 'Tanqueray London Dry Gin', '0.7L', 560),
    ('934153', 'Tanqueray Sabores', '0.7L', 224),
    ('934153', 'JW Black Label', '0.75L', 384),
    ('934153', 'Buchanan''s DeLuxe Aged 12 Years', '0.75L', 270),
    ('934153', 'Buchanan''s Pineapple', '0.75L', 162),
    ('934153', 'Otros SKU', '', 162),
    ('934153', 'Liquidado (sin desglose)', '', 280),
    ('282155', 'JW Red Label', '1.0L', 467),
    ('282155', 'JW Red Label', '0.2L', 256),
    ('282155', 'Liquidado (sin desglose)', '', 694),
    ('302423', 'JW Red Label', '0.75L', 640),
    ('302423', 'JW Red Label', '1.0L', 667),
    ('302423', 'JW Red Label', '0.2L', 256),
    ('357586', 'JW Red Label', '0.75L', 320),
    ('357586', 'Tanqueray London Dry Gin', '0.7L', 336),
    ('357586', 'Liquidado (sin desglose)', '', 799),
    ('350683', 'JW Red Label', '0.75L', 320),
    ('350683', 'JW Red Label', '1.0L', 333),
    ('717798', 'JW Red Label', '0.75L', 320),
    ('717798', 'JW Red Label', '0.2L', 256),
    ('717798', 'JW Red Label', '0.375L', 84),
    ('329126', 'JW Red Label', '0.75L', 640),
    ('329126', 'JW Red Label', '0.2L', 154),
    ('329126', 'White Horse Fine Old Blended Whisky', '1.0L', 200),
    ('935111', 'JW Red Label', '0.75L', 320),
    ('755624', 'JW Red Label', '0.75L', 64),
    ('755624', 'JW Red Label', '1.0L', 67),
    ('755624', 'JW Red Label', '0.2L', 51),
    ('755624', 'Tanqueray London Dry Gin', '0.7L', 56),
    ('755624', 'Buchanan''s DeLuxe Aged 12 Years', '0.75L', 27),
    ('755624', 'Buchanan''s DeLuxe Aged 12 Years', '1.0L', 14),
    ('755119', 'JW Red Label', '0.75L', 64),
    ('755119', 'JW Red Label', '1.0L', 67),
    ('755119', 'JW Red Label', '0.2L', 51),
    ('879573', 'JW Red Label', '0.75L', 64),
    ('879573', 'JW Red Label', '1.0L', 67),
    ('879573', 'JW Red Label', '0.2L', 51),
    ('888910', 'JW Red Label', '0.75L', 64),
    ('888910', 'JW Red Label', '0.2L', 51),
    ('888910', 'Otros SKU', '', 51),
    ('344100', 'JW Red Label', '0.75L', 320),
    ('344100', 'Sandy Mac Blended Whisky', '1.0L', 200),
    ('332838', 'JW Red Label', '0.2L', 51),
    ('332838', 'JW Red Label', '0.375L', 28),
    ('332838', 'Tanqueray London Dry Gin', '0.7L', 28),
    ('1021085', 'JW Red Label', '0.75L', 64),
    ('1021085', 'JW Red Label', '0.2L', 51),
    ('1021085', 'Buchanan''s DeLuxe Aged 12 Years', '0.75L', 27),
    ('1021085', 'Buchanan''s DeLuxe Aged 12 Years', '1.0L', 27),
    ('1064226', 'Tanqueray London Dry Gin', '0.7L', 112),
    ('1064226', 'Buchanan''s DeLuxe Aged 12 Years', '0.75L', 27),
    ('1064226', 'Buchanan''s DeLuxe Aged 12 Years', '1.0L', 27)
) as t(cod, marca, formato, eus)
join cliente_codigos cc on cc.sistema = 'DIAGEO' and cc.cod_cliente = t.cod
group by cc.cliente_id, t.marca, t.formato
on conflict (cliente_id, anio_fiscal, periodo, marca, formato)
do update set eus_plan = excluded.eus_plan, actualizado_at = now();

-- Verificación
-- select round(sum(eus_plan)) from plan_ventas where anio_fiscal = 2027 and periodo = 3;  -- ≈ 24.033
-- select c.nombre_corto, round(sum(s.eus_plan)) sku, round(p.eus_plan) total
-- from plan_ventas_sku s join clientes c on c.id = s.cliente_id
-- join plan_ventas p on p.cliente_id = s.cliente_id and p.anio_fiscal = 2027 and p.periodo = 3
-- where s.anio_fiscal = 2027 and s.periodo = 3 group by 1, 3;  -- sku ≈ total
