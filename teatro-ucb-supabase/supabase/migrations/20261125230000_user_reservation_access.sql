begin;

alter table public.reservas enable row level security;

drop policy if exists "Ver mis reservas" on public.reservas;
create policy "Ver mis reservas"
  on public.reservas for select to authenticated
  using (auth.uid() = user_id or public.es_administrador());

grant select on public.reservas to authenticated;

commit;
