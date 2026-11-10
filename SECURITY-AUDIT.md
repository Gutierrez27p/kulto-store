# Auditoría de seguridad — fase 2

## Hallazgos confirmados en src/App.jsx
- Líneas 60-73 y 12066: ADMIN_EMAIL y ADMIN_PASSWORD están embebidos en el cliente. La contraseña de borrado no es secreta.
- Líneas 19929-19957: la cuenta ADMIN_EMAIL puede registrarse sin verificar el correo y obtiene acceso administrativo.
- Líneas 19194-19202: el rol se decide por correo o por adminPermissions del registro cliente, no por autorización del servidor.
- Líneas 2575-2586: SHA-256 sin salt para contraseñas; si falla WebCrypto se devuelve la contraseña en texto plano.
- Líneas 19910-20055: códigos de verificación y restablecimiento generados con Math.random, guardados y verificados en el navegador.
- Líneas 2928-2950: pedidos se crean, actualizan y eliminan mediante operaciones KV desde el navegador.
- Líneas 949-959: el cliente decide destinatario, asunto y HTML para el endpoint de correo.
- Líneas 689-885: interpolación directa de datos de usuarios en HTML de correos.

## Orden seguro de corrección
1. Copia de seguridad de kulto_kv y del bucket kulto-photos; verificar políticas RLS realmente desplegadas.
2. Migrar cuentas a Supabase Auth; asignar roles de administrador desde el servidor.
3. Separar datos públicos de privados y aplicar RLS específico; mover checkout invitado al servidor con validación de precios y stock.
4. Migrar verificación y recuperación de contraseña a Supabase Auth.
5. Restringir API de correo por evento, destinatario y tasa; generar HTML en servidor y escapar contenido.
6. Sustituir ADMIN_PASSWORD por reautenticación y autorización de borrado en servidor.

NO cerrar las escrituras públicas actuales antes de migrar checkout y administración: se romperían operaciones existentes. La fase 1 es parcial y no protege aún los datos ni los endpoints.

Pendiente: pruebas de checkout, registro, pedidos y panel; inspección de RLS en producción; build y pruebas en staging.
