-- RECETARIO — Baja de categorias, version para nombres NUEVOS (despues de 06).
-- Ejecutar SOLO si todavia NO ejecutaste el script 05 anterior.
-- Si YA ejecutaste el 05 original, el script 06 actualiza su funcion automaticamente.
-- Para usuarios autenticados con rol admin; via POST /rest/v1/rpc/eliminar_categoria.

begin;

create schema if not exists recetario_private;
revoke all on schema recetario_private from public, anon;
grant usage on schema recetario_private to authenticated;

create or replace function recetario_private.eliminar_categoria_internal(p_categoria_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_nombre text;
    v_general_id bigint;
    v_versiones_afectadas bigint[];
begin
    if not exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.rol = 'admin'
    ) then
        raise exception 'Solo un administrador puede eliminar categorias'
            using errcode = '42501';
    end if;

    select c.nombre into v_nombre
    from public.categorias c
    where c.id = p_categoria_id and c.activa = true
    for update;

    if not found then
        raise exception 'La categoria no existe o ya fue eliminada'
            using errcode = 'P0002';
    end if;

    if lower(btrim(v_nombre)) = 'general' then
        raise exception 'La categoria General no puede eliminarse'
            using errcode = '23514';
    end if;

    select c.id into v_general_id
    from public.categorias c
    where lower(btrim(c.nombre)) = 'general' and c.activa = true
    for update;

    if not found then
        raise exception 'No existe una categoria General activa'
            using errcode = 'P0002';
    end if;

    select array_agg(distinct rc.version_id) into v_versiones_afectadas
    from public.receta_categorias rc
    where rc.categoria_id = p_categoria_id;

    update public.categorias
    set activa = false
    where id = p_categoria_id;

    delete from public.receta_categorias
    where categoria_id = p_categoria_id;

    insert into public.receta_categorias (version_id, categoria_id)
    select distinct a.version_id, v_general_id
    from unnest(coalesce(v_versiones_afectadas, array[]::bigint[])) as a(version_id)
    where not exists (
        select 1 from public.receta_categorias rc
        where rc.version_id = a.version_id
    )
    on conflict do nothing;
end;
$$;

revoke all on function recetario_private.eliminar_categoria_internal(bigint)
    from public, anon, authenticated;
grant execute on function recetario_private.eliminar_categoria_internal(bigint)
    to authenticated;

create or replace function public.eliminar_categoria(p_categoria_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
    select recetario_private.eliminar_categoria_internal(p_categoria_id);
$$;

revoke all on function public.eliminar_categoria(bigint)
    from public, anon, authenticated;
grant execute on function public.eliminar_categoria(bigint)
    to authenticated;

notify pgrst, 'reload schema';
commit;
