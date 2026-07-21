-- 0008: Feedback del KAM sobre recomendaciones descartadas.
-- El motivo del descarte se inyecta al system prompt del copiloto para que
-- no repita el mismo tipo de error.

alter table recomendaciones add column motivo_descarte text;
