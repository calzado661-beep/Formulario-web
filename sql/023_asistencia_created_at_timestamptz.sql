-- Corrige el tipo de columna asistencias.created_at: estaba definida como
-- "timestamp" sin zona horaria, asi que Postgres descartaba el sufijo UTC
-- que envia el backend (new Date().toISOString()) y guardaba los digitos de
-- la hora tal cual, sin convertir. Al leerla de vuelta, el navegador la
-- interpretaba como hora local y "Marcado en" mostraba una hora incorrecta.
-- Los valores existentes se reinterpretan como UTC (asi se generaron) para
-- conservar la hora real de marcado.

alter table public.asistencias
  alter column created_at type timestamptz using created_at at time zone 'UTC';

alter table public.asistencias
  alter column created_at set default now();

notify pgrst, 'reload schema';
