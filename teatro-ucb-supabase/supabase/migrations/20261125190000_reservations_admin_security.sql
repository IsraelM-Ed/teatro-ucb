begin;

alter table public.reservas
  add column if not exists estado text not null default 'confirmada',
  add column if not exists cancelada_en timestamptz,
  add column if not exists ticket_token uuid not null default gen_random_uuid();

alter table public.reservas
  alter column user_id drop not null,
  drop constraint if exists reservas_user_id_fkey;

alter table public.reservas
  add constraint reservas_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.reservas
  drop constraint if exists reservas_estado_check;

alter table public.reservas
  add constraint reservas_estado_check
  check (estado in ('confirmada', 'cancelada'));

alter table public.reservas
  drop constraint if exists reservas_funcion_id_butaca_key;

create unique index if not exists reservas_butaca_confirmada_unica_idx
  on public.reservas (funcion_id, butaca)
  where estado = 'confirmada';

create unique index if not exists reservas_ticket_token_unico_idx
  on public.reservas (ticket_token);

create index if not exists reservas_funcion_estado_idx
  on public.reservas (funcion_id, estado);

create table if not exists public.disponibilidad_butacas (
  funcion_id text not null references public.funciones(id) on delete restrict,
  butaca text not null,
  primary key (funcion_id, butaca)
);

alter table public.disponibilidad_butacas enable row level security;

drop policy if exists "Disponibilidad pública de butacas" on public.disponibilidad_butacas;
create policy "Disponibilidad pública de butacas"
  on public.disponibilidad_butacas for select to anon, authenticated
  using (true);

grant select on public.disponibilidad_butacas to anon, authenticated;
revoke insert, update, delete on public.disponibilidad_butacas from anon, authenticated;

insert into public.disponibilidad_butacas (funcion_id, butaca)
select r.funcion_id, r.butaca
from public.reservas r
where r.estado = 'confirmada'
on conflict (funcion_id, butaca) do nothing;

create or replace function public.sincronizar_disponibilidad_butacas()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.disponibilidad_butacas
    where funcion_id = old.funcion_id and butaca = old.butaca;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.estado = 'confirmada' then
      delete from public.disponibilidad_butacas
      where funcion_id = old.funcion_id and butaca = old.butaca;
    end if;
  end if;

  if new.estado = 'confirmada' then
    insert into public.disponibilidad_butacas (funcion_id, butaca)
    values (new.funcion_id, new.butaca)
    on conflict (funcion_id, butaca) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists reservas_sincronizar_disponibilidad on public.reservas;
create trigger reservas_sincronizar_disponibilidad
  after insert or update of estado, funcion_id, butaca or delete on public.reservas
  for each row execute function public.sincronizar_disponibilidad_butacas();

revoke all on function public.sincronizar_disponibilidad_butacas() from public, anon, authenticated;

create or replace function public.butacas_ocupadas(p_funcion_id text)
returns table (butaca text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select r.butaca
  from public.reservas r
  where r.funcion_id = p_funcion_id
    and r.estado = 'confirmada';
$$;

revoke all on function public.butacas_ocupadas(text) from public;
grant execute on function public.butacas_ocupadas(text) to anon, authenticated;

drop policy if exists "Ver reservas" on public.reservas;
drop policy if exists "Ver mis reservas" on public.reservas;
create policy "Ver mis reservas"
  on public.reservas for select to authenticated
  using (auth.uid() = user_id or public.es_administrador());

drop policy if exists "Crear mis reservas" on public.reservas;
create policy "Crear mis reservas"
  on public.reservas for insert to authenticated
  with check (
    auth.uid() = user_id
    and estado = 'confirmada'
    and exists (
      select 1
      from public.funciones f
      where f.id = funcion_id
        and f.estado = 'programada'
        and f.inicio > (now() at time zone 'America/La_Paz')
    )
  );

drop policy if exists "Cancelar mis reservas" on public.reservas;
revoke delete on public.reservas from authenticated;

create or replace function public.cancelar_mis_reservas(p_reserva_id bigint)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reserva public.reservas%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para cancelar una reserva.';
  end if;

  select r.* into v_reserva
  from public.reservas r
  where r.id = p_reserva_id
    and r.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'No se encontró una reserva perteneciente a tu cuenta.';
  end if;
  if v_reserva.estado <> 'confirmada' then
    raise exception 'La reserva ya fue cancelada.';
  end if;
  if not exists (
    select 1
    from public.funciones f
    where f.id = v_reserva.funcion_id
      and f.estado = 'programada'
      and coalesce(f.salida, f.inicio) > (now() at time zone 'America/La_Paz')
  ) then
    raise exception 'Solo puedes cancelar reservas de funciones futuras.';
  end if;

  update public.reservas
  set estado = 'cancelada', cancelada_en = now()
  where id = p_reserva_id;
end;
$$;

revoke all on function public.cancelar_mis_reservas(bigint) from public;
grant execute on function public.cancelar_mis_reservas(bigint) to authenticated;

create or replace function public.quitar_administrador(p_email text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_target_id uuid;
  v_email text := lower(trim(p_email));
begin
  if not public.es_administrador()
     or lower(coalesce(auth.jwt() ->> 'email', '')) <> 'israelmujia5@gmail.com' then
    raise exception 'Solo el administrador principal puede quitar privilegios.';
  end if;
  if v_email = 'israelmujia5@gmail.com' then
    raise exception 'No se pueden quitar los privilegios del administrador principal.';
  end if;

  select u.id into v_target_id
  from auth.users u
  where lower(u.email) = v_email;

  if v_target_id is null then
    raise exception 'No se encontró una cuenta con ese correo.';
  end if;

  delete from public.administradores
  where user_id = v_target_id;

  if not found then
    raise exception 'La cuenta indicada no tiene privilegios administrativos.';
  end if;
end;
$$;

revoke all on function public.quitar_administrador(text) from public;
grant execute on function public.quitar_administrador(text) to authenticated;

update public.obras
set video_url = null
where video_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'disponibilidad_butacas'
     ) then
    alter publication supabase_realtime add table public.disponibilidad_butacas;
  end if;
end;
$$;

commit;
