begin;

alter table public.obras
  add column if not exists director text not null default '',
  add column if not exists video_url text;

alter table public.funciones
  add column if not exists salida timestamp without time zone;

update public.funciones f
set salida = f.inicio + make_interval(mins => o.duracion_minutos)
from public.obras o
where o.id = f.obra_id and f.salida is null;

create table if not exists public.administradores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.administradores enable row level security;

create or replace function public.es_administrador()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.administradores a
    where a.user_id = auth.uid()
  );
$$;

revoke all on function public.es_administrador() from public;
grant execute on function public.es_administrador() to authenticated;

create or replace function public.asignar_administrador_inicial()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if lower(new.email) = 'israelmujia5@gmail.com' then
    insert into public.administradores (user_id, email)
    values (new.id, lower(new.email))
    on conflict (user_id) do update set email = excluded.email;
  end if;
  return new;
end;
$$;

drop trigger if exists teatro_admin_inicial on auth.users;
create trigger teatro_admin_inicial
  after insert or update of email on auth.users
  for each row execute function public.asignar_administrador_inicial();

insert into public.administradores (user_id, email)
select id, lower(email)
from auth.users
where lower(email) = 'israelmujia5@gmail.com'
on conflict (user_id) do update set email = excluded.email;

create or replace function public.agregar_administrador(p_email text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid;
  v_email text := lower(trim(p_email));
begin
  if not public.es_administrador() then
    raise exception 'Se requieren privilegios de administrador.';
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Introduce un correo electrónico válido.';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = v_email
    and u.email_confirmed_at is not null;

  if v_user_id is null then
    raise exception 'No existe una cuenta verificada con ese correo.';
  end if;

  insert into public.administradores (user_id, email)
  values (v_user_id, v_email)
  on conflict (user_id) do update set email = excluded.email;
end;
$$;

revoke all on function public.agregar_administrador(text) from public;
grant execute on function public.agregar_administrador(text) to authenticated;

drop policy if exists "Ver administradores" on public.administradores;
create policy "Ver administradores"
  on public.administradores for select to authenticated
  using (public.es_administrador() or auth.uid() = user_id);

drop policy if exists "Administrar obras" on public.obras;
create policy "Administrar obras"
  on public.obras for all to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

drop policy if exists "Administrar funciones" on public.funciones;
create policy "Administrar funciones"
  on public.funciones for all to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

drop policy if exists "Administrar salas" on public.salas;
create policy "Administrar salas"
  on public.salas for all to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

drop policy if exists "Administradores ven todas las reservas" on public.reservas;
create policy "Administradores ven todas las reservas"
  on public.reservas for select to authenticated
  using (public.es_administrador());

drop policy if exists "Administradores ven talleres" on public.talleres;
create policy "Administradores ven talleres"
  on public.talleres for select to authenticated
  using (public.es_administrador());

drop policy if exists "Inscripción pública a talleres" on public.inscripciones_talleres;
create policy "Inscripción pública a talleres"
  on public.inscripciones_talleres for insert to anon, authenticated
  with check (user_id is null or auth.uid() = user_id);

drop policy if exists "Administradores ven inscripciones de talleres" on public.inscripciones_talleres;
create policy "Administradores ven inscripciones de talleres"
  on public.inscripciones_talleres for select to authenticated
  using (public.es_administrador());

grant select on public.administradores to authenticated;
grant select, insert, update, delete on public.obras, public.funciones, public.salas to authenticated;
grant select on public.reservas, public.talleres, public.inscripciones_talleres to authenticated;
grant insert on public.inscripciones_talleres to anon, authenticated;

drop policy if exists "Crear mis reservas" on public.reservas;
create policy "Crear mis reservas"
  on public.reservas for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.funciones f
      where f.id = funcion_id
        and f.estado = 'programada'
        and f.inicio > (now() at time zone 'America/La_Paz')
    )
  );

create or replace function public.crear_obra_con_funcion(
  p_titulo text,
  p_director text,
  p_sinopsis text,
  p_video_url text,
  p_inicio timestamp without time zone
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sala_id bigint;
  v_obra_id bigint;
begin
  if not public.es_administrador() then
    raise exception 'Se requieren privilegios de administrador.';
  end if;
  if trim(coalesce(p_titulo, '')) = '' or trim(coalesce(p_director, '')) = '' then
    raise exception 'El nombre de la obra y el director son obligatorios.';
  end if;
  if p_inicio <= (now() at time zone 'America/La_Paz') then
    raise exception 'La primera función debe programarse en una fecha y hora futuras.';
  end if;

  select id into v_sala_id
  from public.salas
  where activa
  order by id
  limit 1;
  if v_sala_id is null then
    raise exception 'No hay una sala activa para programar la función.';
  end if;

  insert into public.obras
    (titulo, autor, director, duracion_minutos, sinopsis, video_url, img, activa)
  values
    (trim(p_titulo), trim(p_director), trim(p_director), 90,
     coalesce(nullif(trim(p_sinopsis), ''), 'Una experiencia teatral para disfrutar en comunidad.'),
     nullif(trim(p_video_url), ''), 'assets/keke1.png', true)
  returning id into v_obra_id;

  insert into public.funciones (id, obra_id, sala_id, inicio, salida, estado)
  values (gen_random_uuid()::text, v_obra_id, v_sala_id, p_inicio,
          p_inicio + interval '90 minutes', 'programada');
  return v_obra_id;
end;
$$;

create or replace function public.retirar_obra(p_obra_id bigint)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.es_administrador() then
    raise exception 'Se requieren privilegios de administrador.';
  end if;
  update public.obras set activa = false where id = p_obra_id;
  if not found then
    raise exception 'No se encontró la obra solicitada.';
  end if;
  update public.funciones set estado = 'cancelada' where obra_id = p_obra_id;
end;
$$;

revoke all on function public.crear_obra_con_funcion(text, text, text, text, timestamp without time zone) from public;
revoke all on function public.retirar_obra(bigint) from public;
grant execute on function public.crear_obra_con_funcion(text, text, text, text, timestamp without time zone) to authenticated;
grant execute on function public.retirar_obra(bigint) to authenticated;

commit;
