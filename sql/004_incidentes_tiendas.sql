create table if not exists public.tiendas (
  id bigserial primary key,
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.incidentes (
  id bigserial primary key,
  turno text not null check (turno in ('turno regular', 'incidencia', 'turno extra')),
  nombre text not null,
  tarea_id bigint references public.tarea(id) on delete set null,
  tarea_nombre text,
  tienda_id bigint references public.tiendas(id) on delete set null,
  numero_guia text,
  observacion text,
  tipo_error text not null check (tipo_error in ('CONTENIDO', 'LIBERADO')),
  created_by bigint references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_incidentes_tienda_id on public.incidentes(tienda_id);
create index if not exists idx_incidentes_tarea_id on public.incidentes(tarea_id);
create index if not exists idx_incidentes_created_at on public.incidentes(created_at desc);
