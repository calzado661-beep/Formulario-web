-- Condicion de salud declarada en la ficha del trabajador.

begin;

alter table public.usuarios
  add column if not exists condicion_salud text;

notify pgrst, 'reload schema';

commit;
