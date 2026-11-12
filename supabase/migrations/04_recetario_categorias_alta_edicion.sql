-- RECETARIO COLABORATIVO
-- Etapa 4A: permitir a administradores crear y renombrar categorias via REST.
-- Requiere los scripts 01 (esquema inicial) y 02 (lectura publica).
-- NO activa eliminacion de categorias. Esa operacion se implementara
-- posteriormente junto con la reasignacion de etiquetas a General.
-- Ejecutar una unica vez (o repetir: es idempotente) desde Supabase SQL Editor.

begin;

alter table public.categorias enable row level security;

-- Mantener lectura publica de categorias activas (ya implementada).
-- Dar SOLO a usuarios autenticados permiso para escribir el campo nombre.
-- La columna activa NO puede cambiarse desde la Data API en esta etapa.
grant select on table public.categorias to anon, authenticated;
grant insert (nombre), update (nombre) on table public.categorias to authenticated;

-- Necesario para que el INSERT pueda usar el ID autoincremental.
grant usage, select on sequence public.categorias_id_seq to authenticated;

-- Crear una categoria nueva. El rol se verifica en la BD, no en la interfaz.
drop policy if exists "Admin crea categorias" on public.categorias;
create policy "Admin crea categorias"
on public.categorias
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.rol = 'admin'
    )
    and activa = true
    and lower(btrim(nombre)) <> 'general'
);

-- Modificar el nombre de una categoria existente.
-- Se impide renombrar la categoria protegida General.
drop policy if exists "Admin renombra categorias" on public.categorias;
create policy "Admin renombra categorias"
on public.categorias
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.rol = 'admin'
    )
    and lower(btrim(nombre)) <> 'general'
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.rol = 'admin'
    )
    and lower(btrim(nombre)) <> 'general'
);

commit;

-- La politica existente "Leer categorias activas" sigue vigente.
-- El indice categorias_nombre_unico del esquema original evita duplicados
-- ignorando diferencias de mayusculas y espacios laterales.
-- NOTA: ejecutar como postgres en SQL Editor NO verifica RLS; probar altas y
-- cambios usando la app con usuarios admin y usuario normal.
