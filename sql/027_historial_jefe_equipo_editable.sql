-- Convierte el historial del jefe de equipo en la fuente canonica del registro
-- por tiempo. Las horas se guardan directamente en la misma fila que la
-- cantidad y el puntaje, de modo que el historial pueda editarse como tabla y
-- el operante vea cada correccion al actualizar su progreso.

begin;

alter table public.registros_tareas_jefe_equipo
  add column if not exists marca_id bigint references public.marcas(id) on delete set null,
  add column if not exists tienda_id bigint references public.tiendas(id) on delete set null,
  add column if not exists puntaje integer check (puntaje is null or puntaje between 0 and 10),
  add column if not exists hora_inicio timestamptz,
  add column if not exists hora_fin timestamptz,
  -- Se agrega primero sin default para que las filas historicas conserven su
  -- fecha real en el backfill de abajo y no parezcan actualizadas hoy.
  add column if not exists updated_at timestamptz,
  add column if not exists revision integer not null default 1;

-- Evita incrementar revisiones solo por volver a ejecutar esta migracion.
drop trigger if exists trg_registros_jefe_equipo_version
  on public.registros_tareas_jefe_equipo;

-- Conserva las horas de las tarjetas creadas con el flujo anterior. No se
-- inventan horas para registros legacy que nunca almacenaron ese dato.
do $$
begin
  if to_regclass('public.actividades_jefe_equipo') is not null then
    execute $backfill$
      update public.registros_tareas_jefe_equipo as registro
      set hora_inicio = coalesce(registro.hora_inicio, actividad.hora_inicio),
          hora_fin = coalesce(registro.hora_fin, actividad.hora_fin),
          updated_at = greatest(
            coalesce(registro.updated_at, registro.created_at, now()),
            coalesce(actividad.updated_at, actividad.created_at, registro.created_at, now())
          )
      from public.actividades_jefe_equipo as actividad
      where actividad.registro_tarea_id = registro.id
        and (
          registro.hora_inicio is null
          or (registro.hora_fin is null and actividad.hora_fin is not null)
        )
    $backfill$;
  end if;
end;
$$;

update public.registros_tareas_jefe_equipo
set updated_at = coalesce(updated_at, created_at, now()),
    revision = greatest(coalesce(revision, 1), 1);

alter table public.registros_tareas_jefe_equipo
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.registros_tareas_jefe_equipo
  drop constraint if exists registros_tareas_jefe_equipo_horas_validas,
  drop constraint if exists registros_tareas_jefe_equipo_revision_valida;

alter table public.registros_tareas_jefe_equipo
  add constraint registros_tareas_jefe_equipo_horas_validas check (
    (hora_inicio is null and hora_fin is null)
    or (hora_inicio is not null and hora_fin is not null and hora_fin > hora_inicio)
  ),
  add constraint registros_tareas_jefe_equipo_revision_valida check (revision >= 1);

create or replace function public.actualizar_registro_jefe_equipo_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.revision := greatest(coalesce(old.revision, 1) + 1, 2);
  return new;
end;
$$;

create trigger trg_registros_jefe_equipo_version
before update on public.registros_tareas_jefe_equipo
for each row execute function public.actualizar_registro_jefe_equipo_version();

-- Compatibilidad con los dos pendientes creados por el flujo de tarjetas. La
-- RPC de SQL 026 crea primero el registro historico y despues enlaza la
-- actividad; este trigger copia las horas en esa misma transaccion. Asi el
-- historial sigue siendo canonico incluso si la tarjeta se finaliza despues
-- de aplicar esta migracion.
create or replace function public.sincronizar_horas_registro_desde_actividad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.registro_tarea_id is not null
     and new.hora_inicio is not null
     and new.hora_fin is not null then
    update public.registros_tareas_jefe_equipo
    set hora_inicio = new.hora_inicio,
        hora_fin = new.hora_fin
    where id = new.registro_tarea_id
      and (hora_inicio is distinct from new.hora_inicio
        or hora_fin is distinct from new.hora_fin);
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.actividades_jefe_equipo') is not null then
    execute 'drop trigger if exists trg_sincronizar_horas_registro on public.actividades_jefe_equipo';
    execute $trigger$
      create trigger trg_sincronizar_horas_registro
      after insert or update on public.actividades_jefe_equipo
      for each row
      when (new.registro_tarea_id is not null)
      execute function public.sincronizar_horas_registro_desde_actividad()
    $trigger$;
  end if;
end;
$$;

create index if not exists idx_registros_jefe_equipo_trabajador_hora
  on public.registros_tareas_jefe_equipo(trabajador_id, hora_inicio desc, id desc);

create index if not exists idx_registros_jefe_equipo_encargado_hora
  on public.registros_tareas_jefe_equipo(encargado_id, hora_inicio desc, id desc);

-- El chequeo del API produce un mensaje amigable y esta exclusion elimina la
-- pequena ventana de carrera entre dos guardados simultaneos.
create extension if not exists btree_gist;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'registros_jefe_equipo_sin_solapamiento'
      and conrelid = 'public.registros_tareas_jefe_equipo'::regclass
  ) then
    alter table public.registros_tareas_jefe_equipo
      add constraint registros_jefe_equipo_sin_solapamiento
      exclude using gist (
        trabajador_id with =,
        tstzrange(hora_inicio, hora_fin, '[)') with &&
      )
      where (hora_inicio is not null and hora_fin is not null);
  end if;
end;
$$;

revoke all on function public.actualizar_registro_jefe_equipo_version()
  from public, anon, authenticated;
grant execute on function public.actualizar_registro_jefe_equipo_version()
  to service_role;
revoke all on function public.sincronizar_horas_registro_desde_actividad()
  from public, anon, authenticated;

comment on column public.registros_tareas_jefe_equipo.hora_inicio is
  'Hora real de inicio registrada por el jefe de equipo.';
comment on column public.registros_tareas_jefe_equipo.hora_fin is
  'Hora real de fin registrada por el jefe de equipo; siempre posterior al inicio.';
comment on column public.registros_tareas_jefe_equipo.revision is
  'Version para impedir que dos ediciones simultaneas se sobrescriban silenciosamente.';

commit;
