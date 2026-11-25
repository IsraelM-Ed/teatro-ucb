begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'obras-portadas',
  'obras-portadas',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Lectura publica de portadas" on storage.objects;
create policy "Lectura publica de portadas"
  on storage.objects for select to public
  using (bucket_id = 'obras-portadas');

drop policy if exists "Administradores suben portadas" on storage.objects;
create policy "Administradores suben portadas"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'obras-portadas'
    and public.es_administrador()
  );

drop policy if exists "Administradores eliminan portadas" on storage.objects;
create policy "Administradores eliminan portadas"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'obras-portadas'
    and public.es_administrador()
  );

drop function if exists public.crear_obra_con_funcion(
  text,
  text,
  text,
  text,
  timestamp without time zone
);

create function public.crear_obra_con_funcion(
  p_titulo text,
  p_director text,
  p_sinopsis text,
  p_video_url text,
  p_img_path text,
  p_inicio timestamp without time zone
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, storage
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
  if trim(coalesce(p_img_path, '')) = '' or not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'obras-portadas'
      and o.name = p_img_path
  ) then
    raise exception 'Debes adjuntar una imagen válida antes de crear la obra.';
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
     nullif(trim(p_video_url), ''), 'obras-portadas/' || p_img_path, true)
  returning id into v_obra_id;

  insert into public.funciones (id, obra_id, sala_id, inicio, salida, estado)
  values (gen_random_uuid()::text, v_obra_id, v_sala_id, p_inicio,
          p_inicio + interval '90 minutes', 'programada');
  return v_obra_id;
end;
$$;

revoke all on function public.crear_obra_con_funcion(
  text,
  text,
  text,
  text,
  text,
  timestamp without time zone
) from public;
grant execute on function public.crear_obra_con_funcion(
  text,
  text,
  text,
  text,
  text,
  timestamp without time zone
) to authenticated;

commit;
