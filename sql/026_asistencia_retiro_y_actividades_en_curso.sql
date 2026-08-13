-- Edicion de asistencia del dia y seguimiento de actividades en tiempo real.

begin;

alter table public.asistencias
  add column if not exists retiro_anticipado boolean not null default false,
  add column if not exists motivo_retiro text,
  add column if not exists retirado_en timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.registros_tareas_jefe_equipo (
  id bigserial primary key,
  encargado_id bigint not null references public.usuarios(id) on delete restrict,
  trabajador_id bigint not null references public.usuarios(id) on delete restrict,
  tarea_id bigint not null references public.tarea(id) on delete restrict,
  fecha_registro date not null default current_date,
  cantidad numeric not null default 0 check (cantidad >= 0),
  tiempo_minutos numeric not null default 0 check (tiempo_minutos >= 0),
  numero_guia text,
  lote text,
  observacion text,
  created_at timestamptz not null default now()
);

alter table public.registros_tareas_jefe_equipo
  add column if not exists marca_id bigint references public.marcas(id) on delete set null,
  add column if not exists tienda_id bigint references public.tiendas(id) on delete set null,
  add column if not exists puntaje integer check (puntaje is null or (puntaje >= 0 and puntaje <= 10));

update public.asistencias
set
  retiro_anticipado = coalesce(retiro_anticipado, false),
  updated_at = coalesce(updated_at, created_at, now());

alter table public.asistencias
  drop constraint if exists asistencias_retiro_valido;

update public.asistencias
set motivo_retiro = null,
    retirado_en = null
where not retiro_anticipado;

alter table public.asistencias
  add constraint asistencias_retiro_valido check (
    (not retiro_anticipado and motivo_retiro is null and retirado_en is null)
    or (
      estado in ('PUNTUAL', 'TARDANZA')
      and nullif(btrim(motivo_retiro), '') is not null
      and char_length(motivo_retiro) <= 500
      and retirado_en is not null
      and (created_at is null or retirado_en >= created_at)
    )
  );

create or replace function public.actualizar_updated_at_operaciones()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_asistencias_updated_at on public.asistencias;
create trigger trg_asistencias_updated_at
before update on public.asistencias
for each row execute function public.actualizar_updated_at_operaciones();

