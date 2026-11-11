-- KULTO STORE — auditoría de seguridad SOLO LECTURA (fase 10).
-- Ejecutar en SQL Editor de Supabase con un usuario autorizado.
-- No contiene INSERT, UPDATE, DELETE, ALTER, DROP ni cambios de políticas.
-- No copiar aquí claves, contraseñas, correos ni datos personales.
-- Compartir únicamente resultados de políticas, permisos y recuentos agregados.

-- 1. ¿Está activada RLS y se fuerza para propietarios?
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where (n.nspname = 'public' and c.relname = 'kulto_kv')
   or (n.nspname = 'storage' and c.relname = 'objects')
order by 1, 2;

-- 2. Políticas efectivas sobre la tabla KV y objetos de Storage.
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual as using_expression, with_check as insert_update_expression
from pg_policies
where (schemaname = 'public' and tablename = 'kulto_kv')
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 3. Privilegios concedidos a roles expuestos por la API.
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where ((table_schema = 'public' and table_name = 'kulto_kv')
    or (table_schema = 'storage' and table_name = 'objects'))
  and grantee in ('anon', 'authenticated', 'public')
order by table_schema, table_name, grantee, privilege_type;

-- 4. Configuración del bucket (sin enumerar nombres de archivos).
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'kulto-photos';

-- 5. Solo cantidades agregadas: nunca devolver los valores ni claves.
select
  count(*) as total_rows,
  count(*) filter (where key like 'kulto:customer:%') as customer_rows,
  count(*) filter (where key like 'kulto:order:%') as order_rows,
  count(*) filter (where key like 'kulto:product:%') as product_rows
from public.kulto_kv;

-- 6. Recuento de objetos en el bucket, sin mostrar rutas.
select count(*) as photo_objects
from storage.objects
where bucket_id = 'kulto-photos';
