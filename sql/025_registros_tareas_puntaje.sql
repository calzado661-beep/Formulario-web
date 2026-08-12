-- Usa `puntaje` como la columna canonica del resultado obtenido por actividad.
-- Es seguro ejecutar esta migracion varias veces.

begin;

alter table public.registros_tareas
  add column if not exists puntaje numeric not null default 0;

grant select, insert, update, delete on public.registros_tareas to service_role;

commit;

notify pgrst, 'reload schema';
