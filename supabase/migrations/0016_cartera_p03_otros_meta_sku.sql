-- 0016: cartera P03 FY27 — zona/desarrollador, "Otros" por bottler y meta por SKU
--
-- Fuente: Armado P03 F27 (hoja "Por cliente"). Define la cartera que se
-- gestiona comercialmente: 40 cuentas con código + un agregado "Otros" por
-- bottler (todo lo que está en la base mayorista y no se gestiona directo).

-- =========================
-- 1. Esquema
-- =========================
alter table clientes add column if not exists zona text;
alter table clientes add column if not exists desarrollador text;
alter table clientes add column if not exists es_otros boolean not null default false;
comment on column clientes.es_otros is
  'Fila agregada "Otros <bottler>": su venta es la suma de los clientes NO gestionados (activo=false) de ese bottler.';

-- Meta por SKU (opcional). La meta del cliente sigue viviendo en plan_ventas;
-- al guardar un SKU la app recalcula plan_ventas = suma de los SKUs.
create table if not exists plan_ventas_sku (
  cliente_id     uuid not null references clientes(id) on delete cascade,
  anio_fiscal    int  not null,
  periodo        int  not null check (periodo between 1 and 12),
  marca          text not null,
  formato        text not null default '',
  eus_plan       numeric not null default 0,
  actualizado_at timestamptz not null default now(),
  primary key (cliente_id, anio_fiscal, periodo, marca, formato)
);
alter table plan_ventas_sku enable row level security;
drop policy if exists "autenticado total" on plan_ventas_sku;
create policy "autenticado total" on plan_ventas_sku
  for all to authenticated using (true) with check (true);

-- =========================
-- 2. Cartera: activar / crear, con bottler, zona y desarrollador
-- =========================
do $$
declare
  v record;
  v_id uuid;
