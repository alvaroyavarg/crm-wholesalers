-- 0011: baja de Seisluc (quiebra, mayo 2026)
--
-- Se marca inactivo, NO se borra: la venta histórica debe seguir contando para
-- las series del canal y las comparaciones vs LY a nivel agregado.
--
-- Efecto de `activo = false`:
--   - sale del dashboard y del plan de venta (resumen_cartera / plan_matriz
--     filtran por c.activo)
--   - deja de ensuciar el promedio del segmento CLAVE contra el que se
--     comparan las demás cuentas (mix_categorias)
--   - su historia se conserva en serie_canal, que mira el canal completo
--
-- La cartera activa queda en 23 cuentas: 3 TOP3 + 20 CLAVE.

update clientes
set    activo = false
where  nombre_corto = 'Seisluc';

-- Verificación
-- select count(*) filter (where activo) as activos,
--        count(*) filter (where not activo and nombre_corto is not null) as dados_de_baja
-- from clientes where nombre_corto is not null;
--   esperado: activos 23 | dados_de_baja 1
