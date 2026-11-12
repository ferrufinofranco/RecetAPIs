-- RECETARIO COLABORATIVO - 13: Proponer cambios sobre una receta publicada
-- Requiere 01-12 y migracion 06 (receta_ingredientes, receta_categorias, receta_pasos).
-- No modifica las tablas ni concede INSERT/UPDATE/DELETE directos desde REST.
-- API: POST /rest/v1/rpc/proponer_edicion_receta
-- Payload: {"p_receta_id": 123, "p_datos": {...mismo formato que crear_receta...}}
-- Resultado: una NUEVA version pendiente; la version publicada permanece intacta.
-- Reutiliza las validaciones de editar_propuesta_receta (script 12).
-- La transaccion de la llamada RPC garantiza que, si algo falla, no se crea ninguna version.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('recetario_private.editar_propuesta_receta_internal(bigint,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Primero ejecuta el script 12: falta editar_propuesta_receta_internal(bigint,jsonb)';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS recetario_private;
REVOKE ALL ON SCHEMA recetario_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA recetario_private TO authenticated;

CREATE OR REPLACE FUNCTION recetario_private.proponer_edicion_receta_internal(
    p_receta_id bigint,
    p_datos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_usuario uuid := auth.uid();
    v_receta_id bigint;
    v_version_publicada bigint;
    v_version_nueva bigint;
    v_numero_siguiente integer;
    v_resultado jsonb;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesion'
            USING ERRCODE = '42501';
    END IF;

    IF pg_catalog.jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'El contenido de la receta debe ser un objeto JSON'
            USING ERRCODE = '22023';
    END IF;

    -- Se bloquea la receta para serializar esta operacion con aprobaciones,
    -- rechazos y otras ediciones (mismo bloqueo usado en scripts 11 y 12).
    -- Solo el autor puede proponer cambios desde esta RPC.
    SELECT r.id, v.id
      INTO v_receta_id, v_version_publicada
      FROM public.recetas r
      JOIN public.receta_versiones v ON v.receta_id = r.id
     WHERE r.id = p_receta_id
       AND r.autor_id = v_usuario
       AND r.eliminada_en IS NULL
       AND v.estado = 'publicada'
     FOR UPDATE OF r;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Receta publicada inexistente o no te pertenece'
            USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.receta_versiones v
         WHERE v.receta_id = v_receta_id
           AND v.estado = 'pendiente'
    ) THEN
        RAISE EXCEPTION 'Ya existe una propuesta pendiente: edita esa propuesta'
            USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(MAX(v.numero), 0) + 1
      INTO v_numero_siguiente
      FROM public.receta_versiones v
     WHERE v.receta_id = v_receta_id;

    -- La imagen aprobada se mantiene. En esta etapa no se modifican imagenes.
    -- El contenido final sera el recibido en p_datos y validado por script 12.
    INSERT INTO public.receta_versiones (
        receta_id, numero, estado, titulo, descripcion,
        tiempo_minutos, porciones, dificultad, imagen_path, motivo_rechazo
    )
    SELECT v_receta_id, v_numero_siguiente, 'pendiente',
           v.titulo, v.descripcion, v.tiempo_minutos, v.porciones,
           v.dificultad, v.imagen_path, NULL
      FROM public.receta_versiones v
     WHERE v.id = v_version_publicada
    RETURNING id INTO v_version_nueva;

    -- Copia transitoria de ingredientes de la version publicada:
    -- la validacion del script 12 permite mantener ingredientes inactivos
    -- si ya pertenecian a la receta, pero no agregar otros nuevos inactivos.
    INSERT INTO public.receta_ingredientes (
        version_id, ingrediente_id, cantidad, unidad
    )
    SELECT v_version_nueva, ri.ingrediente_id, ri.cantidad, ri.unidad
      FROM public.receta_ingredientes ri
     WHERE ri.version_id = v_version_publicada;

    -- Esta funcion valida TODOS los datos y reemplaza las relaciones
    -- de la nueva version. No modifica nunca la version publicada.
    v_resultado := recetario_private.editar_propuesta_receta_internal(
        v_version_nueva, p_datos
    );

    RETURN v_resultado || pg_catalog.jsonb_build_object(
        'accion', 'propuesta_creada',
        'version_publicada_id', v_version_publicada
    );
END;
$$;

REVOKE ALL ON FUNCTION recetario_private.proponer_edicion_receta_internal(bigint, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recetario_private.proponer_edicion_receta_internal(bigint, jsonb)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.proponer_edicion_receta(
    p_receta_id bigint,
    p_datos jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT recetario_private.proponer_edicion_receta_internal(p_receta_id, p_datos);
$$;

REVOKE ALL ON FUNCTION public.proponer_edicion_receta(bigint, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proponer_edicion_receta(bigint, jsonb)
    TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verificacion de instalacion; NO crea versiones:
SELECT to_regprocedure('public.proponer_edicion_receta(bigint,jsonb)') AS funcion_rpc;
