begin;

alter table public.reservas
  add column if not exists pago_metodo text,
  add column if not exists pago_referencia uuid,
  add column if not exists pago_confirmado_en timestamptz;

create table if not exists public.bloqueos_butacas (
  funcion_id text not null references public.funciones(id) on delete cascade,
  butaca text not null check (butaca ~ '^[A-F](10|[1-9])$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expira_en timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (funcion_id, butaca)
);

create index if not exists bloqueos_butacas_usuario_idx
  on public.bloqueos_butacas (user_id, funcion_id, expira_en);

alter table public.bloqueos_butacas enable row level security;
revoke all on public.bloqueos_butacas from anon, authenticated;

create or replace function public.sincronizar_bloqueo_disponibilidad()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.disponibilidad_butacas (funcion_id, butaca)
    values (new.funcion_id, new.butaca)
    on conflict (funcion_id, butaca) do nothing;
    return new;
  end if;

  delete from public.disponibilidad_butacas d
  where d.funcion_id = old.funcion_id
    and d.butaca = old.butaca
    and not exists (
      select 1
      from public.reservas r
      where r.funcion_id = old.funcion_id
        and r.butaca = old.butaca
        and r.estado = 'confirmada'
    );
  return old;
end;
$$;

drop trigger if exists bloqueos_sincronizar_disponibilidad on public.bloqueos_butacas;
create trigger bloqueos_sincronizar_disponibilidad
  after insert or delete on public.bloqueos_butacas
  for each row execute function public.sincronizar_bloqueo_disponibilidad();

revoke all on function public.sincronizar_bloqueo_disponibilidad() from public, anon, authenticated;

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
    and r.estado = 'confirmada'
  union
  select b.butaca
  from public.bloqueos_butacas b
  where b.funcion_id = p_funcion_id
    and b.expira_en > now()
    and (auth.uid() is null or b.user_id <> auth.uid());
$$;

revoke all on function public.butacas_ocupadas(text) from public;
grant execute on function public.butacas_ocupadas(text) to anon, authenticated;

create or replace function public.mis_bloqueos_butacas(p_funcion_id text)
returns table (butaca text, expira_en timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select b.butaca, b.expira_en
  from public.bloqueos_butacas b
  where b.funcion_id = p_funcion_id
    and b.user_id = auth.uid()
    and b.expira_en > now();
$$;

revoke all on function public.mis_bloqueos_butacas(text) from public;
grant execute on function public.mis_bloqueos_butacas(text) to authenticated;

create or replace function public.actualizar_bloqueo_butacas(
  p_funcion_id text,
  p_butacas text[]
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_butacas text[] := coalesce(p_butacas, array[]::text[]);
  v_cantidad integer;
  v_bloqueadas integer;
  v_expira_en timestamptz;
begin
  if v_user_id is null then
    raise exception 'Inicia sesión para bloquear tus butacas.';
  end if;
  if p_funcion_id is null or trim(p_funcion_id) = '' then
    raise exception 'Selecciona una función válida.';
  end if;

  v_cantidad := cardinality(v_butacas);
  if v_cantidad = 0 then
    delete from public.bloqueos_butacas
    where funcion_id = p_funcion_id and user_id = v_user_id;
    return null;
  end if;
  if v_cantidad > 60
     or v_cantidad <> (select count(distinct b) from unnest(v_butacas) as seats(b))
     or exists (
       select 1 from unnest(v_butacas) as seats(b)
       where b is null or b !~ '^[A-F](10|[1-9])$'
     ) then
    raise exception 'La selección de butacas no es válida.';
  end if;
  if not exists (
    select 1 from public.funciones f
    where f.id = p_funcion_id
      and f.estado = 'programada'
      and f.inicio > (now() at time zone 'America/La_Paz')
  ) then
    raise exception 'Esta función ya no está disponible para reservar.';
  end if;
  if exists (
    select 1
    from unnest(v_butacas) as requested(butaca)
    where not exists (
      select 1
      from public.funciones f
      join public.butacas b on b.sala_id = f.sala_id
      where f.id = p_funcion_id
        and b.activa
        and b.fila = left(requested.butaca, 1)
        and b.numero = substring(requested.butaca from 2)::smallint
    )
  ) then
    raise exception 'Una o más butacas no pertenecen a la sala de esta función.';
  end if;
  if exists (
    select 1
    from public.reservas r
    where r.funcion_id = p_funcion_id
      and r.estado = 'confirmada'
      and r.butaca = any(v_butacas)
  ) then
    raise exception 'Una o más butacas ya fueron reservadas.';
  end if;

  delete from public.bloqueos_butacas
  where funcion_id = p_funcion_id
    and expira_en <= clock_timestamp();

  delete from public.bloqueos_butacas
  where funcion_id = p_funcion_id
    and user_id = v_user_id
    and not (butaca = any(v_butacas));

  v_expira_en := clock_timestamp() + interval '5 minutes';
  insert into public.bloqueos_butacas as existing
    (funcion_id, butaca, user_id, expira_en)
  select p_funcion_id, seats.butaca, v_user_id, v_expira_en
  from unnest(v_butacas) as seats(butaca)
  on conflict (funcion_id, butaca) do update
    set user_id = excluded.user_id,
        expira_en = excluded.expira_en
    where existing.expira_en <= clock_timestamp()
       or existing.user_id = v_user_id;

  get diagnostics v_bloqueadas = row_count;
  if v_bloqueadas <> v_cantidad then
    raise exception 'Una butaca fue bloqueada por otra persona. Selecciona otra.';
  end if;

  return v_expira_en;
end;
$$;

revoke all on function public.actualizar_bloqueo_butacas(text, text[]) from public;
grant execute on function public.actualizar_bloqueo_butacas(text, text[]) to authenticated;

create or replace function public.confirmar_pago_qr_simulado(
  p_funcion_id text,
  p_butacas text[],
  p_referencia uuid
)
returns table (
  reserva_id bigint,
  funcion_id text,
  butaca text,
  ticket_token uuid,
  pago_referencia uuid,
  pago_confirmado_en timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_butacas text[] := coalesce(p_butacas, array[]::text[]);
  v_cantidad integer;
  v_bloqueadas integer;
  v_pagado_en timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Inicia sesión para confirmar el pago.';
  end if;
  if p_referencia is null then
    raise exception 'No se recibió la referencia del pago simulado.';
  end if;

  v_cantidad := cardinality(v_butacas);
  if p_funcion_id is null
     or trim(p_funcion_id) = ''
     or v_cantidad = 0
     or v_cantidad > 60
     or v_cantidad <> (select count(distinct b) from unnest(v_butacas) as seats(b))
     or exists (
       select 1 from unnest(v_butacas) as seats(b)
       where b is null or b !~ '^[A-F](10|[1-9])$'
     ) then
    raise exception 'La selección de butacas no es válida.';
  end if;
  if not exists (
    select 1 from public.funciones f
    where f.id = p_funcion_id
      and f.estado = 'programada'
      and f.inicio > (now() at time zone 'America/La_Paz')
  ) then
    raise exception 'Esta función ya no está disponible para reservar.';
  end if;

  perform 1
  from public.bloqueos_butacas b
  where b.funcion_id = p_funcion_id
    and b.user_id = v_user_id
    and b.butaca = any(v_butacas)
  for update;

  select count(*) into v_bloqueadas
  from public.bloqueos_butacas b
  where b.funcion_id = p_funcion_id
    and b.user_id = v_user_id
    and b.butaca = any(v_butacas)
    and b.expira_en > clock_timestamp();

  if v_bloqueadas <> v_cantidad then
    raise exception 'El bloqueo de una o más butacas venció. Selecciónalas nuevamente.';
  end if;
  if exists (
    select 1 from public.reservas r
    where r.funcion_id = p_funcion_id
      and r.estado = 'confirmada'
      and r.butaca = any(v_butacas)
  ) then
    raise exception 'Una o más butacas ya fueron reservadas.';
  end if;

  return query
  insert into public.reservas as inserted (
    user_id,
    funcion_id,
    butaca,
    estado,
    pago_metodo,
    pago_referencia,
    pago_confirmado_en
  )
  select
    v_user_id,
    p_funcion_id,
    seats.butaca,
    'confirmada',
    'qr_simple_simulado',
    p_referencia,
    v_pagado_en
  from unnest(v_butacas) as seats(butaca)
  order by seats.butaca
  returning
    inserted.id,
    inserted.funcion_id,
    inserted.butaca,
    inserted.ticket_token,
    inserted.pago_referencia,
    inserted.pago_confirmado_en;

  delete from public.bloqueos_butacas
  where funcion_id = p_funcion_id and user_id = v_user_id;
end;
$$;

revoke all on function public.confirmar_pago_qr_simulado(text, text[], uuid) from public;
grant execute on function public.confirmar_pago_qr_simulado(text, text[], uuid) to authenticated;

drop policy if exists "Crear mis reservas" on public.reservas;
revoke insert on public.reservas from anon, authenticated;

commit;
