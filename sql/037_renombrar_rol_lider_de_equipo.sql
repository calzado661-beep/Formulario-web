-- El rol "jefe de equipo" pasa a llamarse "lider de equipo" en toda la app
-- (codigo, dropdowns y comparaciones). Esta migracion actualiza la constraint
-- de "usuarios.rol" y los usuarios existentes para que su rol guardado siga
-- coincidiendo con el codigo.
alter table public.usuarios drop constraint usuarios_rol_check;

update public.usuarios
set rol = 'lider de equipo'
where rol = 'jefe de equipo';

alter table public.usuarios add constraint usuarios_rol_check
  check (rol in ('administrador', 'operante', 'lider de equipo', 'jefe de grupo', 'otros'));
