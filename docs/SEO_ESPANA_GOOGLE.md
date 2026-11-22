# KULTO STORE — SEO España / Barcelona (22-11-2026)

## Estado comprobado en GitHub
- `index.html`: título, descripción, canonical, idioma es-ES, schema Organization/WebSite y GA4 `G-425Y2C0H8X`. Se ha ampliado el schema a OnlineStore con área de servicio España.
- `public/robots.txt`: permite el rastreo e indica `https://kulto-store.es/sitemap.xml`.
- `public/sitemap.xml`: SOLO contiene la URL de inicio. No afirmar que productos o categorías figuran en el sitemap.
- `src/App.jsx`: la conexión no devuelve contenido; NO se han modificado rutas, catálogo, productos, pedidos ni caja.

## Fase 1 — Páginas de catálogo: pendiente técnico, NO publicar enlaces inexistentes
1. Inspeccionar navegación real de la app y catálogo Supabase: nombres exactos de categorías, IDs y slugs estables.
2. Garantizar enlaces HTML rastreables desde categorías a productos; URL específica por categoría/producto que funcione al abrir directamente y al refrescar, con 200 real y 404 para inexistentes.
3. Servir HTML inicial con título, descripción, canonical y contenido particular de cada URL (prerender o SSR), no depender solo de un modal client-side.
4. Añadir Product + Offer JSON-LD solo con nombre, URL, imagen, precio EUR y disponibilidad que correspondan al producto real. No inventar reseñas, precio anterior, inventario, envío ni valoraciones.
5. Generar sitemap a partir exclusivamente de URLs públicas canónicas reales y activas. Actualizarlo cuando cambie el catálogo. Verificar 3-5 muestras en Search Console / Inspección de URL antes de solicitar indexación global.
6. Probar checkout, historial/modal de producto, versión móvil y enlaces sociales para evitar regresiones.

## Fase 2 — España y Barcelona
- Priorizar términos descriptivos que se correspondan con las prendas reales: ropa personalizada, camisetas estampadas, camisetas oversize, sudaderas personalizadas, streetwear.
- Usar "Barcelona" solo en páginas donde la relación local sea auténtica; NO afirmar tienda física, recogida ni entrega local sin verificar.
- Añadir descripciones originales útiles de familias y personalización; evitar repetir palabras clave artificialmente.

## Fase 3 — Google Merchant Center
- Abrir/confirmar Merchant Center y reivindicar dominio, configurar empresa, política de devoluciones y entrega a España.
- Generar feed de productos desde datos reales: id estable, title, description, link, image_link, price EUR, availability, brand, condition, shipping (si aplica), variantes correctamente.
- Validar destino del feed contra páginas de producto y términos comerciales antes de enviarlo. NO publicar feed ficticio.
- Revisar diagnósticos y elegibilidad de fichas gratuitas.

## Fase 4 — Medición
- Search Console: confirmar sitemap enviado, indexación, páginas excluidas, consultas/CTR por país España y por página.
- GA4: comprobar que la etiqueta carga con consentimiento adecuado y mide view_item, add_to_cart, begin_checkout y purchase sin duplicados ni datos sensibles.
- Revisar orgánico de España cada 28 días; comparar clics, impresiones, CTR, posición y ventas.

Referencias oficiales:
- https://developers.google.com/search/docs/specialty/ecommerce/
- https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure
- https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- https://support.google.com/merchants/answer/13889434?hl=es
