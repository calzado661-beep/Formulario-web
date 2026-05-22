create table if not exists public.registro_actividades (
  id bigserial primary key,
  trabajador_id bigint not null references public.usuarios(id) on delete cascade,
  tarea_id bigint not null references public.tarea(id) on delete cascade,
  fecha_registro date not null default current_date,
  actividad_nombre text not null,
  cantidad numeric,
  tiempo_minutos integer,
  cumplimiento boolean,
  detalle text,
  puntos_obtenidos numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_registro_actividades_trabajador_fecha
  on public.registro_actividades(trabajador_id, fecha_registro desc);
