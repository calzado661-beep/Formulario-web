-- Separa la visibilidad de un campo de su obligatoriedad.
-- requiere_* decide si aparece; obligatorio_* decide si puede quedar vacio.

begin;

alter table public.tarea
  add column if not exists obligatorio_marca boolean not null default true,
  add column if not exists obligatorio_tiempo boolean not null default true,
  add column if not exists obligatorio_lote boolean not null default true,
  add column if not exists obligatorio_numero_guia boolean not null default true,
  add column if not exists obligatorio_hangtag boolean not null default true,
  add column if not exists obligatorio_tienda boolean not null default true;

notify pgrst, 'reload schema';

commit;
