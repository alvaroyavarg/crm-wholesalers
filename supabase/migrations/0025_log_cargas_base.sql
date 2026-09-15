-- Log de cargas de la base consolidada (origen DIAGEO), una fila por mes.
-- Desde ahora el importador la escribe; esto rellena los meses ya cargados
-- que no tienen log de ningún origen (los meses de KOA/KOE no se tocan).

insert into importaciones (origen, anio_fiscal, periodo, fecha_corte, filas, eus, archivo)
select
  'DIAGEO',
  case when extract(month from v.periodo) >= 7
       then extract(year from v.periodo)::int + 1
       else extract(year from v.periodo)::int end                       as anio_fiscal,
  case when extract(month from v.periodo) >= 7
       then extract(month from v.periodo)::int - 6
       else extract(month from v.periodo)::int + 6 end                  as periodo,
  (v.periodo + interval '1 month' - interval '1 day')::date              as fecha_corte,
  count(*)::int                                                          as filas,
  round(sum(v.eus))                                                      as eus,
  'backfill'
from ventas v
group by v.periodo
having not exists (
  select 1 from importaciones i
  where i.anio_fiscal = case when extract(month from v.periodo) >= 7
                             then extract(year from v.periodo)::int + 1
                             else extract(year from v.periodo)::int end
    and i.periodo = case when extract(month from v.periodo) >= 7
                         then extract(month from v.periodo)::int - 6
                         else extract(month from v.periodo)::int + 6 end
);

create index if not exists importaciones_origen_fy_idx on importaciones (origen, anio_fiscal, periodo);