begin
  for v in
    select * from (values
    ('934153', 'COMERCIALIZADORA YDS SPA', null, 'KOA', 'Multi RM', 'Cristobal'),
    ('282155', 'COMERCIAL ESCOCIA LTDA.', null, 'KOA', 'Multi RM', 'Cristobal'),
    ('302423', 'DISTRIB. Y COM. TILICURA S.A.', null, 'KOA', 'Multi RM', 'Cristobal'),
    ('357586', 'JOSE ZAPATA E HIJOS S.A.', null, 'KOA', 'Multi RM', 'Francisco'),
    ('350683', 'CAVALIERI Y COMPANIA LIMITADA', null, 'KOA', 'Multi RM', 'Francisco'),
    ('717798', 'DISTRIBUIDORA GEOEXPRESS LIMITADA', null, 'KOA', 'Multi RM', 'Cristobal'),
    ('329126', 'GABRIEL ARTURO CRISOSTOMO GONZ', null, 'KOA', 'Multi RM', 'Robinson'),
    ('935111', 'JUAN PABLO MARTINEZ MUNOZ', null, 'KOA', 'Multi RM', 'Robinson'),
    ('903529', 'COMERCIAL SANTA MARTA LIMITADA', 'Santa Marta', 'KOA', 'Multi RM', 'Robinson'),
    ('755624', 'DISTRIBUIDORA SANTA MARIA LIMITADA', 'Santa María', 'KOA', 'Multi RM', 'Francisco'),
    ('755119', 'DISTRIBUIDORA HILTON SPA', 'Hilton', 'KOA', 'Multi RM', 'Francisco'),
    ('879573', 'CARLOS JILMENR GUEVARA ORTIZ', 'Guevara', 'KOA', 'Multi RM', 'Francisco'),
    ('888910', 'COMERCIAL BACO LIMITADA', 'Baco', 'KOA', 'Multi RM', 'Robinson'),
    ('344100', 'BOTILLERIA PRAT LTDA.', null, 'KOA', 'Multi RM', 'Robinson'),
    ('332838', 'CHAVARRI Y HUGOT LIMITADA', 'Chavarri y Hugot', 'KOA', 'Multi RM', 'Francisco'),
    ('1021085', 'IMP. MMM SPA', 'Imp. MMM', 'KOA', 'Multi RM', 'Robinson'),
    ('1064226', 'IMP. SHIV GANESHA SPA', 'Shiv Ganesha', 'KOA', 'Multi RM', 'Robinson'),
    ('854586', 'EL CONDOR RACING SPA', 'El Cóndor Racing', 'KOA', 'Norte', 'Nicolas'),
    ('1127401', 'COMERCIAL MEYER SPA', 'Comercial Meyer', 'KOA', 'Norte', 'Nicolas'),
    ('370862', 'DIST.Y COM. GIGANTE DEL PACIFICO', null, 'KOA', 'Centro Norte', 'Camilo'),
    ('280873', 'JORGE ARIEL RIQUELME MORENO', null, 'KOA', 'RGUA-SA', 'Jaime'),
    ('872983', 'HENRIQUEZ HERMANOS LIMITADA', null, 'KOA', 'RGUA-SA', 'Jaime'),
    ('6518191', 'IMP.Y EXPORTADORA EUROMAXX LTD', null, 'KOE', 'Iquique', 'Christian'),
    ('1842360', 'SOC.DISTRIB.EL MOLINO LTDA', null, 'KOE', 'Viña', 'Francisco'),
    ('1907026', 'DISTRIB. SAN BENJAMIN LTDA.', null, 'KOE', 'Viña', 'Francisco'),
    ('2034150', 'MATTE ARAVENA Y COMPANIA LTDA.', null, 'KOE', 'Viña', 'Ignacio'),
    ('1802114', 'COM. SAN FERMIN LTDA.', null, 'KOE', 'Viña', 'Francisco'),
    ('1906870', 'SOC.COM.SAN CARLOS LTDA', 'San Carlos', 'KOE', 'Viña', 'Ignacio'),
    ('1003358', 'HENRIQUEZ HERMANOS LIMITADA', null, 'KOE', null, null),
    ('1031480', 'D Y L LIQUORS STORE SPA', null, 'KOE', 'Talca', 'Carlos'),
    ('1501361', 'CLAUDIO ANTONIO RETAMAL MOYA', null, 'KOE', 'Talca', 'John'),
    ('1407176', 'JORGE RODRIGO VILCHES DONOSO', null, 'KOE', 'Talca', 'Carlos'),
    ('1404611', 'GERTRUDIS PASTRIAN PINO', 'Pastrian', 'KOE', 'Talca', 'Carlos'),
    ('49683', 'VIBE SPA', null, 'KOE', 'Concepcion', 'John'),
    ('402953', 'SOC.COMERCIAL HIPERKOR LTDA.', 'Hiperkor', 'KOE', 'Temuco', 'Gonzalo'),
    ('253368', 'FERNANDO JANS Y CIA LIMITADA', 'Fernando Jans', 'KOE', 'Temuco', 'Gonzalo'),
    ('217633', 'JOSE ZAPATA E HIJOS S A', 'Zapata (Embonor)', 'KOE', 'Temuco', 'Gonzalo'),
    ('4100851', 'DIST.Y COM.DIMAK LIMITADA', null, 'KOE', 'Puerto Montt', 'Victor'),
    ('4012669', 'DISTRIBUIDORA LA COLINA', 'La Colina', 'KOE', 'Puerto Montt', 'Victor'),
    ('227445', 'ELAB.COM.ALIM.OSORNO LTDA', 'Osorno', 'KOE', 'Puerto Montt', 'Victor')
    ) as t(cod, nombre, nombre_corto, bottler, zona, desarrollador)
  loop
    select cc.cliente_id into v_id
    from cliente_codigos cc
    where cc.sistema = 'DIAGEO' and cc.cod_cliente = v.cod;

    if v_id is null then
      insert into clientes (nombre, nombre_corto, segmento, activo, bottler, zona, desarrollador)
      values (v.nombre, v.nombre_corto, 'CLAVE', true, v.bottler, v.zona, v.desarrollador)
      returning id into v_id;
      insert into cliente_codigos (sistema, cod_cliente, cliente_id, nombre_oficial)
      values ('DIAGEO', v.cod, v_id, v.nombre)
      on conflict (sistema, cod_cliente) do nothing;
    else
      update clientes c
      set activo        = true,
          nombre_corto  = coalesce(c.nombre_corto, v.nombre_corto),
          bottler       = coalesce(c.bottler, v.bottler),
          zona          = coalesce(v.zona, c.zona),
          desarrollador = coalesce(v.desarrollador, c.desarrollador)
      where c.id = v_id;
    end if;

    -- código del bottler donde vive (KOE = mismo; KOA = +499.987.655)
    if v.bottler = 'KOA' then
      insert into cliente_codigos (sistema, cod_cliente, cliente_id, nombre_oficial)
      values ('KOA', (v.cod::bigint + 499987655)::text, v_id, v.nombre)
      on conflict (sistema, cod_cliente) do nothing;
    else
      insert into cliente_codigos (sistema, cod_cliente, cliente_id, nombre_oficial)
      values ('KOE', v.cod, v_id, v.nombre)
      on conflict (sistema, cod_cliente) do nothing;
    end if;
  end loop;
