create table if not exists public.asistencias (
  id bigserial primary key,
  usuario_id bigint not null references public.usuarios(id) on delete cascade,
  fecha date not null,
  estado varchar(20) not null default 'Presente',
  created_at timestamp default current_timestamp,
  constraint uq_asistencia unique (usuario_id, fecha)
);
