-- Alinea los registros independientes creados por el jefe de equipo.
-- Ejecutar después de 005, 006 y 008.

drop view if exists public.v_registros_jefe_grupo;

update public.registros_jefe_grupo r
set tarea_nombre = coalesce(nullif(btrim(r.tarea_nombre), ''), t.nombre, 'Tarea ' || r.tarea_id::text)
from public.tareas t
where t.id = r.tarea_id
  and (r.tarea_nombre is null or btrim(r.tarea_nombre) = '');

update public.registros_jefe_grupo
set tarea_nombre = 'Tarea ' || tarea_id::text
where tarea_nombre is null or btrim(tarea_nombre) = '';

update public.registros_jefe_grupo
set
  fecha_registro = coalesce(fecha_registro, created_at::date, current_date),
  cantidad = coalesce(cantidad, 0),
  tiempo_minutos = coalesce(tiempo_minutos, 0),
  created_at = coalesce(created_at, now());

alter table public.registros_jefe_grupo
  drop constraint if exists chk_registro_jefe_grupo_valor,
  drop constraint if exists registros_cantidad_valida,
  drop constraint if exists registros_tiempo_valido;

alter table public.registros_jefe_grupo
  alter column tarea_nombre set not null,
  alter column fecha_registro set default current_date,
  alter column fecha_registro set not null,
  alter column cantidad type integer using round(coalesce(cantidad, 0))::integer,
  alter column cantidad set default 0,
  alter column cantidad set not null,
  alter column tiempo_minutos type integer using round(coalesce(tiempo_minutos, 0))::integer,
  alter column tiempo_minutos set default 0,
  alter column tiempo_minutos set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.registros_jefe_grupo
  add constraint registros_cantidad_valida check (cantidad >= 0),
  add constraint registros_tiempo_valido check (tiempo_minutos >= 0);

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
  r.tarea_nombre,
  r.fecha_registro,
  r.cantidad,
  r.tiempo_minutos,
  r.codigo_guia,
  r.lote,
  r.detalle,
  r.created_at
from public.registros_jefe_grupo r
join public.usuarios encargado on encargado.id = r.encargado_id
join public.usuarios trabajador on trabajador.id = r.trabajador_id
left join public.tareas t on t.id = r.tarea_id;

grant select, insert, update, delete on public.registros_jefe_grupo to service_role;
grant select on public.v_registros_jefe_grupo to service_role;

notify pgrst, 'reload schema';
