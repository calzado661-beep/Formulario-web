-- Reemplaza "Salida mediodia" y "Asistio mediodia" por un unico estado
-- "Medio turno". Tambien amplia el retiro anticipado valido a los estados
-- que cuentan como presente (Asistencia, Tardanza, Medio turno, Apoyo), para
-- que coincida con como los agrupa la app en el dashboard de asistencia.

begin;

update public.asistencias
  set estado = 'MEDIO_TURNO'
  where estado in ('SALIDA_MEDIODIA', 'ASISTIO_MEDIODIA', 'ASISTIO_MEDIO_DIA');

alter table public.asistencias
  drop constraint if exists asistencias_estado_check;

alter table public.asistencias
  add constraint asistencias_estado_check
  check (estado in (
    'ASISTENCIA', 'FALTA', 'TARDANZA', 'MEDIO_TURNO', 'APOYO',
    'PERMISO', 'DESCANSO_MEDICO', 'SUSPENSION'
  ));

alter table public.asistencias
  drop constraint if exists asistencias_retiro_valido;

alter table public.asistencias
  add constraint asistencias_retiro_valido check (
    (not retiro_anticipado and motivo_retiro is null and retirado_en is null)
    or (
      estado in ('ASISTENCIA', 'TARDANZA', 'MEDIO_TURNO', 'APOYO')
      and nullif(btrim(motivo_retiro), '') is not null
      and char_length(motivo_retiro) <= 500
      and retirado_en is not null
      and (created_at is null or retirado_en >= created_at)
    )
  );

notify pgrst, 'reload schema';

commit;
