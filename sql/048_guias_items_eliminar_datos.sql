-- Ejecutar solamente despues de publicar el codigo que usa cantidad.
begin;

drop trigger if exists trg_guias_items_cantidad_desde_datos
  on public.guias_items;
drop function if exists public.sincronizar_guias_items_cantidad();

alter table public.guias_items
  drop column if exists datos;

notify pgrst, 'reload schema';

commit;
