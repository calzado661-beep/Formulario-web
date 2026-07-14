-- Login seguro para React con clave publica.
-- El frontend llama esta funcion en vez de leer usuarios/password_hash directamente.

create or replace function public.verify_usuario_login(
  p_email text,
  p_password text
)
returns table (
  id bigint,
  nombre text,
  email text,
  rol text,
  activo boolean,
  created_at timestamptz,
  fecha_cumpleanos date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    u.id,
    u.nombre,
    u.email,
    u.rol,
    u.activo,
    u.created_at,
    u.fecha_cumpleanos
  from public.usuarios u
  where lower(trim(u.email)) = lower(trim(p_email))
    and u.password_hash = p_password
  limit 1;
end;
$$;

revoke all on function public.verify_usuario_login(text, text) from public;
grant execute on function public.verify_usuario_login(text, text) to anon;
grant execute on function public.verify_usuario_login(text, text) to authenticated;
