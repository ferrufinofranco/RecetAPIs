-- RECETARIO COLABORATIVO — ETAPA 2 DEL ABM DE INGREDIENTES: DESACTIVACION LOGICA
-- Requiere 01 (esquema inicial), 07 (permisos de alta y edicion de ingredientes).
-- Ejecutar en Supabase > SQL Editor con un rol administrador de base de datos.
-- No elimina registros ni modifica las asociaciones de recetas a ingredientes.
-- La funcion se consume desde Vue con POST /rest/v1/rpc/desactivar_ingrediente
-- Body: {"p_ingrediente_id": 123}
-- Puede ejecutarse nuevamente sin duplicar objetos.

begin;

-- Reutilizamos el esquema privado del ABM de categorias, si existe.
create schema if not exists recetario_private;
revoke all on schema recetario_private from public, anon;
grant usage on schema recetario_private to authenticated;

-- Funcion interna con permisos elevados: SOLO desactiva el ingrediente indicado.
-- Se ubica fuera de los esquemas expuestos por la Data API.
create or replace function recetario_private.desactivar_ingrediente_internal(
    p_ingrediente_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- El rol se verifica contra el usuario real del JWT, no contra datos enviados por Vue.
    if not exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.rol = 'admin'
    ) then
        raise exception 'Solo un administrador puede desactivar ingredientes'
            using errcode = '42501';
    end if;

    -- Baja logica atomica. Los registros relacionados siguen intactos.
    update public.ingredientes
       set activo = false
     where id = p_ingrediente_id
       and activo = true;

    if not found then
        raise exception 'El ingrediente no existe o ya esta desactivado'
            using errcode = 'P0002';
    end if;
end;
$$;

-- Las funciones tienen EXECUTE para PUBLIC por defecto; cerramos el acceso.
revoke all on function recetario_private.desactivar_ingrediente_internal(bigint)
    from public, anon, authenticated;
grant execute on function recetario_private.desactivar_ingrediente_internal(bigint)
    to authenticated;

-- En public queda solo un endpoint RPC con derechos del invocador.
create or replace function public.desactivar_ingrediente(p_ingrediente_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
    select recetario_private.desactivar_ingrediente_internal(p_ingrediente_id);
$$;

revoke all on function public.desactivar_ingrediente(bigint)
    from public, anon, authenticated;
grant execute on function public.desactivar_ingrediente(bigint)
    to authenticated;

-- Mantener las reglas de 07: en REST directo solo se puede INSERT/UPDATE nombre.
-- NO otorgamos permisos UPDATE sobre activo desde la API REST.
-- La politica SELECT del esquema inicial sigue mostrando los ingredientes inactivos
-- para que las recetas existentes conserven su ingrediente.

notify pgrst, 'reload schema';
commit;

-- Verificacion: la siguiente consulta deberia devolver public.desactivar_ingrediente(bigint)
-- select to_regprocedure('public.desactivar_ingrediente(bigint)');
-- Nota: NO probar RLS desde SQL Editor (el usuario postgres puede saltarse RLS).
-- Probar los permisos usando JWTs de admin y usuario comun desde REST.
