-- Guarda la eleccion del selector de hangtag que aparece cuando la tarea tiene
-- `requiere_hangtag` en true (hoy solo Etiquetado).
--
-- La tabla del jefe de equipo ya tenia la columna sin usar; la del operante no
-- la tenia. Aqui se emparejan las dos y se limita el valor a las dos opciones
-- del selector, para que no entren textos libres.
--
-- Es seguro ejecutar esta migracion varias veces.

begin;

alter table public.registros_tareas
  add column if not exists tipo_etiquetado text;

alter table public.registros_tareas_jefe_equipo
  add column if not exists tipo_etiquetado text;

alter table public.registros_tareas
  drop constraint if exists registros_tareas_tipo_etiquetado_valido;

alter table public.registros_tareas
  add constraint registros_tareas_tipo_etiquetado_valido check (
    tipo_etiquetado is null or tipo_etiquetado in ('CON_HANGTAG', 'SIN_HANGTAG')
  );

alter table public.registros_tareas_jefe_equipo
  drop constraint if exists registros_jefe_equipo_tipo_etiquetado_valido;

alter table public.registros_tareas_jefe_equipo
  add constraint registros_jefe_equipo_tipo_etiquetado_valido check (
    tipo_etiquetado is null or tipo_etiquetado in ('CON_HANGTAG', 'SIN_HANGTAG')
  );

comment on column public.registros_tareas.tipo_etiquetado is
  'CON_HANGTAG o SIN_HANGTAG. Solo se completa si la tarea tiene requiere_hangtag.';

comment on column public.registros_tareas_jefe_equipo.tipo_etiquetado is
  'CON_HANGTAG o SIN_HANGTAG. Solo se completa si la tarea tiene requiere_hangtag.';

commit;

notify pgrst, 'reload schema';
