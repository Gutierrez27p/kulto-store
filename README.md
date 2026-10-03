# Kulto — guía para publicar la web

Este proyecto ya trae todo el código de la tienda. Te faltan tres cosas, todas gratis
para empezar: conectar una base de datos, subir el código a internet, y (opcional)
conectar tu propio dominio.

Tiempo estimado: 30–45 minutos la primera vez.

---

## Paso 1 — Crear la base de datos (Supabase, gratis)

1. Entra a **supabase.com** y crea una cuenta (con tu email o con GitHub).
2. Crea un proyecto nuevo. Elegí una contraseña de base de datos y guárdala en un
   lugar seguro (no la vas a necesitar para lo siguiente, pero por si acaso).
3. Una vez creado, andá a **SQL Editor** (menú de la izquierda) → **New query**.
4. Abrí el archivo `supabase-setup.sql` de esta carpeta, copiá todo el contenido,
   pegalo ahí, y tocá **Run**. Esto crea la tabla donde se van a guardar tus
   productos, pedidos y configuración.
5. Andá a **Project Settings → API**. Ahí vas a ver dos datos que necesitás:
   - **Project URL**
   - **anon public key**

Guardalos, los usás en el paso siguiente.

---

## Paso 2 — Configurar el proyecto en tu computadora

