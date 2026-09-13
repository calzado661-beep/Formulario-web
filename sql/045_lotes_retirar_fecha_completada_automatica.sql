-- El cierre del lote ahora requiere que el administrador registre todas las
-- fechas y seleccione Completado. Retira la automatizacion historica que
-- asignaba o borraba fecha_completada al cambiar el estado.
begin;

drop trigger if exists trg_lotes_fecha_completada on public.lotes;
drop function if exists public.fn_lotes_fecha_completada();

notify pgrst, 'reload schema';

commit;