end $$;

-- Agregados "Otros" (uno por bottler)
insert into clientes (nombre, nombre_corto, segmento, activo, bottler, zona, desarrollador, es_otros)
select 'OTROS CLIENTES (CANAL MAYORISTA KOA)', 'Otros Andina', 'CLAVE', true, 'KOA', 'Otros', 'Otros', true
where not exists (select 1 from clientes where es_otros and bottler = 'KOA');
insert into clientes (nombre, nombre_corto, segmento, activo, bottler, zona, desarrollador, es_otros)
select 'OTROS CLIENTES (CANAL MAYORISTA KOE)', 'Otros Embonor', 'CLAVE', true, 'KOE', 'Otros', 'Otros', true
where not exists (select 1 from clientes where es_otros and bottler = 'KOE');

-- =========================
-- 3. Venta de un cliente para un (fy, periodo): normal u "Otros"
-- =========================
-- "Otros KOA" = lo que el importador de Andina agrupa como "Otros" (códigos
-- fuera de la cartera) + la venta de clientes que dejaron de gestionarse
-- (activo=false) y que en cargas anteriores entraron con su propio id.
-- p_bottler (opcional) restringe a la venta de un bottler.
drop function if exists eus_cliente_periodo(uuid, int, int);
create or replace function eus_cliente_periodo(
  p_cliente uuid, p_fy int, p_periodo int, p_bottler text default null
)
returns numeric
language sql stable as $$
  select coalesce(sum(v.eus), 0)
  from clientes c
  join ventas v
    on v.cliente_id = c.id
    or (c.es_otros and v.bottler = c.bottler
        and v.cliente_id in (select id from clientes where not activo and not es_otros))
  where c.id = p_cliente
    and fy_de(v.periodo) = p_fy and periodo_de(v.periodo) = p_periodo
    and (p_bottler is null or v.bottler = p_bottler)
$$;

-- =========================
-- 4. resumen_meta_periodo: zona, desarrollador, otros, meta por SKU
-- =========================
drop function if exists resumen_meta_periodo(int, int, int, int, int, int, int, int);
create or replace function resumen_meta_periodo(
  p_fy_a int, p_periodo_a int,
  p_fy_b int, p_periodo_b int,
  p_fy_c int, p_periodo_c int,
  p_fy_meta int, p_periodo_meta int
)
returns table (
  cliente_id    uuid,
  nombre        text,
  nombre_corto  text,
  segmento      segmento_cliente,
  cod_diageo    text,
  bottler       text,
  es_frontera   boolean,
  zona          text,
  desarrollador text,
  es_otros      boolean,
  eus_a         numeric,
  eus_b         numeric,
  eus_c         numeric,
  meta_eus      numeric,
  meta_sku_eus  numeric
)
language sql stable as $$
  select
    c.id, c.nombre, c.nombre_corto, c.segmento,
    (select string_agg(cc.cod_cliente, ' / ' order by cc.cod_cliente)
       from cliente_codigos cc where cc.cliente_id = c.id and cc.sistema = 'DIAGEO'),
    coalesce(b.bottler_principal, c.bottler),
    coalesce(b.es_frontera, false),
    c.zona, c.desarrollador, c.es_otros,
    eus_cliente_periodo(c.id, p_fy_a, p_periodo_a),
    eus_cliente_periodo(c.id, p_fy_b, p_periodo_b),
    eus_cliente_periodo(c.id, p_fy_c, p_periodo_c),
    coalesce((select pv.eus_plan from plan_ventas pv
              where pv.cliente_id = c.id and pv.anio_fiscal = p_fy_meta and pv.periodo = p_periodo_meta), 0),
    coalesce((select sum(ps.eus_plan) from plan_ventas_sku ps
              where ps.cliente_id = c.id and ps.anio_fiscal = p_fy_meta and ps.periodo = p_periodo_meta), 0)
  from clientes c
  left join bottlers_cliente b on b.cliente_id = c.id
  where c.activo
  order by c.es_otros, c.nombre_corto nulls last, c.nombre
$$;

