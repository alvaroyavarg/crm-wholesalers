-- CRM Mayoristas — schema base (Fase 1)
-- Calendario fiscal: FY de julio a junio. P1 = julio ... P12 = junio.

-- =========================
-- Enums
-- =========================
create type segmento_cliente as enum ('TOP3', 'CLAVE');
create type tipo_nota as enum ('visita', 'llamada', 'acuerdo', 'rechazo', 'nota');
create type tipo_conocimiento as enum ('estrategia', 'politica');
create type estado_recomendacion as enum ('nueva', 'aceptada', 'descartada');

-- =========================
-- Tablas
-- =========================

-- Cuentas clave (~25). La cola larga del canal queda fuera de la app.
create table clientes (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  rut                 text unique,
  comuna              text,
  cliente_desde       date,
  segmento            segmento_cliente not null,
  activo              boolean not null default true,
  -- Señales para "Compra Inteligente" (editables; luego pueden venir de importaciones)
  dias_inventario     numeric,
  credito_disponible  numeric,  -- CLP
  creado_at           timestamptz not null default now()
);

-- Ventas mensuales por marca (periodo = día 1 del mes calendario)
create table ventas (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  periodo    date not null,
  marca      text not null,
  categoria  text not null,  -- Whisky, Vodka, Gin, Tequila, Ron, Licores, RTD
  eus        numeric not null default 0,
  valor      numeric not null default 0,
  unique (cliente_id, periodo, marca)  -- upsert idempotente del importador
);
create index ventas_cliente_periodo_idx on ventas (cliente_id, periodo);
create index ventas_periodo_idx on ventas (periodo);

-- Plan de venta mes a mes por año fiscal.
-- La meta base es "empatar LY": se pre-carga con el real del FY anterior y se edita.
create table plan_ventas (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  anio_fiscal    int not null,           -- ej: 2027 = FY27 (jul 2026 - jun 2027)
  periodo        int not null check (periodo between 1 and 12),
  eus_plan       numeric not null default 0,
  actualizado_at timestamptz not null default now(),
  unique (cliente_id, anio_fiscal, periodo)
);

-- Notas de visita / memoria cruda
create table notas (
  id                     uuid primary key default gen_random_uuid(),
  cliente_id             uuid not null references clientes(id) on delete cascade,
  fecha                  timestamptz not null default now(),
  tipo                   tipo_nota not null default 'nota',
  contenido_raw          text not null,
  contenido_estructurado jsonb,
  creado_por_agente      boolean not null default false
);
create index notas_cliente_fecha_idx on notas (cliente_id, fecha desc);

-- Perfil del comprador (1:1 con cliente, mantenido por el agente)
create table perfiles (
  cliente_id         uuid primary key references clientes(id) on delete cascade,
  decisor            text,
  estilo_negociacion text,
  frecuencia_compra  text,
  marcas_afines      text[] not null default '{}',
  rechazos           jsonb not null default '[]',
  acuerdos           jsonb not null default '[]',
  resumen            text,
  actualizado_at     timestamptz not null default now()
);

-- Estrategia del canal / políticas (editable; alimenta el system prompt del agente)
create table conocimiento (
  id             uuid primary key default gen_random_uuid(),
  tipo           tipo_conocimiento not null,
  titulo         text not null,
  contenido      text not null,  -- markdown
  actualizado_at timestamptz not null default now()
);

-- Boletines comerciales con vigencia
create table boletines (
  id                 uuid primary key default gen_random_uuid(),
  titulo             text not null,
  fecha_publicacion  date not null,
  vigente_desde      date not null,
  vigente_hasta      date not null,
  resumen_accionable text,   -- generado por Haiku (Fase 2)
  contenido_raw      text,
  archivo_url        text,   -- Supabase Storage
  creado_at          timestamptz not null default now(),
  check (vigente_hasta >= vigente_desde)
);

-- Recomendaciones del copiloto — la evidencia es obligatoria también a nivel de BD
create table recomendaciones (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  texto      text not null,
  -- [{tipo:'boletin'|'memoria'|'ventas', ref, detalle}]
  evidencia  jsonb not null check (jsonb_array_length(evidencia) > 0),
  estado     estado_recomendacion not null default 'nueva',
  creada_at  timestamptz not null default now()
);
create index recomendaciones_cliente_idx on recomendaciones (cliente_id, estado);

-- Historial de chat con el copiloto
create table conversaciones (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid references clientes(id) on delete set null,  -- null = chat general
  mensajes       jsonb not null default '[]',
  creada_at      timestamptz not null default now(),
  actualizada_at timestamptz not null default now()
);

-- =========================
-- RLS: data privada, acceso solo autenticado (2-3 usuarios, sin roles)
-- =========================
alter table clientes enable row level security;
alter table ventas enable row level security;
alter table plan_ventas enable row level security;
alter table notas enable row level security;
alter table perfiles enable row level security;
alter table conocimiento enable row level security;
alter table boletines enable row level security;
alter table recomendaciones enable row level security;
alter table conversaciones enable row level security;

create policy "autenticado total" on clientes        for all to authenticated using (true) with check (true);
create policy "autenticado total" on ventas          for all to authenticated using (true) with check (true);
create policy "autenticado total" on plan_ventas     for all to authenticated using (true) with check (true);
create policy "autenticado total" on notas           for all to authenticated using (true) with check (true);
create policy "autenticado total" on perfiles        for all to authenticated using (true) with check (true);
create policy "autenticado total" on conocimiento    for all to authenticated using (true) with check (true);
create policy "autenticado total" on boletines       for all to authenticated using (true) with check (true);
create policy "autenticado total" on recomendaciones for all to authenticated using (true) with check (true);
create policy "autenticado total" on conversaciones  for all to authenticated using (true) with check (true);
