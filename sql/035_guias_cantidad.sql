-- Guarda en la propia tabla "guias" la cantidad total de cada guia (suma de
-- la columna "SERIE" del Excel, que en realidad es una cantidad, entre
-- todas las lineas de esa guia en "guias_items"). Antes se calculaba al
-- vuelo en cada lectura; ahora queda como columna para que se vea
-- directamente en la tabla y no dependa de recalcularla cada vez.

begin;

alter table public.guias
  add column if not exists cantidad numeric not null default 0;

update public.guias g
set cantidad = coalesce(sub.total, 0)
from (
  select codigo_guia, sum((datos->>'SERIE')::numeric) as total
  from public.guias_items
  group by codigo_guia
) sub
where g.codigo = sub.codigo_guia;

notify pgrst, 'reload schema';

commit;
