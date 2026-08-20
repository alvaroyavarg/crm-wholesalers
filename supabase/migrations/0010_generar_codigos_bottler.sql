-- 0010: generar los códigos KOA / KOE de la cartera activa
--
-- Regla: cada cliente lleva SOLO el código del bottler donde tiene venta real.
-- La zona no se escribe a mano: se deduce de `ventas.bottler`.
--
--   KOE = mismo código Diageo
--   KOA = código Diageo + 499.987.655
--
-- Idempotente: se puede correr de nuevo sin duplicar (on conflict do nothing).
--
-- ⚠️ Las cuentas FRONTERA (venta en ambos bottlers) quedan fuera a propósito.
--    Tienen un código Diageo por razón social / zona, y desde la base no se
--    puede saber cuál corresponde a cuál bottler. Ver el bloque final.

-- =========================
-- 1. Embonor (KOE): mismo número
-- =========================
insert into cliente_codigos (sistema, cod_cliente, cliente_id, nombre_oficial)
select 'KOE', cc.cod_cliente, cc.cliente_id, cc.nombre_oficial
from   cliente_codigos cc
join   clientes c on c.id = cc.cliente_id
where  cc.sistema = 'DIAGEO'
  and  c.activo
  and  cc.cod_cliente ~ '^[0-9]+$'
  -- solo clientes que viven únicamente en Embonor
  and  exists (select 1 from ventas v where v.cliente_id = cc.cliente_id and v.bottler = 'KOE')
  and  not exists (select 1 from ventas v where v.cliente_id = cc.cliente_id and v.bottler = 'KOA')
on conflict (sistema, cod_cliente) do nothing;

-- =========================
-- 2. Andina (KOA): + 499.987.655
-- =========================
insert into cliente_codigos (sistema, cod_cliente, cliente_id, nombre_oficial)
select 'KOA', (cc.cod_cliente::bigint + 499987655)::text, cc.cliente_id, cc.nombre_oficial
from   cliente_codigos cc
join   clientes c on c.id = cc.cliente_id
where  cc.sistema = 'DIAGEO'
  and  c.activo
  and  cc.cod_cliente ~ '^[0-9]+$'
  -- solo clientes que viven únicamente en Andina
  and  exists (select 1 from ventas v where v.cliente_id = cc.cliente_id and v.bottler = 'KOA')
  and  not exists (select 1 from ventas v where v.cliente_id = cc.cliente_id and v.bottler = 'KOE')
on conflict (sistema, cod_cliente) do nothing;

-- =========================
-- 3. Cuentas frontera — completar a mano
-- =========================
-- Estas quedan pendientes. Para resolverlas hay que saber qué código Diageo
-- pertenece a la operación de cada zona. Consulta de apoyo:
--
--   select b.nombre_corto, b.pct_principal, b.pct_secundario,
--          cc.cod_cliente, cc.nombre_oficial
--   from bottlers_cliente b
--   join cliente_codigos cc on cc.cliente_id = b.cliente_id and cc.sistema = 'DIAGEO'
--   where b.es_frontera;
--
-- Una vez identificado, insertar reemplazando <COD_ZONA_KOA> / <COD_ZONA_KOE>:
--
--   -- lado Andina
--   insert into cliente_codigos (sistema, cod_cliente, cliente_id, nombre_oficial)
--   select 'KOA', (cc.cod_cliente::bigint + 499987655)::text, cc.cliente_id, cc.nombre_oficial
--   from cliente_codigos cc
--   where cc.sistema = 'DIAGEO' and cc.cod_cliente = '<COD_ZONA_KOA>'
--   on conflict (sistema, cod_cliente) do nothing;
--
--   -- lado Embonor
--   insert into cliente_codigos (sistema, cod_cliente, cliente_id, nombre_oficial)
--   select 'KOE', cc.cod_cliente, cc.cliente_id, cc.nombre_oficial
--   from cliente_codigos cc
--   where cc.sistema = 'DIAGEO' and cc.cod_cliente = '<COD_ZONA_KOE>'
--   on conflict (sistema, cod_cliente) do nothing;

-- =========================
-- Verificación
-- =========================
-- select sistema, count(*) from cliente_codigos group by sistema order by 1;
--   DIAGEO 27  |  KOA 13  |  KOE 10     ← esperado antes de resolver frontera
