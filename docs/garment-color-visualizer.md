# Visualizador de colores de prendas (fase 1)

Motor de recoloración independiente en `src/utils/garmentColor.js`.

## Requisitos de imágenes
- Foto base neutral, preferentemente gris claro, con iluminación uniforme.
- Máscara PNG RGBA del mismo tamaño: alpha 255 en **tela únicamente**, alpha 0 en fondo, etiquetas, piel y estampados DTF.
- En los bordes de la tela se permite alpha parcial para conservar antialiasing.
- Si el diseño está integrado en la foto, **excluirlo de la máscara**; si no hay máscara fiable, mostrar la foto original.
- Las prendas negras o muy oscuras pueden perder detalle al convertirse a colores claros. No prometer equivalencia fotográfica exacta.

## Integración pendiente
1. Conectar el canvas al selector de variantes de la ficha de producto.
2. Añadir campos optativos para foto base, máscara y activación en el editor administrativo y persistencia Supabase.
3. Mantener imagen original como fallback y guardar la variante de color elegida en carrito/pedido.
4. Probar fotos reales, carga cruzada CORS, navegadores móviles y rendimiento.
5. Desplegar únicamente después de pasar pruebas y revisión de la integración.

## Seguridad
El motor trabaja localmente en el navegador; no cambia productos, precios, pedidos ni base de datos.
