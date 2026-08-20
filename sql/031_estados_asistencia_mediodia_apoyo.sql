-- Agrega los estados operativos de media jornada y apoyo.

begin;

alter table public.asistencias
  drop constraint if exists asistencias_estado_check;

alter table public.asistencias
  add constraint asistencias_estado_check
  check (estado in (
    'AUSENTE', 'PUNTUAL', 'TARDANZA', 'ASISTIO_MEDIO_DIA',
    'SALIDA_MEDIODIA', 'APOYO', 'PERMISO', 'DESCANSO_MEDICO', 'SUSPENSION'
  ));

alter table public.asistencias
  drop constraint if exists asistencias_retiro_valido;

alter table public.asistencias
  add constraint asistencias_retiro_valido check (
    (not retiro_anticipado and motivo_retiro is null and retirado_en is null)
    or (
      estado in ('PUNTUAL', 'TARDANZA', 'ASISTIO_MEDIO_DIA', 'SALIDA_MEDIODIA', 'APOYO')
      and nullif(btrim(motivo_retiro), '') is not null
      and char_length(motivo_retiro) <= 500
      and retirado_en is not null
      and (created_at is null or retirado_en >= created_at)
    )
  );

notify pgrst, 'reload schema';

commit;
