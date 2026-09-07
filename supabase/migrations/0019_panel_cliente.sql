-- 0019: panel de cliente en Meta — bitácora (compromisos e ideas) y pedidos
-- registrados a mano.

-- ---- Bitácora: dos tipos nuevos + vencimiento y cierre de compromisos ----
alter type tipo_nota add value if not exists 'compromiso';
alter type tipo_nota add value if not exists 'idea';
alter table notas add column if not exists vence date;
alter table notas add column if not exists cerrada_at timestamptz;
comment on column notas.vence is 'Fecha límite de un compromiso (solo tipo compromiso).';
comment on column notas.cerrada_at is 'Cuándo se marcó cumplido el compromiso (null = pendiente).';

-- ---- Pedidos ingresados a mano ----
-- NO se escriben en ventas: esa tabla es la verdad del bottler y cada carga
-- reemplaza el mes completo. Un pedido es avance "en curso" contra la meta
-- hasta que la venta real lo refleje.
create table if not exists pedidos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  fecha          date not null default current_date,
  anio_fiscal    int  not null,
  periodo        int  not null check (periodo between 1 and 12),
  bottler        text,
  marca          text not null,
  formato        text not null default '',
  uc             numeric,
  eus            numeric not null,
  estado         text not null default 'ingresado'
                 check (estado in ('comprometido', 'ingresado', 'facturado')),
  comentario     text,
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);
create index if not exists pedidos_cliente_periodo_idx on pedidos (cliente_id, anio_fiscal, periodo);
alter table pedidos enable row level security;
drop policy if exists "autenticado total" on pedidos;
create policy "autenticado total" on pedidos
  for all to authenticated using (true) with check (true);
