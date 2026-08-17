-- Agrega Permiso, Descanso Medico y Suspension como estados de asistencia,
-- ademas de Ausente, Puntual y Tardanza. El estado ahora se elige de forma
-- explicita por trabajador desde el panel de administrador (ya no se marca
-- por checkbox ni se deduce de una hora limite).

begin;

alter table public.asistencias
  drop constraint if exists asistencias_estado_check;

alter table public.asistencias
  add constraint asistencias_estado_check
  check (estado in ('AUSENTE', 'PUNTUAL', 'TARDANZA', 'PERMISO', 'DESCANSO_MEDICO', 'SUSPENSION'));

notify pgrst, 'reload schema';

commit;
