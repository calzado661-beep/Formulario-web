-- Permite fijar la duracion y el encargado de una capacitacion por
-- trabajador (antes eran un unico valor global en la tabla capacitaciones).
-- Si un trabajador no tiene su propio valor, la app usa el de la
-- capacitacion como base.

begin;

alter table public.usuario_capacitaciones
  add column if not exists nro_horas text,
  add column if not exists encargado text;

notify pgrst, 'reload schema';

commit;
