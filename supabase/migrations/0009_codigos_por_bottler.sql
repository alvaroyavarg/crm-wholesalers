-- 0009: códigos de cliente por sistema (Diageo / Andina / Embonor)
--
-- Contexto: el canal se reparte en zonas territoriales. Cada cliente vive en
-- zona Andina (KOA) o Embonor (KOE); unos pocos "fronterizos" compran a ambos.
-- Cada bottler identifica al cliente con su propio código:
--   KOE = mismo código Diageo
--   KOA = código Diageo + 500.000.000 - 12.345  (offset 499.987.655)
--
-- Como el código KOE coincide con el de Diageo, `cod_cliente` NO puede seguir
-- siendo primary key global: el mismo número debe convivir en dos sistemas.

-- =========================
-- 1. Sistema de codificación
-- =========================
alter table cliente_codigos
  add column sistema text not null default 'DIAGEO'
  check (sistema in ('DIAGEO', 'KOA', 'KOE'));

comment on column cliente_codigos.sistema is
  'Origen del código: DIAGEO (base propia), KOA (Andina), KOE (Embonor).';

-- Clave compuesta: (sistema, código). Las filas existentes quedan como DIAGEO.
alter table cliente_codigos drop constraint cliente_codigos_pkey;
alter table cliente_codigos add primary key (sistema, cod_cliente);

-- Búsqueda del importador: por código dentro de un sistema.
create index if not exists cliente_codigos_cod_idx on cliente_codigos (cod_cliente);

-- =========================
-- 2. Bottler principal y secundario
-- =========================
-- `clientes.bottler` guarda solo el principal y se fija al crear el cliente.
-- Esta vista lo deriva de la venta real, y expone además el secundario para
-- las cuentas frontera.
create or replace view bottlers_cliente as
with volumen as (
  select v.cliente_id, v.bottler, sum(v.eus) as eus
  from ventas v
  where coalesce(v.bottler, '') <> ''
  group by v.cliente_id, v.bottler
),
ranking as (
  select
    volumen.*,
    row_number() over (partition by cliente_id order by eus desc) as pos,
    sum(eus)    over (partition by cliente_id)                    as eus_total,
    count(*)    over (partition by cliente_id)                    as n_bottlers
  from volumen
)
select
  c.id                                                          as cliente_id,
  c.nombre_corto,
  c.nombre,
  c.segmento,
  max(r.n_bottlers)                                             as n_bottlers,
  max(r.n_bottlers) > 1                                         as es_frontera,
  max(case when r.pos = 1 then r.bottler end)                   as bottler_principal,
  max(case when r.pos = 1 then r.eus end)                       as eus_principal,
  max(case when r.pos = 2 then r.bottler end)                   as bottler_secundario,
  max(case when r.pos = 2 then r.eus end)                       as eus_secundario,
  round(100.0 * max(case when r.pos = 1 then r.eus end)
        / nullif(max(r.eus_total), 0), 1)                       as pct_principal,
  round(100.0 * max(case when r.pos = 2 then r.eus end)
        / nullif(max(r.eus_total), 0), 1)                       as pct_secundario
from clientes c
join ranking r on r.cliente_id = c.id
group by c.id, c.nombre_corto, c.nombre, c.segmento;

comment on view bottlers_cliente is
  'Reparto de venta por bottler. es_frontera = el cliente compra a Andina y Embonor.';

-- =========================
-- 3. Refrescar clientes.bottler
-- =========================
-- El importador lo fija solo al crear el cliente, así que puede quedar viejo
-- si la cuenta se movió de zona. Lo alineamos con la venta real.
update clientes c
set    bottler = b.bottler_principal
from   bottlers_cliente b
where  b.cliente_id = c.id
  and  coalesce(c.bottler, '') is distinct from b.bottler_principal;
