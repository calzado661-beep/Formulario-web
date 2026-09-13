-- Incorpora el estado operativo de etiquetado en curso. Solo es válido una
-- vez registrada la fecha de fin de clasificado / inicio de etiquetado.
begin;

alter table public.lotes
  drop constraint if exists lotes_estado_check;

alter table public.lotes
  add constraint lotes_estado_check check (
    estado in ('pendiente', 'en_curso', 'completado')
    and (estado <> 'en_curso' or fecha_fin_clasificado is not null)
  );

notify pgrst, 'reload schema';

commit;
