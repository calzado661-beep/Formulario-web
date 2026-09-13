-- Sustituye la fila completa en JSON por la unica cifra que usa la
-- aplicacion. codigo_item conserva la deteccion de filas duplicadas.
begin;

alter table public.guias_items
  add column if not exists cantidad numeric;

update public.guias_items
set cantidad = (datos->>'SERIE')::numeric
where cantidad is null;

do $$
begin
  if exists (select 1 from public.guias_items where cantidad is null) then
    raise exception 'Existen filas de guias_items sin una cantidad valida';
  end if;
end
$$;

alter table public.guias_items
  alter column cantidad set default 0,
  alter column cantidad set not null;

notify pgrst, 'reload schema';

commit;
