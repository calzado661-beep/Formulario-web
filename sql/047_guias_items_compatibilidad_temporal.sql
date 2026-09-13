-- Compatibilidad temporal: la version anterior envia datos y la nueva envia
-- cantidad. Mientras conviven, extrae SERIE solo cuando llega el JSON.
begin;

create or replace function public.sincronizar_guias_items_cantidad()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.datos ? 'SERIE' then
    new.cantidad := coalesce(nullif(btrim(new.datos->>'SERIE'), '')::numeric, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guias_items_cantidad_desde_datos
  on public.guias_items;
create trigger trg_guias_items_cantidad_desde_datos
before insert or update of datos
on public.guias_items
for each row
execute function public.sincronizar_guias_items_cantidad();

revoke all on function public.sincronizar_guias_items_cantidad()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
