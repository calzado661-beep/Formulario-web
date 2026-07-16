-- Configura las tareas operativas y permite distribuir un registro entre varias marcas.

alter table public.tareas
  add column if not exists requiere_marca boolean not null default false;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.tareas'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo_medicion%'
  loop
    execute format('alter table public.tareas drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.tareas
  add constraint tareas_tipo_medicion_check
  check (tipo_medicion in ('cantidad', 'fijo', 'turno', 'tiempo', 'cumplimiento'));

update public.tareas
set nombre = 'Clasificado y Rotulado según Género, Talla y Modelo'
where nombre = 'Clasificado y Rotulado';

update public.tareas
set
  tipo_medicion = case
    when nombre in (
      'Etiquetado',
      'Envío Nuevo',
      'Visita de Tienda',
      'Picking',
      'Embalado y Rotulado de Guía'
    ) then 'tiempo'
    else tipo_medicion
  end,
  requiere_marca = nombre in (
    'Etiquetado',
    'Visita de Tienda',
    'Pedido Mayorista',
    'Picking',
    'Pistoleado',
    'Embalado y Rotulado de Guía',
    'Inventario'
  )
where nombre in (
  'Recepción de Mercaderías',
  'Clasificado y Rotulado según Género, Talla y Modelo',
  'Etiquetado',
  'Revisión de Guía (Devolución)',
  'Envío Nuevo',
  'Visita de Tienda',
  'Pedido Mayorista',
  'Picking',
  'Pistoleado',
  'Revisión de Guía (Despacho)',
  'Embalado y Rotulado de Guía',
  'Apoyo Inter-Area',
  'Manejo de Montacarga',
  'Cargar Bultos',
  'Inventario',
  'Apoyo tienda',
  'Limpieza',
  'Sacar Basura'
);

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

create table if not exists public.registro_jefe_grupo_marcas (
  id bigserial primary key,
  registro_jefe_grupo_id bigint not null references public.registros_jefe_grupo(id) on delete cascade,
  marca_id bigint not null references public.marcas(id) on delete restrict,
  cantidad numeric not null check (cantidad > 0),
  created_at timestamptz not null default now(),
  constraint uq_registro_jefe_grupo_marca unique (registro_jefe_grupo_id, marca_id)
);

create index if not exists idx_registro_jefe_grupo_marcas_registro
  on public.registro_jefe_grupo_marcas(registro_jefe_grupo_id);

create index if not exists idx_registro_jefe_grupo_marcas_marca
  on public.registro_jefe_grupo_marcas(marca_id);

grant select on public.marcas to anon, authenticated, service_role;
grant select, insert, update, delete on public.registro_tarea_marcas to service_role;
grant select, insert, update, delete on public.registro_jefe_grupo_marcas to service_role;
grant usage, select on sequence public.registro_tarea_marcas_id_seq to service_role;
grant usage, select on sequence public.registro_jefe_grupo_marcas_id_seq to service_role;

notify pgrst, 'reload schema';
