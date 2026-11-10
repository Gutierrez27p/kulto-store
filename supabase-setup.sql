-- KULTO STORE — configuración segura para una instalación nueva.
-- NO EJECUTAR EN PRODUCCIÓN ACTUAL sin migrar primero el frontend y los pedidos.
-- Este archivo no abre políticas públicas de escritura, actualización o borrado.
-- Las cuentas y pedidos existentes requieren un plan de migración y respaldo.
--
-- IMPORTANTE: CREATE TABLE IF NOT EXISTS y ENABLE RLS NO eliminan políticas
-- permisivas ya existentes. Para corregir una instalación actual, revisar
-- primero las políticas desplegadas y seguir SECURITY-MIGRATION.md.

create table if not exists public.kulto_kv (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

alter table public.kulto_kv enable row level security;

-- No se conceden políticas públicas: se deniega por defecto.
-- La migración futura deberá crear políticas por operación y rol.
-- No usar 'using (true)' para INSERT, UPDATE o DELETE desde anon.

insert into storage.buckets (id, name, public)
values ('kulto-photos', 'kulto-photos', true)
on conflict (id) do nothing;

-- Bucket público únicamente para lectura de archivos publicados.
-- No se habilitan cargas, modificaciones ni borrados anónimos.
-- El frontend actual necesita una migración antes de activar este esquema.
