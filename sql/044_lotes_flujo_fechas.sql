-- Separa el inicio de etiquetado del fin de clasificado y obliga a que las
-- etapas del lote avancen en orden. El cierre pasa a ser manual, una vez que
-- todas las fechas fueron registradas.
begin;

alter table public.lotes
  add column if not exists fecha_inicio_etiquetado date;

-- Los datos anteriores trataban fecha_fin_clasificado como inicio de
-- etiquetado. Se conserva esa equivalencia para el historial existente.
update public.lotes
set fecha_fin_clasificado = coalesce(fecha_fin_clasificado, fecha_completada)
where estado = 'completado'
  and fecha_trabajo is not null
  and fecha_fin_clasificado is null;

update public.lotes
set fecha_inicio_etiquetado = fecha_fin_clasificado
where fecha_inicio_etiquetado is null
  and fecha_fin_clasificado is not null;

update public.lotes
set estado = case when fecha_trabajo is null then 'pendiente' else 'en_curso' end
where estado <> 'completado';

drop trigger if exists trg_lote_completado_por_etiquetado
  on public.registros_tareas_jefe_equipo;
drop function if exists public.sincronizar_lote_completado_por_etiquetado();

alter table public.lotes
  drop constraint if exists lotes_fechas_proceso_check;
alter table public.lotes
  add constraint lotes_fechas_proceso_check check (
    (fecha_fin_clasificado is null or (fecha_trabajo is not null and fecha_fin_clasificado >= fecha_trabajo))
    and (fecha_inicio_etiquetado is null or (fecha_fin_clasificado is not null and fecha_inicio_etiquetado >= fecha_fin_clasificado))
    and (fecha_completada is null or (fecha_inicio_etiquetado is not null and fecha_completada >= fecha_inicio_etiquetado))
  );

alter table public.lotes
  drop constraint if exists lotes_estado_check;
alter table public.lotes
  add constraint lotes_estado_check check (
    (estado = 'pendiente' and fecha_trabajo is null and fecha_fin_clasificado is null and fecha_inicio_etiquetado is null and fecha_completada is null)
    or (estado = 'en_curso' and fecha_trabajo is not null)
    or (estado = 'completado' and fecha_trabajo is not null and fecha_fin_clasificado is not null and fecha_inicio_etiquetado is not null and fecha_completada is not null)
  );

comment on column public.lotes.fecha_fin_clasificado is
  'Fecha en la que termino el proceso de clasificado.';
comment on column public.lotes.fecha_inicio_etiquetado is
  'Fecha en la que comenzo el proceso de etiquetado.';
comment on column public.lotes.fecha_completada is
  'Fecha en la que termino el proceso de etiquetado.';

notify pgrst, 'reload schema';

commit;
