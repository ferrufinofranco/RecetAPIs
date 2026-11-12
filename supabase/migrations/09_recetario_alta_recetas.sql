-- RECETARIO COLABORATIVO - 09: alta atomica de recetas pendientes
-- Ejecutar en Supabase SQL Editor luego de 01-08 y la migracion 06.
-- No crea tablas, no publica recetas ni habilita INSERT directo sobre tablas.
-- API: POST /rest/v1/rpc/crear_receta con {"p_datos": {...}}
-- Imagen opcional: en esta etapa imagen_path se mantiene NULL.
-- La escritura completa se hace en una transaccion (la de la invocacion RPC).

begin;

create schema if not exists recetario_private;
revoke all on schema recetario_private from public, anon;
grant usage on schema recetario_private to authenticated;

-- Esta funcion no esta expuesta directamente en la Data API.
create or replace function recetario_private.crear_receta_internal(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_usuario uuid := auth.uid();
    v_receta_id bigint;
    v_version_id bigint;
    v_titulo text;
    v_descripcion text;
    v_porciones integer;
    v_tiempo integer;
    v_dificultad text;
    v_total integer;
    v_distintos integer;
begin
    -- El autor SIEMPRE se obtiene del JWT, nunca del JSON recibido.
    if v_usuario is null or not exists (
        select 1 from public.profiles p where p.id = v_usuario
    ) then
        raise exception 'Debes iniciar sesion para crear recetas'
            using errcode = '42501';
    end if;

    if pg_catalog.jsonb_typeof(p_datos) is distinct from 'object' then
        raise exception 'El cuerpo de la receta debe ser un objeto JSON'
            using errcode = '22023';
    end if;

    v_titulo := nullif(pg_catalog.btrim(p_datos->>'titulo'), '');
    v_descripcion := nullif(pg_catalog.btrim(p_datos->>'descripcion'), '');
    v_porciones := nullif(p_datos->>'porciones', '')::integer;
    v_tiempo := nullif(p_datos->>'tiempo_minutos', '')::integer;
    v_dificultad := nullif(pg_catalog.btrim(p_datos->>'dificultad'), '');

    if v_titulo is null then
        raise exception 'El titulo es obligatorio' using errcode = '22023';
    end if;
    if v_porciones is null or v_porciones <= 0 then
        raise exception 'Porciones debe ser mayor a cero' using errcode = '22023';
    end if;
    if v_tiempo is not null and v_tiempo <= 0 then
        raise exception 'El tiempo debe ser mayor a cero' using errcode = '22023';
    end if;
    if v_dificultad is not null and v_dificultad not in ('facil', 'media', 'dificil') then
        raise exception 'Dificultad invalida' using errcode = '22023';
    end if;

    -- CATEGORIAS: una o mas, activas y sin duplicados.
    if pg_catalog.jsonb_typeof(p_datos->'categorias') is distinct from 'array'
       or pg_catalog.jsonb_array_length(p_datos->'categorias') = 0 then
        raise exception 'Selecciona al menos una categoria'
            using errcode = '22023';
    end if;

    select count(*), count(distinct x.id_text::bigint)
      into v_total, v_distintos
      from pg_catalog.jsonb_array_elements_text(p_datos->'categorias') as x(id_text);
    if v_total <> v_distintos then
        raise exception 'No repitas categorias' using errcode = '22023';
    end if;
    if exists (
        select 1
          from pg_catalog.jsonb_array_elements_text(p_datos->'categorias') as x(id_text)
          left join public.categorias c
            on c.id = x.id_text::bigint and c.activa = true
         where c.id is null
    ) then
        raise exception 'Una categoria no existe o esta inactiva'
            using errcode = '22023';
    end if;

    -- INGREDIENTES: filas {ingrediente_id, cantidad, unidad}.
    if pg_catalog.jsonb_typeof(p_datos->'ingredientes') is distinct from 'array'
       or pg_catalog.jsonb_array_length(p_datos->'ingredientes') = 0 then
        raise exception 'Agrega al menos un ingrediente'
            using errcode = '22023';
    end if;
    if exists (
        select 1
          from pg_catalog.jsonb_array_elements(p_datos->'ingredientes') as x(item)
         where pg_catalog.jsonb_typeof(x.item) <> 'object'
            or nullif(x.item->>'ingrediente_id', '') is null
            or nullif(x.item->>'cantidad', '') is null
            or nullif(x.item->>'unidad', '') is null
    ) then
        raise exception 'Los ingredientes requieren id, cantidad y unidad'
            using errcode = '22023';
    end if;
    select count(*), count(distinct (x.item->>'ingrediente_id')::bigint)
      into v_total, v_distintos
      from pg_catalog.jsonb_array_elements(p_datos->'ingredientes') as x(item);
    if v_total <> v_distintos then
        raise exception 'No repitas ingredientes' using errcode = '22023';
    end if;
    if exists (
        select 1
          from pg_catalog.jsonb_array_elements(p_datos->'ingredientes') as x(item)
          left join public.ingredientes i
            on i.id = (x.item->>'ingrediente_id')::bigint and i.activo = true
         where i.id is null
            or (x.item->>'cantidad')::numeric <= 0
            or (x.item->>'unidad') not in (
                'g', 'kg', 'ml', 'l', 'unidades',
                'cucharaditas', 'cucharadas', 'tazas', 'pizcas'
            )
    ) then
        raise exception 'Ingrediente inexistente, inactivo o con cantidad/unidad invalida'
            using errcode = '22023';
    end if;

    -- PASOS: array ordenado de textos; el orden se toma de la posicion.
    if pg_catalog.jsonb_typeof(p_datos->'pasos') is distinct from 'array'
       or pg_catalog.jsonb_array_length(p_datos->'pasos') = 0 then
        raise exception 'Agrega al menos un paso'
            using errcode = '22023';
    end if;
    if exists (
        select 1
          from pg_catalog.jsonb_array_elements(p_datos->'pasos') as x(item)
         where pg_catalog.jsonb_typeof(x.item) <> 'string'
            or pg_catalog.btrim(x.item #>> '{}') = ''
    ) then
        raise exception 'Todos los pasos deben tener una descripcion'
            using errcode = '22023';
    end if;

    -- Una unica operacion: si falla cualquier insert, se deshace todo.
    insert into public.recetas (autor_id)
    values (v_usuario)
    returning id into v_receta_id;

    insert into public.receta_versiones (
        receta_id, numero, estado, titulo, descripcion,
        tiempo_minutos, porciones, dificultad, imagen_path
    ) values (
        v_receta_id, 1, 'pendiente', v_titulo, v_descripcion,
        v_tiempo, v_porciones, v_dificultad, null
    ) returning id into v_version_id;

    insert into public.receta_categorias (version_id, categoria_id)
    select v_version_id, x.id_text::bigint
      from pg_catalog.jsonb_array_elements_text(p_datos->'categorias') as x(id_text);

    insert into public.receta_ingredientes (version_id, ingrediente_id, cantidad, unidad)
    select v_version_id, (x.item->>'ingrediente_id')::bigint,
           (x.item->>'cantidad')::numeric, x.item->>'unidad'
      from pg_catalog.jsonb_array_elements(p_datos->'ingredientes') as x(item);

    insert into public.receta_pasos (version_id, orden, descripcion)
    select v_version_id, x.orden::integer, pg_catalog.btrim(x.paso)
      from pg_catalog.jsonb_array_elements_text(p_datos->'pasos')
           with ordinality as x(paso, orden);

    return pg_catalog.jsonb_build_object(
        'receta_id', v_receta_id,
        'version_id', v_version_id,
        'estado', 'pendiente'
    );
end;
$$;

revoke all on function recetario_private.crear_receta_internal(jsonb)
    from public, anon, authenticated;
grant execute on function recetario_private.crear_receta_internal(jsonb)
    to authenticated;

-- Unico endpoint publico; requiere sesion y delega a la funcion interna.
create or replace function public.crear_receta(p_datos jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
    select recetario_private.crear_receta_internal(p_datos);
$$;

revoke all on function public.crear_receta(jsonb)
    from public, anon, authenticated;
grant execute on function public.crear_receta(jsonb)
    to authenticated;

-- Las tablas permanecen protegidas contra escritura directa por Data API.
-- No concedemos INSERT / UPDATE / DELETE sobre recetas y tablas hijas.
notify pgrst, 'reload schema';
commit;

-- Comprobacion (lectura, no ejecuta el alta):
select to_regprocedure('public.crear_receta(jsonb)') as funcion_rpc;
