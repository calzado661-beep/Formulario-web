-- Catalogo de encargados que se pueden asignar a una capacitacion de
-- trabajador (antes era texto libre). Se administra desde la pestana
-- "Cursos" y se selecciona de forma obligatoria al asignar capacitaciones
-- en lote.

begin;

create table if not exists public.capacitacion_encargados (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

notify pgrst, 'reload schema';

commit;
