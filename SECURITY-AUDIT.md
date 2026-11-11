# Auditoría de seguridad — KULTO STORE

## Estado de las mitigaciones desplegadas

- Validación de entradas, errores genéricos, cabeceras HTTP, respuestas sin caché y tiempos máximos de espera en APIs: incorporados y probados en fases anteriores.
- El fallback que guardaba contraseñas sin hash cuando fallaba Web Crypto se eliminó en la fase 12.
- En esta tanda se añade escape de HTML en los correos construidos en el navegador, códigos de verificación con generador criptográfico, rechazo de registros nuevos con la dirección administrativa reservada, sustitución del PIN fijo de borrado por confirmación explícita y rechazo de resultados IA incompletos.
- **Estas medidas son parciales. No constituyen autenticación de servidor ni protegen por sí solas los datos de Supabase.** La confirmación de borrado solo protege de clics accidentales, no autoriza la operación.

## Riesgos críticos sin resolver

1. **RLS y Storage de producción no verificados:** el cliente accede a la tabla `public.kulto_kv` y al bucket `kulto-photos` con una clave pública. Si las políticas de producción permiten escritura anónima, se pueden alterar cuentas, pedidos, precios y fotografías sin pasar por la interfaz. Revisar el proyecto real con `security/supabase-readonly-audit.sql`.
2. **Autorización administrativa:** la interfaz sigue basándose en email / `adminPermissions` del registro cliente. Se requiere rol y verificación de sesión en el servidor, con permisos que no pueda modificar un cliente.
3. **Contraseñas y recuperación:** los hashes SHA-256 sin sal y los códigos de recuperación actuales residen en la KV, potencialmente legibles. El generador criptográfico no corrige este defecto de almacenamiento. Migrar a Supabase Auth con recuperación segura de cuentas, sin perder históricos.
4. **Pedidos:** la KV admite, según permisos reales, creación, modificación y borrado desde el navegador. El servidor debe calcular precios, descuentos, puntos, envío, stock y totales a partir de un catálogo autorizado. No se debe aceptar un total indicado por el cliente.
5. **Endpoints de correo/IA:** aún reciben solicitudes sin autorización fuerte y pueden consumir cuota del proveedor. Requieren autorización de evento y rate-limiting duradero.
6. **Ambiente de pruebas:** solo hay secretos/variables de Supabase de producción; faltan un entorno aislado y copia de seguridad verificada.

## Orden seguro de migración

1. Conectar Supabase y **auditar solo lectura** las políticas, roles, claves y tablas reales; no mostrar datos personales en el informe.
2. Crear backup/restauración comprobados y un entorno de pruebas con configuración equivalente.
3. Preparar tablas privadas/perfiles y roles autorizados en servidor; habilitar Supabase Auth y migración de clientes sin borrar datos.
4. Implementar una API de checkout que valide precios, stock, descuentos y permisos del servidor con pruebas de compra invitada y registrada.
5. Mover el envío de correo a eventos autorizados, introducir rate-limiting duradero, restringir subida/borrado de archivos.
6. En una ventana controlada y con reversión preparada, aplicar RLS de mínimo privilegio y desactivar escrituras públicas. Verificar que cliente A no pueda leer/modificar pedidos de cliente B y que la tienda continúa vendiendo.

**Nunca ejecutar revocaciones de RLS ni migraciones destructivas a ciegas sobre producción.** El archivo `SECURITY-MIGRATION.md` complementa este plan.