Necesitás tener [Node.js](https://nodejs.org) instalado (versión 18 o más nueva).

1. Descomprimí esta carpeta del proyecto donde quieras.
2. Abrí una terminal dentro de esa carpeta.
3. Copiá el archivo `.env.example` y renombralo a `.env`.
4. Abrí `.env` y pegá ahí los dos datos de Supabase del paso anterior:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-clave-anon
   ```
5. Instalá las dependencias:
   ```
   npm install
   ```
6. Probá que funcione en tu computadora:
   ```
   npm run dev
   ```
   Te va a dar un link tipo `http://localhost:5173` — abrilo en el navegador.
   Deberías ver la web de Kulto funcionando, ya conectada a tu base de datos real.

Entrá a "Mi cuenta" y registrate con el mail `admin@kulto.com` (el mail de
administrador que viene configurado por defecto) y la contraseña que quieras.
Como es ese mail, en vez de la cuenta de cliente vas a ver directo el panel de
administrador ahí mismo — cargá tu primer producto para confirmar que todo se
guarda bien.

**Importante:** antes de publicarlo, cambiá ese mail por el tuyo. Está en
`src/App.jsx`, en la línea que dice `const ADMIN_EMAIL = "admin@kulto.com"`.
Cambialo por tu propio mail (por ejemplo el tuyo real) y volvé a registrarte
con ese mail nuevo — ese va a ser desde ahora el único mail que abre el panel
de administrador. Cualquier otra persona que se registre en "Mi cuenta" solo
va a ver la cuenta de cliente normal.

---

## Paso 3 — Subir el código a GitHub

Vercel (el siguiente paso) se conecta a GitHub para publicar el sitio.

1. Creá una cuenta en **github.com** si no tenés.
2. Creá un repositorio nuevo (podés dejarlo privado).
3. Subí el código de esta carpeta a ese repositorio. Si nunca usaste git, la forma
   más simple es con GitHub Desktop (**desktop.github.com**): lo instalás, le decís
   "Add local repository", elegís esta carpeta, y tocás "Publish repository".

---

## Paso 4 — Publicar con Vercel (gratis)

1. Entra a **vercel.com** y creá una cuenta con tu GitHub.
2. Tocá **Add New → Project** y elegí el repositorio que acabás de subir.
3. Antes de darle a "Deploy", abrí **Environment Variables** y agregá las dos
   mismas variables de tu `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Tocá **Deploy**. En un par de minutos te da un link tipo
   `kulto.vercel.app` — esa ya es tu web pública, funcionando de verdad.

Cada vez que subas un cambio al repositorio de GitHub, Vercel vuelve a publicar
la web sola.

---

## Paso 4.5 — Activar el autocompletado con IA (opcional)

En el panel de administrador, al subir fotos de un producto nuevo, hay un botón
"Rellenar con IA" que sugiere el nombre, la categoría y una descripción a partir
de la primera foto. Es opcional — si no lo configurás, todo lo demás de la web
funciona igual, simplemente ese botón muestra un aviso de que falta activarlo.

1. Entra a **console.anthropic.com** y creá una cuenta si no tenés.
2. Generá una API key (sección **API Keys**). Cargá algo de crédito — es un
   servicio pago, pero cada foto analizada cuesta una fracción de centavo.
3. En Vercel, andá a tu proyecto → **Settings → Environment Variables** y
   agregá una nueva variable:
   - Nombre: `ANTHROPIC_API_KEY`
   - Valor: la clave que generaste
   - **Importante:** a diferencia de las variables de Supabase, esta **no**
     lleva el prefijo `VITE_` — así se queda solo en el servidor y nunca se
     expone en el navegador.
4. Volvé a publicar el proyecto (Vercel → Deployments → ⋯ → Redeploy) para que
   tome la nueva variable.

Este botón solo funciona una vez que publiques el sitio en Vercel (paso
siguiente) — el servidor que lo procesa no corre con `npm run dev` en tu
computadora. Mientras tanto, podés seguir cargando productos escribiendo el
nombre y la categoría a mano con toda normalidad.

---

## Paso 4.6 — Activar los mails (confirmar cuenta y avisar compras) (opcional pero recomendado)

Sin esto, la web funciona igual: los clientes pueden crear cuenta y comprar
sin problema. Lo único que cambia es que no reciben el mail con el código
para confirmar su cuenta, ni el mail de "gracias por tu compra" — y como
todavía no confirmaron el mail, no pueden terminar de loguearse hasta que lo
actives (o hasta que reenvíes el código a mano).

1. Entrá a **resend.com** y creá una cuenta gratis (el plan gratis alcanza
   para 3.000 mails por mes).
2. Generá una API key (sección **API Keys** → **Create API Key**).
3. En Vercel, andá a tu proyecto → **Settings → Environment Variables** y
   agregá:
   - Nombre: `RESEND_API_KEY`
   - Valor: la clave que generaste
   - **Importante:** sin el prefijo `VITE_`, para que quede solo en el
     servidor.
4. (Opcional) Si más adelante verificás tu propio dominio en Resend
   (**Domains → Add Domain**), agregá también `RESEND_FROM_EMAIL` con algo
   como `Kulto <pedidos@tudominio.com>`. Hasta entonces, los mails salen
   desde una dirección de prueba de Resend — funciona, pero puede caer en la
   carpeta de spam del cliente.
5. Volvé a publicar el proyecto (Vercel → Deployments → ⋯ → Redeploy).

Igual que el botón de IA, esto solo funciona una vez publicado en Vercel —
no en `npm run dev` local.

## Paso 5 — Conectar tu propio dominio (opcional)

### Dónde comprarlo

Para un `.es` concretamente:
- **Namecheap** (recomendado): conocido, confiable, panel en español, buen soporte. Un `.es` ronda los 18€/año.
- **Sered** o **Hostinet** (alternativa): registradores españoles, bastante más baratos para `.es` (5€–7€/año) y con soporte en español, aunque el panel es un poco menos pulido que el de Namecheap.

No hace falta ser español ni tener NIF para registrar un `.es` — eso se exigía antes, ya no. Evitá GoDaddy si podés: es más caro para renovar y empuja mucho "extras" pagos al comprar.

### Cómo comprarlo

1. Entrá al sitio del registrador que elijas, buscá `kulto-store.es` y comprobá que esté libre.
2. Agregalo al carrito. Te van a ofrecer extras (protección de privacidad WHOIS, hosting, mail) — para esto no hace falta nada de eso, solo el dominio pelado (la privacidad WHOIS sí está bien tenerla si es gratis o muy barata).
3. Pagá y listo, ya es tuyo.

### Cómo conectarlo en Vercel

1. En Vercel, andá a tu proyecto → **Settings → Domains** → escribí `kulto-store.es` → **Add**.
2. Vercel te va a mostrar uno o dos registros DNS (normalmente un registro **A** apuntando a una IP, y un **CNAME** para la versión `www`).
3. Andá al panel de tu registrador → la sección de **DNS** (a veces se llama "Zona DNS" o "Administrar DNS") de `kulto-store.es` → agregá ahí los registros que te mostró Vercel, tal cual (copiar y pegar).
4. Esperá un rato — a veces son minutos, a veces unas horas (nunca más de 24–48h) — y listo, tu dominio va a apuntar directo a la web. Vercel también te genera el candado HTTPS automáticamente, sin que tengas que hacer nada más.

---

## Paso 6 — Instalar la web como app en el celular (PWA)

La web ya está armada para que cualquiera pueda "instalarla" en su celular como si fuera una app, sin pasar por Google Play ni la App Store:

- **Android/Chrome:** al entrar a la web aparece un cartel amarillo arriba con un botón "Instalar" que hace todo solo.
- **iPhone/iPad (Safari):** ahí Apple no deja que las webs se instalen solas — aparece un cartel con instrucciones: tocar **Compartir** → **"Agregar a pantalla de inicio"**.

Una vez instalada, queda un ícono en la pantalla de inicio del celular y abre en pantalla completa, sin la barra del navegador. No hay nada que configurar de tu lado — ya viene activado en el proyecto (lo arma `vite-plugin-pwa` al compilar, ver `vite.config.js`).

Si más adelante querés que además aparezca en Google Play o en el App Store (una app "de verdad" en las tiendas), es un paso aparte y más grande: hay que crear cuentas de desarrollador (pagas: ~25 USD una vez en Google, ~99 USD por año en Apple) y pasar la revisión de cada tienda. Avisame cuando quieras ir por ese camino.

---

## Antes de anunciarlo al público, revisá esto

- [ ] Cambiaste el mail de administrador (`ADMIN_EMAIL` en `src/App.jsx`) por el tuyo, y te registraste en "Mi cuenta" con ese mail.
- [ ] Cargaste tus productos reales, con fotos, colores, stock y precios.
- [ ] Probaste hacer un pedido de prueba de punta a punta: agregar al carrito,
      completar el email y la dirección, y confirmar que el pedido te llega
      por mail y queda guardado en el panel ("Pedidos").
- [ ] Revisaste la pestaña "Envío" del panel de administrador con tus valores
      reales de costo de envío.
- [ ] Confirmaste el número de WhatsApp (`WHATSAPP_NUMBER` en `src/App.jsx`), que ahora es solo el canal de contacto opcional, no obligatorio para pedir.

## Una limitación para tener en cuenta

El panel de administrador se abre automáticamente cuando iniciás sesión en
"Mi cuenta" con el mail que pusiste en `ADMIN_EMAIL` — no hay una contraseña
maestra aparte de la que vos mismo elegiste al registrarte con ese mail. Es
simple y cómodo, pero solo hay una cuenta de administrador (no varios
usuarios con permisos distintos), y esa contraseña la protege igual que
cualquier contraseña de cliente de la tienda. Si más adelante el negocio
crece y querés algo más robusto (varios usuarios administradores, permisos
por rol, etc.), el siguiente paso natural es agregar autenticación de
Supabase. Cuando llegues a ese punto, decímelo y lo armamos juntos.
