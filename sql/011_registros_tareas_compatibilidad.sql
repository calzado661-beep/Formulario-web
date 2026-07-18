-- Alinea registros_tareas con todos los campos opcionales enviados por la aplicacion.
-- Es seguro ejecutarlo varias veces.

alter table public.registros_tareas
  add column if not exists tiempo_minutos integer,
  add column if not exists dato_extra text,
  add column if not exists cumplimiento boolean,
  add column if not exists created_at timestamptz not null default now();

grant select, insert, update, delete on public.registros_tareas to service_role;

notify pgrst, 'reload schema';
