-- Agrega el rol Otros y actualiza las cuentas indicadas por administracion.

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.usuarios'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%rol%'
  loop
    execute format('alter table public.usuarios drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

alter table public.usuarios
  add constraint usuarios_rol_check
  check (rol in ('administrador', 'operante', 'jefe de equipo', 'jefe de grupo', 'otros'));

update public.usuarios
set nombre = case id
  when 63 then 'Danny Adamo'
  when 64 then 'Marlon Vera'
  when 78 then 'Valeria Montero'
  when 65 then 'Estefani Ortega'
  when 66 then 'Daniel Collantes'
  when 122 then 'Milton Paz'
  when 125 then 'Dana Elias'
end,
rol = 'otros'
where id in (63, 64, 65, 66, 78, 122, 125)
  and email in (
    'danny.adamo',
    'marlon.vera',
    'valeria.montero',
    'estefani.ortega',
    'daniel.collantes',
    'milton.paz',
    'dana.elias'
  );
