-- Puntos en contra configurables por el administrador.
-- Cada fila define cuantos puntos resta una ocurrencia (amonestacion,
-- inasistencia o tardanza). Los puntos se guardan como valor positivo y
-- representan la cantidad que se descuenta.

create table if not exists public.penalizaciones (
  id bigserial primary key,
  clave text not null unique,
  etiqueta text not null,
  puntos numeric(6, 2) not null default 0,
  descripcion text,
  updated_at timestamptz not null default now()
);

alter table public.penalizaciones
  drop constraint if exists penalizaciones_puntos_no_negativos;

alter table public.penalizaciones
  add constraint penalizaciones_puntos_no_negativos
  check (puntos >= 0);

insert into public.penalizaciones (clave, etiqueta, puntos, descripcion)
values
  ('amonestacion', 'Amonestacion', 0, 'Puntos que resta cada amonestacion registrada.'),
  ('inasistencia', 'Inasistencia', 0, 'Puntos que resta cada dia marcado como AUSENTE.'),
  ('tardanza', 'Tardanza', 0, 'Puntos que resta cada dia marcado como TARDANZA.')
on conflict (clave) do nothing;

-- El panel de administracion lee y guarda esta tabla directamente desde el
-- navegador con la clave publicable, igual que public.amonestaciones.
grant select, insert, update on public.penalizaciones to anon, authenticated, service_role;
grant usage, select on sequence public.penalizaciones_id_seq to anon, authenticated, service_role;

-- Sin estas politicas RLS la clave publicable no puede leer ni guardar. Son
-- permisivas porque la app no usa Supabase Auth: valida el login con la RPC
-- verify_usuario_login y accede con la clave publicable.
alter table public.penalizaciones enable row level security;

drop policy if exists penalizaciones_select on public.penalizaciones;
create policy penalizaciones_select on public.penalizaciones
  for select to anon, authenticated using (true);

drop policy if exists penalizaciones_insert on public.penalizaciones;
create policy penalizaciones_insert on public.penalizaciones
  for insert to anon, authenticated with check (true);

drop policy if exists penalizaciones_update on public.penalizaciones;
create policy penalizaciones_update on public.penalizaciones
  for update to anon, authenticated using (true) with check (true);

notify pgrst, 'reload schema';
