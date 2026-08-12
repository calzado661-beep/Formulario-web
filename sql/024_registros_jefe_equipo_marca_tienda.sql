-- Las tareas por tiempo que registra el jefe de equipo (Etiquetado, Visita de
-- tienda, Picking, etc.) deben pedir los mismos datos adicionales que ya pide
-- el operante para esa misma tarea: marca para Etiquetado, tienda para Picking
-- y Visita de tienda. Agrega las columnas necesarias para guardarlos.

alter table public.registros_tareas_jefe_equipo
  add column if not exists marca_id bigint references public.marcas(id) on delete set null,
  add column if not exists tienda_id bigint references public.tiendas(id) on delete set null;

create index if not exists idx_registros_tareas_jefe_equipo_marca
  on public.registros_tareas_jefe_equipo(marca_id);

create index if not exists idx_registros_tareas_jefe_equipo_tienda
  on public.registros_tareas_jefe_equipo(tienda_id);

notify pgrst, 'reload schema';
