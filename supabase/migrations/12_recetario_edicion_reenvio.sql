-- RECETARIO COLABORATIVO - 12: editar propuesta pendiente / corregir y reenviar rechazada
-- Requiere scripts anteriores hasta 11 y las tablas renombradas por la migracion 06.
-- Ejecutar en Supabase > SQL Editor. No cambia el esquema ni los permisos de escritura directa.
-- POST /rest/v1/rpc/editar_propuesta_receta
-- Payload: {"p_version_id": 123, "p_datos": { ...mismo formato que crear_receta... }}
-- Si la version es pendiente: se modifica en el lugar, sigue pendiente.
-- Si la version es rechazada: se conserva en el historial y se crea otra version pendiente.
-- Las versiones publicadas NO se editan por esta RPC.
-- Las escrituras de la RPC son atomicas (transaccion de la peticion).

BEGIN;

CREATE SCHEMA IF NOT EXISTS recetario_private;
REVOKE ALL ON SCHEMA recetario_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA recetario_private TO authenticated;

-- El autor necesita poder leer categorias, ingredientes y pasos de sus propias
-- versiones no publicadas para precargar el formulario de edicion.
-- Las politicas publicas y administrativas existentes se conservan.
ALTER TABLE public.receta_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_pasos ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.receta_categorias, public.receta_ingredientes,
    public.receta_pasos TO authenticated;

DROP POLICY IF EXISTS "Autor: leer categorias de mis versiones" ON public.receta_categorias;
CREATE POLICY "Autor: leer categorias de mis versiones"
ON public.receta_categorias FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.receta_versiones v
        JOIN public.recetas r ON r.id = v.receta_id
        WHERE v.id = version_id
          AND r.autor_id = (SELECT auth.uid())
          AND r.eliminada_en IS NULL
    )
);

DROP POLICY IF EXISTS "Autor: leer ingredientes de mis versiones" ON public.receta_ingredientes;
CREATE POLICY "Autor: leer ingredientes de mis versiones"
ON public.receta_ingredientes FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.receta_versiones v
        JOIN public.recetas r ON r.id = v.receta_id
        WHERE v.id = version_id
          AND r.autor_id = (SELECT auth.uid())
          AND r.eliminada_en IS NULL
    )
);

DROP POLICY IF EXISTS "Autor: leer pasos de mis versiones" ON public.receta_pasos;
CREATE POLICY "Autor: leer pasos de mis versiones"
ON public.receta_pasos FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.receta_versiones v
        JOIN public.recetas r ON r.id = v.receta_id
        WHERE v.id = version_id
          AND r.autor_id = (SELECT auth.uid())
          AND r.eliminada_en IS NULL
    )
);

