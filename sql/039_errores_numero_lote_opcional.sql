-- Añade un lote opcional al registro de errores. La guía también permanece
-- opcional; ambos campos sirven como referencia y pueden quedar vacíos.
alter table public.registro_errores
  add column if not exists numero_lote text;

comment on column public.registro_errores.numero_lote is
  'Número de lote relacionado con el error; dato opcional.';

notify pgrst, 'reload schema';