-- =========================
-- 5. Detalle por SKU: histórico ∪ metas por SKU (un cliente / toda la cartera)
-- =========================
drop function if exists detalle_meta_cliente(uuid, int, int, int, int, int, int);
create or replace function detalle_meta_cliente(
  p_cliente uuid,
  p_fy_a int, p_periodo_a int,
  p_fy_b int, p_periodo_b int,
  p_fy_c int, p_periodo_c int,
  p_fy_meta int, p_periodo_meta int
)
returns jsonb
language sql stable as $$
  with cli as (select * from clientes where id = p_cliente),
  vv as (
    select v.*
    from cli, ventas v
    where v.cliente_id = cli.id
       or (cli.es_otros and v.bottler = cli.bottler
           and v.cliente_id in (select id from clientes where not activo and not es_otros))
  ),
  hist as (
    select v.categoria, v.marca, coalesce(v.formato, '') as formato,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy_a and periodo_de(v.periodo) = p_periodo_a) as eus_a,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy_b and periodo_de(v.periodo) = p_periodo_b) as eus_b,
      sum(v.eus) filter (where fy_de(v.periodo) = p_fy_c and periodo_de(v.periodo) = p_periodo_c) as eus_c
    from vv v group by 1, 2, 3
  ),
  metas as (
    select marca, formato, eus_plan from plan_ventas_sku
    where cliente_id = p_cliente and anio_fiscal = p_fy_meta and periodo = p_periodo_meta
  ),
  todo as (
    select coalesce(h.categoria, '') as categoria,
           coalesce(h.marca, m.marca) as marca,
           coalesce(h.formato, m.formato) as formato,
           coalesce(h.eus_a, 0) as eus_a, coalesce(h.eus_b, 0) as eus_b, coalesce(h.eus_c, 0) as eus_c,
           coalesce(m.eus_plan, 0) as meta_eus
    from hist h
    full join metas m on m.marca = h.marca and m.formato = h.formato
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'categoria', categoria, 'marca', marca, 'formato', formato,
      'eus_a', eus_a, 'eus_b', eus_b, 'eus_c', eus_c, 'meta_eus', meta_eus)
      order by (eus_a + eus_b + eus_c + meta_eus) desc), '[]'::jsonb)
  from todo
  where eus_a <> 0 or eus_b <> 0 or eus_c <> 0 or meta_eus <> 0
$$;

drop function if exists detalle_meta_todos(int, int, int, int, int, int);
create or replace function detalle_meta_todos(
  p_fy_a int, p_periodo_a int,
  p_fy_b int, p_periodo_b int,
  p_fy_c int, p_periodo_c int,
  p_fy_meta int, p_periodo_meta int
)
returns table (
  cliente_id uuid, nombre_corto text, nombre text,
  categoria text, marca text, formato text,
  eus_a numeric, eus_b numeric, eus_c numeric, meta_eus numeric
)
language sql stable as $$
  select c.id, c.nombre_corto, c.nombre,
         (d->>'categoria'), (d->>'marca'), (d->>'formato'),
         (d->>'eus_a')::numeric, (d->>'eus_b')::numeric, (d->>'eus_c')::numeric, (d->>'meta_eus')::numeric
  from clientes c
  cross join lateral jsonb_array_elements(
    detalle_meta_cliente(c.id, p_fy_a, p_periodo_a, p_fy_b, p_periodo_b, p_fy_c, p_periodo_c, p_fy_meta, p_periodo_meta)
  ) as d
  where c.activo
  order by c.es_otros, c.nombre_corto nulls last, c.nombre, 7 desc
$$;

-- Catálogo de SKUs conocidos (para "agregar SKU" a la meta)
create or replace function catalogo_skus()
returns table (marca text, formato text, categoria text)
language sql stable as $$
  select marca, coalesce(formato, ''), max(categoria)
  from ventas
  where periodo >= (current_date - interval '18 months')
  group by 1, 2
  order by 1, 2
$$;

-- =========================
-- 6. MTD: que "Otros" también tenga venta
-- =========================
drop function if exists mtd_cartera(int, int);
create or replace function mtd_cartera(p_fy int, p_periodo int)
returns table (
  cliente_id uuid, nombre text, nombre_corto text, segmento segmento_cliente, bottler text,
  mtd_eus numeric, mtd_ly_eus numeric, plan_mes_eus numeric, mtd_koa numeric, mtd_koe numeric
)
language sql stable as $$
  select
    c.id, c.nombre, c.nombre_corto, c.segmento, c.bottler,
    eus_cliente_periodo(c.id, p_fy, p_periodo),
    eus_cliente_periodo(c.id, p_fy - 1, p_periodo),
    coalesce((select pv.eus_plan from plan_ventas pv
              where pv.cliente_id = c.id and pv.anio_fiscal = p_fy and pv.periodo = p_periodo), 0),
    eus_cliente_periodo(c.id, p_fy, p_periodo, 'KOA'),
    eus_cliente_periodo(c.id, p_fy, p_periodo, 'KOE')
  from clientes c
  where c.activo
  order by 6 desc
$$;
