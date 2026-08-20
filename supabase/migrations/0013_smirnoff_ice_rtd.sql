-- 0013: Smirnoff Ice pasa de Vodka a RTD
--
-- El negocio mide Smirnoff Ice como RTD, no como Vodka. Hasta ahora caía en
-- "Vodka" porque la marca L3 es Smirnoff.
--
-- Reclasificar el HISTÓRICO es obligatorio, no cosmético: el código nuevo ya
-- clasifica como RTD, así que si el histórico se queda en Vodka, la venta del
-- mismo producto queda partida en dos categorías. RTD mostraría crecimiento
-- infinito (sin base LY) y Vodka una caída que no ocurrió.

-- El patrón cubre las abreviaturas reales de los bottlers: Andina escribe
-- "SMIR. ICE" y Embonor "SMICE". Buscar solo "smirnoff ice" deja fuera la
-- práctica totalidad de las filas.
-- No debe alcanzar al vodka: "SMIRNOFF 21", "SMIR BITE CIT", "SMIRNOFF RED".
update ventas
set    categoria = 'RTD'
where  categoria <> 'RTD'
  and  (
        marca ~* '(^|[^a-z])smice'
        or (marca ~* 'smir' and marca ~* '(^|[^a-z])ice([^a-z]|$)')
       );

-- Verificación
-- select categoria, count(*), round(sum(eus)) as eus
-- from ventas where marca ilike '%smirnoff%'
-- group by categoria order by 3 desc;
--   esperado: ninguna fila con "ice" en la marca fuera de RTD
