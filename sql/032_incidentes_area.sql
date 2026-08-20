-- Las incidencias de tipo "incidencia" se asignan a un area en lugar de un operante.

begin;

alter table public.incidentes
  add column if not exists area text;

alter table public.incidentes
  alter column nombre drop not null,
  alter column usuario_id drop not null;

alter table public.incidentes
  drop constraint if exists incidentes_responsable_valido;

alter table public.incidentes
  add constraint incidentes_responsable_valido check (
    (
      lower(btrim(turno)) = 'incidencia'
      and usuario_id is null
      and nombre is null
      and area in ('Textil', 'Hogar', 'Importaciones', 'Almacén 1', 'Operaciones', 'Sistemas', 'Tiendas', 'Marketing')
    )
    or (
      lower(btrim(turno)) <> 'incidencia'
      and usuario_id is not null
      and nullif(btrim(nombre), '') is not null
      and area is null
    )
  ) not valid;

create index if not exists idx_incidentes_area on public.incidentes(area)
where area is not null;

notify pgrst, 'reload schema';

commit;
