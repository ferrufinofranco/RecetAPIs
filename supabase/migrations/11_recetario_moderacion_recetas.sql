-- RECETARIO COLABORATIVO - 11: Moderacion de recetas (aprobar / rechazar)
-- Ejecutar despues de los scripts 01, 02, 06, 09 y 10.
-- Utiliza los nombres ACTUALES: receta_categorias, receta_ingredientes, receta_pasos.
-- No modifica tablas, no otorga escrituras directas por REST, no elimina datos.
-- Las funciones de escritura son RPC exclusivas para administradores.
-- Es reejecutable (CREATE OR REPLACE FUNCTION, DROP/CREATE POLICY).

BEGIN;

CREATE SCHEMA IF NOT EXISTS recetario_private;
REVOKE ALL ON SCHEMA recetario_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA recetario_private TO authenticated;

-- 1. LECTURA PARA MODERACION: solo admins, solo propuestas pendientes.
-- Las lecturas publicas (versiones publicadas) y las del autor se conservan.
ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_pasos ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE
    public.recetas,
    public.receta_versiones,
    public.receta_categorias,
    public.receta_ingredientes,
    public.receta_pasos
TO authenticated;

DROP POLICY IF EXISTS "Admin: leer recetas para moderacion" ON public.recetas;
CREATE POLICY "Admin: leer recetas para moderacion"
ON public.recetas FOR SELECT TO authenticated
USING (
    eliminada_en IS NULL
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.rol = 'admin'
    )
);

DROP POLICY IF EXISTS "Admin: leer propuestas pendientes" ON public.receta_versiones;
CREATE POLICY "Admin: leer propuestas pendientes"
ON public.receta_versiones FOR SELECT TO authenticated
USING (
    estado = 'pendiente'
    AND EXISTS (
        SELECT 1 FROM public.recetas r
        WHERE r.id = receta_id AND r.eliminada_en IS NULL
    )
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.rol = 'admin'
    )
);

DROP POLICY IF EXISTS "Admin: leer categorias propuestas" ON public.receta_categorias;
CREATE POLICY "Admin: leer categorias propuestas"
ON public.receta_categorias FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.receta_versiones v
        WHERE v.id = version_id AND v.estado = 'pendiente'
    )
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.rol = 'admin'
    )
);

DROP POLICY IF EXISTS "Admin: leer ingredientes propuestos" ON public.receta_ingredientes;
CREATE POLICY "Admin: leer ingredientes propuestos"
ON public.receta_ingredientes FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.receta_versiones v
        WHERE v.id = version_id AND v.estado = 'pendiente'
    )
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.rol = 'admin'
    )
);

DROP POLICY IF EXISTS "Admin: leer pasos propuestos" ON public.receta_pasos;
CREATE POLICY "Admin: leer pasos propuestos"
ON public.receta_pasos FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.receta_versiones v
        WHERE v.id = version_id AND v.estado = 'pendiente'
    )
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.rol = 'admin'
    )
);

-- 2. APROBACION. Se publica una propuesta 'pendiente'.
-- Si existia una version publicada, pasa a 'anterior' ANTES de publicar
-- la nueva version (respeta el indice unico parcial existente).
-- FOR UPDATE sobre recetas serializa las decisiones sobre una misma receta.
CREATE OR REPLACE FUNCTION recetario_private.aprobar_receta_internal(
    p_version_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_receta_id bigint;
    v_estado text;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.rol = 'admin'
    ) THEN
        RAISE EXCEPTION 'Solo un administrador puede aprobar recetas'
            USING ERRCODE = '42501';
    END IF;

    SELECT r.id INTO v_receta_id
    FROM public.recetas r
    JOIN public.receta_versiones v ON v.receta_id = r.id
    WHERE v.id = p_version_id AND r.eliminada_en IS NULL
    FOR UPDATE OF r;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Receta inexistente o eliminada'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT v.estado INTO v_estado
    FROM public.receta_versiones v
    WHERE v.id = p_version_id AND v.receta_id = v_receta_id
    FOR UPDATE;

    IF v_estado IS DISTINCT FROM 'pendiente' THEN
        RAISE EXCEPTION 'La version no esta pendiente de aprobacion'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.receta_versiones
       SET estado = 'anterior', actualizada_en = now()
     WHERE receta_id = v_receta_id AND estado = 'publicada';

    UPDATE public.receta_versiones
       SET estado = 'publicada', motivo_rechazo = NULL, actualizada_en = now()
     WHERE id = p_version_id AND estado = 'pendiente';

    RETURN pg_catalog.jsonb_build_object(
        'receta_id', v_receta_id,
        'version_id', p_version_id,
        'estado', 'publicada'
    );
END;
$$;

REVOKE ALL ON FUNCTION recetario_private.aprobar_receta_internal(bigint)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recetario_private.aprobar_receta_internal(bigint)
TO authenticated;

CREATE OR REPLACE FUNCTION public.aprobar_receta(p_version_id bigint)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT recetario_private.aprobar_receta_internal(p_version_id);
$$;

REVOKE ALL ON FUNCTION public.aprobar_receta(bigint)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_receta(bigint) TO authenticated;

-- 3. RECHAZO. Motivo opcional; nunca se modifica la version publicada.
CREATE OR REPLACE FUNCTION recetario_private.rechazar_receta_internal(
    p_version_id bigint,
    p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_receta_id bigint;
    v_estado text;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.rol = 'admin'
    ) THEN
        RAISE EXCEPTION 'Solo un administrador puede rechazar recetas'
            USING ERRCODE = '42501';
    END IF;

    SELECT r.id INTO v_receta_id
    FROM public.recetas r
    JOIN public.receta_versiones v ON v.receta_id = r.id
    WHERE v.id = p_version_id AND r.eliminada_en IS NULL
    FOR UPDATE OF r;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Receta inexistente o eliminada'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT v.estado INTO v_estado
    FROM public.receta_versiones v
    WHERE v.id = p_version_id AND v.receta_id = v_receta_id
    FOR UPDATE;

    IF v_estado IS DISTINCT FROM 'pendiente' THEN
        RAISE EXCEPTION 'La version no esta pendiente de revision'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.receta_versiones
       SET estado = 'rechazada',
           motivo_rechazo = NULLIF(pg_catalog.btrim(p_motivo), ''),
           actualizada_en = now()
     WHERE id = p_version_id AND estado = 'pendiente';

    RETURN pg_catalog.jsonb_build_object(
        'receta_id', v_receta_id,
        'version_id', p_version_id,
        'estado', 'rechazada'
    );
END;
$$;

REVOKE ALL ON FUNCTION recetario_private.rechazar_receta_internal(bigint, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recetario_private.rechazar_receta_internal(bigint, text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.rechazar_receta(
    p_version_id bigint,
    p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT recetario_private.rechazar_receta_internal(p_version_id, p_motivo);
$$;

REVOKE ALL ON FUNCTION public.rechazar_receta(bigint, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rechazar_receta(bigint, text)
TO authenticated;

-- Sin GRANT UPDATE ni DELETE directo sobre receta_versiones.
-- Solo estas funciones controladas pueden cambiar estados.
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Comprobaciones de instalacion (no aprueban ni rechazan datos).
SELECT to_regprocedure('public.aprobar_receta(bigint)') AS aprobar_receta_rpc,
       to_regprocedure('public.rechazar_receta(bigint,text)') AS rechazar_receta_rpc;