CREATE OR REPLACE FUNCTION recetario_private.editar_propuesta_receta_internal(
    p_version_id bigint,
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
    v_estado text;
    v_numero_actual integer;
    v_numero_siguiente integer;
    v_version_destino bigint;
    v_titulo text;
    v_descripcion text;
    v_porciones integer;
    v_tiempo integer;
    v_dificultad text;
    v_total bigint;
    v_distintos bigint;
    v_accion text;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesion'
            USING ERRCODE = '42501';
    END IF;

    IF pg_catalog.jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'El cuerpo de la receta debe ser un objeto JSON'
            USING ERRCODE = '22023';
    END IF;

    -- Bloqueamos la receta como hace la moderacion. La autorizacion se
    -- verifica en PostgreSQL, independientemente de la ruta de Vue.
    SELECT r.id INTO v_receta_id
      FROM public.recetas r
      JOIN public.receta_versiones v ON v.receta_id = r.id
     WHERE v.id = p_version_id
       AND r.autor_id = v_usuario
       AND r.eliminada_en IS NULL
     FOR UPDATE OF r;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La propuesta no existe o no te pertenece'
            USING ERRCODE = '42501';
    END IF;

    SELECT v.estado, v.numero
      INTO v_estado, v_numero_actual
      FROM public.receta_versiones v
     WHERE v.id = p_version_id AND v.receta_id = v_receta_id
     FOR UPDATE;

    IF v_estado NOT IN ('pendiente', 'rechazada') THEN
        RAISE EXCEPTION 'Solo se pueden corregir propuestas pendientes o rechazadas'
            USING ERRCODE = '22023';
    END IF;

    -- No se puede reabrir una propuesta antigua si ya existe otra version.
    IF EXISTS (
        SELECT 1 FROM public.receta_versiones v
         WHERE v.receta_id = v_receta_id AND v.numero > v_numero_actual
    ) THEN
        RAISE EXCEPTION 'Existe una version posterior de esta receta'
            USING ERRCODE = '22023';
    END IF;

    IF v_estado = 'rechazada' AND EXISTS (
        SELECT 1 FROM public.receta_versiones v
         WHERE v.receta_id = v_receta_id AND v.estado = 'pendiente'
    ) THEN
        RAISE EXCEPTION 'La receta ya tiene una propuesta pendiente'
            USING ERRCODE = '22023';
    END IF;

    -- Validaciones iguales al alta de recetas (script 09).
    v_titulo := NULLIF(pg_catalog.btrim(p_datos->>'titulo'), '');
    v_descripcion := NULLIF(pg_catalog.btrim(p_datos->>'descripcion'), '');
    v_porciones := NULLIF(p_datos->>'porciones', '')::integer;
    v_tiempo := NULLIF(p_datos->>'tiempo_minutos', '')::integer;
    v_dificultad := NULLIF(pg_catalog.btrim(p_datos->>'dificultad'), '');

    IF v_titulo IS NULL THEN
        RAISE EXCEPTION 'El titulo es obligatorio' USING ERRCODE = '22023';
    END IF;
    IF v_porciones IS NULL OR v_porciones <= 0 THEN
        RAISE EXCEPTION 'Porciones debe ser mayor a cero' USING ERRCODE = '22023';
    END IF;
    IF v_tiempo IS NOT NULL AND v_tiempo <= 0 THEN
        RAISE EXCEPTION 'El tiempo debe ser mayor a cero' USING ERRCODE = '22023';
    END IF;
    IF v_dificultad IS NOT NULL AND v_dificultad NOT IN ('facil', 'media', 'dificil') THEN
        RAISE EXCEPTION 'Dificultad invalida' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(p_datos->'categorias') IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(p_datos->'categorias') = 0 THEN
        RAISE EXCEPTION 'Selecciona al menos una categoria' USING ERRCODE = '22023';
    END IF;

    SELECT count(*), count(DISTINCT x.id_text::bigint)
      INTO v_total, v_distintos
      FROM pg_catalog.jsonb_array_elements_text(p_datos->'categorias') AS x(id_text);
    IF v_total <> v_distintos THEN
        RAISE EXCEPTION 'No repitas categorias' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_catalog.jsonb_array_elements_text(p_datos->'categorias') AS x(id_text)
          LEFT JOIN public.categorias c
            ON c.id = x.id_text::bigint AND c.activa = true
         WHERE c.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Una categoria no existe o esta inactiva'
            USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(p_datos->'ingredientes') IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(p_datos->'ingredientes') = 0 THEN
        RAISE EXCEPTION 'Agrega al menos un ingrediente' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_catalog.jsonb_array_elements(p_datos->'ingredientes') AS x(item)
         WHERE pg_catalog.jsonb_typeof(x.item) <> 'object'
            OR NULLIF(x.item->>'ingrediente_id', '') IS NULL
            OR NULLIF(x.item->>'cantidad', '') IS NULL
            OR NULLIF(x.item->>'unidad', '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Los ingredientes requieren id, cantidad y unidad'
            USING ERRCODE = '22023';
    END IF;
    SELECT count(*), count(DISTINCT (x.item->>'ingrediente_id')::bigint)
      INTO v_total, v_distintos
      FROM pg_catalog.jsonb_array_elements(p_datos->'ingredientes') AS x(item);
    IF v_total <> v_distintos THEN
        RAISE EXCEPTION 'No repitas ingredientes' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_catalog.jsonb_array_elements(p_datos->'ingredientes') AS x(item)
          LEFT JOIN public.ingredientes i
            ON i.id = (x.item->>'ingrediente_id')::bigint
         WHERE i.id IS NULL
            OR (i.activo = false AND NOT EXISTS (
                SELECT 1 FROM public.receta_ingredientes existente
                 WHERE existente.version_id = p_version_id
                   AND existente.ingrediente_id = i.id
            ))
            OR (x.item->>'cantidad')::numeric <= 0
            OR (x.item->>'unidad') NOT IN (
                'g', 'kg', 'ml', 'l', 'unidades',
                'cucharaditas', 'cucharadas', 'tazas', 'pizcas'
            )
    ) THEN
        RAISE EXCEPTION 'Ingrediente inexistente, no permitido o con cantidad/unidad invalida'
            USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(p_datos->'pasos') IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(p_datos->'pasos') = 0 THEN
        RAISE EXCEPTION 'Agrega al menos un paso' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_catalog.jsonb_array_elements(p_datos->'pasos') AS x(item)
         WHERE pg_catalog.jsonb_typeof(x.item) <> 'string'
            OR pg_catalog.btrim(x.item #>> '{}') = ''
    ) THEN
        RAISE EXCEPTION 'Todos los pasos deben tener una descripcion'
            USING ERRCODE = '22023';
    END IF;

    IF v_estado = 'pendiente' THEN
        -- Reemplazar el contenido de la misma propuesta; continua pendiente.
        v_version_destino := p_version_id;
        UPDATE public.receta_versiones
           SET titulo = v_titulo,
               descripcion = v_descripcion,
               porciones = v_porciones,
               tiempo_minutos = v_tiempo,
               dificultad = v_dificultad,
               motivo_rechazo = NULL,
               actualizada_en = now()
         WHERE id = v_version_destino;
        v_accion := 'actualizada';
    ELSE
        -- La version rechazada queda intacta en el historial.
        SELECT coalesce(max(numero), 0) + 1 INTO v_numero_siguiente
          FROM public.receta_versiones
         WHERE receta_id = v_receta_id;

        INSERT INTO public.receta_versiones (
            receta_id, numero, estado, titulo, descripcion, tiempo_minutos,
            porciones, dificultad, imagen_path, motivo_rechazo
        )
        SELECT v_receta_id, v_numero_siguiente, 'pendiente',
               v_titulo, v_descripcion, v_tiempo, v_porciones, v_dificultad,
               v.imagen_path, NULL
          FROM public.receta_versiones v
         WHERE v.id = p_version_id
        RETURNING id INTO v_version_destino;
        v_accion := 'reenviada';
    END IF;

    -- Borramos las relaciones solo de la VERSION DE DESTINO.
    -- Si era una propuesta pendiente no existe historial aprobado que alterar.
    DELETE FROM public.receta_categorias WHERE version_id = v_version_destino;
    DELETE FROM public.receta_ingredientes WHERE version_id = v_version_destino;
    DELETE FROM public.receta_pasos WHERE version_id = v_version_destino;

    INSERT INTO public.receta_categorias (version_id, categoria_id)
    SELECT v_version_destino, x.id_text::bigint
      FROM pg_catalog.jsonb_array_elements_text(p_datos->'categorias') AS x(id_text);

    INSERT INTO public.receta_ingredientes (version_id, ingrediente_id, cantidad, unidad)
    SELECT v_version_destino, (x.item->>'ingrediente_id')::bigint,
           (x.item->>'cantidad')::numeric, x.item->>'unidad'
      FROM pg_catalog.jsonb_array_elements(p_datos->'ingredientes') AS x(item);

    INSERT INTO public.receta_pasos (version_id, orden, descripcion)
    SELECT v_version_destino, x.orden::integer, pg_catalog.btrim(x.paso)
      FROM pg_catalog.jsonb_array_elements_text(p_datos->'pasos')
           WITH ORDINALITY AS x(paso, orden);

    RETURN pg_catalog.jsonb_build_object(
        'receta_id', v_receta_id,
        'version_id', v_version_destino,
        'estado', 'pendiente',
        'accion', v_accion
    );
END;
$$;

REVOKE ALL ON FUNCTION recetario_private.editar_propuesta_receta_internal(bigint, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recetario_private.editar_propuesta_receta_internal(bigint, jsonb)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.editar_propuesta_receta(
    p_version_id bigint,
    p_datos jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT recetario_private.editar_propuesta_receta_internal(p_version_id, p_datos);
$$;

REVOKE ALL ON FUNCTION public.editar_propuesta_receta(bigint, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editar_propuesta_receta(bigint, jsonb)
    TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verificacion: debe devolver public.editar_propuesta_receta(bigint,jsonb)
SELECT to_regprocedure('public.editar_propuesta_receta(bigint,jsonb)') AS funcion_rpc;
