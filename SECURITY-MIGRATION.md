# Migración de seguridad — KULTO STORE

## Estado y riesgo

El frontend actual usa `kulto_kv` para catálogo, cuentas, sesiones y pedidos. No es seguro cerrar las políticas anónimas de golpe: rompería la tienda. **Este documento no implica que se haya accedido al proyecto Supabase ni que las políticas estén corregidas.**

## 1. Inspección de solo lectura (SQL Editor de Supabase)

**Script reproducible:** `security/supabase-readonly-audit.sql`. Incluye estado de RLS, políticas, privilegios de roles API, configuración del bucket y recuentos agregados. Ejecutarlo manualmente en el proyecto correcto y revisar los resultados antes de diseñar cambios. El script no modifica datos ni permisos.

**Atención:** las políticas actuales de producción no han sido inspeccionadas desde este repositorio. No publicar migraciones basadas en supuestos.

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename = 'kulto_kv')
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select
  count(*) filter (where key like 'kulto:customer:%') as customers,
  count(*) filter (where key like 'kulto:order:%') as orders,
  count(*) filter (where key like 'kulto:product:%') as products,
  count(*) as total
from public.kulto_kv;
```

Los conteos no revelan datos personales. Hacer backup de la tabla y del bucket `kulto-photos` antes de cualquier migración.

## 2. Migración que falta implementar y probar

1. Configurar Supabase Auth, confirmar correos y recuperación de contraseña.
2. Crear perfiles/roles administrados exclusivamente en servidor (nunca basados en email introducido desde el navegador).
3. Migrar clientes sin eliminar registros existentes. Los hashes SHA-256 antiguos **no se pueden importar como contraseñas válidas de Supabase Auth**: los clientes deberán restablecer contraseña o seguir un proceso seguro de transición.
4. Pasar creación de pedidos y cálculo de totales/stock a una función de servidor autenticada o con validación antifraude; no aceptar precios del navegador.
5. Separar catálogo público de pedidos y datos privados, con RLS granular y pruebas para usuario anónimo, cliente y administrador.
6. Limitar correos a plantillas/eventos permitidos, verificar permisos del solicitante, y añadir límites de uso.
7. Mover cargas de imágenes a un endpoint o políticas con autorización y validación de tamaño/tipo.
8. Solo entonces retirar políticas `public write`, `public update`, `public delete` y equivalentes en Storage.

## 3. Criterios de publicación

- Compra invitada y registrada funcionan en entorno de pruebas.
- El cliente A no puede leer ni modificar pedidos del cliente B.
- Una persona anónima no puede alterar precios, stock, pedidos, usuarios ni archivos.
- Solo un administrador autenticado puede acceder a operaciones administrativas.
- Copia de seguridad comprobada y plan de reversión preparado.
- `npm test` y `npm run build` correctos.

**No ejecutar automáticamente SQL destructivo o revocaciones en la base de datos de producción.**
