-- Catalogo de estados de asistencia con su sigla, para no repetir la lista
-- de valores validos en un CHECK y para poder mostrar la sigla de cada
-- registro en la tabla de asistencias.

begin;

create table if not exists public.dato_asistencia (
  estado varchar(20) primary key,
  nombre text not null,
  sigla varchar(5) not null
);

insert into public.dato_asistencia (estado, nombre, sigla) values
  ('FALTA', 'Falta', 'F'),
  ('ASISTENCIA', 'Asistencia', 'A'),
  ('TARDANZA', 'Tardanza', 'AT'),
  ('MEDIO_TURNO', 'Medio Turno', 'MT'),
  ('APOYO', 'Apoyo', 'TDA'),
  ('PERMISO', 'Permiso', 'P'),
  ('DESCANSO_MEDICO', 'Descanso Medico', 'DM'),
  ('SUSPENSION', 'Suspension', 'S')
on conflict (estado) do update set nombre = excluded.nombre, sigla = excluded.sigla;

-- La tabla de asistencias ahora referencia este catalogo en vez de una lista
-- de valores fija (CHECK): asi el estado de cada registro siempre existe en
-- dato_asistencia y de ahi se puede sacar la sigla correspondiente.
alter table public.asistencias
  drop constraint if exists asistencias_estado_check;

alter table public.asistencias
  add constraint asistencias_estado_fkey
  foreign key (estado) references public.dato_asistencia(estado);

notify pgrst, 'reload schema';

commit;
