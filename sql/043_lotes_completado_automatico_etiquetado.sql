-- Completa automáticamente un lote cuando los pares registrados en la tarea
-- Etiquetado alcanzan su cantidad total. Las correcciones posteriores no
-- revierten el cierre ni modifican su fecha, preservando el historial.
begin;

create or replace function public.sincronizar_lote_completado_por_etiquetado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.lote is null or btrim(new.lote) = '' then
    return new;
  end if;

  if not exists (
    select 1
    from public.tarea as t
    where t.id = new.tarea_id
      and lower(btrim(t.nombre)) = 'etiquetado'
  ) then
    return new;
  end if;

  update public.lotes as l
  set estado = 'completado',
      fecha_completada = coalesce(
        l.fecha_completada,
        (now() at time zone 'America/Lima')::date
      )
  where upper(btrim(l.codigo_lote)) = upper(btrim(new.lote))
    and l.estado <> 'completado'
    and l.cantidad_lote <= (
      select coalesce(sum(r.cantidad), 0)
      from public.registros_tareas_jefe_equipo as r
      join public.tarea as t on t.id = r.tarea_id
      where upper(btrim(r.lote)) = upper(btrim(new.lote))
        and lower(btrim(t.nombre)) = 'etiquetado'
    );

  return new;
end;
$$;

drop trigger if exists trg_lote_completado_por_etiquetado
  on public.registros_tareas_jefe_equipo;

create trigger trg_lote_completado_por_etiquetado
after insert or update of cantidad, lote, tarea_id
on public.registros_tareas_jefe_equipo
for each row
execute function public.sincronizar_lote_completado_por_etiquetado();

notify pgrst, 'reload schema';

commit;
