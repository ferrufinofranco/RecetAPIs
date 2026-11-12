-- RECETARIO COLABORATIVO - 15: cierre de modulos de recetas e ingredientes
-- Requiere migraciones 01-14, incluidas las tablas renombradas por 06.
-- Incluye: solicitudes de ingredientes, imagenes Storage, adjuntar imagen a
-- propuesta pendiente, edicion directa de recetas por administradores.
-- Ejecutar en SQL Editor en un ambiente de prueba primero.
-- No borra registros ni modifica la estructura de las nueve tablas existentes.
-- Nota: el bucket es PUBLICO. Conocer la URL del objeto permite verlo aun
-- cuando la receta todavia esta pendiente de aprobacion.

BEGIN;

DO $validar$
BEGIN
  IF to_regclass('public.solicitudes_ingredientes') IS NULL
     OR to_regclass('public.recetas') IS NULL
     OR to_regclass('public.receta_versiones') IS NULL
     OR to_regclass('public.receta_categorias') IS NULL
     OR to_regclass('public.receta_ingredientes') IS NULL
     OR to_regclass('public.receta_pasos') IS NULL THEN
    RAISE EXCEPTION 'Faltan tablas o la migracion 06 de Recetario';
  END IF;
  IF to_regprocedure('public.eliminar_receta(bigint)') IS NULL THEN
    RAISE EXCEPTION 'Falta ejecutar el script 14 (eliminar_receta)';
  END IF;
END;
$validar$;

CREATE SCHEMA IF NOT EXISTS recetario_private;
REVOKE ALL ON SCHEMA recetario_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA recetario_private TO authenticated;

-- A. Solicitudes: solo el solicitante y los administradores pueden leerlas.
ALTER TABLE public.solicitudes_ingredientes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.solicitudes_ingredientes TO authenticated;

DROP POLICY IF EXISTS "Solicitudes: propietario o admin consulta" ON public.solicitudes_ingredientes;
CREATE POLICY "Solicitudes: propietario o admin consulta"
ON public.solicitudes_ingredientes FOR SELECT TO authenticated
USING (
  solicitante_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.rol = 'admin'
  )
);

-- A1. Solicitar ingrediente; no se acepta identidad del usuario desde el cliente.
CREATE OR REPLACE FUNCTION recetario_private.solicitar_ingrediente_internal(p_nombre text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $func$
DECLARE
  v_usuario uuid := auth.uid();
  v_nombre text := NULLIF(pg_catalog.btrim(p_nombre), '');
  v_id bigint;
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesion' USING ERRCODE = '42501';
  END IF;
  IF v_nombre IS NULL OR pg_catalog.char_length(v_nombre) > 120 THEN
    RAISE EXCEPTION 'Indica un nombre de ingrediente valido (1-120 caracteres)'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.solicitudes_ingredientes s
    WHERE s.solicitante_id = v_usuario AND s.estado = 'pendiente'
      AND pg_catalog.lower(pg_catalog.btrim(s.nombre_solicitado)) = pg_catalog.lower(v_nombre)
  ) THEN
    RAISE EXCEPTION 'Ya tenes una solicitud pendiente para ese ingrediente'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.solicitudes_ingredientes(solicitante_id, nombre_solicitado)
  VALUES (v_usuario, v_nombre) RETURNING id INTO v_id;
  RETURN pg_catalog.jsonb_build_object('solicitud_id', v_id, 'estado', 'pendiente');