create table if not exists public.actividades_jefe_equipo (
  id bigserial primary key,
  encargado_id bigint not null references public.usuarios(id) on delete restrict,
  trabajador_id bigint not null references public.usuarios(id) on delete restrict,
  tarea_id bigint not null references public.tarea(id) on delete restrict,
  fecha_registro date not null default current_date,
  hora_inicio timestamptz not null,
  hora_fin timestamptz,
  cantidad integer not null default 0 check (cantidad >= 0),
  puntaje integer check (puntaje is null or (puntaje >= 0 and puntaje <= 10)),
  numero_guia text,
  lote text,
  marca_id bigint references public.marcas(id) on delete set null,
  tienda_id bigint references public.tiendas(id) on delete set null,
  observacion text,
  estado text not null default 'EN_CURSO' check (estado in ('EN_CURSO', 'FINALIZADA')),
  registro_tarea_id bigint unique references public.registros_tareas_jefe_equipo(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint actividades_jefe_equipo_cierre_valido check (
    (estado = 'EN_CURSO' and hora_fin is null and puntaje is null)
    or (estado = 'FINALIZADA' and hora_fin is not null and hora_fin > hora_inicio and puntaje is not null)
  )
);

alter table public.actividades_jefe_equipo
  add column if not exists encargado_id bigint references public.usuarios(id) on delete restrict,
  add column if not exists trabajador_id bigint references public.usuarios(id) on delete restrict,
  add column if not exists tarea_id bigint references public.tarea(id) on delete restrict,
  add column if not exists fecha_registro date default current_date,
  add column if not exists hora_inicio timestamptz,
  add column if not exists hora_fin timestamptz,
  add column if not exists cantidad integer default 0,
  add column if not exists puntaje integer,
  add column if not exists numero_guia text,
  add column if not exists lote text,
  add column if not exists marca_id bigint references public.marcas(id) on delete set null,
  add column if not exists tienda_id bigint references public.tiendas(id) on delete set null,
  add column if not exists observacion text,
  add column if not exists estado text default 'EN_CURSO',
  add column if not exists registro_tarea_id bigint references public.registros_tareas_jefe_equipo(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.actividades_jefe_equipo
set fecha_registro = coalesce(fecha_registro, (hora_inicio at time zone 'America/Lima')::date, current_date),
    cantidad = greatest(coalesce(cantidad, 0), 0),
    estado = case when estado = 'FINALIZADA' and hora_fin is not null and puntaje is not null then 'FINALIZADA' else 'EN_CURSO' end,
    hora_fin = case when estado = 'FINALIZADA' and hora_fin is not null and puntaje is not null then hora_fin else null end,
    puntaje = case when estado = 'FINALIZADA' and hora_fin is not null and puntaje is not null then puntaje else null end,
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, created_at, now());

alter table public.actividades_jefe_equipo
  drop constraint if exists actividades_jefe_equipo_cierre_valido,
  drop constraint if exists actividades_jefe_equipo_cantidad_valida,
  drop constraint if exists actividades_jefe_equipo_puntaje_valido,
  drop constraint if exists actividades_jefe_equipo_estado_valido;

alter table public.actividades_jefe_equipo
  alter column encargado_id set not null,
  alter column trabajador_id set not null,
  alter column tarea_id set not null,
  alter column fecha_registro set default current_date,
  alter column fecha_registro set not null,
  alter column hora_inicio set not null,
  alter column cantidad set default 0,
  alter column cantidad set not null,
  alter column estado set default 'EN_CURSO',
  alter column estado set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.actividades_jefe_equipo
  add constraint actividades_jefe_equipo_cantidad_valida check (cantidad >= 0),
  add constraint actividades_jefe_equipo_puntaje_valido check (puntaje is null or puntaje between 0 and 10),
  add constraint actividades_jefe_equipo_estado_valido check (estado in ('EN_CURSO', 'FINALIZADA')),
  add constraint actividades_jefe_equipo_cierre_valido check (
    (estado = 'EN_CURSO' and hora_fin is null and puntaje is null)
    or (estado = 'FINALIZADA' and hora_fin is not null and hora_fin > hora_inicio and puntaje is not null)
  );

create unique index if not exists uq_actividad_registro_tarea
  on public.actividades_jefe_equipo(registro_tarea_id)
  where registro_tarea_id is not null;

create unique index if not exists uq_actividad_abierta_por_trabajador
  on public.actividades_jefe_equipo(trabajador_id)
  where estado = 'EN_CURSO';

create index if not exists idx_actividades_jefe_equipo_encargado
  on public.actividades_jefe_equipo(encargado_id, estado, hora_inicio desc);

create index if not exists idx_actividades_jefe_equipo_trabajador
  on public.actividades_jefe_equipo(trabajador_id, hora_inicio desc);

create table if not exists public.actividades_jefe_equipo_historial (
  id bigserial primary key,
  actividad_id bigint not null references public.actividades_jefe_equipo(id) on delete cascade,
  cantidad integer not null check (cantidad >= 0),
  registrado_por bigint not null references public.usuarios(id) on delete restrict,
  tipo text not null check (tipo in ('INICIO', 'ACTUALIZACION', 'FINALIZACION')),
  puntaje integer check (puntaje is null or (puntaje >= 0 and puntaje <= 10)),
  created_at timestamptz not null default now()
);

alter table public.actividades_jefe_equipo_historial
  add column if not exists actividad_id bigint references public.actividades_jefe_equipo(id) on delete cascade,
  add column if not exists cantidad integer default 0,
  add column if not exists registrado_por bigint references public.usuarios(id) on delete restrict,
  add column if not exists tipo text,
  add column if not exists puntaje integer,
  add column if not exists created_at timestamptz default now();

update public.actividades_jefe_equipo_historial
set cantidad = greatest(coalesce(cantidad, 0), 0),
    tipo = coalesce(nullif(tipo, ''), 'ACTUALIZACION'),
    created_at = coalesce(created_at, now());

alter table public.actividades_jefe_equipo_historial
  drop constraint if exists actividades_jefe_equipo_historial_cantidad_valida,
  drop constraint if exists actividades_jefe_equipo_historial_tipo_valido,
  drop constraint if exists actividades_jefe_equipo_historial_puntaje_valido;

alter table public.actividades_jefe_equipo_historial
  alter column actividad_id set not null,
  alter column cantidad set not null,
  alter column registrado_por set not null,
  alter column tipo set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.actividades_jefe_equipo_historial
  add constraint actividades_jefe_equipo_historial_cantidad_valida check (cantidad >= 0),
  add constraint actividades_jefe_equipo_historial_tipo_valido check (tipo in ('INICIO', 'ACTUALIZACION', 'FINALIZACION')),
  add constraint actividades_jefe_equipo_historial_puntaje_valido check (puntaje is null or puntaje between 0 and 10);

create index if not exists idx_actividad_historial_actividad
  on public.actividades_jefe_equipo_historial(actividad_id, created_at asc, id asc);

create or replace function public.bloquear_reglas_puntaje_tarea()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(coalesce(new.tarea_id, old.tarea_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_bloquear_reglas_puntaje_tarea on public.reglas_puntaje;
create trigger trg_bloquear_reglas_puntaje_tarea
before insert or update or delete on public.reglas_puntaje
for each row execute function public.bloquear_reglas_puntaje_tarea();

-- Las cantidades mayores al maximo configurado deben seguir recibiendo los
-- 10 puntos; de lo contrario una actividad acumulativa podria quedar atrapada.
update public.reglas_puntaje r
set hasta = null
where upper(coalesce(r.tipo_regla, '')) = 'CANTIDAD'
  and r.puntos = 10
  and not exists (
    select 1
    from public.reglas_puntaje higher
    where higher.tarea_id = r.tarea_id
      and upper(coalesce(higher.tipo_regla, '')) = 'CANTIDAD'
      and higher.puntos > r.puntos
  );

-- Congela el puntaje de los registros historicos que aun no lo tenian.
update public.registros_tareas_jefe_equipo registro
set puntaje = (
  select max(regla.puntos)::integer
  from public.reglas_puntaje regla
  where regla.tarea_id = registro.tarea_id
    and upper(coalesce(regla.tipo_regla, '')) = 'CANTIDAD'
    and registro.cantidad >= regla.desde
    and (regla.hasta is null or registro.cantidad <= regla.hasta)
)
where registro.puntaje is null
  and exists (
    select 1
    from public.reglas_puntaje regla
    where regla.tarea_id = registro.tarea_id
      and upper(coalesce(regla.tipo_regla, '')) = 'CANTIDAD'
      and registro.cantidad >= regla.desde
      and (regla.hasta is null or registro.cantidad <= regla.hasta)
  );

-- Evita que una secuencia antigua bloquee el cierre atomico de una actividad.
select setval(
  pg_get_serial_sequence('public.registros_tareas_jefe_equipo', 'id'),
  coalesce((select max(id) from public.registros_tareas_jefe_equipo), 1),
  exists (select 1 from public.registros_tareas_jefe_equipo)
);

create or replace function public.iniciar_actividad_jefe_equipo(
  p_encargado_id bigint,
  p_trabajador_id bigint,
  p_tarea_id bigint,
  p_fecha_registro date,
  p_hora_inicio timestamptz,
  p_numero_guia text default null,
  p_lote text default null,
  p_marca_id bigint default null,
  p_tienda_id bigint default null,
  p_observacion text default null
)
returns public.actividades_jefe_equipo
language plpgsql
security definer
set search_path = public
as $$
declare
  actividad public.actividades_jefe_equipo%rowtype;
begin
  insert into public.actividades_jefe_equipo (
    encargado_id, trabajador_id, tarea_id, fecha_registro, hora_inicio,
    cantidad, numero_guia, lote, marca_id, tienda_id, observacion, estado
  ) values (
    p_encargado_id, p_trabajador_id, p_tarea_id, p_fecha_registro, p_hora_inicio,
    0, nullif(btrim(p_numero_guia), ''), null,
    null, p_tienda_id, nullif(btrim(p_observacion), ''), 'EN_CURSO'
  ) returning * into actividad;

  insert into public.actividades_jefe_equipo_historial (
    actividad_id, cantidad, registrado_por, tipo
  ) values (actividad.id, 0, p_encargado_id, 'INICIO');

  return actividad;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'El operante ya tiene una actividad en curso.';
end;
$$;

-- Elimina variantes previas para que PostgREST exponga una sola firma inequívoca.
drop function if exists public.actualizar_actividad_jefe_equipo(bigint, bigint, integer);
drop function if exists public.actualizar_actividad_jefe_equipo(bigint, bigint, integer, timestamptz);
-- Esta firma anterior debe desaparecer para evitar RPC sobrecargadas ambiguas en PostgREST.
drop function if exists public.actualizar_actividad_jefe_equipo(bigint, bigint, integer, timestamptz, integer);
drop function if exists public.actualizar_actividad_jefe_equipo(bigint, bigint, integer, timestamptz, integer, bigint, text, boolean);

create or replace function public.actualizar_actividad_jefe_equipo(
  p_actividad_id bigint,
  p_encargado_id bigint,
  p_cantidad integer,
  p_hora_fin timestamptz default null,
  p_marca_id bigint default null,
  p_lote text default null,
  p_actualizar_datos boolean default false
)
returns public.actividades_jefe_equipo
language plpgsql
security definer
set search_path = public
as $$
declare
  actividad public.actividades_jefe_equipo%rowtype;
  registro_id bigint;
  minutos integer;
  puntaje_calculado integer;
  tarea_etiquetado boolean;
  lote_resuelto text;
begin
  select * into actividad
  from public.actividades_jefe_equipo
  where id = p_actividad_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Actividad no encontrada.';
  end if;
  if actividad.encargado_id <> p_encargado_id then
    raise exception using errcode = '42501', message = 'Solo el jefe que inicio la actividad puede actualizarla.';
  end if;
  select lower(btrim(coalesce(to_jsonb(tarea)->>'titulo', to_jsonb(tarea)->>'nombre', ''))) = 'etiquetado'
  into tarea_etiquetado
  from public.tarea tarea
  where tarea.id = actividad.tarea_id;

  if coalesce(tarea_etiquetado, false) then
    lote_resuelto := nullif(upper(btrim(coalesce(p_lote, ''))), '');
  else
    if p_actualizar_datos and (p_marca_id is not null or nullif(btrim(coalesce(p_lote, '')), '') is not null) then
      raise exception using errcode = '23514', message = 'Marca y lote solo estan disponibles para Etiquetado.';
    end if;
    p_marca_id := null;
    lote_resuelto := null;
  end if;
  if actividad.estado = 'FINALIZADA' then
    if p_hora_fin is not null
       and p_cantidad = actividad.cantidad
       and abs(extract(epoch from (p_hora_fin - actividad.hora_fin))) < 1
       and (
         not p_actualizar_datos
         or (
           actividad.marca_id is not distinct from p_marca_id
           and actividad.lote is not distinct from lote_resuelto
         )
       ) then
      return actividad;
    end if;
    raise exception using errcode = '23514', message = 'La actividad ya fue finalizada con datos diferentes.';
  end if;
  if actividad.estado <> 'EN_CURSO' then
    raise exception using errcode = '23514', message = 'La actividad ya fue finalizada.';
  end if;
  if p_cantidad < actividad.cantidad then
    raise exception using errcode = '23514', message = 'La cantidad no puede disminuir.';
  end if;

  if p_actualizar_datos then
    if coalesce(tarea_etiquetado, false) and p_marca_id is not null and not exists (
      select 1
      from public.marcas marca
      where marca.id = p_marca_id
        and coalesce((to_jsonb(marca)->>'activo')::boolean, true)
    ) then
      raise exception using errcode = '23503', message = 'Selecciona una marca valida.';
    end if;
    update public.actividades_jefe_equipo
    set marca_id = p_marca_id,
        lote = lote_resuelto,
        updated_at = now()
    where id = actividad.id
    returning * into actividad;
  end if;

  if p_hora_fin is null then
    if p_cantidad = actividad.cantidad then
      return actividad;
    end if;
    update public.actividades_jefe_equipo
    set cantidad = p_cantidad, updated_at = now()
    where id = actividad.id
    returning * into actividad;

    insert into public.actividades_jefe_equipo_historial (
      actividad_id, cantidad, registrado_por, tipo
    ) values (actividad.id, p_cantidad, p_encargado_id, 'ACTUALIZACION');
    return actividad;
  end if;

  if p_cantidad <= 0 then
    raise exception using errcode = '23514', message = 'La cantidad final debe ser mayor a cero.';
  end if;
  if p_hora_fin <= actividad.hora_inicio then
    raise exception using errcode = '23514', message = 'La hora fin debe ser posterior a la hora inicio.';
  end if;
  if coalesce(tarea_etiquetado, false) and actividad.marca_id is null then
    raise exception using errcode = '23514', message = 'Selecciona una marca antes de finalizar la actividad de Etiquetado.';
  end if;

  perform pg_advisory_xact_lock(actividad.tarea_id);

  select max(regla.puntos)::integer into puntaje_calculado
  from public.reglas_puntaje regla
  where regla.tarea_id = actividad.tarea_id
    and upper(coalesce(regla.tipo_regla, '')) = 'CANTIDAD'
    and p_cantidad >= regla.desde
    and (regla.hasta is null or p_cantidad <= regla.hasta);

  if puntaje_calculado is null or puntaje_calculado <= 0 then
    raise exception using errcode = '23514', message = 'La cantidad final no coincide con una regla de puntaje vigente.';
  end if;

  minutos := greatest(1, round(extract(epoch from (p_hora_fin - actividad.hora_inicio)) / 60.0)::integer);
  insert into public.registros_tareas_jefe_equipo (
    encargado_id, trabajador_id, tarea_id, fecha_registro, cantidad,
    tiempo_minutos, numero_guia, lote, marca_id, tienda_id, observacion, puntaje
  ) values (
    actividad.encargado_id, actividad.trabajador_id, actividad.tarea_id,
    actividad.fecha_registro, p_cantidad, minutos, actividad.numero_guia,
    actividad.lote, actividad.marca_id, actividad.tienda_id, actividad.observacion, puntaje_calculado
  ) returning id into registro_id;

  update public.actividades_jefe_equipo
  set cantidad = p_cantidad,
      hora_fin = p_hora_fin,
      puntaje = puntaje_calculado,
      estado = 'FINALIZADA',
      registro_tarea_id = registro_id,
      updated_at = now()
  where id = actividad.id
  returning * into actividad;

  insert into public.actividades_jefe_equipo_historial (
    actividad_id, cantidad, registrado_por, tipo, puntaje
  ) values (actividad.id, p_cantidad, p_encargado_id, 'FINALIZACION', puntaje_calculado);

  return actividad;
end;
$$;

grant select, insert, update on public.actividades_jefe_equipo to service_role;
grant delete on public.actividades_jefe_equipo to service_role;
grant select, insert on public.actividades_jefe_equipo_historial to service_role;
grant select, insert, update on public.registros_tareas_jefe_equipo to service_role;
grant usage, select on sequence public.actividades_jefe_equipo_id_seq to service_role;
grant usage, select on sequence public.actividades_jefe_equipo_historial_id_seq to service_role;
revoke all on function public.iniciar_actividad_jefe_equipo(bigint, bigint, bigint, date, timestamptz, text, text, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.actualizar_actividad_jefe_equipo(bigint, bigint, integer, timestamptz, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.iniciar_actividad_jefe_equipo(bigint, bigint, bigint, date, timestamptz, text, text, bigint, bigint, text) to service_role;
grant execute on function public.actualizar_actividad_jefe_equipo(bigint, bigint, integer, timestamptz, bigint, text, boolean) to service_role;

commit;

notify pgrst, 'reload schema';
