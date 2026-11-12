-- RECETARIO COLABORATIVO - 14: baja logica de recetas
-- Requiere el esquema inicial y las etapas de lectura/moderacion ya instaladas.
-- Ejecutar en Supabase > SQL Editor (idealmente primero en un proyecto de prueba).
-- Endpoint: POST /rest/v1/rpc/eliminar_receta
-- Body: {"p_receta_id": 123}
--
-- Reglas:
-- * Autor puede dar de baja sus recetas; administrador puede dar de baja cualquier receta.
-- * Marca recetas.eliminada_en (no hace DELETE fisico).
-- * Cambia versiones pendientes a 'descartada'.
-- * Conserva versiones publicadas, rechazadas, anteriores, ingredientes y pasos.
-- * El catalogo y Mis recetas ya filtran por eliminada_en IS NULL mediante RLS.
-- * La llamada RPC es atomica. No se otorgan UPDATE/DELETE directos sobre recetas.

BEGIN;

-- Comprobaciones del esquema antes de crear la funcion.
DO $validacion$
BEGIN
    IF to_regclass('public.recetas') IS NULL
       OR to_regclass('public.receta_versiones') IS NULL
       OR to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'Faltan tablas del esquema inicial de Recetario';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'recetas'
           AND column_name = 'eliminada_en'
    ) THEN
        RAISE EXCEPTION 'Falta la columna recetas.eliminada_en';
    END IF;
END;
$validacion$;

-- El administrador debe poder listar tambien las recetas rechazadas que nunca
-- se publicaron, para ofrecer la baja desde el panel de gestion. Esta politica
-- NO concede lectura al resto de los usuarios.
ALTER TABLE public.receta_versiones ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.receta_versiones TO authenticated;

DROP POLICY IF EXISTS "Admin: leer versiones para gestion" ON public.receta_versiones;
CREATE POLICY "Admin: leer versiones para gestion"
ON public.receta_versiones FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.recetas r
        WHERE r.id = receta_id AND r.eliminada_en IS NULL
    )
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.rol = 'admin'
    )
);

CREATE SCHEMA IF NOT EXISTS recetario_private;
REVOKE ALL ON SCHEMA recetario_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA recetario_private TO authenticated;

-- La funcion interna hace la escritura con permisos de su propietario.
-- Por eso valida AUTENTICACION y AUTORIZACION expresamente.
CREATE OR REPLACE FUNCTION recetario_private.eliminar_receta_internal(
    p_receta_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $cuerpo$
DECLARE
    v_usuario uuid := auth.uid();
    v_es_admin boolean := false;
    v_receta_id bigint;
    v_versiones_descartadas integer := 0;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesion para eliminar recetas'
            USING ERRCODE = '42501';
    END IF;

    IF p_receta_id IS NULL THEN
        RAISE EXCEPTION 'El ID de la receta es obligatorio'
            USING ERRCODE = '22023';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_usuario AND p.rol = 'admin'
    ) INTO v_es_admin;

    -- Se bloquea la receta para evitar conflictos con otras RPC de versionado
    -- y moderacion. No se filtran datos privados de recetas ajenas.
    SELECT r.id INTO v_receta_id
    FROM public.recetas r
    WHERE r.id = p_receta_id
      AND r.eliminada_en IS NULL
      AND (r.autor_id = v_usuario OR v_es_admin)
    FOR UPDATE OF r;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La receta no existe, ya fue eliminada o no tenes permisos'
            USING ERRCODE = '42501';
    END IF;

    -- Descartar una propuesta pendiente, si existe. El resto del historial
    -- NO se altera: no se borran versiones ni datos de sus tablas hijas.
    UPDATE public.receta_versiones
       SET estado = 'descartada',
           actualizada_en = pg_catalog.now()
     WHERE receta_id = v_receta_id
       AND estado = 'pendiente';

    GET DIAGNOSTICS v_versiones_descartadas = ROW_COUNT;

    UPDATE public.recetas
       SET eliminada_en = pg_catalog.now()
     WHERE id = v_receta_id
       AND eliminada_en IS NULL;

    RETURN pg_catalog.jsonb_build_object(
        'receta_id', v_receta_id,
        'eliminada', true,
        'versiones_descartadas', v_versiones_descartadas
    );
END;
$cuerpo$;

-- Funcion interna en esquema no expuesto a la Data API.
REVOKE ALL ON FUNCTION recetario_private.eliminar_receta_internal(bigint)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recetario_private.eliminar_receta_internal(bigint)
TO authenticated;

-- Unico punto de entrada por REST, con sesion del usuario.
CREATE OR REPLACE FUNCTION public.eliminar_receta(p_receta_id bigint)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $envoltorio$
    SELECT recetario_private.eliminar_receta_internal(p_receta_id);
$envoltorio$;

REVOKE ALL ON FUNCTION public.eliminar_receta(bigint)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_receta(bigint)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Comprobacion de instalacion. No elimina recetas:
SELECT to_regprocedure('public.eliminar_receta(bigint)') AS rpc_eliminar_receta;
