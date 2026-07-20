-- 0007: Análisis de boletines con IA (Haiku).
-- resumen_accionable ya existe (texto markdown); agregamos lo estructurado.

alter table boletines add column promociones jsonb not null default '[]';
-- [{sku, categoria, detalle, mejor_costo, descuento_max}]
alter table boletines add column focos text[] not null default '{}';
alter table boletines add column analizado_at timestamptz;
