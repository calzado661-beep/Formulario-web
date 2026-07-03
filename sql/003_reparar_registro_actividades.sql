-- Alinea el guardado de actividades con el esquema real de esta base:
-- public.registros_tareas es la tabla editable y
-- public.v_registro_actividades es solo una vista de lectura.

create table if not exists public.registros_tareas (
  id bigserial primary key,
  usuario_id bigint not null references public.usuarios(id) on delete cascade,
  tarea_id bigint not null references public.tareas(id) on delete cascade,
  fecha_registro date not null default current_date,
  cantidad numeric,
  turno varchar,
  dato_extra text,
  observacion text,
  puntos_obtenidos numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.registros_tareas
  add column if not exists usuario_id bigint,
  add column if not exists tarea_id bigint,
  add column if not exists fecha_registro date not null default current_date,
  add column if not exists cantidad numeric,
  add column if not exists turno varchar,
  add column if not exists dato_extra text,
  add column if not exists observacion text,
  add column if not exists puntos_obtenidos numeric not null default 0,
  add column if not exists created_at timestamptz not null default now();

alter table public.registro_actividades
  add column if not exists dato_extra text;

create index if not exists idx_registros_tareas_usuario_fecha
  on public.registros_tareas(usuario_id, fecha_registro desc);

create index if not exists idx_registros_tareas_tarea_id
  on public.registros_tareas(tarea_id);

create or replace view public.v_registro_actividades as
select
  rt.id,
  rt.fecha_registro,
  rt.usuario_id,
  u.nombre,
  rt.tarea_id,
  t.nombre as tarea,
  t.tipo_medicion,
  rt.cantidad,
  rt.turno,
  rt.dato_extra,
  rt.observacion,
  rt.puntos_obtenidos
from public.registros_tareas rt
left join public.usuarios u on u.id = rt.usuario_id
left join public.tareas t on t.id = rt.tarea_id;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert on public.registros_tareas to anon, authenticated, service_role;
grant select on public.v_registro_actividades to anon, authenticated, service_role;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'registros_tareas_id_seq'
      and c.relkind = 'S'
  ) then
    grant usage, select on sequence public.registros_tareas_id_seq to anon, authenticated, service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
