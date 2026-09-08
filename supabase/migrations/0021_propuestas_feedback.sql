-- 0021: feedback del KAM sobre las propuestas de SKU del copiloto
-- Cada propuesta de SKU es una fila de recomendaciones (una por SKU) con
-- estado nueva / aceptada / descartada. El KAM puede aceptar, modificar el
-- volumen o rechazar, y siempre dejar feedback. El copiloto lee ese
-- feedback en su system prompt (descartes y ajustes) para no repetir el
-- mismo tipo de error.
alter table recomendaciones add column if not exists feedback text;
alter table recomendaciones add column if not exists eus_propuestos numeric;
alter table recomendaciones add column if not exists eus_final numeric;
alter table recomendaciones add column if not exists resuelta_at timestamptz;
comment on column recomendaciones.feedback is 'Comentario libre del KAM (acepte, modifique o rechace).';
comment on column recomendaciones.eus_propuestos is 'Volumen propuesto por el copiloto (propuestas de SKU).';
comment on column recomendaciones.eus_final is 'Volumen que el KAM dejó en la meta (propuestas de SKU aceptadas/modificadas).';
