-- RECETARIO - Etapa 2: lectura publica del catalogo
-- Ejecutar en Supabase SQL Editor despues de recetario_supabase_esquema.sql.
-- No habilita escrituras desde la API. Es idempotente.

begin;

-- Seguridad: eliminamos permisos que algunos proyectos otorgan por defecto
-- y luego devolvemos solo las lecturas que necesita el catalogo.
revoke all on table
    public.profiles,
    public.recetas,
    public.receta_versiones,
    public.categorias,
    public.version_categorias,
    public.ingredientes,
    public.version_ingredientes,
    public.version_pasos,
    public.solicitudes_ingredientes
from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.categorias, public.ingredientes,
    public.recetas, public.receta_versiones, public.version_categorias,
    public.version_ingredientes, public.version_pasos
    to anon, authenticated;

-- Función limitada a responder si una receta tiene versión publicada
-- y no fue dada de baja. SECURITY DEFINER evita referencias circulares
-- entre las políticas de recetas y receta_versiones.
create or replace function public.receta_visible_en_catalogo(p_receta_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.recetas r
        join public.receta_versiones v on v.receta_id = r.id
        where r.id = p_receta_id
          and r.eliminada_en is null
          and v.estado = 'publicada'
    );
$$;

revoke all on function public.receta_visible_en_catalogo(bigint)
    from public, anon, authenticated;
grant execute on function public.receta_visible_en_catalogo(bigint)
    to anon, authenticated;

-- Aseguramos RLS en todas las tablas involucradas.
alter table public.recetas enable row level security;
alter table public.receta_versiones enable row level security;
alter table public.version_categorias enable row level security;
alter table public.version_ingredientes enable row level security;
alter table public.version_pasos enable row level security;

drop policy if exists "Catalogo: recetas publicadas" on public.recetas;
create policy "Catalogo: recetas publicadas"
    on public.recetas for select to anon, authenticated
    using (public.receta_visible_en_catalogo(id));

drop policy if exists "Catalogo: versiones publicadas" on public.receta_versiones;
create policy "Catalogo: versiones publicadas"
    on public.receta_versiones for select to anon, authenticated
    using (
        estado = 'publicada'
        and public.receta_visible_en_catalogo(receta_id)
    );

-- Las tablas hijas solo se ven para versiones publicadas visibles.
-- Al consultar receta_versiones, su propia RLS aplica los controles de baja.
drop policy if exists "Catalogo: categorias de versiones publicadas" on public.version_categorias;
create policy "Catalogo: categorias de versiones publicadas"
    on public.version_categorias for select to anon, authenticated
    using (
        exists (
            select 1 from public.receta_versiones v
            where v.id = version_id and v.estado = 'publicada'
        )
    );

drop policy if exists "Catalogo: ingredientes de versiones publicadas" on public.version_ingredientes;
create policy "Catalogo: ingredientes de versiones publicadas"
    on public.version_ingredientes for select to anon, authenticated
    using (
        exists (
            select 1 from public.receta_versiones v
            where v.id = version_id and v.estado = 'publicada'
        )
    );

drop policy if exists "Catalogo: pasos de versiones publicadas" on public.version_pasos;
create policy "Catalogo: pasos de versiones publicadas"
    on public.version_pasos for select to anon, authenticated
    using (
        exists (
            select 1 from public.receta_versiones v
            where v.id = version_id and v.estado = 'publicada'
        )
    );

commit;

-- Verificación de políticas existentes.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('recetas', 'receta_versiones', 'version_categorias',
                    'version_ingredientes', 'version_pasos')
order by tablename, policyname;
