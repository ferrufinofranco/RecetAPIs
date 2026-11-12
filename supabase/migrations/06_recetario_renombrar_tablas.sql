-- RECETARIO — Migracion 06: nombres de tablas asociadas a las versiones
-- Basado en el esquema original usado en esta conversacion.
-- Ejecutar UNA SOLA VEZ en Supabase > SQL Editor, despues de realizar un respaldo.
-- No borra registros, no cambia version_id, ni recrea tablas ni sus permisos/RLS.
-- Si se instalo antes la RPC de baja de categorias (script 05), se actualiza aqui.
-- IMPORTANTE: el script original 05 NO debe volver a ejecutarse despues de esta
-- migracion; usar 05_recetario_categorias_baja_actualizado.sql.

begin;

-- Validacion: abortar la transaccion si los nombres no coinciden con el esquema original.
do $validar$
declare
    par record;
begin
    for par in
        select * from (values
            ('version_ingredientes', 'receta_ingredientes'),
            ('version_categorias', 'receta_categorias'),
            ('version_pasos', 'receta_pasos')
        ) as t(viejo, nuevo)
    loop
        if to_regclass(format('public.%I', par.viejo)) is null then
            raise exception 'No existe la tabla esperada: public.%', par.viejo;
        end if;
        if to_regclass(format('public.%I', par.nuevo)) is not null then
            raise exception 'Ya existe la tabla destino: public.%', par.nuevo;
        end if;
    end loop;
end
$validar$;

alter table public.version_ingredientes rename to receta_ingredientes;
alter table public.version_categorias rename to receta_categorias;
alter table public.version_pasos rename to receta_pasos;

-- Si la funcion del script 05 ya existia, actualizar sus referencias.
-- Si todavia no se ejecuto 05, no se instala ni se modifica esa funcionalidad.
do $actualizar_rpc$
begin
    if to_regprocedure('recetario_private.eliminar_categoria_internal(bigint)') is not null then
        execute $definicion$
            create or replace function recetario_private.eliminar_categoria_internal(p_categoria_id bigint)
            returns void
            language plpgsql
            security definer
            set search_path = ''
            as $cuerpo$
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
            $cuerpo$;
        $definicion$;
    end if;
end
$actualizar_rpc$;

-- La Data API necesita reconocer los nombres nuevos de las tablas.
notify pgrst, 'reload schema';
commit;

-- Verificacion de nombres, filas y RLS (solo lectura).
select
    c.relname as tabla,
    c.reltuples::bigint as filas_estimadas,
    c.relrowsecurity as rls_habilitado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in ('receta_ingredientes', 'receta_categorias', 'receta_pasos')
order by c.relname;
