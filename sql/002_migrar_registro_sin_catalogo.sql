-- Migración para usar solo tabla `tarea` y eliminar dependencia de `actividades_catalogo`.
alter table public.registro_actividades
  add column if not exists actividad_nombre text;

update public.registro_actividades ra
set actividad_nombre = coalesce(ra.actividad_nombre, t.titulo)
from public.tarea t
where t.id = ra.tarea_id;

alter table public.registro_actividades
  drop constraint if exists registro_actividades_actividad_id_fkey;

alter table public.registro_actividades
  drop column if exists actividad_id;

drop table if exists public.actividades_catalogo;