END;
$func$;
REVOKE ALL ON FUNCTION recetario_private.solicitar_ingrediente_internal(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recetario_private.solicitar_ingrediente_internal(text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.solicitar_ingrediente(p_nombre text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT recetario_private.solicitar_ingrediente_internal(p_nombre); $$;
REVOKE ALL ON FUNCTION public.solicitar_ingrediente(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_ingrediente(text) TO authenticated;

-- A2. Resolver solicitud: rechazar, asociar con existente o crear ingrediente.
CREATE OR REPLACE FUNCTION recetario_private.resolver_solicitud_ingrediente_internal(
  p_solicitud_id bigint,
  p_accion text,
  p_ingrediente_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $func$
DECLARE
  v_nombre text;
  v_estado text;
  v_ingrediente_id bigint;
  v_estado_final text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede resolver solicitudes'
      USING ERRCODE = '42501';
  END IF;
  IF p_accion NOT IN ('aprobar', 'rechazar', 'asociar') OR p_accion IS NULL THEN
    RAISE EXCEPTION 'Accion invalida' USING ERRCODE = '22023';
  END IF;
  SELECT nombre_solicitado, estado INTO v_nombre, v_estado
  FROM public.solicitudes_ingredientes
  WHERE id = p_solicitud_id
  FOR UPDATE;
  IF NOT FOUND OR v_estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La solicitud no existe o ya fue resuelta'
      USING ERRCODE = '22023';
  END IF;

  IF p_accion = 'rechazar' THEN
    v_ingrediente_id := NULL;
    v_estado_final := 'rechazada';
  ELSIF p_accion = 'asociar' THEN
    SELECT id INTO v_ingrediente_id
    FROM public.ingredientes
    WHERE id = p_ingrediente_id AND activo = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selecciona un ingrediente existente y activo'
        USING ERRCODE = '22023';
    END IF;
    v_estado_final := 'asociada';
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.ingredientes i
      WHERE pg_catalog.lower(pg_catalog.btrim(i.nombre)) = pg_catalog.lower(pg_catalog.btrim(v_nombre))
    ) THEN
      RAISE EXCEPTION 'Ya existe un ingrediente con ese nombre; utiliza asociar'
        USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.ingredientes(nombre) VALUES (v_nombre)
    RETURNING id INTO v_ingrediente_id;
    v_estado_final := 'aprobada';
  END IF;

  UPDATE public.solicitudes_ingredientes
    SET estado = v_estado_final,
        ingrediente_id = v_ingrediente_id,
        resuelta_en = pg_catalog.now()
  WHERE id = p_solicitud_id;

  RETURN pg_catalog.jsonb_build_object(
    'solicitud_id', p_solicitud_id,
    'estado', v_estado_final,
    'ingrediente_id', v_ingrediente_id
  );
END;
$func$;
REVOKE ALL ON FUNCTION recetario_private.resolver_solicitud_ingrediente_internal(bigint,text,bigint)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recetario_private.resolver_solicitud_ingrediente_internal(bigint,text,bigint)
TO authenticated;

CREATE OR REPLACE FUNCTION public.resolver_solicitud_ingrediente(
  p_solicitud_id bigint,
  p_accion text,
  p_ingrediente_id bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  SELECT recetario_private.resolver_solicitud_ingrediente_internal(
    p_solicitud_id, p_accion, p_ingrediente_id
  );
$$;
REVOKE ALL ON FUNCTION public.resolver_solicitud_ingrediente(bigint,text,bigint)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_solicitud_ingrediente(bigint,text,bigint)
TO authenticated;

-- B. Storage. Las imagenes pueden verse por URL publica, pero solamente
-- el usuario autenticado puede subir objetos bajo SU propia carpeta UUID.
-- No se habilitan UPSERT, UPDATE, DELETE ni sobreescritura de objetos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recetas-imagenes', 'recetas-imagenes', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Recetario: subir imagen propia" ON storage.objects;
CREATE POLICY "Recetario: subir imagen propia"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'recetas-imagenes'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  AND pg_catalog.lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
);

-- B1. Asociar una imagen a una propuesta pendiente. El archivo debe existir
-- en Storage y estar bajo la carpeta UUID del propio autor. NULL quita imagen.
CREATE OR REPLACE FUNCTION recetario_private.asignar_imagen_receta_internal(
  p_version_id bigint,
  p_imagen_path text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $func$
DECLARE
  v_usuario uuid := auth.uid();
  v_receta_id bigint;
  v_path text := NULLIF(pg_catalog.btrim(p_imagen_path), '');
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesion' USING ERRCODE = '42501';
  END IF;
  SELECT r.id INTO v_receta_id
  FROM public.recetas r
  JOIN public.receta_versiones v ON v.receta_id = r.id
  WHERE v.id = p_version_id AND v.estado = 'pendiente'
    AND r.autor_id = v_usuario AND r.eliminada_en IS NULL
  FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No podes modificar la imagen de esta propuesta'
      USING ERRCODE = '42501';
  END IF;
  IF v_path IS NOT NULL THEN
    IF v_path NOT LIKE v_usuario::text || '/%'
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id = 'recetas-imagenes' AND o.name = v_path
       ) THEN
      RAISE EXCEPTION 'La imagen no existe o no fue subida por este usuario'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  UPDATE public.receta_versiones
  SET imagen_path = v_path, actualizada_en = pg_catalog.now()
  WHERE id = p_version_id AND estado = 'pendiente';
  RETURN pg_catalog.jsonb_build_object(
    'version_id', p_version_id, 'imagen_path', v_path
  );
END;
$func$;
REVOKE ALL ON FUNCTION recetario_private.asignar_imagen_receta_internal(bigint,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recetario_private.asignar_imagen_receta_internal(bigint,text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.asignar_imagen_receta(
  p_version_id bigint, p_imagen_path text
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  SELECT recetario_private.asignar_imagen_receta_internal(p_version_id,p_imagen_path);
$$;
REVOKE ALL ON FUNCTION public.asignar_imagen_receta(bigint,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_imagen_receta(bigint,text)
TO authenticated;

-- C. Edicion directa por administrador. Crea version NUEVA publicada e
-- historiza la anterior: no reescribe el historial de versiones.
-- Rechaza la operacion si existe una propuesta pendiente.
CREATE OR REPLACE FUNCTION recetario_private.admin_editar_receta_internal(
  p_receta_id bigint,
  p_datos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $func$
DECLARE
  v_usuario uuid := auth.uid();
  v_version_publicada bigint;
  v_numero_nuevo integer;
  v_version_nueva bigint;
  v_imagen_anterior text;
  v_imagen_nueva text;
  v_titulo text;
  v_descripcion text;
  v_porciones integer;
  v_tiempo integer;
  v_dificultad text;
  v_total bigint;
  v_distintos bigint;
BEGIN
  IF v_usuario IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_usuario AND p.rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede editar directamente'
      USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Datos de receta invalidos' USING ERRCODE = '22023';
  END IF;

  -- Bloquear la receta serializa con RPC de moderacion, baja y versionado.
  PERFORM 1 FROM public.recetas r
   WHERE r.id = p_receta_id AND r.eliminada_en IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receta inexistente o eliminada' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.receta_versiones v
             WHERE v.receta_id = p_receta_id AND v.estado = 'pendiente') THEN
    RAISE EXCEPTION 'Resolve primero la propuesta pendiente'
      USING ERRCODE = '22023';
  END IF;
  SELECT v.id, v.imagen_path INTO v_version_publicada, v_imagen_anterior
  FROM public.receta_versiones v
  WHERE v.receta_id = p_receta_id AND v.estado = 'publicada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo se pueden editar directamente recetas publicadas'
      USING ERRCODE = '22023';
  END IF;

  v_titulo := NULLIF(pg_catalog.btrim(p_datos->>'titulo'), '');
  v_descripcion := NULLIF(pg_catalog.btrim(p_datos->>'descripcion'), '');
  v_porciones := NULLIF(p_datos->>'porciones', '')::integer;
  v_tiempo := NULLIF(p_datos->>'tiempo_minutos', '')::integer;
  v_dificultad := NULLIF(pg_catalog.btrim(p_datos->>'dificultad'), '');
  IF v_titulo IS NULL OR v_porciones IS NULL OR v_porciones <= 0 THEN
    RAISE EXCEPTION 'Titulo y porciones positivas son obligatorios'
      USING ERRCODE = '22023';
  END IF;
  IF v_tiempo IS NOT NULL AND v_tiempo <= 0 THEN
    RAISE EXCEPTION 'Tiempo invalido' USING ERRCODE = '22023';
  END IF;
  IF v_dificultad IS NOT NULL AND v_dificultad NOT IN ('facil','media','dificil') THEN
    RAISE EXCEPTION 'Dificultad invalida' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(p_datos->'categorias') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_datos->'categorias') = 0 THEN
    RAISE EXCEPTION 'Agrega al menos una categoria' USING ERRCODE = '22023';
  END IF;
  SELECT count(*), count(DISTINCT x.id_text::bigint)
    INTO v_total, v_distintos
    FROM pg_catalog.jsonb_array_elements_text(p_datos->'categorias') AS x(id_text);
  IF v_total <> v_distintos OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_datos->'categorias') AS x(id_text)
    LEFT JOIN public.categorias c ON c.id = x.id_text::bigint AND c.activa = true
    WHERE c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Categorias repetidas o inactivas'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(p_datos->'ingredientes') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_datos->'ingredientes') = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un ingrediente' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_datos->'ingredientes') AS x(item)
    WHERE pg_catalog.jsonb_typeof(x.item) <> 'object'
      OR NULLIF(x.item->>'ingrediente_id','') IS NULL
      OR NULLIF(x.item->>'cantidad','') IS NULL
      OR NULLIF(x.item->>'unidad','') IS NULL
  ) THEN
    RAISE EXCEPTION 'Ingrediente incompleto' USING ERRCODE = '22023';
  END IF;
  SELECT count(*), count(DISTINCT (x.item->>'ingrediente_id')::bigint)
  INTO v_total, v_distintos
  FROM pg_catalog.jsonb_array_elements(p_datos->'ingredientes') AS x(item);
  IF v_total <> v_distintos OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_datos->'ingredientes') AS x(item)
    LEFT JOIN public.ingredientes i ON i.id = (x.item->>'ingrediente_id')::bigint
    WHERE i.id IS NULL
      OR (i.activo = false AND NOT EXISTS (
        SELECT 1 FROM public.receta_ingredientes ri
        WHERE ri.version_id = v_version_publicada AND ri.ingrediente_id = i.id
      ))
      OR (x.item->>'cantidad')::numeric <= 0
      OR x.item->>'unidad' NOT IN (
        'g','kg','ml','l','unidades','cucharaditas','cucharadas','tazas','pizcas'
      )
  ) THEN
    RAISE EXCEPTION 'Ingredientes repetidos, invalidos o inactivos nuevos'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(p_datos->'pasos') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_datos->'pasos') = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un paso' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_datos->'pasos') AS x(item)
    WHERE pg_catalog.jsonb_typeof(x.item) <> 'string'
       OR pg_catalog.btrim(x.item #>> '{}') = ''
  ) THEN
    RAISE EXCEPTION 'Paso invalido' USING ERRCODE = '22023';
  END IF;

  -- Si p_datos no contiene imagen_path, conserva la imagen anterior.
  -- Si contiene null, la quita. Si cambia, debe ser imagen subida por el admin.
  v_imagen_nueva := v_imagen_anterior;
  IF p_datos ? 'imagen_path' THEN
    v_imagen_nueva := NULLIF(pg_catalog.btrim(p_datos->>'imagen_path'), '');
    IF v_imagen_nueva IS NOT NULL AND v_imagen_nueva IS DISTINCT FROM v_imagen_anterior THEN
      IF v_imagen_nueva NOT LIKE v_usuario::text || '/%'
         OR NOT EXISTS (
           SELECT 1 FROM storage.objects o
           WHERE o.bucket_id = 'recetas-imagenes' AND o.name = v_imagen_nueva
         ) THEN
        RAISE EXCEPTION 'Imagen nueva inexistente o ajena'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero_nuevo
  FROM public.receta_versiones WHERE receta_id = p_receta_id;

  -- La transicion es atomica y respeta el indice parcial de version publicada.
  UPDATE public.receta_versiones
    SET estado = 'anterior', actualizada_en = pg_catalog.now()
  WHERE id = v_version_publicada;

  INSERT INTO public.receta_versiones (
    receta_id, numero, estado, titulo, descripcion, tiempo_minutos,
    porciones, dificultad, imagen_path
  ) VALUES (
    p_receta_id, v_numero_nuevo, 'publicada', v_titulo, v_descripcion,
    v_tiempo, v_porciones, v_dificultad, v_imagen_nueva
  ) RETURNING id INTO v_version_nueva;

  INSERT INTO public.receta_categorias(version_id, categoria_id)
  SELECT v_version_nueva, x.id_text::bigint
  FROM pg_catalog.jsonb_array_elements_text(p_datos->'categorias') AS x(id_text);
  INSERT INTO public.receta_ingredientes(version_id, ingrediente_id, cantidad, unidad)
  SELECT v_version_nueva, (x.item->>'ingrediente_id')::bigint,
    (x.item->>'cantidad')::numeric, x.item->>'unidad'
  FROM pg_catalog.jsonb_array_elements(p_datos->'ingredientes') AS x(item);
  INSERT INTO public.receta_pasos(version_id, orden, descripcion)
  SELECT v_version_nueva, x.orden::integer, pg_catalog.btrim(x.paso)
  FROM pg_catalog.jsonb_array_elements_text(p_datos->'pasos')
  WITH ORDINALITY AS x(paso, orden);

  RETURN pg_catalog.jsonb_build_object(
    'receta_id', p_receta_id,
    'version_id', v_version_nueva,
    'estado', 'publicada',
    'version_anterior_id', v_version_publicada
  );
END;
$func$;
REVOKE ALL ON FUNCTION recetario_private.admin_editar_receta_internal(bigint,jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recetario_private.admin_editar_receta_internal(bigint,jsonb)
TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_editar_receta(p_receta_id bigint,p_datos jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT recetario_private.admin_editar_receta_internal(p_receta_id,p_datos); $$;
REVOKE ALL ON FUNCTION public.admin_editar_receta(bigint,jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_editar_receta(bigint,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Comprobacion sin escrituras de negocio:
SELECT
  to_regprocedure('public.solicitar_ingrediente(text)') AS rpc_solicitar,
  to_regprocedure('public.resolver_solicitud_ingrediente(bigint,text,bigint)') AS rpc_resolver,
  to_regprocedure('public.asignar_imagen_receta(bigint,text)') AS rpc_imagen,
  to_regprocedure('public.admin_editar_receta(bigint,jsonb)') AS rpc_admin_edicion;
