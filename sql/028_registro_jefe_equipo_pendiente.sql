-- Permite que el jefe de equipo registre solo el inicio de la tarea y complete
-- despues la cantidad, la fecha y la hora de fin desde el historial editable.
--
-- Antes la fila exigia las dos horas juntas o ninguna, asi que no habia forma
-- de guardar una tarea empezada sin inventarle un cierre. Ahora hora_fin puede
-- quedar vacia mientras el registro sigue pendiente; cuando se completa, se
-- mantiene la exigencia de que sea posterior al inicio.
--
-- Es seguro ejecutar esta migracion varias veces.

begin;

alter table public.registros_tareas_jefe_equipo
  drop constraint if exists registros_tareas_jefe_equipo_horas_validas;

alter table public.registros_tareas_jefe_equipo
  add constraint registros_tareas_jefe_equipo_horas_validas check (
    hora_fin is null
    or (hora_inicio is not null and hora_fin > hora_inicio)
  );

-- La exclusion por solapamiento ya ignora las filas sin cierre
-- (`where hora_inicio is not null and hora_fin is not null`), de modo que dos
-- tareas pendientes del mismo operante no se bloquean entre si.

comment on column public.registros_tareas_jefe_equipo.hora_fin is
  'Hora real de fin. Queda vacia mientras el registro esta pendiente de cierre.';

comment on column public.registros_tareas_jefe_equipo.cantidad is
  'Cantidad terminada. Vale 0 mientras el registro esta pendiente de cierre.';

comment on column public.registros_tareas_jefe_equipo.puntaje is
  'Puntaje calculado al cerrar el registro. Queda nulo mientras esta pendiente.';

commit;

notify pgrst, 'reload schema';
