-- Separa las fechas operativas de clasificado y etiquetado de cada lote.
-- fecha_trabajo conserva los datos existentes y pasa a representar el inicio
-- del clasificado; la nueva fecha marca simultaneamente el fin del clasificado
-- y el inicio del etiquetado.
begin;

alter table public.lotes
  add column if not exists fecha_fin_clasificado date;

comment on column public.lotes.fecha_trabajo is
  'Fecha de inicio del proceso de clasificado del lote.';

comment on column public.lotes.fecha_fin_clasificado is
  'Fecha de fin del clasificado e inicio del proceso de etiquetado.';

comment on column public.lotes.fecha_completada is
  'Fecha en la que se completo el proceso de etiquetado del lote.';

alter table public.lotes
  drop constraint if exists lotes_fechas_proceso_check;

alter table public.lotes
  add constraint lotes_fechas_proceso_check check (
    (fecha_fin_clasificado is null or fecha_trabajo is null or fecha_fin_clasificado >= fecha_trabajo)
    and (fecha_completada is null or fecha_fin_clasificado is null or fecha_completada >= fecha_fin_clasificado)
  );

notify pgrst, 'reload schema';

commit;
