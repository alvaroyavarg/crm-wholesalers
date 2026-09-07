-- 0020: precio acordado por botella en pedidos (CLP, opcional)
alter table pedidos add column if not exists precio_botella numeric;
comment on column pedidos.precio_botella is 'Precio acordado por botella (CLP), opcional.';
