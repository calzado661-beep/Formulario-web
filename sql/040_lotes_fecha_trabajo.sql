-- Fecha operativa opcional desde la que se calcula la duración del lote.
begin;

alter table public.lotes add column if not exists fecha_trabajo date;

comment on column public.lotes.fecha_trabajo is
  'Fecha en la que empezó el trabajo del lote; puede completarse al editarlo.';

notify pgrst, 'reload schema';
commit;
