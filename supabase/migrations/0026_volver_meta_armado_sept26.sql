-- 0026: volver a la meta del Armado (sept-26 = FY27 P3) en los clientes cuya
-- meta creció al aceptar propuestas por SKU encima de las líneas ya cargadas
-- (YDS, Escocia, Botillería Prat, Riquelme, San Benjamín). Riquelme y San
-- Benjamín no tenían desglose en el Armado: vuelven como "Sin desglose".
-- Desde ahora, asignar un SKU descuenta de "Sin desglose" (regla en la app).

delete from plan_ventas_sku s
using cliente_codigos cc
where cc.cliente_id = s.cliente_id and cc.sistema = 'DIAGEO'
  and cc.cod_cliente in ('934153', '282155', '344100', '280873', '1907026')
  and s.anio_fiscal = 2027 and s.periodo = 3;

insert into plan_ventas_sku (cliente_id, anio_fiscal, periodo, marca, formato, eus_plan)
select cc.cliente_id, 2027, 3, t.marca, t.formato, t.eus
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
    ('344100', 'JW Red Label', '0.75L', 320),
    ('344100', 'Sandy Mac Blended Whisky', '1.0L', 200),
    ('280873', 'Sin desglose', '', 700),
    ('1907026', 'Sin desglose', '', 380)
) as t(cod, marca, formato, eus)
join cliente_codigos cc on cc.sistema = 'DIAGEO' and cc.cod_cliente = t.cod
on conflict (cliente_id, anio_fiscal, periodo, marca, formato)
do update set eus_plan = excluded.eus_plan, actualizado_at = now();

-- Verificación: debe dar ≈ 38.080 UC (38.063 del Armado + redondeos por cliente)
select round(sum(eus_plan) / (5.678 / 9)) as meta_uc
from plan_ventas where anio_fiscal = 2027 and periodo = 3;
