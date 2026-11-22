-- Aplicar manualmente después de las migraciones del recetario.
begin;

create table if not exists recetario_private.asistente_cuota_diaria (
    usuario_id uuid not null references auth.users(id) on delete cascade,
    fecha date not null,
    mensajes integer not null check (mensajes between 1 and 20),
    primary key (usuario_id, fecha)
);

alter table recetario_private.asistente_cuota_diaria enable row level security;
revoke all on table recetario_private.asistente_cuota_diaria from public, anon, authenticated;

create or replace function public.reservar_consulta_asistente()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    usuario uuid := auth.uid();
    hoy date := (pg_catalog.statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
    if usuario is null then
        raise exception 'Se requiere sesión' using errcode = '42501';
    end if;

    -- La clave primaria serializa las reservas del mismo usuario y día.
    insert into recetario_private.asistente_cuota_diaria as cuota (usuario_id, fecha, mensajes)
    values (usuario, hoy, 1)
    on conflict (usuario_id, fecha) do update
        set mensajes = cuota.mensajes + 1
        where cuota.mensajes < 20;

    return found;
end;
$$;

revoke all on function public.reservar_consulta_asistente() from public, anon, authenticated;
grant execute on function public.reservar_consulta_asistente() to authenticated;

commit;
