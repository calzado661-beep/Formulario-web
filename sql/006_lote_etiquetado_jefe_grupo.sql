-- Campo lote para registros de jefe de grupo.
-- Se usa solo para tareas de Etiquetado / Codificado.

alter table public.registros_jefe_grupo
  add column if not exists lote text;

create index if not exists idx_registros_jefe_grupo_lote
  on public.registros_jefe_grupo(lote)
  where lote is not null;

update public.tareas
set
  requiere_dato_extra = true,
  nombre_dato_extra = 'lote'
where lower(nombre) like '%etiquetado%'
   or lower(nombre) like '%codificado%'
   or lower(nombre) like '%codificacion%'
   or lower(nombre) like '%codificación%';

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
  r.lote,
  r.detalle,
  r.created_at
from public.registros_jefe_grupo r
join public.usuarios encargado on encargado.id = r.encargado_id
join public.usuarios trabajador on trabajador.id = r.trabajador_id
left join public.tareas t on t.id = r.tarea_id;

update public.registros_jefe_grupo r
set lote = 'A' || lpad(((r.id % 20) + 1)::text, 2, '0')
from public.tareas t
where t.id = r.tarea_id
  and r.lote is null
  and (
    lower(t.nombre) like '%etiquetado%'
    or lower(t.nombre) like '%codificado%'
    or lower(t.nombre) like '%codificacion%'
    or lower(t.nombre) like '%codificación%'
  );
