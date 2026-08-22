-- Promedio de referencia manual para el historial de jefe de equipo: un
-- numero editable POR TAREA (no uno solo global) que reemplaza el calculo
-- automatico anterior. Ademas, si la tarea usa hangtag (hoy, Etiquetado),
-- se guarda un promedio separado para "con hangtag" y "sin hangtag" porque
-- rinden a ritmos distintos y no son comparables entre si.
--
-- No se pone una foreign key hacia la tabla de tareas porque el nombre real
-- (tarea o tareas) varia segun el proyecto; el backend ya valida el tarea_id
-- contra la tabla de tareas antes de guardar.
--
-- Este archivo es seguro de correr aunque ya hayas ejecutado una version
-- anterior de esta migracion (con una sola fila por tarea, sin hangtag):
-- agrega la columna que falte y migra la clave primaria sin perder datos.

begin;

create table if not exists public.promedios_referencia_jefe_equipo (
  tarea_id bigint not null,
  promedio_referencia numeric(8, 2) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by bigint references public.usuarios(id) on delete set null
);

-- '' = tarea sin hangtag (un solo promedio). 'CON_HANGTAG' / 'SIN_HANGTAG' =
-- las dos mitades de una tarea que si lo usa.
alter table public.promedios_referencia_jefe_equipo
  add column if not exists tipo_etiquetado text not null default '';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'promedios_referencia_jefe_equipo_pkey'
      and conrelid = 'public.promedios_referencia_jefe_equipo'::regclass
      and array_length(conkey, 1) = 1
  ) then
    alter table public.promedios_referencia_jefe_equipo
      drop constraint promedios_referencia_jefe_equipo_pkey;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'promedios_referencia_jefe_equipo_pkey'
      and conrelid = 'public.promedios_referencia_jefe_equipo'::regclass
  ) then
    alter table public.promedios_referencia_jefe_equipo
      add constraint promedios_referencia_jefe_equipo_pkey primary key (tarea_id, tipo_etiquetado);
  end if;
end;
$$;

grant select, insert, update, delete on public.promedios_referencia_jefe_equipo to service_role;

notify pgrst, 'reload schema';

commit;
