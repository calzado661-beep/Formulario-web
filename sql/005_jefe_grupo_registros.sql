-- Nuevo rol: jefe de grupo
-- Registro supervisado por encargado hacia trabajador/tarea.

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.usuarios'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%rol%'
  loop
    execute format('alter table public.usuarios drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.usuarios
  add constraint usuarios_rol_check
  check (rol in ('administrador', 'operante', 'jefe de equipo', 'jefe de grupo', 'otros'));

create table if not exists public.registros_jefe_grupo (
  id bigserial primary key,
  encargado_id bigint not null references public.usuarios(id) on delete restrict,
  trabajador_id bigint not null references public.usuarios(id) on delete restrict,
  tarea_id bigint not null references public.tareas(id) on delete restrict,
  tarea_nombre text,
  fecha_registro date not null default current_date,
  cantidad numeric,
  tiempo_minutos integer,
  codigo_guia text,
  detalle text,
  created_at timestamptz not null default now(),
  constraint chk_registro_jefe_grupo_valor
    check (
      cantidad is not null
      or tiempo_minutos is not null
      or codigo_guia is not null
      or detalle is not null
    )
);

create index if not exists idx_registros_jefe_grupo_encargado
  on public.registros_jefe_grupo(encargado_id, created_at desc);

create index if not exists idx_registros_jefe_grupo_trabajador
  on public.registros_jefe_grupo(trabajador_id, created_at desc);

create index if not exists idx_registros_jefe_grupo_tarea
  on public.registros_jefe_grupo(tarea_id);

create or replace view public.v_registros_jefe_grupo as
select
  r.id,
  r.encargado_id,
  encargado.nombre as encargado_nombre,
  encargado.email as encargado_email,
  r.trabajador_id,
  trabajador.nombre as trabajador_nombre,
  trabajador.email as trabajador_email,
  r.tarea_id,
  coalesce(r.tarea_nombre, t.nombre, ('Tarea ' || r.tarea_id::text)) as tarea_nombre,
  r.fecha_registro,
  r.cantidad,
  r.tiempo_minutos,
  r.codigo_guia,
  r.detalle,
  r.created_at
from public.registros_jefe_grupo r
join public.usuarios encargado on encargado.id = r.encargado_id
join public.usuarios trabajador on trabajador.id = r.trabajador_id
left join public.tareas t on t.id = r.tarea_id;
