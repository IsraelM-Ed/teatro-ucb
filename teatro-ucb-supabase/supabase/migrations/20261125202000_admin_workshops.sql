begin;

alter table public.talleres
  add column if not exists instructor text not null default '',
  add column if not exists video_url text;

drop policy if exists "Administradores gestionan talleres" on public.talleres;
create policy "Administradores gestionan talleres"
  on public.talleres for all to authenticated
  using (public.es_administrador())
  with check (public.es_administrador());

grant select, insert, update, delete on public.talleres to authenticated;
grant usage, select on sequence public.talleres_id_seq to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talleres-portadas',
  'talleres-portadas',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Lectura publica de portadas de talleres" on storage.objects;
create policy "Lectura publica de portadas de talleres"
  on storage.objects for select to public
  using (bucket_id = 'talleres-portadas');

drop policy if exists "Administradores suben portadas de talleres" on storage.objects;
create policy "Administradores suben portadas de talleres"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'talleres-portadas'
    and public.es_administrador()
  );

drop policy if exists "Administradores eliminan portadas de talleres" on storage.objects;
create policy "Administradores eliminan portadas de talleres"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'talleres-portadas'
    and public.es_administrador()
  );

commit;
