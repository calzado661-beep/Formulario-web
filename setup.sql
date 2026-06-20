create table if not exists public.usuarios (
  id bigserial primary key,
  nombre text not null,
  email text unique not null,
  password_hash text not null,
  rol text not null check (rol in ('administrador', 'trabajador')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tarea (
  id bigserial primary key,
  titulo text not null,
  descripcion text,
  estado text not null default 'pendiente',
  tipo_medicion text not null default 'cantidad',
  unidad_base text,
  puntaje_fijo integer,
  asignado_a bigint references public.usuarios(id) on delete set null,
  email_trabajador text,
  created_at timestamptz not null default now()
);

create table if not exists public.rangos_puntaje (
  id bigserial primary key,
  tarea_id bigint not null references public.tarea(id) on delete cascade,
  cantidad_desde numeric,
  cantidad_hasta numeric,
  puntos integer not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_rangos_puntaje_tarea_range
  on public.rangos_puntaje(tarea_id, cantidad_desde, cantidad_hasta);

create table if not exists public.registro_actividades (
  id bigserial primary key,
  trabajador_id bigint not null references public.usuarios(id) on delete cascade,
  tarea_id bigint not null references public.tarea(id) on delete cascade,
  actividad_nombre text,
  fecha_registro date not null default current_date,
  cantidad numeric,
  tiempo_minutos integer,
  cumplimiento boolean,
  detalle text,
  turno text,
  puntos_obtenidos numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_registro_actividades_trabajador_fecha
  on public.registro_actividades(trabajador_id, fecha_registro desc);
