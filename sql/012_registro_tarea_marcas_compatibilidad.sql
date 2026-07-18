-- Crea el detalle de marcas para el esquema real que usa public.tarea.
-- Es seguro ejecutar este archivo varias veces.

create table if not exists public.registro_tarea_marcas (
  id bigserial primary key,
  registro_tarea_id bigint not null references public.registros_tareas(id) on delete cascade,
  marca_id bigint not null references public.marcas(id) on delete restrict,
  cantidad numeric not null check (cantidad > 0),
  created_at timestamptz not null default now(),
  constraint uq_registro_tarea_marca unique (registro_tarea_id, marca_id)
);

create index if not exists idx_registro_tarea_marcas_registro
  on public.registro_tarea_marcas(registro_tarea_id);

create index if not exists idx_registro_tarea_marcas_marca
  on public.registro_tarea_marcas(marca_id);

grant select, insert, update, delete on public.registro_tarea_marcas to service_role;
grant usage, select on sequence public.registro_tarea_marcas_id_seq to service_role;

notify pgrst, 'reload schema';
