-- AUDITORÍA MANUAL, NO MIGRACIÓN. Ejecutar únicamente SELECT con un operador
-- autorizado. No ejecutar funciones de negocio. Revisar/redactar las salidas
-- antes de compartirlas; no incluir claves, JWT ni registros personales.

-- 1. Firmas, retornos, SECURITY DEFINER, search_path y permisos efectivos.
SELECT n.nspname AS esquema, p.proname AS funcion,
       pg_get_function_identity_arguments(p.oid) AS identidad,
       pg_get_function_arguments(p.oid) AS argumentos_y_defaults,
       pg_get_function_result(p.oid) AS retorno,
       p.prosecdef AS security_definer, p.provolatile AS volatilidad,
       pg_get_userbyid(p.proowner) AS propietario, p.proconfig AS configuracion,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'recetario_private')
  AND p.proname ~ '^(crear_receta|editar_propuesta_receta|proponer_edicion_receta|aprobar_receta|rechazar_receta|eliminar_receta|eliminar_categoria|desactivar_ingrediente|solicitar_ingrediente|resolver_solicitud_ingrediente|asignar_imagen_receta|admin_editar_receta)(_internal)?$'
ORDER BY n.nspname, p.proname, identidad;

-- 2. El tipo jsonb por sí solo NO demuestra las claves del objeto devuelto.
-- Incluir tanto wrappers como implementaciones internas para revisar version_id,
-- autoría, estados, eliminada_en, bloqueos, historial y control de roles.
SELECT n.nspname AS esquema, p.proname AS funcion,
       pg_get_functiondef(p.oid) AS definicion
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'recetario_private')
  AND p.proname ~ '^(crear_receta|editar_propuesta_receta|proponer_edicion_receta|aprobar_receta|rechazar_receta|eliminar_receta|eliminar_categoria|desactivar_ingrediente|solicitar_ingrediente|resolver_solicitud_ingrediente|asignar_imagen_receta|admin_editar_receta)(_internal)?$'
ORDER BY n.nspname, p.proname;

-- 3. RLS y grants de todas las tablas funcionales y Storage.
SELECT n.nspname AS esquema, c.relname AS tabla,
       c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
       pg_get_userbyid(c.relowner) AS propietario,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname = 'public' AND c.relname IN (
  'profiles', 'recetas', 'receta_versiones', 'categorias', 'ingredientes',
  'receta_categorias', 'receta_ingredientes', 'receta_pasos', 'solicitudes_ingredientes'
)) OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
ORDER BY n.nspname, c.relname;

-- Las políticas permisivas se combinan por OR: revisar TODAS, no solo la 15.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN (
  'profiles', 'recetas', 'receta_versiones', 'categorias', 'ingredientes',
  'receta_categorias', 'receta_ingredientes', 'receta_pasos', 'solicitudes_ingredientes'
)) OR (schemaname = 'storage' AND tablename IN ('objects', 'buckets'))
ORDER BY schemaname, tablename, policyname;

-- 4. Columnas/tipos, incluidos bigint, cantidades y fechas de solicitudes.
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN (
  'profiles', 'recetas', 'receta_versiones', 'categorias', 'ingredientes',
  'receta_categorias', 'receta_ingredientes', 'receta_pasos', 'solicitudes_ingredientes'
)
ORDER BY table_name, ordinal_position;

SELECT c.relname AS tabla, con.conname, pg_get_constraintdef(con.oid) AS definicion
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'profiles', 'recetas', 'receta_versiones', 'categorias', 'ingredientes',
  'receta_categorias', 'receta_ingredientes', 'receta_pasos', 'solicitudes_ingredientes'
)
ORDER BY c.relname, con.conname;

SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN (
  'profiles', 'recetas', 'receta_versiones', 'categorias', 'ingredientes',
  'receta_categorias', 'receta_ingredientes', 'receta_pasos', 'solicitudes_ingredientes'
) ORDER BY tablename, indexname;

-- 5. Permisos de columna: importantes para que profiles.rol no sea autoeditable.
SELECT a.attname AS columna,
       has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT') AS auth_insert,
       has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE') AS auth_update
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public' AND c.relname = 'profiles'
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;

-- 6. No se consultan claves ni credenciales.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'recetas-imagenes';
