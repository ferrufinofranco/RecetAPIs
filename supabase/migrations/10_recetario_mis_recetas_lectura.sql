-- RECETARIO COLABORATIVO - ETAPA 10: lectura de "Mis recetas"
-- Requisitos previos: esquema inicial, lectura publica (02),
-- y alta de recetas (09). Compatible con los nombres de tablas migrados (06).
-- Ejecutar desde Supabase > SQL Editor.
--
-- Objetivo: que un usuario autenticado pueda ver sus propias recetas
-- y TODAS sus versiones, incluso pendientes/rechazadas. No modifica
-- la lectura publica, NO habilita INSERT/UPDATE/DELETE ni muestra
-- propuestas privadas de otros autores.
-- Reejecutable: DROP POLICY IF EXISTS + CREATE POLICY.

BEGIN;

ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_versiones ENABLE ROW LEVEL SECURITY;

-- Las tablas ya tienen estos GRANT desde la etapa de catalogo (02),
-- pero se reiteran para que esta funcionalidad funcione con ese esquema.
GRANT SELECT ON TABLE public.recetas, public.receta_versiones TO authenticated;

-- El autor puede listar sus recetas NO eliminadas, aunque aun
-- no exista una version publicada.
DROP POLICY IF EXISTS "Autor: leer mis recetas" ON public.recetas;
CREATE POLICY "Autor: leer mis recetas"
ON public.recetas
FOR SELECT TO authenticated
USING (
    autor_id = (SELECT auth.uid())
    AND eliminada_en IS NULL
);

-- El autor puede ver sus propias versiones (publicadas, pendientes,
-- rechazadas y anteriores). La version publica de cualquier otra
-- receta sigue siendo accesible por la politica del catalogo existente.
DROP POLICY IF EXISTS "Autor: leer mis versiones" ON public.receta_versiones;
CREATE POLICY "Autor: leer mis versiones"
ON public.receta_versiones
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.recetas r
        WHERE r.id = receta_id
          AND r.autor_id = (SELECT auth.uid())
          AND r.eliminada_en IS NULL
    )
);

COMMIT;

-- Verificacion de las politicas (NO sustituye las pruebas REST con JWT).
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('recetas', 'receta_versiones')
ORDER BY tablename, policyname;
