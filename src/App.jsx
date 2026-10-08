import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ShoppingBag, X, Menu, Plus, Minus, Trash2, Pencil, ChevronRight, ChevronLeft, ChevronDown,
  MessageCircle, Lock, Check, Shirt, Upload, Package, Star, Sparkles, ArrowRight,
  LogOut, Loader2, ZoomIn, ZoomOut, ArrowUp, ArrowDown, Quote, Instagram, Search, Heart, GripVertical, Info,
  Sun, Moon, RotateCw, Facebook, Music2, Mail, Phone, MapPin, HelpCircle, SlidersHorizontal, RotateCcw,
  LayoutGrid, Eye, EyeOff, TrendingUp, UserPlus, KeyRound, Boxes, FolderPlus, ArrowLeft, Move, WifiOff, Download, BarChart3, Gift, Copy, Zap
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/*  Supabase client                                                    */
/*  Reads the project URL and public anon key from environment        */
/*  variables you set in .env (see .env.example and the README).       */
/* ------------------------------------------------------------------ */

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Al abrir la web se piden muchas cosas a la vez (productos, categorías,
// ajustes, diseños, trabajos personalizados...), y varias de esas consultas
// son pesadas porque las fotos se guardan completas adentro de cada fila. Si
// todas viajan al mismo tiempo se pelean por los mismos recursos de la base
// y terminan canceladas por tardar demasiado ("statement timeout", error
// 57014) — eso es lo que hacía "desaparecer" productos y diseños enteros.
// Esta cola limita cuántas lecturas viajan en simultáneo (nunca todas juntas),
// para que ninguna pesada se pise con otras.
// Ahora que las fotos viven como archivos aparte (cada fila es liviana), se
// permiten varias lecturas a la vez (hasta 6) en vez de una sola: antes cada
// consulta esperaba a la anterior, y con ~100 consultas en una conexión
// lejana (ej: desde Argentina) la suma de esperas hacía tardar la carga o
// llegar al tiempo límite.
const KV_MAX_PARALLEL = 6;
let kvActive = 0;
const kvWaiting = [];
function kvNext() {
  while (kvActive < KV_MAX_PARALLEL && kvWaiting.length) {
    const { fn, resolve, reject } = kvWaiting.shift();
    kvActive++;
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { kvActive--; kvNext(); });
  }
}
function queueKvRead(fn) {
  return new Promise((resolve, reject) => {
    kvWaiting.push({ fn, resolve, reject });
    kvNext();
  });
}

/* ------------------------------------------------------------------ */
/*  Config & helpers                                                   */
/* ------------------------------------------------------------------ */

// El número de WhatsApp de la tienda ya no se fija acá en el código: se
// carga desde el panel en Ajustes → Marca (ver settings.whatsappNumber más
// abajo), así el dueño lo puede cambiar él mismo cuando quiera.
const INSTAGRAM_URL = "https://www.instagram.com/kulto25";
// Este es el mail de tu cuenta de administrador. Registrate (o iniciá
// sesión) en "Mi cuenta" con este mail exacto y vas a ver el panel de
// administrador ahí mismo, en vez de la cuenta de cliente normal — no hace
// falta ninguna contraseña ni pantalla aparte. Cambialo por tu propio mail
// antes de publicar la web (ver el README).
const ADMIN_EMAIL = "admin@kulto.com";
// admin@kulto.com es solo el usuario para entrar al panel — no es un buzón
// real que alguien revise. Cualquier mail que el sistema le mande a esa
// dirección (código de verificación, recuperar contraseña, etc.) se manda en
// realidad acá, a la casilla de verdad del dueño. Ver sendEmail() más abajo.
const ADMIN_NOTIFICATION_EMAIL = "pablo.gutcha@gmail.com";
// Usada solo como confirmación extra antes de borrar pedidos en el panel de
// administrador — no tiene relación con el acceso al panel en sí.
const ADMIN_PASSWORD = "kulto2024";
// Secciones del panel de administrador que se le pueden dar (o no) a una
// cuenta de "admin con permisos limitados" — ver AdminCustomers y
// handleSetAdminPermissions. El dueño (ADMIN_EMAIL) siempre las tiene todas.
const ADMIN_TABS = [
  ["productos", "Productos"],
  ["personalizar", "Personalizar"],
  ["pedidos", "Pedidos"],
  ["ventas", "Ventas"],
  ["estadisticas", "Estadísticas"],
  ["compras", "Compras"],
  ["clientes", "Clientes"],
  ["resenas", "Reseñas"],
  ["contacto", "Contacto"],
  ["beneficios", "Beneficios"],
  ["ajustes", "Ajustes"],
];
const ADMIN_TAB_KEYS = ADMIN_TABS.map(([key]) => key);
const ADMIN_TAB_META = {
  productos: { icon: Shirt, hint: "Fotos, precios y stock" },
  personalizar: { icon: Sparkles, hint: "Banners, colores y textos" },
  pedidos: { icon: Package, hint: "Pedidos que llegan" },
  ventas: { icon: TrendingUp, hint: "Ofertas y ventas" },
  estadisticas: { icon: BarChart3, hint: "Visitas y números" },
  compras: { icon: ShoppingBag, hint: "Reponer mercadería" },
  clientes: { icon: UserPlus, hint: "Cuentas y puntos" },
  resenas: { icon: Star, hint: "Opiniones de clientes" },
  contacto: { icon: Mail, hint: "Mensajes recibidos" },
  beneficios: { icon: Gift, hint: "Recompensas y códigos" },
  ajustes: { icon: SlidersHorizontal, hint: "Envíos, pagos, marca" },
};
const DEFAULT_CATEGORIES = [
  "Camisetas",
  "Sudaderas con capucha",
  "Sudaderas sin capucha",
  "Tops deportivos",
  "Llaveros y lanyards",
];

const DEFAULT_GROUPS = [];

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Código corto para usar como referencia del producto (en vez del id interno,
// largo y sin sentido para nadie) — ej: "BEAGLE-001", "OVERSIZE-002". Se arma
// con la primera palabra del nombre + un número que solo se repite si ya hay
// otro producto con esa misma palabra inicial (ej: "Oversize Negra" y
// "Oversize Blanca" comparten familia pero se numeran distinto).
function generateSku(name, existingProducts = []) {
  const base = (name || "PROD")
    .trim()
    .split(/\s+/)[0]
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12) || "PROD";
  const used = new Set(existingProducts.map((p) => p.sku).filter(Boolean));
  let n = 1;
  let candidate = `${base}-${String(n).padStart(3, "0")}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${base}-${String(n).padStart(3, "0")}`;
  }
  return candidate;
}

// "En tendencia" automático: puntúa cada producto vendible combinando ventas
// (peso fuerte, es la señal más confiable) y vistas (peso liviano), y devuelve
// los ids de los que más puntaje sacan. Esto se suma —nunca reemplaza— a lo
// que el admin ya marcó a mano con el tilde "Tendencia" de cada prenda (ver
// Home y AdminSalesPanel). No escribe nada en el producto: se recalcula al
// vuelo con los datos que ya hay, así siempre está al día.
// "Más vendidos" automático: igual que el de tendencia pero mirando SOLO las
// ventas reales (salesCount). Se juntan las ventas por diseño (un mismo diseño
// en varias prendas cuenta junto, y en Inicio se muestra una sola tarjeta) y
// se eligen los N diseños que más vendieron. Se suma a lo que el admin ya
// marcó a mano con "Más vendido" — nunca lo reemplaza.
function computeBestsellerIds(products, settings) {
  if (!settings?.bestsellerAutoEnabled) return new Set();
  const byDesign = new Map();
  (products || [])
    .filter((p) => !p.tags?.template)
    .forEach((p) => {
      const key = p.designGroup || p.id;
      const entry = byDesign.get(key) || { ids: [], sales: 0 };
      entry.ids.push(p.id);
      entry.sales += p.salesCount || 0;
      byDesign.set(key, entry);
    });
  const ranked = [...byDesign.values()]
    .filter((e) => e.sales > 0)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, settings?.bestsellerAutoCount ?? 8);
  return new Set(ranked.flatMap((e) => e.ids));
}

function computeTrendingIds(products, settings) {
  if (!settings?.trendingAutoEnabled) return new Set();
  // Un mismo diseño puede estar en varias prendas (mismo designGroup) y en
  // Inicio se muestra una sola tarjeta por diseño — por eso el puntaje se
  // junta por diseño y se eligen los N diseños con más puntos. Si no, los N
  // primeros podían ser el mismo diseño en N prendas y quedaba solo 1.
  const byDesign = new Map();
  (products || [])
    .filter((p) => !p.tags?.template)
    .forEach((p) => {
      const key = p.designGroup || p.id;
      const entry = byDesign.get(key) || { ids: [], score: 0 };
      entry.ids.push(p.id);
      entry.score += (p.salesCount || 0) * 3 + (p.viewsCount || 0);
      byDesign.set(key, entry);
    });
  const ranked = [...byDesign.values()]
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, settings?.trendingAutoCount ?? 8);
  return new Set(ranked.flatMap((e) => e.ids));
}

// ---------------------------------------------------------------------------
// Pedidos de entrega personal (los que entrega el dueño en persona): los que
// eligen "Recoger en persona" y los de envío a Barcelona y alrededores. A esos
// el cliente los sigue con una barra de etapas (globos) que confirma el dueño
// a mano; el resto de los envíos sigue con el link de seguimiento de siempre.
// ---------------------------------------------------------------------------
const LOCAL_ORDER_STEPS = [
  { key: "realizado", label: "Pedido realizado" },
  { key: "procesando", label: "Procesando su pedido" },
  { key: "terminado", label: "Pedido terminado" },
  { key: "entregado", label: "Pedido entregado" },
];
const DEFAULT_LOCAL_AREAS = ["Barcelona", "Sants", "L'Hospitalet", "Barberà del Vallès", "Montgat", "Badalona"];
function normalizePlace(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
function isLocalOrder(order, settings) {
  if (!order) return false;
  if (typeof order.localTracking === "boolean") return order.localTracking;
  if (order.deliveryMethod !== "envio") return true;
  const city = normalizePlace(order.address?.city);
  if (city.length < 3) return false;
  const areas = (settings?.localDeliveryAreas?.length ? settings.localDeliveryAreas : DEFAULT_LOCAL_AREAS).map(normalizePlace).filter((a) => a.length >= 3);
  return areas.some((a) => city.includes(a) || (city.length >= 5 && a.includes(city)));
}

// Una carpeta de diseños puede quedar disponible en varias prendas de
// "Personalizar" a la vez (ej: Beagle, Jamaica y las sudaderas). "garments"
// guarda claves "s:Beagle" (un estilo/modelo) o "c:Camisetas" (toda una
// categoría). Si no tiene ninguna marcada, vale la categoría única de siempre
// (o "todas") — así todo lo anterior sigue funcionando igual.
function garmentStyleKey(p) {
  return p?.subcategory || p?.name || "";
}
function folderAppliesTo(folder, product) {
  const g = folder?.garments;
  if (Array.isArray(g) && g.length) {
    if (!product) return false;
    return g.includes(`s:${garmentStyleKey(product)}`) || g.includes(`c:${product.category}`);
  }
  return !folder?.category || folder.category === product?.category;
}
// Precio de una prenda base de "Personalizar" (misma prioridad que al comprar):
// precio propio → precio de su estilo → precio general.
function templatePriceFor(p, settings) {
  if (!p) return 0;
  if (p.price != null) return Number(p.price);
  const sp = settings?.personalizeSubcategoryPrices?.[garmentStyleKey(p)];
  return sp != null ? Number(sp) : Number(settings?.personalizedBasePrice) || 0;
}

function formatPrice(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

// Las fotos de un color pueden venir de dos sistemas distintos: el viejo
// (un array genérico "images") o el actual, por zona (frontImage, backImage,
// sleeveLeftImage, sleeveRightImage, cargadas una por una en el panel).
// Esto junta lo que haya, priorizando el array viejo si existe, para que el
// catálogo muestre la foto sin importar con cuál de los dos se cargó el color.
function getColorImages(color) {
  if (!color) return [];
  if (color.images && color.images.length) return color.images;
  return [color.frontImage, color.backImage, color.sleeveLeftImage, color.sleeveRightImage].filter(Boolean);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Dónde se guardan las fotos que se suben desde la web — como ARCHIVOS,
// no como texto adentro de una fila de la base. Así cada fila que guarda un
// producto/diseño/ajuste solo lleva un link cortito, sin importar cuántas
// fotos subas ni cuán grandes sean. Necesita que el bucket exista en el
// proyecto de Supabase con este nombre (ver supabase-setup.sql).
const STORAGE_BUCKET = "kulto-photos";

function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(",");
  const mime = (header.match(/data:(.*?);base64/) || [])[1] || "image/jpeg";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Sube una foto ya comprimida (como "data:image/...;base64,...") al
// almacenamiento de archivos y devuelve su link público, o null si todavía
// no se puede (por ejemplo, si el bucket "kulto-photos" no existe) — en ese
// caso quien llama sigue funcionando igual que antes, guardando la foto
// completa en la base, para no romper nada mientras se configura Storage.
async function uploadDataUrlToStorage(dataUrl) {
  try {
    if (!dataUrl || !dataUrl.startsWith("data:")) return null;
    const blob = dataUrlToBlob(dataUrl);
    const ext = blob.type === "image/png" ? "png" : "jpg";
    const path = `${genId("img")}.${ext}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: "31536000" });
    if (error) return null;
    // Miniatura al lado de la foto (ver FastImg) — si falla no pasa nada,
    // las tarjetas simplemente muestran la original.
    if (dataUrl.length > 300) {
      try { await uploadThumbFor(path, await loadImageEl(dataUrl)); } catch { /* sin miniatura */ }
    }
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Miniaturas — para que la web cargue rápido sin tocar las fotos originales.
// Cada foto que se sube a Storage tiene al lado una versión chica
// ("img_xxx_t.webp", 480 px, WebP que conserva la transparencia de los PNG).
// Las tarjetas y listas piden la miniatura; la foto completa (la original,
// sin cambios) solo se baja al abrir el producto o ampliar. Si una foto
// todavía no tiene miniatura, <FastImg> muestra la original como antes.
// ---------------------------------------------------------------------------
const THUMB_MAX = 480;
const STORAGE_URL_RE = new RegExp(`^(.*/storage/v1/object/public/${STORAGE_BUCKET}/[^?#]+?)\\.(png|jpe?g)$`, "i");
function thumbUrl(url) {
  if (typeof url !== "string") return url;
  const m = url.match(STORAGE_URL_RE);
  return m ? `${m[1]}_t.webp` : url;
}
function FastImg({ src, onError, ...rest }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return (
    <img
      {...rest}
      decoding="async"
      src={failed ? src : thumbUrl(src)}
      onError={(e) => { if (!failed && thumbUrl(src) !== src) setFailed(true); else if (onError) onError(e); }}
    />
  );
}
function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
async function makeThumbBlob(img) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) return null;
  const scale = Math.min(1, THUMB_MAX / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
  return blob && blob.type === "image/webp" ? blob : null;
}
// Sube la miniatura de una foto ya subida. "fullPath" es el nombre del
// archivo dentro del bucket (ej: "img_ab12.png").
async function uploadThumbFor(fullPath, img) {
  try {
    const blob = await makeThumbBlob(img);
    if (!blob) return false;
    const tPath = fullPath.replace(/\.(png|jpe?g)$/i, "") + "_t.webp";
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(tPath, blob, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
    return !error;
  } catch {
    return false;
  }
}

// Guardar las fotos como texto (base64) directo en la base de datos hacía
// que una foto pesada volviera lenta o imposible de leer (junto con otras) —
// eso es lo que hacía "desaparecer" productos y diseños enteros. Esta
// función arregla los dos lados del problema:
// - Comprime la foto antes de guardarla: si es un PNG que en realidad no usa
//   transparencia, la pasa a JPEG (mucho más liviano), y si aun así queda
//   pesada, la achica un poco más — priorizando siempre la mejor calidad
//   posible dentro de un tamaño razonable.
// - Después, en vez de devolver esa foto comprimida para guardarla adentro
//   de la fila, la sube como archivo aparte y devuelve su link — así la fila
//   en sí queda liviana pase lo que pase. Si la subida falla (por ejemplo,
//   porque el bucket todavía no está creado), devuelve la foto comprimida
//   como antes, para que la web nunca deje de funcionar por esto.
function fileToBase64(file, cb, maxDim = 1000, quality = 0.82, format = "image/jpeg") {
  const MAX_BYTES = 900 * 1024; // tamaño de archivo seguro para leer sin trabas
  const MIN_DIM = 500;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = async () => {
      const render = (dim) => {
        let { width, height } = img;
        if (width > dim || height > dim) {
          if (width > height) { height = Math.round((height * dim) / width); width = dim; }
          else { width = Math.round((width * dim) / height); height = dim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        return { canvas, ctx, width, height };
      };
      const hasTransparency = (ctx, width, height) => {
        try {
          const { data } = ctx.getImageData(0, 0, width, height);
          // Revisamos una muestra de píxeles (no todos) para que sea rápido
          // incluso en imágenes grandes.
          for (let i = 3; i < data.length; i += 4 * 47) {
            if (data[i] < 255) return true;
          }
          return false;
        } catch {
          return true; // si no podemos leerlo, no arriesgamos a perder transparencia real
        }
      };
      let dim = maxDim;
      let { canvas, ctx, width, height } = render(dim);
      let useFormat = format;
      if (format === "image/png" && !hasTransparency(ctx, width, height)) {
        useFormat = "image/jpeg";
      }
      let out = canvas.toDataURL(useFormat, quality);
      let attempts = 0;
      while (out.length > MAX_BYTES && dim > MIN_DIM && attempts < 5) {
        dim = Math.round(dim * 0.75);
        ({ canvas, ctx, width, height } = render(dim));
        out = canvas.toDataURL(useFormat, quality);
        attempts++;
      }
      const uploadedUrl = await uploadDataUrlToStorage(out);
      cb(uploadedUrl || out);
    };
    img.onerror = () => cb(reader.result); // fall back to the original if resizing fails
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// Renders a garment photo plus zero or more customer-placed design images onto
// a single flat canvas, so the customer (and later the admin) can see exactly
// how the finished piece will look. `designs` is an array of
// { image, x, y, widthPct } where x/y are the % position of each design's
// CENTER and widthPct is its width as a fraction of the canvas width. Layers
// are drawn in array order, so later entries sit on top of earlier ones.
function composeDesignImage(garmentImage, garmentBg, designs) {
  return new Promise((resolve) => {
    if (!garmentImage) { resolve(null); return; }
    const layers = (designs || []).filter((d) => d && d.image);
    const W = 1000, H = 1250;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    // Desde que las fotos se guardan en Supabase Storage (URLs remotas) en vez
    // de texto embebido, dibujarlas en un canvas sin "crossOrigin" lo deja
    // "manchado" y toDataURL tira un error — antes esto dejaba la vista previa
    // cargando para siempre sin avisar nada. Ahora, si igual llegara a fallar,
    // mostramos que no se pudo generar en vez de trabarse.
    const finish = () => {
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch {
        resolve(null);
      }
    };

    const drawLayer = (index) => {
      if (index >= layers.length) { finish(); return; }
      const design = layers[index];
      const designImg = new Image();
      designImg.crossOrigin = "anonymous";
      designImg.onload = () => {
        const dW = W * design.widthPct;
        const dH = dW * (designImg.height / designImg.width);
        const cx = W * (design.x / 100);
        const cy = H * (design.y / 100);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(((design.rotation || 0) * Math.PI) / 180);
        ctx.drawImage(designImg, -dW / 2, -dH / 2, dW, dH);
        ctx.restore();
        drawLayer(index + 1);
      };
      designImg.onerror = () => drawLayer(index + 1);
      designImg.src = design.image;
    };

    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous";
    bgImg.onload = () => {
      ctx.fillStyle = garmentBg || "#f2f2f2";
      ctx.fillRect(0, 0, W, H);
      const scale = Math.min(W / bgImg.width, H / bgImg.height);
      const dw = bgImg.width * scale, dh = bgImg.height * scale;
      const dx = (W - dw) / 2, dy = (H - dh) / 2;
      ctx.drawImage(bgImg, dx, dy, dw, dh);
      drawLayer(0);
    };
    bgImg.onerror = finish;
    bgImg.src = garmentImage;
  });
}

function buildOrderMessage(order, settings) {
  const lines = [];
  lines.push(`Pedido nuevo KULTO`);
  lines.push(`N° de orden: ${order.id}`);
  lines.push(`Fecha: ${formatDate(order.date)}`);
  lines.push("");
  order.items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.name}  (ref. ${it.sku})`);
    lines.push(`   Categoría: ${it.category}`);
    if (it.subcategory) lines.push(`   Modelo: ${it.subcategory}`);
    lines.push(`   Color: ${it.colorName}`);
    if (it.size) lines.push(`   Talle: ${it.size}`);
    if (it.designName) lines.push(`   Diseño: ${it.designName}`);
    if (it.designImage) lines.push(`   (subió una imagen de diseño — la ves en el panel o en el link de este pedido)`);
    if (it.previewImageFront || it.previewImageBack || it.previewImageSleeveLeft || it.previewImageSleeveRight) lines.push(`   (personalización con vista previa — la ves en el panel o en el link de este pedido)`);
    lines.push(`   Cantidad: ${it.qty}`);
    lines.push(`   Precio unidad: ${formatPrice(it.unitPrice)}`);
    lines.push("");
  });
  lines.push(`Subtotal: ${formatPrice(order.subtotal)}`);
  if (order.discountAmount > 0) {
    lines.push(`Descuento de bienvenida: -${formatPrice(order.discountAmount)}`);
  }
  if (order.promoCode) {
    lines.push(promoOrderSummary(order));
  }
  if (order.deliveryMethod === "envio") {
    lines.push(`Envío a domicilio: ${order.shippingCost > 0 ? formatPrice(order.shippingCost) : "Gratis"}`);
    lines.push(`Dirección: ${formatAddress(order.address)}`);
  } else {
    lines.push(`Entrega: Recoge en persona (sin costo de envío)`);
  }
  lines.push(`Total: ${formatPrice(order.total)}`);
  if (order.customerName) lines.push(`Cliente: ${order.customerName}`);
  if (order.customerPhone) lines.push(`Teléfono: ${order.customerPhone}`);
  if (order.customerEmail) lines.push(`Email: ${order.customerEmail}`);
  if (order.comment) lines.push(`Comentario: ${order.comment}`);
  const hasCustom = order.items.some((it) => it.designName?.startsWith("Personalizado"));
  if (hasCustom) {
    lines.push("");
    lines.push("(Sé que los pedidos personalizados pueden demorar entre 3 y 7 días. Si llegara a necesitarlo antes, se los aviso por acá.)");
    if (settings?.depositEnabled) {
      const depositAmount = order.subtotal * ((settings.depositPercent || 0) / 100);
      lines.push("");
      lines.push(`Entiendo que para confirmar y empezar a producirlo mando una seña del ${settings.depositPercent}% (${formatPrice(depositAmount)}) por ${settings.depositInfo || "el medio que me indiquen"}, y el resto al recibirlo.`);
    }
  }
  return lines.join("\n");
}

function openWhatsApp(text, number) {
  // El número ahora lo carga el admin en Ajustes → Marca (settings.whatsappNumber).
  // Si todavía no cargó ninguno, no hay a dónde escribir — no hace nada.
  if (!number) return;
  const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

// Envoltorio simple de estilos para que los mails se vean prolijos en
// cualquier cliente de correo (Gmail, Outlook, etc. no soportan <style> ni
// variables CSS, por eso todo va en línea).
function emailShell(storeName, bodyHtml) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#15131a; padding:32px 16px;">
      <div style="max-width:520px;margin:0 auto;background:#1f1c26;border-radius:16px;padding:32px;color:#f3efe6;">
        <p style="margin:0 0 20px;font-size:18px;font-weight:bold;letter-spacing:0.5px;">${storeName}</p>
        ${bodyHtml}
      </div>
    </div>
  `;
}

function buildVerificationEmailHtml(name, code, settings) {
  const storeName = settings?.logoText || "Kulto";
  return emailShell(storeName, `
    <p style="margin:0 0 12px;">Hola${name ? " " + name : ""},</p>
    <p style="margin:0 0 20px;">Usá este código para confirmar tu cuenta:</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#15131a;border-radius:12px;padding:18px;margin:0 0 20px;">${code}</p>
    <p style="margin:0;color:#a9a2b0;font-size:13px;">Vale por 15 minutos. Si no pediste esto, podés ignorar este mail.</p>
  `);
}

function buildPasswordResetEmailHtml(name, code, settings, email) {
  const storeName = settings?.logoText || "Kulto";
  let link = null;
  try { link = `${window.location.origin}/?resetEmail=${encodeURIComponent(email)}&resetCode=${encodeURIComponent(code)}`; } catch { /* sin window (no debería pasar, se llama desde el navegador) */ }
  return emailShell(storeName, `
    <p style="margin:0 0 12px;">Hola${name ? " " + name : ""},</p>
    <p style="margin:0 0 20px;">Usá este código para elegir una contraseña nueva:</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#15131a;border-radius:12px;padding:18px;margin:0 0 20px;">${code}</p>
    ${link ? `
    <p style="margin:0 0 20px;text-align:center;">
      <a href="${link}" style="display:inline-block;background:#E8452C;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;">Elegir contraseña nueva</a>
    </p>
    ` : ""}
    <p style="margin:0;color:#a9a2b0;font-size:13px;">Vale por 15 minutos. Si no pediste esto, podés ignorar este mail — tu contraseña actual sigue funcionando igual.</p>
  `);
}

// El formulario de "Contacto" del sitio (en vez de mostrar el mail/teléfono
// del dueño directamente) — siempre se manda a ADMIN_EMAIL, que sendEmail()
// redirige de verdad a ADMIN_NOTIFICATION_EMAIL.
function buildContactEmailHtml(data, settings) {
  const storeName = settings?.logoText || "Kulto";
  return emailShell(storeName, `
    <p style="margin:0 0 16px;">Nuevo mensaje de contacto desde la web.</p>
    <p style="margin:0 0 8px;"><strong>Nombre:</strong> ${data.name}</p>
    <p style="margin:0 0 8px;"><strong>Email:</strong> ${data.email}</p>
    <p style="margin:0 0 16px;"><strong>Asunto:</strong> ${data.subject}</p>
    <p style="margin:0 0 8px;"><strong>Mensaje:</strong></p>
    <p style="margin:0;white-space:pre-line;background:#15131a;border-radius:12px;padding:16px;">${data.message}</p>
  `);
}

// La respuesta que el admin manda desde el panel de administrador (pestaña
// "Contacto") a un mensaje ya recibido — incluye el texto que escribió, y si
// corresponde, cómo quedó la incidencia (cambio/devolución aprobado o no,
// descuento de regalo con su código) para que quede todo junto en un mail.
function buildContactReplyEmailHtml(ticket, replyText, settings) {
  const storeName = settings?.logoText || "Kulto";
  const decisionText =
    ticket.changeDecision === "aprobado" ? "Aprobamos tu cambio o devolución." :
    ticket.changeDecision === "rechazado" ? "No pudimos aprobar el cambio o devolución en este caso." :
    "";
  const discountText = ticket.discountPercent
    ? `Como disculpa por la incidencia, te regalamos un <strong>${ticket.discountPercent}% de descuento</strong> para tu próxima compra. Mencioná este código cuando hagas tu próximo pedido: <strong style="letter-spacing:2px;">${ticket.discountCode}</strong>`
    : "";
  return emailShell(storeName, `
    <p style="margin:0 0 12px;">Hola${ticket.name ? " " + ticket.name : ""},</p>
    <p style="margin:0 0 16px;">Te escribimos por tu consulta ("${ticket.subject}"):</p>
    <p style="margin:0 0 20px;white-space:pre-line;background:#15131a;border-radius:12px;padding:16px;">${replyText}</p>
    ${decisionText ? `<p style="margin:0 0 12px;">${decisionText}</p>` : ""}
    ${discountText ? `<p style="margin:0 0 12px;background:#15131a;border-radius:12px;padding:16px;">${discountText}</p>` : ""}
    <p style="margin:0;color:#a9a2b0;font-size:13px;">Si te queda alguna duda, respondé este mail o escribinos por WhatsApp.</p>
  `);
}

function buildRestockEmailHtml(productName, settings) {
  const storeName = settings?.logoText || "Kulto";
  return emailShell(storeName, `
    <p style="margin:0 0 12px;">¡Buenas noticias!</p>
    <p style="margin:0 0 20px;">Ya volvió el stock de <strong>${productName}</strong> — pedite el tuyo antes de que se agote de nuevo.</p>
  `);
}

// Se manda a mano desde el panel (Pedidos → "Pedir reseña") una vez que el
// pedido ya está completado/entregado. El link lleva a "Mi pedido" con el
// número de orden ya cargado, para que el cliente no tenga que escribirlo.
function buildReviewRequestEmailHtml(order, settings) {
  const storeName = settings?.logoText || "Kulto";
  let link = null;
  try { link = `${window.location.origin}/?review=${encodeURIComponent(order.id)}`; } catch { /* sin window (no debería pasar, se llama desde el navegador) */ }
  return emailShell(storeName, `
    <p style="margin:0 0 12px;">¡Hola${order.customerName ? " " + order.customerName : ""}!</p>
    <p style="margin:0 0 20px;">Esperamos que estés disfrutando tu pedido <strong>${order.id}</strong>. Si tenés un minuto, nos encantaría que nos cuentes cómo te fue — ayuda un montón a otros clientes a elegir.</p>
    ${link ? `
    <p style="margin:0 0 20px;text-align:center;">
      <a href="${link}" style="display:inline-block;background:#E8452C;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;">Dejar mi reseña</a>
    </p>
    ` : ""}
    <p style="margin:0;color:#a9a2b0;font-size:13px;">Si el botón no funciona, entrá a la web y buscá tu pedido con el número ${order.id} en "Mi pedido".</p>
  `);
}

function buildOrderEmailHtml(order, settings) {
  const storeName = settings?.logoText || "Kulto";
  // El detalle de cada prenda se muestra como una lista de campos con su
  // nombre (Ítem/Modelo/Talla/Color/Diseño) en vez de una sola línea corrida
  // — para que el cliente vea reflejado, tal cual, lo que eligió al comprar.
  const itemsHtml = order.items.map((it) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #2c2833;">
        <p style="margin:0 0 4px;font-weight:bold;">${it.name} ${it.qty > 1 ? `× ${it.qty}` : ""}</p>
        <table style="font-size:13px;color:#a9a2b0;border-collapse:collapse;">
          <tr><td style="padding:1px 6px 1px 0;">Ítem:</td><td>${it.category || "—"}</td></tr>
          ${it.subcategory ? `<tr><td style="padding:1px 6px 1px 0;">Modelo:</td><td>${it.subcategory}</td></tr>` : ""}
          ${it.size ? `<tr><td style="padding:1px 6px 1px 0;">Talla:</td><td>${it.size}</td></tr>` : ""}
          <tr><td style="padding:1px 6px 1px 0;">Color:</td><td>${it.colorName || "—"}</td></tr>
          ${it.designName ? `<tr><td style="padding:1px 6px 1px 0;vertical-align:top;">Diseño:</td><td>${it.designName}</td></tr>` : ""}
        </table>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #2c2833;text-align:right;white-space:nowrap;">${formatPrice(it.unitPrice * it.qty)}</td>
    </tr>
  `).join("");

  const deliveryHtml = order.deliveryMethod === "envio"
    ? `<p style="margin:0 0 4px;">Envío a domicilio: ${order.shippingCost > 0 ? formatPrice(order.shippingCost) : "Gratis"}</p><p style="margin:0 0 16px;color:#a9a2b0;font-size:13px;">${formatAddress(order.address)}</p>`
    : `<p style="margin:0 0 16px;">Retiro en persona (sin costo de envío)</p>`;

  return emailShell(storeName, `
    <p style="margin:0 0 4px;">¡Gracias por tu compra${order.customerName ? ", " + order.customerName : ""}!</p>
    <p style="margin:0 0 20px;color:#a9a2b0;font-size:13px;">Pedido N° ${order.id} · ${formatDate(order.date)}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${itemsHtml}</table>
    ${deliveryHtml}
    ${order.discountAmount > 0 ? `<p style="margin:0 0 4px;">Descuento: -${formatPrice(order.discountAmount)}</p>` : ""}
    ${order.promoCode ? `<p style="margin:0 0 4px;">${promoOrderSummary(order)}</p>` : ""}
    <p style="margin:0 0 4px;font-size:18px;font-weight:bold;">Total: ${formatPrice(order.total)}</p>
    <p style="margin:20px 0 0;color:#a9a2b0;font-size:13px;">Gracias por su compra. Su pedido se está procesando y nos pondremos en contacto con usted para coordinar el pago por Bizum o transferencia.${isLocalOrder(order, settings) ? ` Podrá seguir cada etapa de su pedido en \"Mi pedido\" de nuestra web con su número de orden (${order.id}).` : ""} Cualquier duda, responda este mismo mail o escríbanos por WhatsApp.</p>
  `);
}

// Aviso interno al dueño (se manda a ADMIN_EMAIL, que sendEmail() redirige de
// verdad a ADMIN_NOTIFICATION_EMAIL) cada vez que entra un pedido nuevo. Este
// mail — junto con que el pedido ya queda guardado en el panel vía
// persistOrder() — es ahora el camino GARANTIZADO para enterarse de un
// pedido: antes dependía de que WhatsApp se abriera bien en el celular del
// cliente (algunos navegadores, sobre todo Safari de iPhone, bloqueaban el
// popup), así que podía perderse un pedido sin que nadie se diera cuenta.
function buildAdminOrderEmailHtml(order, settings) {
  const storeName = settings?.logoText || "Kulto";
  // El detalle de cada prenda se muestra como una lista de campos con su
  // nombre (Ítem/Modelo/Talla/Color/Diseño) en vez de una sola línea corrida
  // — es la misma información que el cliente eligió al comprar, pero así se
  // lee de un vistazo sin tener que descifrar qué es cada dato.
  const itemsHtml = order.items.map((it) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #2c2833;">
        <p style="margin:0 0 4px;font-weight:bold;">${it.name} ${it.qty > 1 ? `× ${it.qty}` : ""}</p>
        <table style="font-size:13px;color:#a9a2b0;border-collapse:collapse;">
          <tr><td style="padding:1px 6px 1px 0;">Ítem:</td><td>${it.category || "—"}</td></tr>
          ${it.subcategory ? `<tr><td style="padding:1px 6px 1px 0;">Modelo:</td><td>${it.subcategory}</td></tr>` : ""}
          ${it.size ? `<tr><td style="padding:1px 6px 1px 0;">Talla:</td><td>${it.size}</td></tr>` : ""}
          <tr><td style="padding:1px 6px 1px 0;">Color:</td><td>${it.colorName || "—"}</td></tr>
          ${it.designName ? `<tr><td style="padding:1px 6px 1px 0;vertical-align:top;">Diseño:</td><td>${it.designName}</td></tr>` : ""}
        </table>
        <p style="margin:4px 0 0;font-size:11px;color:#6f6878;">ref. ${it.sku}</p>
        ${(it.designImage || it.previewImageFront || it.previewImageBack || it.previewImageSleeveLeft || it.previewImageSleeveRight) ? `<p style="margin:2px 0 0;font-size:12px;color:#E8452C;">(tiene imagen de diseño o vista previa — se ve en el panel, pestaña Pedidos)</p>` : ""}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #2c2833;text-align:right;white-space:nowrap;">${formatPrice(it.unitPrice * it.qty)}</td>
    </tr>
  `).join("");

  const deliveryHtml = order.deliveryMethod === "envio"
    ? `<p style="margin:0 0 4px;">Envío a domicilio: ${order.shippingCost > 0 ? formatPrice(order.shippingCost) : "Gratis"}</p><p style="margin:0 0 16px;color:#a9a2b0;font-size:13px;">${formatAddress(order.address)}</p>`
    : `<p style="margin:0 0 16px;">Retiro en persona (sin costo de envío)</p>`;

  const hasCustom = order.items.some((it) => it.designName?.startsWith("Personalizado"));
  const depositHtml = hasCustom && settings?.depositEnabled
    ? `<p style="margin:0 0 12px;color:#a9a2b0;font-size:13px;">Lleva seña del ${settings.depositPercent}% (${formatPrice(order.subtotal * ((settings.depositPercent || 0) / 100))}) por ${settings.depositInfo || "el medio que corresponda"}.</p>`
    : "";

  return emailShell(storeName, `
    <p style="margin:0 0 4px;font-weight:bold;">Pedido nuevo</p>
    <p style="margin:0 0 20px;color:#a9a2b0;font-size:13px;">Pedido N° ${order.id} · ${formatDate(order.date)}</p>
    <p style="margin:0 0 4px;"><strong>Cliente:</strong> ${order.customerName || "(sin nombre)"}</p>
    ${order.customerPhone ? `<p style="margin:0 0 4px;"><strong>Teléfono:</strong> ${order.customerPhone}</p>` : ""}
    ${order.customerEmail ? `<p style="margin:0 0 16px;"><strong>Email:</strong> ${order.customerEmail}</p>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${itemsHtml}</table>
    ${deliveryHtml}
    ${order.discountAmount > 0 ? `<p style="margin:0 0 4px;">Descuento: -${formatPrice(order.discountAmount)}</p>` : ""}
    ${order.promoCode ? `<p style="margin:0 0 4px;">${promoOrderSummary(order)}</p>` : ""}
    <p style="margin:0 0 4px;font-size:18px;font-weight:bold;">Total: ${formatPrice(order.total)}</p>
    ${order.comment ? `<p style="margin:16px 0 4px;"><strong>Comentario del cliente:</strong></p><p style="margin:0 0 12px;white-space:pre-line;background:#15131a;border-radius:12px;padding:12px;">${order.comment}</p>` : ""}
    ${depositHtml}
    <p style="margin:20px 0 0;color:#a9a2b0;font-size:13px;">También lo vas a ver en el panel, pestaña "Pedidos".</p>
  `);
}

// Calls the serverless function in /api/analyze-product.js to suggest a name,
// category and description from a product photo. Needs ANTHROPIC_API_KEY set
// on the server (Vercel) — see the README. Fails gracefully if not configured.
async function analyzeProductPhoto(imageBase64, categories) {
  try {
    const res = await fetch("/api/analyze-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageBase64, categories }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || "No se pudo completar con IA en este momento." };
    }
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "No se pudo conectar con la IA. Revisá tu conexión o probá de nuevo." };
  }
}

// Calls the serverless function in /api/send-email.js (usa Resend) para
// mandar mails de verdad — confirmación de cuenta y aviso de compra. Necesita
// RESEND_API_KEY configurada en el servidor (Vercel) — ver el README. Nunca
// tira una excepción hacia arriba: si falla, devuelve { ok: false } y quien
// llama decide si eso bloquea algo o no (nunca debería bloquear el checkout).
async function sendEmail({ to, subject, html }) {
  // admin@kulto.com no es un mail real — cualquier cosa que el sistema le
  // quiera mandar (verificación, recuperar contraseña, etc.) se redirige a
  // la casilla real del dueño. Ver la constante ADMIN_NOTIFICATION_EMAIL.
  const finalTo = normalizeEmail(to) === normalizeEmail(ADMIN_EMAIL) ? ADMIN_NOTIFICATION_EMAIL : to;
  try {
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: finalTo, subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "No se pudo enviar el mail." };
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor de mails." };
  }
}

// Removes the background from a customer-uploaded design photo, entirely in
// the browser (via @imgly/background-removal — a free, open-source model
// that runs locally, no API key or server cost involved). Returns null if it
// fails for any reason, so callers can fall back to the original photo.
async function removeImageBackground(base64) {
  try {
    const { removeBackground } = await import("@imgly/background-removal");
    const sourceBlob = await (await fetch(base64)).blob();
    const resultBlob = await removeBackground(sourceBlob);
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(resultBlob);
    });
  } catch {
    return null;
  }
}

// Recolorea una foto de prenda (idealmente blanca o de un color claro, y con
// el fondo ya quitado) para que se vea de otro color, SIN perder los pliegues
// ni las sombras de la tela — es la misma técnica que usan los catálogos de
// imprenta para no tener que fotografiar cada color por separado. Funciona
// multiplicando cada píxel por el color elegido, escalado según qué tan clara
// u oscura sea esa zona en la foto original (una zona casi blanca queda casi
// del color elegido; una sombra se ve un poco más oscura, como en la tela de
// verdad). Por eso la foto base funciona mejor si la prenda está fotografiada
// en blanco o un gris muy clarito. Devuelve null si la imagen no se pudo leer
// (por ejemplo, por un bloqueo de CORS) — quien llama debe seguir funcionando
// igual en ese caso, usando la foto original sin recolorear.
function hexToRgb(hex) {
  const h = (hex || "#CCCCCC").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16) || 0xcccccc;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function tintImageToColor(src, hex) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const { r: tr, g: tg, b: tb } = hexToRgb(hex);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = frame.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue; // transparente: lo dejamos como está
          const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
          d[i] = Math.round(tr * lum);
          d[i + 1] = Math.round(tg * lum);
          d[i + 2] = Math.round(tb * lum);
        }
        ctx.putImageData(frame, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null); // imagen "manchada" por CORS u otro error de lectura
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Genera las 4 fotos de UN color a partir de una tanda de fotos base (ya
// subidas a Storage o como dataURL), pintando cada zona disponible. Es el
// mismo paso que usa AdminTemplateForm para "Foto base" — lo dejamos acá
// arriba, fuera del componente, para que también lo pueda usar la carga
// masiva por subcategoría (AdminBulkColorsBySubcategory) sin duplicar la
// lógica. Si la subida a Storage falla, devuelve la imagen pintada tal cual
// (más pesada) para no perder el color, marcando usedFallback.
async function generateColorFromBaseImages(baseImages, hex) {
  const zones = TEMPLATE_ZONE_DEFS.map((z) => z.key);
  const result = {};
  let usedFallback = false;
  for (const zone of zones) {
    const base = baseImages?.[zone];
    if (!base) continue;
    const tinted = await tintImageToColor(base, hex);
    if (!tinted) continue;
    const uploaded = await uploadDataUrlToStorage(tinted);
    if (!uploaded) usedFallback = true;
    result[zone] = uploaded || tinted;
  }
  return { images: result, usedFallback };
}

/* ------------------------------------------------------------------ */
/*  Storage layer                                                      */
/*  "shared" data (products, categories, orders, settings) lives in a  */
/*  Supabase table so every visitor sees the same catalog.             */
/*  "personal" data (each visitor's own cart) lives in their browser's */
/*  localStorage, since there's no need to sync it across devices.     */
/* ------------------------------------------------------------------ */

const KV_TABLE = "kulto_kv";

async function storageGet(key, shared) {
  try {
    if (!shared) {
      const v = localStorage.getItem(key);
      return v;
    }
    const { data, error } = await queueKvRead(() => supabase.from(KV_TABLE).select("value").eq("key", key).maybeSingle());
    if (error || !data) return null;
    return data.value;
  } catch {
    return null;
  }
}
async function storageSet(key, value, shared) {
  try {
    if (!shared) {
      localStorage.setItem(key, value);
      return true;
    }
    const { error } = await supabase.from(KV_TABLE).upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) console.error(`[Kulto] No se pudo guardar "${key}":`, error.message || error);
    return !error;
  } catch (err) {
    console.error(`[Kulto] Error guardando "${key}":`, err);
    return false;
  }
}
// Igual que storageSet, pero además devuelve el motivo del error en vez de
// tragárselo — se usa donde el motivo real le sirve a quien está usando la
// web (por ejemplo, para mostrarle al admin por qué no se guardó un diseño).
async function storageSetVerbose(key, value, shared) {
  try {
    if (!shared) {
      localStorage.setItem(key, value);
      return { ok: true, error: null };
    }
    const { error } = await supabase.from(KV_TABLE).upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) console.error(`[Kulto] No se pudo guardar "${key}":`, error.message || error);
    return { ok: !error, error: error ? (error.message || String(error)) : null };
  } catch (err) {
    console.error(`[Kulto] Error guardando "${key}":`, err);
    return { ok: false, error: err?.message || "Error de red." };
  }
}
async function storageDelete(key, shared) {
  try {
    if (!shared) {
      localStorage.removeItem(key);
      return;
    }
    await supabase.from(KV_TABLE).delete().eq("key", key);
  } catch {
    /* ignore */
  }
}

// "Notificarme" cuando vuelve el stock de un producto (ver RestockNotifyForm
// y ProductConfigurator). La lista de mails en espera por producto se guarda
// como un JSON simple bajo una key propia — no hace falta una tabla nueva.
function restockNotifyKey(productId) {
  return `kulto:restock:${productId}`;
}
async function getRestockSubscribers(productId) {
  const raw = await storageGet(restockNotifyKey(productId), true);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
async function addRestockSubscriber(productId, email) {
  const norm = normalizeEmail(email);
  const list = await getRestockSubscribers(productId);
  if (list.includes(norm)) return { ok: true, already: true };
  await storageSet(restockNotifyKey(productId), JSON.stringify([...list, norm]), true);
  return { ok: true, already: false };
}
// Se llama al publicar cambios, para cada producto que pasó de sin stock a
// con stock — le avisa a todos los que pidieron que les avisen y vacía la
// lista (si vuelve a agotarse, se arma una lista nueva desde cero).
async function notifyRestockSubscribers(productId, productName, settings) {
  const list = await getRestockSubscribers(productId);
  if (!list.length) return;
  await Promise.all(
    list.map((email) =>
      sendEmail({
        to: email,
        subject: `Ya volvió el stock de ${productName}`,
        html: buildRestockEmailHtml(productName, settings),
      }).catch(() => {})
    )
  );
  await storageDelete(restockNotifyKey(productId), true);
}

// Fetches many keys in a single request instead of one request per key —
// this is what makes loading the catalog and orders fast.
async function storageGetMany(keys, shared) {
  if (!keys.length) return {};
  try {
    if (!shared) {
      const out = {};
      keys.forEach((k) => { const v = localStorage.getItem(k); if (v !== null) out[k] = v; });
      return out;
    }
    // Las fotos (diseños, trabajos personalizados, fotos de producto) se
    // guardan completas adentro de cada fila, y algunas pesan tanto que
    // leerlas junto con otras hace que la consulta tarde más de lo que
    // Supabase permite antes de cancelarla ("statement timeout", error 57014)
    // — eso hacía fallar el pedido entero y la tienda mostraba "no hay
    // productos/diseños guardados" aunque los datos seguían intactos en la
    // base. Reintentar la misma tanda no sirve porque va a volver a tardar lo
    // mismo: en cambio, si una tanda falla la partimos al medio y probamos
    // cada mitad por separado, hasta aislar (y en el peor caso pedir sola) la
    // foto puntual que está tardando, sin perder el resto de los datos.
    async function fetchChunk(chunk) {
      const { data, error } = await queueKvRead(() => supabase.from(KV_TABLE).select("key,value").in("key", chunk));
      if (!error && data) return data;
      if (chunk.length <= 1) return [];
      const mid = Math.ceil(chunk.length / 2);
      // De a una mitad por vez (no las dos juntas) — si el problema es que
      // varias consultas pesadas viajando a la vez se pisan entre sí, hacer
      // dos consultas en paralelo acá adentro tendría el mismo problema.
      const a = await fetchChunk(chunk.slice(0, mid));
      const b = await fetchChunk(chunk.slice(mid));
      return [...a, ...b];
    }
    const CHUNK_SIZE = 25;
    const chunks = [];
    for (let i = 0; i < keys.length; i += CHUNK_SIZE) chunks.push(keys.slice(i, i + CHUNK_SIZE));
    // Las tandas se piden TODAS a la vez (antes se pedían una por una, de a
    // una por vez) — cada una ya es chica y liviana, así que no hay motivo
    // para esperar a que termine una para recién pedir la siguiente. Con
    // varias tandas (ej: muchos productos) esto ahorra varias "idas y
    // vueltas" al servidor, que es lo que más se nota en una conexión lejana
    // o lenta.
    const out = {};
    const results = await Promise.all(chunks.map((chunk) => fetchChunk(chunk)));
    results.forEach((rows) => { rows.forEach((row) => { out[row.key] = row.value; }); });
    return out;
  } catch {
    return {};
  }
}

const PUB_PREFIX = "kulto:";
const DRAFT_PREFIX = "kulto:draft:";

async function loadProductsFromPrefix(prefix) {
  const idxRaw = await storageGet(`${prefix}product-index`, true);
  const ids = idxRaw ? JSON.parse(idxRaw) : [];
  if (!ids.length) return [];
  const keys = ids.map((id) => `${prefix}product:${id}`);
  const map = await storageGetMany(keys, true);
  return keys.map((k) => map[k]).filter(Boolean).map((v) => JSON.parse(v));
}
// "updateIndex=false" solo guarda la fila del producto, sin tocar el índice
// compartido — lo usan las operaciones en lote (publicar/descartar/inicializar
// el borrador) que guardan muchos productos a la vez y después escriben el
// índice completo una sola vez, para que no se pisen entre sí si dos
// guardados de índice ocurren en paralelo.
// Igual que persistProductToPrefix, pero devuelve si de verdad se guardó (y
// por qué no, si falló) en vez de tragarse el error — la usa el formulario de
// "Personalizar" para avisar al admin si un producto con muchos colores no
// se pudo guardar (por ejemplo, por pesar demasiado), en vez de dejarlo creer
// que se guardó cuando en realidad no pasó nada.
async function persistProductToPrefixVerbose(prefix, product, updateIndex = true) {
  const res = await storageSetVerbose(`${prefix}product:${product.id}`, JSON.stringify(product), true);
  if (!res.ok) return res;
  if (!updateIndex) return res;
  const idxRaw = await storageGet(`${prefix}product-index`, true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  if (!ids.includes(product.id)) {
    ids.push(product.id);
    return storageSetVerbose(`${prefix}product-index`, JSON.stringify(ids), true);
  }
  return res;
}
async function persistProductToPrefix(prefix, product, updateIndex = true) {
  await storageSet(`${prefix}product:${product.id}`, JSON.stringify(product), true);
  if (!updateIndex) return;
  const idxRaw = await storageGet(`${prefix}product-index`, true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  if (!ids.includes(product.id)) {
    ids.push(product.id);
    await storageSet(`${prefix}product-index`, JSON.stringify(ids), true);
  }
}
async function removeProductFromPrefix(prefix, id) {
  await storageDelete(`${prefix}product:${id}`, true);
  const idxRaw = await storageGet(`${prefix}product-index`, true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  ids = ids.filter((x) => x !== id);
  await storageSet(`${prefix}product-index`, JSON.stringify(ids), true);
}

// Published — what the public storefront reads.
async function loadProducts() { return loadProductsFromPrefix(PUB_PREFIX); }
async function persistProduct(product) { return persistProductToPrefix(PUB_PREFIX, product); }
async function removeProduct(id) { return removeProductFromPrefix(PUB_PREFIX, id); }

// Draft — what the admin edits. Stays invisible to the public until published.
async function loadDraftProducts() { return loadProductsFromPrefix(DRAFT_PREFIX); }
async function persistDraftProduct(product) { return persistProductToPrefix(DRAFT_PREFIX, product); }
async function persistDraftProductVerbose(product) { return persistProductToPrefixVerbose(DRAFT_PREFIX, product); }
async function removeDraftProduct(id) { return removeProductFromPrefix(DRAFT_PREFIX, id); }

async function loadCategories() {
  const raw = await storageGet("kulto:categories", true);
  if (raw) return JSON.parse(raw);
  await storageSet("kulto:categories", JSON.stringify(DEFAULT_CATEGORIES), true);
  return DEFAULT_CATEGORIES;
}
async function persistCategories(cats) {
  await storageSet("kulto:categories", JSON.stringify(cats), true);
}
async function loadDraftCategoriesRaw() {
  const raw = await storageGet("kulto:draft:categories", true);
  return raw ? JSON.parse(raw) : null;
}
async function persistDraftCategories(cats) {
  await storageSet("kulto:draft:categories", JSON.stringify(cats), true);
}

async function loadGroups() {
  const raw = await storageGet("kulto:groups", true);
  if (raw) return JSON.parse(raw);
  await storageSet("kulto:groups", JSON.stringify(DEFAULT_GROUPS), true);
  return DEFAULT_GROUPS;
}
async function persistGroups(groups) {
  await storageSet("kulto:groups", JSON.stringify(groups), true);
}
async function loadDraftGroupsRaw() {
  const raw = await storageGet("kulto:draft:groups", true);
  return raw ? JSON.parse(raw) : null;
}
async function persistDraftGroups(groups) {
  await storageSet("kulto:draft:groups", JSON.stringify(groups), true);
}

// The first time the admin opens the catalog editor, the draft starts as a
// copy of whatever's currently published, so they're editing from reality.
async function ensureDraftInitialized() {
  const flag = await storageGet("kulto:draft:initialized", true);
  if (flag === "true") return;
  const [pubProducts, pubCats, pubGroups] = await Promise.all([loadProducts(), loadCategories(), loadGroups()]);
  await Promise.all([
    ...pubProducts.map((p) => persistProductToPrefix(DRAFT_PREFIX, p, false)),
    persistDraftCategories(pubCats),
    persistDraftGroups(pubGroups),
  ]);
  await storageSet(`${DRAFT_PREFIX}product-index`, JSON.stringify(pubProducts.map((p) => p.id)), true);
  await storageSet("kulto:draft:initialized", "true", true);
}

async function loadDraftCategories() {
  await ensureDraftInitialized();
  const cats = await loadDraftCategoriesRaw();
  return cats || DEFAULT_CATEGORIES;
}
async function loadDraftGroups() {
  await ensureDraftInitialized();
  const groups = await loadDraftGroupsRaw();
  return groups || DEFAULT_GROUPS;
}

async function markDraftChanged() { await storageSet("kulto:draft:has-changes", "true", true); }
async function checkDraftChanges() { return (await storageGet("kulto:draft:has-changes", true)) === "true"; }

// Makes the draft catalog (products + categories + groups) the one the public sees.
async function publishDraft() {
  const [draftProducts, draftCats, draftGroups, pubProducts] = await Promise.all([
    loadDraftProducts(), loadDraftCategories(), loadDraftGroups(), loadProducts(),
  ]);
  const draftIds = new Set(draftProducts.map((p) => p.id));
  const toDelete = pubProducts.filter((p) => !draftIds.has(p.id));
  await Promise.all([
    ...toDelete.map((p) => storageDelete(`${PUB_PREFIX}product:${p.id}`, true)),
    // Las ventas y vistas se suman directo sobre el producto publicado; el
    // borrador tiene copias viejas — sin esto, cada "Publicar cambios" las
    // pisaba y el "En tendencia" automático volvía a cero.
    ...draftProducts.map((p) => {
      const live = pubProducts.find((x) => x.id === p.id);
      const merged = live
        ? { ...p, salesCount: Math.max(p.salesCount || 0, live.salesCount || 0), viewsCount: Math.max(p.viewsCount || 0, live.viewsCount || 0) }
        : p;
      return persistProductToPrefix(PUB_PREFIX, merged, false);
    }),
    persistCategories(draftCats),
    persistGroups(draftGroups),
  ]);
  await storageSet(`${PUB_PREFIX}product-index`, JSON.stringify(draftProducts.map((p) => p.id)), true);
  await storageSet("kulto:draft:has-changes", "false", true);
}

// Throws away unpublished edits, resetting the draft back to what's live.
async function discardDraft() {
  const [pubProducts, pubCats, pubGroups, draftProducts] = await Promise.all([
    loadProducts(), loadCategories(), loadGroups(), loadDraftProducts(),
  ]);
  const pubIds = new Set(pubProducts.map((p) => p.id));
  const toDelete = draftProducts.filter((p) => !pubIds.has(p.id));
  await Promise.all([
    ...toDelete.map((p) => storageDelete(`${DRAFT_PREFIX}product:${p.id}`, true)),
    ...pubProducts.map((p) => persistProductToPrefix(DRAFT_PREFIX, p, false)),
    persistDraftCategories(pubCats),
    persistDraftGroups(pubGroups),
  ]);
  await storageSet(`${DRAFT_PREFIX}product-index`, JSON.stringify(pubProducts.map((p) => p.id)), true);
  await storageSet("kulto:draft:has-changes", "false", true);
}


async function loadSavedColors() {
  const raw = await storageGet("kulto:saved-colors", true);
  return raw ? JSON.parse(raw) : [];
}
async function persistSavedColors(list) {
  await storageSet("kulto:saved-colors", JSON.stringify(list), true);
}

// Paleta oficial de colores del catálogo Roly 2026 (tal cual figura en el
// PDF del proveedor: número + nombre, y el color tomado directo de las
// muestras impresas). Los que no tienen nombre confirmado en el catálogo
// quedan como "Color NN" — el admin puede renombrarlos después si hace
// falta, sin perder el número ni el tono.
const ROLY_2026_COLORS = [
  { name: "01 Blanco", hex: "#ffffff" },
  { name: "02 Negro", hex: "#221f1f" },
  { name: "03 Amarillo", hex: "#f3dc2b" },
  { name: "05 Royal", hex: "#02518a" },
  { name: "Color 06", hex: "#877c6f" },
  { name: "07 Arena", hex: "#cfbc9f" },
  { name: "08 Moca", hex: "#997061" },
  { name: "10 Celeste", hex: "#8bc1e8" },
  { name: "12 Turquesa", hex: "#00afd9" },
  { name: "Color 13", hex: "#b4a16e" },
  { name: "15 Verde Militar", hex: "#63644e" },
  { name: "20 Verde Kelly", hex: "#0d7c4d" },
  { name: "Color 23", hex: "#636a77" },
  { name: "24 Verde Irish", hex: "#3fb76b" },
  { name: "Color 28", hex: "#b4c13b" },
  { name: "Color 29", hex: "#d5cdb1" },
  { name: "31 Naranja", hex: "#f68822" },
  { name: "Color 34", hex: "#d585b6" },
  { name: "Color 38", hex: "#3d4230" },
  { name: "Color 40", hex: "#cb1a7f" },
  { name: "43 Azul Profundo", hex: "#0e91c0" },
  { name: "45 Azul Luz de Luna", hex: "#004358" },
  { name: "46 Plomo Oscuro", hex: "#303738" },
  { name: "47 Gris", hex: "#909da3" },
  { name: "48 Rosa Claro", hex: "#f7c1d8" },
  { name: "55 Azul Marino", hex: "#103753" },
  { name: "56 Verde Botella", hex: "#044f3a" },
  { name: "57 Granate", hex: "#83203a" },
  { name: "58 Gris Vigoré", hex: "#a2a4aa" },
  { name: "60 Rojo", hex: "#c52027" },
  { name: "63 Morado", hex: "#45497b" },
  { name: "64 Burgundy", hex: "#86154e" },
  { name: "67 Nogal", hex: "#7f756a" },
  { name: "Color 69", hex: "#bcd86f" },
  { name: "71 Púrpura", hex: "#702571" },
  { name: "Color 72", hex: "#e25778" },
  { name: "73 Amarillo Sweet", hex: "#e9dba1" },
  { name: "78 Rosetón", hex: "#ca3c72" },
  { name: "83 Verde Grass", hex: "#3da648" },
  { name: "86 Azul Denim", hex: "#486880" },
  { name: "87 Chocolate", hex: "#3e2420" },
  { name: "Color 96", hex: "#f4c126" },
  { name: "98 Verde Menta", hex: "#a4d8cd" },
  { name: "Color 99", hex: "#044f94" },
  { name: "100 Azul Océano", hex: "#0d92c5" },
  { name: "101 Azul Sweet", hex: "#bbe6fa" },
  { name: "Color 106", hex: "#c32645" },
  { name: "Color 107", hex: "#4a4d3e" },
  { name: "108 Gris Piedra", hex: "#959595" },
  { name: "Color 112", hex: "#faee51" },
  { name: "114 Verde Oasis", hex: "#86c667" },
  { name: "Color 116", hex: "#540029" },
  { name: "118 Lima Limón", hex: "#e7e639" },
  { name: "120 Coral", hex: "#f37560" },
  { name: "121 Lila", hex: "#8e88a3" },
  { name: "125 Rosa Lady Flúor", hex: "#f2768f" },
  { name: "126 Azul Lavado", hex: "#85b2b7" },
  { name: "132 Blanco Vintage", hex: "#e2d8d6" },
  { name: "Color 143", hex: "#122b49" },
  { name: "152 Verde Aventura", hex: "#4d594a" },
  { name: "Color 157", hex: "#d9222d" },
  { name: "Color 158", hex: "#ffffff" },
  { name: "Color 159", hex: "#495347" },
  { name: "160 Ópalo", hex: "#939492" },
  { name: "Color 161", hex: "#ffffff" },
  { name: "Color 162", hex: "#ec3732" },
  { name: "Color 164", hex: "#6aa38e" },
  { name: "168 Rojo Pálido", hex: "#997179" },
  { name: "169 Rojo Baya", hex: "#7e525f" },
  { name: "170 Azul Tormenta", hex: "#547080" },
  { name: "Color 171", hex: "#7c959d" },
  { name: "172 Amarillo Curry", hex: "#b57833" },
  { name: "Color 176", hex: "#00b4d2" },
  { name: "Color 182", hex: "#ffffff" },
  { name: "Color 185", hex: "#023349" },
  { name: "216 Verde Tropical", hex: "#0d874c" },
  { name: "219 Arena Oscuro", hex: "#ae9d8c" },
  { name: "221 Amarillo Flúor", hex: "#e0e331" },
  { name: "222 Verde Flúor", hex: "#8cc63f" },
  { name: "223 Naranja Flúor", hex: "#f48241" },
  { name: "225 Lima", hex: "#83c342" },
  { name: "226 Verde Helecho", hex: "#22a64b" },
  { name: "228 Rosa Flúor", hex: "#ee468c" },
  { name: "229 Ángora", hex: "#efdabd" },
  { name: "230 Orquídea", hex: "#745899" },
  { name: "231 Ébano", hex: "#38424a" },
  { name: "Color 232", hex: "#5c653f" },
  { name: "234 Coral Flúor", hex: "#f2726d" },
  { name: "Color 235", hex: "#c3d734" },
  { name: "Color 236", hex: "#1598a7" },
  { name: "Color 242", hex: "#24a8e0" },
  { name: "261 Azul Riviera", hex: "#5d77a1" },
  { name: "262 Rojo Crisantemo", hex: "#c86768" },
  { name: "263 Azul Zen", hex: "#93a0b3" },
  { name: "264 Verde Mist", hex: "#c8d8be" },
  { name: "265 Naranja Greek", hex: "#b08b70" },
  { name: "266 Naranja Clay", hex: "#cf8f84" },
  { name: "267 Azul Dusty", hex: "#6a9497" },
  { name: "268 Lavanda", hex: "#9c899e" },
  { name: "275 Verde Laurel", hex: "#5a6a62" },
  { name: "276 Ocre", hex: "#bb9b57" },
  { name: "277 Teja", hex: "#a96a67" },
  { name: "278 Jade", hex: "#0fb69f" },
  { name: "Color 311", hex: "#f0652a" },
  { name: "316 Naranja Fuego", hex: "#ef4935" },
  { name: "Color 380", hex: "#343f31" },
  { name: "430 Azul Lago", hex: "#1d535d" },
  { name: "481 Rosa Seda", hex: "#f2829e" },
  { name: "643 Rojo Ciruela", hex: "#512640" },
  { name: "Color 651", hex: "#e22327" },
  { name: "Color 652", hex: "#ee436f" },
  { name: "711 Iris Púrpura", hex: "#6d5fa9" },
  { name: "777 Arándano", hex: "#80315f" },
  // Acabados "Vigoré" (jaspeados) y "Lavado" de la página de colores del
  // catálogo — el tono es el promedio de la muestra impresa.
  { name: "013 Blanco Vigoré", hex: "#d3d4d5" },
  { name: "177 Blanco Ceniza Vigoré", hex: "#f0f1f1" },
  { name: "249 Amarillo Flúor Vigoré", hex: "#e8e857" },
  { name: "39 Mostaza Vigoré", hex: "#edbf61" },
  { name: "244 Coral Flúor Vigoré", hex: "#f69e97" },
  { name: "245 Rojo Vigoré", hex: "#eb3c63" },
  { name: "256 Granate Vigoré", hex: "#913b4d" },
  { name: "252 Rosetón Vigoré", hex: "#d24f7d" },
  { name: "248 Royal Vigoré", hex: "#247cae" },
  { name: "255 Azul Dénim Vigoré", hex: "#5d6988" },
  { name: "247 Azul Marino Vigoré", hex: "#2a465f" },
  { name: "246 Turquesa Vigoré", hex: "#23b3c7" },
  { name: "693 Verde Mantis Vigoré", hex: "#c7de86" },
  { name: "250 Lima Vigoré", hex: "#96cb5f" },
  { name: "257 Verde Militar Oscuro Vigoré", hex: "#32705b" },
  { name: "243 Negro Vigoré", hex: "#5f6369" },
  { name: "801 Amarillo Sweet Lavado", hex: "#e5d99f" },
  { name: "805 Papaya Claro Lavado", hex: "#f79d6a" },
  { name: "804 Kaki Claro Lavado", hex: "#9b8d68" },
  { name: "806 Verde Pato Lavado", hex: "#51685e" },
  { name: "802 Gris Piedra Lavado", hex: "#989897" },
  { name: "803 Gris Cielo Lavado", hex: "#434755" },
];

// La primera vez que el admin entra después de esta actualización, suma
// automáticamente los colores de Roly 2026 a la librería de colores
// guardados (sin duplicar ni pisar los que ya existan, comparando por
// nombre) — así quedan disponibles para elegir en cualquier prenda sin
// tener que cargarlos a mano uno por uno.
async function seedRolyColorsIfNeeded(existing) {
  const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
  const missing = ROLY_2026_COLORS.filter((c) => !existingNames.has(c.name.toLowerCase()));
  if (!missing.length) return existing;
  const next = [...existing, ...missing];
  await persistSavedColors(next);
  return next;
}

// El número de cada color de Roly va al principio de su nombre ("05 Royal") o,
// para los que no tienen nombre oficial confirmado, después de "Color " ("Color
// 06") — esta función saca ese número de cualquiera de los dos formatos.
function rolyColorCode(name) {
  const m = name.match(/^(\d+)\b/) || name.match(/Color (\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Busca colores del catálogo Roly 2026 a partir de una lista de números que el
// admin escribe de una (separados por coma, espacio o salto de línea — "01",
// "1" o "001" matchean el mismo color). Devuelve los que encontró (en el
// orden pedido, sin repetidos) y los números que no existen en el catálogo,
// para poder avisarle cuáles revisar.
function lookupRolyColorsByNumbers(input) {
  const codes = (input.match(/\d+/g) || []).map((n) => parseInt(n, 10));
  const byCode = new Map();
  ROLY_2026_COLORS.forEach((c) => {
    const code = rolyColorCode(c.name);
    if (code !== null && !byCode.has(code)) byCode.set(code, c);
  });
  const found = [];
  const notFound = [];
  const seen = new Set();
  codes.forEach((code) => {
    if (seen.has(code)) return;
    seen.add(code);
    const match = byCode.get(code);
    if (match) found.push(match);
    else notFound.push(code);
  });
  return { found, notFound };
}

// Librería general de diseños propios de Kulto (PNG), reutilizable en
// cualquier prenda dentro de Personalizar — independiente de un producto.
// Igual que los productos, cada diseño se guarda en su propia fila (clave
// "kulto:design:{id}") más un índice liviano con los ids — así un diseño no
// depende de que TODOS los demás se reenvíen juntos en un solo registro cada
// vez (eso era lo que hacía que, apenas la librería crecía un poco, el envío
// se pusiera pesado y fallara en silencio sin guardar nada).
async function loadDesignLibrary() {
  const idxRaw = await storageGet("kulto:design-index", true);
  const ids = idxRaw ? JSON.parse(idxRaw) : null;
  if (ids && ids.length) {
    const keys = ids.map((id) => `kulto:design:${id}`);
    const map = await storageGetMany(keys, true);
    return keys.map((k) => map[k]).filter(Boolean).map((v) => JSON.parse(v));
  }
  // Compatibilidad con el formato viejo (un solo registro con todos los
  // diseños juntos) — si queda alguno guardado así, lo migramos al nuevo formato.
  const legacyRaw = await storageGet("kulto:design-library", true);
  const legacy = legacyRaw ? JSON.parse(legacyRaw) : [];
  for (const d of legacy) await persistDesignToLibrary(d);
  return legacy;
}
// Devuelve { ok, error } en vez de un booleano solo — así, si falla, la
// pantalla de "Diseños propios de Kulto" le puede mostrar al admin el motivo
// real en vez de un genérico "no se guardó". Reintenta una vez cada guardado
// por si fue un corte de red pasajero, y — importante — si falla el guardado
// de la imagen en sí, NO actualiza el índice: antes, aunque la imagen no se
// guardara, el índice se actualizaba igual, y el diseño quedaba "fantasma"
// (aparecía guardado en el momento pero desaparecía en la próxima carga,
// porque el índice apuntaba a una fila que nunca llegó a existir).
async function persistDesignToLibrary(design) {
  const value = JSON.stringify(design);
  let row = await storageSetVerbose(`kulto:design:${design.id}`, value, true);
  if (!row.ok) row = await storageSetVerbose(`kulto:design:${design.id}`, value, true);
  if (!row.ok) return { ok: false, error: row.error || "No se pudo guardar la imagen." };

  const idxRaw = await storageGet("kulto:design-index", true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  if (!ids.includes(design.id)) {
    ids.push(design.id);
    let idx = await storageSetVerbose("kulto:design-index", JSON.stringify(ids), true);
    if (!idx.ok) idx = await storageSetVerbose("kulto:design-index", JSON.stringify(ids), true);
    if (!idx.ok) return { ok: false, error: idx.error || "Se guardó la imagen pero no se pudo actualizar la lista de diseños." };
  }
  return { ok: true, error: null };
}
async function removeDesignFromLibrary(id) {
  await storageDelete(`kulto:design:${id}`, true);
  const idxRaw = await storageGet("kulto:design-index", true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  ids = ids.filter((x) => x !== id);
  await storageSet("kulto:design-index", JSON.stringify(ids), true);
}

// Carpetas para organizar la librería de diseños (ver arriba) — cada diseño
// puede pertenecer a una carpeta (design.folderId) o quedar "suelto". Cada
// carpeta guarda además hasta 4 ids de diseño elegidos a mano por el admin
// como "portada" (lo que se ve de afuera de la tarjeta sin entrar).
async function loadDesignFolders() {
  const raw = await storageGet("kulto:design-folders", true);
  return raw ? JSON.parse(raw) : [];
}
async function persistDesignFolders(folders) {
  await storageSet("kulto:design-folders", JSON.stringify(folders), true);
}

// Galería de "trabajos personalizados" (fotos de pedidos reales, para mostrar
// en el inicio) — mismo esquema de fila-por-foto + índice liviano que la
// librería de diseños de arriba, por la misma razón: evitar que un solo
// registro gigante con todas las fotos juntas se ponga pesado y falle al
// guardar apenas la galería crece un poco.
async function loadCustomWorkGallery() {
  const idxRaw = await storageGet("kulto:customwork-index", true);
  const ids = idxRaw ? JSON.parse(idxRaw) : [];
  if (!ids.length) return [];
  const keys = ids.map((id) => `kulto:customwork:${id}`);
  const map = await storageGetMany(keys, true);
  return keys.map((k) => map[k]).filter(Boolean).map((v) => JSON.parse(v));
}
async function persistCustomWorkPhoto(item) {
  const value = JSON.stringify(item);
  let row = await storageSetVerbose(`kulto:customwork:${item.id}`, value, true);
  if (!row.ok) row = await storageSetVerbose(`kulto:customwork:${item.id}`, value, true);
  if (!row.ok) return { ok: false, error: row.error || "No se pudo guardar la foto." };

  const idxRaw = await storageGet("kulto:customwork-index", true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  if (!ids.includes(item.id)) {
    ids.push(item.id);
    let idx = await storageSetVerbose("kulto:customwork-index", JSON.stringify(ids), true);
    if (!idx.ok) idx = await storageSetVerbose("kulto:customwork-index", JSON.stringify(ids), true);
    if (!idx.ok) return { ok: false, error: idx.error || "Se guardó la foto pero no se pudo actualizar la lista." };
  }
  return { ok: true, error: null };
}
async function removeCustomWorkPhoto(id) {
  await storageDelete(`kulto:customwork:${id}`, true);
  const idxRaw = await storageGet("kulto:customwork-index", true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  ids = ids.filter((x) => x !== id);
  await storageSet("kulto:customwork-index", JSON.stringify(ids), true);
}

// Cuentas de cliente — simples (email + contraseña), no reemplazan ni
// requieren el checkout por WhatsApp, solo habilitan el descuento de
// bienvenida y la tarjeta de puntos. La contraseña nunca se guarda en texto
// plano: se hashea con SHA-256 (Web Crypto, disponible en cualquier navegador).
async function hashPassword(pw) {
  try {
    const enc = new TextEncoder().encode(pw);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return pw; // entorno sin Web Crypto disponible — degradación mínima, no debería pasar en un navegador real
  }
}

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

async function loadCustomer(email) {
  const raw = await storageGet(`kulto:customer:${normalizeEmail(email)}`, true);
  return raw ? JSON.parse(raw) : null;
}
async function persistCustomer(customer) {
  await storageSet(`kulto:customer:${normalizeEmail(customer.email)}`, JSON.stringify(customer), true);
  const idxRaw = await storageGet("kulto:customer-index", true);
  let emails = idxRaw ? JSON.parse(idxRaw) : [];
  const norm = normalizeEmail(customer.email);
  if (!emails.includes(norm)) {
    emails.push(norm);
    await storageSet("kulto:customer-index", JSON.stringify(emails), true);
  }
}
async function loadAllCustomers() {
  const idxRaw = await storageGet("kulto:customer-index", true);
  const emails = idxRaw ? JSON.parse(idxRaw) : [];
  if (!emails.length) return [];
  const keys = emails.map((e) => `kulto:customer:${e}`);
  const map = await storageGetMany(keys, true);
  return keys.map((k) => map[k]).filter(Boolean).map((v) => JSON.parse(v));
}
async function removeCustomer(email) {
  const norm = normalizeEmail(email);
  await storageDelete(`kulto:customer:${norm}`, true);
  const idxRaw = await storageGet("kulto:customer-index", true);
  const emails = idxRaw ? JSON.parse(idxRaw) : [];
  await storageSet("kulto:customer-index", JSON.stringify(emails.filter((e) => e !== norm)), true);
}

async function loadPhotoInbox() {
  const raw = await storageGet("kulto:draft:photo-inbox", true);
  return raw ? JSON.parse(raw) : [];
}
async function persistPhotoInbox(list) {
  await storageSet("kulto:draft:photo-inbox", JSON.stringify(list), true);
}

const DEFAULT_THEME = { ink: "#15131A", bone: "#F3EFE6", signal: "#E8452C", sun: "#F4C430", slate: "#9A9488", cardShadow: "media" };

const CARD_SHADOWS = {
  ninguna: "none",
  suave: "0 4px 14px rgba(0,0,0,0.16)",
  media: "0 10px 22px rgba(0,0,0,0.26)",
  fuerte: "0 16px 34px rgba(0,0,0,0.4)",
};
const CARD_SHADOWS_HOVER = {
  ninguna: "0 4px 10px rgba(0,0,0,0.18)",
  suave: "0 10px 20px rgba(0,0,0,0.24)",
  media: "0 16px 30px rgba(0,0,0,0.34)",
  fuerte: "0 22px 40px rgba(0,0,0,0.48)",
};

// Comunidades autónomas + Ceuta y Melilla, para el selector de provincia del
// checkout y la tabla de precios de envío por destino en Ajustes → Envío.
const SPAIN_REGIONS = [
  "Andalucía", "Aragón", "Asturias", "Islas Baleares", "Canarias", "Cantabria",
  "Castilla-La Mancha", "Castilla y León", "Cataluña", "Ceuta",
  "Comunidad Valenciana", "Extremadura", "Galicia", "La Rioja", "Madrid",
  "Melilla", "Murcia", "Navarra", "País Vasco",
];

// Precios de partida por comunidad — a modo de referencia, pensados para un
// paquete chico (ropa) con un transportista de paquetería personal: en
// península suele costar lo mismo enviar a cualquier destino, mientras que
// Canarias, Ceuta y Melilla salen bastante más caros por el transporte
// especial que necesitan. El admin puede ajustar cada uno en Ajustes → Envío
// para que coincida con lo que realmente le cobra su transportista.
const DEFAULT_SHIPPING_REGION_PRICES = Object.fromEntries(
  SPAIN_REGIONS.map((region) => [region, ["Canarias", "Ceuta", "Melilla"].includes(region) ? 18 : (region === "Islas Baleares" ? 7.5 : 4.5)])
);

const DEFAULT_SETTINGS = {
  shippingFlatRate: 3.5, freeShippingThreshold: 30,
  shippingRegionPrices: DEFAULT_SHIPPING_REGION_PRICES,
  logoImage: null, logoText: "",
  heroTitle: "Tu estilo,\ntu kulto.",
  heroSubtitle: "Camisetas, sudaderas y accesorios sublimados a tu manera. Elige la prenda, el color y el diseño — nosotros lo estampamos.",
  heroImage: null,
  heroImages: [],
  howItWorksSteps: [],
  howItWorksCardSize: "md",
  howItWorksImageShape: "auto",
  productsMenuItems: [],
  personalizeGroupCovers: {},
  personalizeSubcategoryCovers: {},
  personalizeSubcategoryPrices: {},
  personalizeCardBg: {},
  localDeliveryAreas: [],
  customWorkSpeed: 0.3,
  banners: [],
  homeSections: [],
  theme: DEFAULT_THEME,
  designFeedbackOptions: [
    "Quiero el fondo de otro color",
    "El diseño quedó muy chico",
    "El diseño quedó muy grande",
    "Se ve borrosa o pixelada",
    "Prefiero mandar otra foto",
  ],
  depositEnabled: true,
  depositPercent: 50,
  depositInfo: "Bizum al +34662317094",
  designServiceEnabled: true,
  designServiceFee: 2,
  personalizedBasePrice: 20,
  printSizeGuideEnabled: true,
  printSizeGuideFrontText: "El tamaño habitual para un diseño grande centrado en el pecho es de 25 a 30 cm de ancho por 30 a 38 cm de alto, empezando unos 5 a 8 cm por debajo del cuello. Si preferís un logo chico tipo pecho izquierdo, lo normal es de 8 a 12 cm de ancho y alto.",
  printSizeGuideBackText: "En la espalda el diseño grande puede ser un poco más grande: entre 30 y 35 cm de ancho (hasta 40-45 cm en estilos oversize) por 30 a 38 cm de alto, empezando unos 6 a 9 cm por debajo del cuello. Si es solo un detalle chico arriba, ronda los 10 a 14 cm de ancho por 3 a 8 cm de alto.",
  printSizeGuideFrontImage: null,
  printSizeGuideBackImage: null,
  qualityPolicyEnabled: true,
  qualityPolicyText: "Reponemos sin cargo cualquier prenda que llegue con fallas de fabricación.",
  productionTimeNormal: "3-5 días",
  signupDiscountEnabled: true,
  signupPopupEnabled: true,
  signupDiscountPercent: 10,
  loyaltyEnabled: true,
  loyaltyPointsPerItem: 1,
  loyaltyRewardThreshold: 5,
  loyaltyRewardDescription: "Cada 5 prendas compradas, la 6ta es gratis.",
  // Recompensas: botón flotante, premios canjeables con puntos y códigos del
  // carrito (se editan en el panel → Beneficios).
  rewardsEnabled: true,
  rewardsButtonLabel: "Recompensas",
  rewardsColor: "#E63946",
  rewardsEarnText: "",
  rewardsRedeemText: "",
  loyaltyRewards: [
    { id: "rw1", name: "10% de descuento", pointsCost: 5, type: "percent", value: 10, giftText: "", color: "#E63946", active: true },
  ],
  promoCodes: [
    { id: "pc1", code: "KULTO10", label: "Ejemplo: 10% de descuento", type: "percent", value: 10, giftText: "", minSubtotal: 0, maxUses: 0, startsAt: "", endsAt: "", perCustomerOnce: false, color: "#2A9D8F", active: false },
  ],
  returnsPolicyEnabled: true,
  returnsPolicyText: "Tenés 10 días desde que recibís tu pedido para pedir un cambio o la devolución, siempre que la prenda esté sin usar, sin lavar y con sus etiquetas. Las prendas personalizadas o hechas a medida no tienen cambio salvo falla de fabricación. Escribinos por WhatsApp contándonos qué pasó y coordinamos los pasos a seguir.",
  // El bloque de preguntas frecuentes solo se muestra en el inicio (ver
  // FaqSection) — este tilde deja apagarlo del todo si no se quiere mostrar.
  faqEnabled: true,
  faqItems: [
    { id: "faq1", question: "¿Cuánto tarda en llegar mi pedido?", answer: "Los productos normales salen en 3-5 días hábiles. Los personalizados pueden tardar entre 3 y 7 días porque se sublimman a pedido." },
    { id: "faq2", question: "¿Puedo cambiar o devolver una prenda?", answer: "Sí, tenés 10 días desde que la recibís — mirá la sección de cambios y devoluciones más abajo para los detalles." },
    { id: "faq3", question: "¿Cómo sé qué talle pedir?", answer: "Cada prenda tiene su guía de talles en la ficha de producto, justo debajo de las opciones de talle." },
    { id: "faq4", question: "¿Cómo pago mi pedido?", answer: "Coordinamos el pago por WhatsApp al confirmar la compra — aceptamos Bizum y transferencia." },
  ],
  socialInstagram: "https://www.instagram.com/kulto25",
  socialFacebook: "",
  socialTiktok: "",
  contactEmail: "",
  contactPhone: "",
  contactAddress: "",
  // Número de WhatsApp para los botones "Escribir por WhatsApp" de la web
  // (formato internacional sin "+" ni espacios, ej: 34612345678). Arranca
  // vacío a propósito: mientras no se cargue ninguno acá, esos botones se
  // ocultan solos en toda la web (el pedido en sí nunca depende de esto).
  whatsappNumber: "",
  // Globito flotante de WhatsApp (abajo a la derecha, en todas las páginas).
  // Es independiente del número de arriba: el admin lo puede prender o
  // apagar a mano, aunque ya haya un número cargado. Arranca apagado.
  whatsappFloatEnabled: false,
  // "En tendencia" automático: combina ventas y vistas de cada producto para
  // sumar (sin pisar) a los que el admin ya marcó a mano — ver
  // computeTrendingIds y AdminSalesPanel.
  trendingAutoEnabled: true,
  trendingAutoCount: 8,
  bestsellerAutoEnabled: true,
  bestsellerAutoCount: 8,
  // Umbral de stock bajo para el apartado "Compras" del panel — ver
  // AdminRestockPanel.
  lowStockThreshold: 3,
  // Link para mostrar las estadísticas de Google (Looker Studio) adentro de
  // la pestaña "Estadísticas" del panel — ver AdminAnalyticsPanel. Google
  // Analytics en sí no se puede "incrustar" dentro de otra página (Google no
  // lo permite por seguridad), pero un reporte de Looker Studio (otra
  // herramienta gratis de Google, conectada a los mismos datos) sí se puede
  // insertar así, con gráficos reales actualizados solos.
  analyticsEmbedUrl: "",
};

const HOME_SECTION_DEFS = [
  { key: "bestsellers", label: "Más vendido" },
  { key: "ofertas", label: "En oferta" },
  { key: "tendencia", label: "Tendencia" },
  { key: "cta", label: 'Banner "Crea una prenda única"' },
  { key: "customwork", label: "Trabajos personalizados (galería)" },
  { key: "reviews", label: "Reseñas de clientes" },
];
const DEFAULT_HOME_SECTIONS = HOME_SECTION_DEFS.map((s) => ({ key: s.key, visible: true }));

// Combina las secciones fijas de la web con un ítem por cada banner que el
// admin haya marcado como "sección" (en vez de portada), respetando el orden
// y las visibilidades ya guardadas y agregando al final lo que sea nuevo.
function getEffectiveHomeSections(settings) {
  const staticKeys = HOME_SECTION_DEFS.map((d) => d.key);
  const sectionBanners = (settings.banners || []).filter((b) => b.placement === "section");
  const bannerKeys = sectionBanners.map((b) => `banner:${b.id}`);
  const allKeys = [...staticKeys, ...bannerKeys];
  const saved = settings.homeSections || [];
  const result = saved.filter((s) => allKeys.includes(s.key));
  allKeys.forEach((k) => {
    if (!result.some((s) => s.key === k)) result.push({ key: k, visible: true });
  });
  return result;
}

const EMPTY_ADDRESS = { street: "", number: "", apartment: "", city: "", state: "", postalCode: "", country: "España", reference: "" };

function formatAddress(a) {
  if (!a) return "";
  const line1 = [a.street, a.number].filter(Boolean).join(" ");
  const line2 = a.apartment ? `${a.apartment}` : "";
  const line3 = [a.postalCode, a.city].filter(Boolean).join(" ");
  const line4 = a.state || "";
  const lines = [line1, line2, line3, line4, a.country].filter(Boolean);
  return lines.join(", ") + (a.reference ? ` · Referencia: ${a.reference}` : "");
}

async function loadSettings() {
  const raw = await storageGet("kulto:settings", true);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed, theme: { ...DEFAULT_THEME, ...(parsed.theme || {}) } };
    } catch { /* fall through */ }
  }
  return DEFAULT_SETTINGS;
}

async function persistSettings(settings) {
  await storageSet("kulto:settings", JSON.stringify(settings), true);
}

// --- Migración de fotos viejas a Storage ---------------------------------
// Todo lo de acá abajo es para las fotos que se guardaron ANTES de este
// cambio, que quedaron como texto enorme adentro de su fila (productos,
// ajustes, diseños, trabajos personalizados) — eso es lo que las hacía
// lentas o directamente imposibles de leer. Recorremos cada dato guardado
// buscando fotos "data:image/..." y las subimos a Storage, dejando en su
// lugar el link — así esas filas quedan livianas para siempre. Se corre una
// sola vez, en segundo plano, sin bloquear la carga de la tienda.
function isEmbeddedImage(v) {
  return typeof v === "string" && v.startsWith("data:image/") && v.length > 300;
}
// Recorre cualquier dato guardado (un producto, los ajustes, un diseño...) y
// reemplaza, en el lugar donde estén, todas las fotos embebidas que
// encuentre por su link en Storage — sin importar el nombre del campo ni
// qué tan anidado esté (colores de un producto, pasos de "cómo funciona",
// portadas por categoría, etc.), así no hace falta enumerar cada campo a mano.
async function migrateImagesDeep(value) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = await migrateImagesDeep(value[i]);
    return value;
  }
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) value[k] = await migrateImagesDeep(value[k]);
    return value;
  }
  if (isEmbeddedImage(value)) {
    const url = await uploadDataUrlToStorage(value);
    return url || value;
  }
  return value;
}
// Migra un ítem (producto, diseño, foto de trabajo personalizado) y lo
// vuelve a guardar SOLO si de verdad tenía alguna foto vieja adentro —
// para no reescribir de más lo que ya está liviano.
async function migrateAndPersist(item, persistFn) {
  const before = JSON.stringify(item);
  const migrated = await migrateImagesDeep(item);
  if (JSON.stringify(migrated) !== before) await persistFn(migrated);
}
async function migrateLegacyImages({ products, draftProducts, designLibrary, customWorkGallery }) {
  // Probamos primero con una imagen mínima: si el bucket "kulto-photos"
  // todavía no está creado, esto falla al toque y no perdemos tiempo
  // recorriendo todo el catálogo para nada.
  const probeUrl = await uploadDataUrlToStorage(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  );
  if (!probeUrl) return;

  for (const p of products || []) await migrateAndPersist(p, persistProduct);
  for (const p of draftProducts || []) await migrateAndPersist(p, persistDraftProduct);
  for (const d of designLibrary || []) await migrateAndPersist(d, persistDesignToLibrary);
  for (const c of customWorkGallery || []) await migrateAndPersist(c, persistCustomWorkPhoto);
  // Los ajustes son una sola fila (no se puede dividir en tandas), así que
  // si tenían varias fotos juntas (portada del hero, pasos, portadas de
  // categoría) era justo lo que más rápido la hacía fallar al guardar.
  const settings = await loadSettings();
  await migrateAndPersist(settings, persistSettings);
}

async function loadOrders() {
  const idxRaw = await storageGet("kulto:order-index", true);
  const ids = idxRaw ? JSON.parse(idxRaw) : [];
  if (!ids.length) return [];
  const keys = ids.map((id) => `kulto:order:${id}`);
  const map = await storageGetMany(keys, true);
  return keys.map((k) => map[k]).filter(Boolean).map((v) => JSON.parse(v));
}

async function persistOrder(order) {
  await storageSet(`kulto:order:${order.id}`, JSON.stringify(order), true);
  const idxRaw = await storageGet("kulto:order-index", true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  ids.unshift(order.id);
  await storageSet("kulto:order-index", JSON.stringify(ids), true);
}

async function updateOrder(order) {
  await storageSet(`kulto:order:${order.id}`, JSON.stringify(order), true);
}

async function removeOrder(id) {
  await storageDelete(`kulto:order:${id}`, true);
  const idxRaw = await storageGet("kulto:order-index", true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  ids = ids.filter((x) => x !== id);
  await storageSet("kulto:order-index", JSON.stringify(ids), true);
}

async function findOrderById(id) {
  const raw = await storageGet(`kulto:order:${id.trim().toUpperCase()}`, true);
  return raw ? JSON.parse(raw) : null;
}

async function loadReviews() {
  const idxRaw = await storageGet("kulto:review-index", true);
  const ids = idxRaw ? JSON.parse(idxRaw) : [];
  if (!ids.length) return [];
  const keys = ids.map((id) => `kulto:review:${id}`);
  const map = await storageGetMany(keys, true);
  // Preserve the admin-chosen order from the index, not storage return order.
  return ids.map((id) => map[`kulto:review:${id}`]).filter(Boolean).map((v) => JSON.parse(v));
}

async function persistReview(review) {
  await storageSet(`kulto:review:${review.id}`, JSON.stringify(review), true);
  const idxRaw = await storageGet("kulto:review-index", true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  if (!ids.includes(review.id)) {
    ids.push(review.id);
    await storageSet("kulto:review-index", JSON.stringify(ids), true);
  }
}

async function removeReview(id) {
  await storageDelete(`kulto:review:${id}`, true);
  const idxRaw = await storageGet("kulto:review-index", true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  ids = ids.filter((x) => x !== id);
  await storageSet("kulto:review-index", JSON.stringify(ids), true);
}

async function persistReviewOrder(ids) {
  await storageSet("kulto:review-index", JSON.stringify(ids), true);
}

// Mensajes que llegan por el formulario de "Contacto" — se guardan acá,
// además de mandarse por mail, para que el admin los pueda ver, responder,
// y marcar cómo quedó la incidencia (resuelta o no, cambio/devolución
// aprobado o no, y si se le regaló un % de descuento para la próxima compra)
// desde el panel de administrador.
async function loadContactMessages() {
  const idxRaw = await storageGet("kulto:contact-index", true);
  const ids = idxRaw ? JSON.parse(idxRaw) : [];
  if (!ids.length) return [];
  const keys = ids.map((id) => `kulto:contact:${id}`);
  const map = await storageGetMany(keys, true);
  return ids
    .map((id) => map[`kulto:contact:${id}`])
    .filter(Boolean)
    .map((v) => JSON.parse(v))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
async function persistContactMessage(msg) {
  await storageSet(`kulto:contact:${msg.id}`, JSON.stringify(msg), true);
  const idxRaw = await storageGet("kulto:contact-index", true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  if (!ids.includes(msg.id)) {
    ids.push(msg.id);
    await storageSet("kulto:contact-index", JSON.stringify(ids), true);
  }
}
async function removeContactMessage(id) {
  await storageDelete(`kulto:contact:${id}`, true);
  const idxRaw = await storageGet("kulto:contact-index", true);
  let ids = idxRaw ? JSON.parse(idxRaw) : [];
  ids = ids.filter((x) => x !== id);
  await storageSet("kulto:contact-index", JSON.stringify(ids), true);
}

function genDiscountCode(percent) {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `KULTO${percent}-${rand}`;
}

/* ------------------------------------------------------------------ */
/*  Recompensas y códigos promocionales                                */
/* ------------------------------------------------------------------ */
const PROMO_TYPES = [
  ["percent", "% de descuento"],
  ["fixed", "Monto fijo de descuento"],
  ["freeShipping", "Envío gratis"],
  ["gift", "Premio / regalo"],
];
const PROMO_COLORS = ["#E63946", "#F4A261", "#2A9D8F", "#4C6EF5", "#9B5DE5", "#F15BB5", "#00BBF9", "#8AC926"];

function describeBenefit(b) {
  if (!b) return "";
  const v = Number(b.value) || 0;
  if (b.type === "percent") return `${v}% de descuento`;
  if (b.type === "fixed") return `${formatPrice(v)} de descuento`;
  if (b.type === "freeShipping") return "Envío gratis";
  if (b.type === "gift") return b.giftText || "Premio sorpresa";
  return "";
}
function normalizePromoCode(s) {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, "");
}
function genRewardCode() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PREMIO-${rand}`;
}
function getActiveRewards(settings) {
  return (settings?.loyaltyRewards || [])
    .filter((r) => r && r.active !== false && Number(r.pointsCost) > 0)
    .sort((a, b) => Number(a.pointsCost) - Number(b.pointsCost));
}
// Cuántas veces se usó cada código compartido (para el tope de usos).
async function loadPromoUsage() {
  try {
    const raw = await storageGet("kulto:promo-usage", true);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
async function bumpPromoUsage(code) {
  try {
    const u = await loadPromoUsage();
    u[code] = (u[code] || 0) + 1;
    await storageSet("kulto:promo-usage", JSON.stringify(u), true);
  } catch { /* nunca bloquear el pedido por esto */ }
}
// Busca un código: primero entre los personales del cliente (canjeados con
// puntos) y después entre los códigos generales del admin.
function findPromo(code, settings, customer, usage) {
  const c = normalizePromoCode(code);
  const mine = (customer?.rewardCodes || []).find((r) => normalizePromoCode(r.code) === c);
  if (mine) {
    if (mine.usedAt) return { ok: false, error: "Este código ya lo usaste." };
    return { ok: true, promo: { ...mine, label: mine.name || "", code: c, personal: true } };
  }
  const p = (settings?.promoCodes || []).find((x) => x && normalizePromoCode(x.code) === c);
  if (!p || p.active === false) return { ok: false, error: "Ese código no existe o ya no está vigente." };
  const now = new Date();
  if (p.startsAt && new Date(`${p.startsAt}T00:00:00`) > now) return { ok: false, error: "Este código todavía no empezó." };
  if (p.endsAt && new Date(`${p.endsAt}T23:59:59`) < now) return { ok: false, error: "Este código ya venció." };
  if (Number(p.maxUses) > 0 && (usage?.[c] || 0) >= Number(p.maxUses)) return { ok: false, error: "Este código ya se agotó." };
  if (p.perCustomerOnce) {
    if (!customer) return { ok: false, error: "Iniciá sesión para usar este código." };
    if ((customer.usedPromoCodes || []).includes(c)) return { ok: false, error: "Ya usaste este código." };
  }
  return { ok: true, promo: { ...p, code: c, personal: false } };
}
// Calcula lo que da un código para el subtotal actual del carrito.
function evalPromo(promo, subtotal, customer) {
  if (!promo) return { ok: false, error: "" };
  if (promo.personal && !(customer?.rewardCodes || []).some((r) => normalizePromoCode(r.code) === promo.code && !r.usedAt)) {
    return { ok: false, error: "Iniciá sesión con la cuenta que canjeó este código." };
  }
  const min = Number(promo.minSubtotal) || 0;
  if (min > 0 && subtotal < min) return { ok: false, error: `Este código pide una compra mínima de ${formatPrice(min)}.` };
  const v = Number(promo.value) || 0;
  let discount = 0;
  let freeShipping = false;
  let gift = "";
  if (promo.type === "percent") discount = Math.round((subtotal * Math.min(100, v)) / 100 * 100) / 100;
  else if (promo.type === "fixed") discount = Math.min(v, subtotal);
  else if (promo.type === "freeShipping") freeShipping = true;
  else if (promo.type === "gift") gift = promo.giftText || promo.label || "Premio sorpresa";
  return { ok: true, discount, freeShipping, gift };
}
// Texto corto con el beneficio que usó un pedido (mensaje y mails).
function promoOrderSummary(order) {
  if (!order || !order.promoCode) return "";
  const parts = [];
  if (order.promoDiscount > 0) parts.push(`-${formatPrice(order.promoDiscount)}`);
  if (order.promoFreeShipping) parts.push("envío gratis");
  if (order.promoGift) parts.push(`premio: ${order.promoGift}`);
  return `Código ${order.promoCode}${parts.length ? ": " + parts.join(", ") : ""}`;
}

async function loadCartState() {
  const raw = await storageGet("kulto:cart-state", false);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  return { items: [], email: "", name: "", phone: "", savedAt: null };
}
async function persistCartState(state) {
  await storageSet("kulto:cart-state", JSON.stringify(state), false);
}

const ABANDONED_HOURS = 24;
function hoursSince(ts) {
  if (!ts) return 0;
  return (Date.now() - ts) / 36e5;
}

/* ------------------------------------------------------------------ */
/*  Global style (design tokens)                                       */
/* ------------------------------------------------------------------ */

function GlobalStyle({ colors }) {
  const c = { ...DEFAULT_THEME, ...(colors || {}) };
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&display=swap');
      :root{
        --ink:${c.ink};
        --ink-2:color-mix(in srgb, ${c.ink} 88%, white);
        --ink-3:color-mix(in srgb, ${c.ink} 78%, white);
        --bone:${c.bone};
        --signal:${c.signal};
        --sun:${c.sun};
        --slate:${c.slate};
        --line:color-mix(in srgb, ${c.bone} 14%, transparent);
        --font-display:'Archivo Black', 'Inter', sans-serif;
        --font-body:'Inter', sans-serif;
      }
      .kulto-root{ font-family:var(--font-body); background:var(--ink); color:var(--bone); transition:filter .25s ease; }
      .kulto-root *{ box-sizing:border-box; }
      /* Modo claro: en vez de redefinir cada color a mano (la web entera da
         por sentado que el fondo es oscuro y el texto claro, en cientos de
         lugares), invertimos toda la página y le devolvemos el color
         original a las fotos — así se mantiene siempre el mismo contraste
         entre fondo y texto, sin botones que queden ilegibles. */
      .kulto-root[data-mode="light"]{ filter:invert(1) hue-rotate(180deg); }
      .kulto-root[data-mode="light"] img,
      .kulto-root[data-mode="light"] video{ filter:invert(1) hue-rotate(180deg) !important; }
      @media (prefers-reduced-motion: reduce){
        .kulto-root{ transition:none !important; }
      }
      .kulto-display{ font-family:var(--font-display); text-transform:uppercase; }
      .kulto-scrollbar::-webkit-scrollbar{ height:6px; width:6px; }
      .kulto-scrollbar::-webkit-scrollbar-thumb{ background:var(--line); border-radius:99px; }
      .kulto-btn{ cursor:pointer; transition:transform .15s ease, opacity .15s ease; }
      .kulto-btn:hover{ opacity:.88; }
      .kulto-btn:active{ transform:scale(0.97); }
      .kulto-nav{ position:relative; transition:color .2s ease, transform .2s ease; }
      .kulto-nav::after{ content:""; position:absolute; left:0; right:0; bottom:-2px; height:2px; border-radius:2px; background:var(--sun); transform:scaleX(0); transform-origin:left center; transition:transform .28s ease; }
      .kulto-nav:hover{ color:var(--sun) !important; opacity:1; transform:translateY(-1px); }
      .kulto-nav:hover::after, .kulto-nav:focus-visible::after{ transform:scaleX(1); }
      .kulto-card:hover .kulto-card-img{ transform:scale(1.12); }
      .kulto-card-img{ transition:transform .3s ease; }
      .kulto-card{ transition:box-shadow .25s ease, transform .25s ease; box-shadow:${CARD_SHADOWS[c.cardShadow] || CARD_SHADOWS.media}; }
      .kulto-card:hover{ box-shadow:${CARD_SHADOWS_HOVER[c.cardShadow] || CARD_SHADOWS_HOVER.media}; transform:translateY(-3px); }
      .kulto-banner-tile:hover .kulto-banner-tile-img{ transform:scale(1.06); }
      .kulto-banner-tile-img{ transition:transform .4s ease; }
      .kulto-banner-tile{ transition:transform .25s ease, box-shadow .25s ease; }
      .kulto-banner-clickable:hover{ transform:scale(1.012); box-shadow:0 0 0 3px var(--banner-glow, transparent), 0 18px 40px -14px var(--banner-glow, transparent); }
      .kulto-flip-outer{ position:relative; perspective:1200px; }
      .kulto-flip-inner{ position:absolute; inset:0; transition:transform .5s; transform-style:preserve-3d; }
      .kulto-flip-face{ position:absolute; inset:0; width:100%; height:100%; backface-visibility:hidden; -webkit-backface-visibility:hidden; }
      .kulto-flip-back{ transform:rotateY(180deg); }
      .kulto-flip-inner.is-flipped{ transform:rotateY(180deg); }
      @media (hover:hover){
        .kulto-flip-outer:hover .kulto-flip-inner{ transform:rotateY(180deg); }
      }
      @media (prefers-reduced-motion: reduce){
        .kulto-flip-inner{ transition:none !important; }
      }
      @keyframes kulto-hero-fadein{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:translateY(0); } }
      .kulto-hero-fade{ animation:kulto-hero-fadein .5s ease; }
      @media (prefers-reduced-motion: reduce){
        .kulto-hero-fade{ animation:none !important; }
      }
      input, textarea, select{ font-family:var(--font-body); outline:none; }
      input:focus, textarea:focus, select:focus{ box-shadow:0 0 0 2px var(--sun); }
      ::selection{ background:var(--sun); color:var(--ink); }
      @keyframes kulto-marquee{ from{ transform:translateX(0); } to{ transform:translateX(-50%); } }
      .kulto-marquee-track{ display:flex; width:max-content; animation:kulto-marquee 24s linear infinite; }
      @keyframes kulto-shimmer{ 0%{ background-position:100% 50%; } 100%{ background-position:0 50%; } }
      .kulto-skel{ background:linear-gradient(90deg, var(--ink-2) 25%, var(--ink-3) 37%, var(--ink-2) 63%); background-size:400% 100%; animation:kulto-shimmer 1.4s ease infinite; }
      @media (prefers-reduced-motion: reduce){
        .kulto-btn, .kulto-nav, .kulto-nav::after, .kulto-card-img, .kulto-card, .kulto-banner-tile-img, .kulto-banner-tile{ transition:none !important; }
        .kulto-marquee-track{ animation:none !important; }
      }
    `}</style>
  );
}

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function Badge({ children, tone = "signal" }) {
  const bg = tone === "signal" ? "var(--signal)" : tone === "sun" ? "var(--sun)" : "var(--ink-3)";
  const color = tone === "sun" ? "var(--ink)" : "var(--bone)";
  return (
    <span
      className="text-xs font-semibold px-2 py-1 rounded-full"
      style={{ background: bg, color }}
    >
      {children}
    </span>
  );
}

// Migas de pan simples: cada paso es { label, onClick } — el último paso
// (la página actual) no lleva onClick y se muestra sin subrayar.
function Breadcrumbs({ steps = [] }) {
  if (steps.length < 2) return null;
  return (
    <nav aria-label="Ruta de navegación" className="flex items-center flex-wrap gap-1 text-xs mb-4" style={{ color: "var(--slate)" }}>
      {steps.map((s, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} />}
          {s.onClick && i < steps.length - 1 ? (
            <button onClick={s.onClick} className="kulto-btn hover:underline" style={{ color: "var(--slate)" }}>
              {s.label}
            </button>
          ) : (
            <span style={{ color: i === steps.length - 1 ? "var(--bone)" : "var(--slate)" }}>{s.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function SectionTitle({ eyebrow, title, action }) {
  return (
    <div className="flex items-end justify-between mb-5 gap-4">
      <div>
        {eyebrow && (
          <div className="text-sm mb-1" style={{ color: "var(--sun)" }}>{eyebrow}</div>
        )}
        <h2 className="kulto-display text-2xl md:text-3xl" style={{ color: "var(--bone)" }}>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ text, cta }) {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{ background: "var(--ink-2)", border: "1px dashed var(--line)" }}
    >
      <Package size={28} style={{ color: "var(--slate)", margin: "0 auto 10px" }} />
      <p style={{ color: "var(--slate)" }} className="text-sm">{text}</p>
      {cta}
    </div>
  );
}

function ColorSwatch({ hex, selected, onClick, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="kulto-btn rounded-full"
      style={{
        width: 34, height: 34, background: hex,
        border: selected ? "3px solid var(--sun)" : "2px solid rgba(243,239,230,0.35)",
        boxShadow: selected ? "0 0 0 2px var(--ink-2)" : "none",
      }}
    />
  );
}

// Small "Ver guía de talles" link that expands into a table of medidas y/o
// una imagen (por ejemplo, la foto de la tabla de talles del fabricante) —
// cada prenda puede tener una, la otra, o las dos. Renders nothing if the
// product has neither loaded.
function SizeGuideToggle({ sizeGuide, sizeGuideImage }) {
  const [open, setOpen] = useState(false);
  const hasTable = sizeGuide && sizeGuide.length > 0;
  const hasImage = !!sizeGuideImage;
  if (!hasTable && !hasImage) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="kulto-btn text-xs font-semibold underline"
        style={{ color: "var(--slate)" }}
      >
        {open ? "Ocultar guía de talles" : "Ver guía de talles"}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {hasTable && (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
              {sizeGuide.map((g, i) => (
                <div
                  key={g.size}
                  className="flex items-center gap-3 px-3 py-2 text-xs"
                  style={{ background: i % 2 === 0 ? "var(--ink-2)" : "transparent", color: "var(--bone)" }}
                >
                  <span className="font-semibold w-12 shrink-0">{g.size}</span>
                  <span style={{ color: "var(--slate)" }}>{g.measurements}</span>
                </div>
              ))}
            </div>
          )}
          {hasImage && (
            <img
              loading="lazy"
              src={sizeGuideImage}
              alt="Guía de talles con las medidas de la prenda"
              className="w-full rounded-xl"
              style={{ border: "1px solid var(--line)" }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Guía de tamaños de estampado en el paso de diseño de Personalizar — un
// texto (editable por el administrador) que aclara qué medidas suele tener
// un diseño grande, uno chico tipo bolsillo, etc. en esa zona (adelante o
// atrás), para que el cliente sepa de antemano el tamaño aproximado y no se
// lleve una sorpresa cuando le llegue la prenda. No aplica a mangas.
function PrintSizeGuide({ settings, zone }) {
  const [open, setOpen] = useState(false);
  if (!settings?.printSizeGuideEnabled) return null;
  if (zone !== "front" && zone !== "back") return null;
  const text = zone === "back" ? settings?.printSizeGuideBackText : settings?.printSizeGuideFrontText;
  const image = zone === "back" ? settings?.printSizeGuideBackImage : settings?.printSizeGuideFrontImage;
  if (!text && !image) return null;
  return (
    <div className="mt-3 max-w-md mx-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="kulto-btn text-xs font-semibold underline block mx-auto"
        style={{ color: "var(--slate)" }}
      >
        {open ? "Ocultar guía de tamaños del diseño" : "Ver guía de tamaños del diseño"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl p-3 flex flex-col gap-3 sm:flex-row sm:items-start" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
          {image && (
            <img
              loading="lazy"
              src={image}
              alt={`Guía de tamaños de estampado - ${zone === "back" ? "espalda" : "adelante"}`}
              className="w-full sm:w-28 sm:shrink-0 rounded-lg"
              style={{ aspectRatio: "4 / 5", objectFit: "cover", border: "1px solid var(--line)" }}
            />
          )}
          {text && (
            <p className="text-xs whitespace-pre-line" style={{ color: "var(--bone)" }}>{text}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Product card                                                       */
/* ------------------------------------------------------------------ */

function ProductCard({ product, onOpen, isFavorite, onToggleFavorite, onAddToCart }) {
  const colors = product.colors || [];
  // Armamos una sola lista con las fotos de TODOS los colores, una atrás de
  // la otra (o el pool general del producto si no hay fotos cargadas por
  // color) — así las flechitas dejan ver todas las fotos del producto sin
  // tener que entrar a él, sea como sea que estén organizadas (aunque cada
  // color tenga una sola foto). "starts[i]" guarda en qué posición de esa
  // lista arrancan las fotos del color i (o null si ese color no tiene fotos
  // propias cargadas).
  const starts = [];
  let combined = [];
  colors.forEach((c) => {
    const imgs = getColorImages(c);
    if (imgs.length > 0) {
      starts.push(combined.length);
      combined = combined.concat(imgs);
    } else {
      starts.push(null);
    }
  });
  if (combined.length === 0 && product.photoPool && product.photoPool.length) {
    combined = product.photoPool;
  }
  const images = combined;

  const [idx, setIdx] = useState(0);
  // A qué color pertenece la foto que se está mostrando, para resaltar el
  // punto correspondiente aunque se haya llegado ahí con las flechitas.
  let activeColorIdx = -1;
  starts.forEach((s, i) => { if (s !== null && s <= idx) activeColorIdx = i; });
  const activeColor = activeColorIdx >= 0 ? colors[activeColorIdx] : colors[0];

  const onSale = product.tags?.oferta && product.salePrice;
  const isCover = product.imageFit === "cover";
  const bg = product.imageBackground || (activeColor ? activeColor.hex : "var(--ink-3)");

  const prev = (e) => { e.stopPropagation(); setIdx((i) => (i - 1 + images.length) % images.length); };
  const next = (e) => { e.stopPropagation(); setIdx((i) => (i + 1) % images.length); };
  const pickColor = (e, i) => { e.stopPropagation(); if (starts[i] !== null) setIdx(starts[i]); };

  // "Agregar rápido" — solo para productos que no necesitan que el cliente
  // elija o suba un diseño (esos siguen yendo por la ficha completa) y que
  // tengan stock. Igual pedimos el talle explícitamente (no se preselecciona
  // ninguno) para no repetir el problema de las devoluciones por talle mal
  // adivinado que ya resolvimos en otro lado.
  const hasPresetDesigns = product.designs && product.designs.length > 0;
  const allowCustomDesign = product.tags?.customDesign === true;
  const needsDesignStep = hasPresetDesigns || allowCustomDesign;
  const outOfStock = (product.stock ?? 0) <= 0;
  const hasSizes = product.sizes && product.sizes.length > 0;
  const canQuickAdd = !!onAddToCart && !needsDesignStep && !outOfStock;

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickColorIdx, setQuickColorIdx] = useState(0);
  const [quickSizeIdx, setQuickSizeIdx] = useState(null);
  const [quickQty, setQuickQty] = useState(1);
  const [quickJustAdded, setQuickJustAdded] = useState(false);

  // Si el cliente sigue scrolleando la página con la ventanita abierta, la
  // cerramos sola en vez de dejarla flotando pegada a la pantalla.
  useEffect(() => {
    if (!quickOpen) return;
    const closeOnScroll = () => setQuickOpen(false);
    window.addEventListener("scroll", closeOnScroll, { passive: true });
    return () => window.removeEventListener("scroll", closeOnScroll);
  }, [quickOpen]);

  const openQuickAdd = (e) => {
    e.stopPropagation();
    setQuickColorIdx(activeColorIdx >= 0 ? activeColorIdx : 0);
    setQuickSizeIdx(null);
    setQuickQty(1);
    setQuickOpen(true);
  };

  const handleQuickAdd = () => {
    if (hasSizes && quickSizeIdx === null) return;
    const qColor = colors[quickColorIdx];
    const item = {
      cartId: genId("c"),
      productId: product.id,
      sku: product.sku || product.id,
      name: product.name,
      category: product.category,
      subcategory: product.subcategory || "",
      colorName: qColor ? qColor.name : "Único",
      colorHex: qColor ? qColor.hex : "#999",
      size: hasSizes ? product.sizes[quickSizeIdx] : null,
      designName: null,
      designImage: null,
      qty: quickQty,
      unitPrice: onSale ? product.salePrice : product.price,
      points: product.points ?? null,
      previewImage: images[idx] || null,
    };
    onAddToCart(item);
    setQuickJustAdded(true);
    setTimeout(() => { setQuickJustAdded(false); setQuickOpen(false); }, 1100);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(product)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(product)}
      className="kulto-card kulto-btn text-left rounded-2xl overflow-hidden flex flex-col w-full h-full cursor-pointer"
      style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}
    >
      <div
        className="relative overflow-hidden"
        style={{ background: bg, aspectRatio: "4 / 5" }}
      >
        {images.length > 0 ? (
          <FastImg loading="lazy" src={images[idx]} alt={product.name} className={`kulto-card-img w-full h-full ${isCover ? "object-cover" : "object-contain"}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Shirt size={36} style={{ color: "rgba(243,239,230,0.35)" }} />
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
          {product.tags?.oferta && <Badge tone="signal">Oferta</Badge>}
          {product.tags?.bestseller && <Badge tone="sun">Más vendido</Badge>}
          {(product.stock ?? 0) <= 0 && <Badge tone="neutral">Sin stock</Badge>}
        </div>
        {onToggleFavorite && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(product.id); }}
            className="kulto-btn absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(21,19,26,0.55)" }}
            title={isFavorite ? "Quitar de favoritos" : "Guardar en favoritos"}
          >
            <Heart size={16} style={{ color: isFavorite ? "var(--signal)" : "var(--bone)" }} fill={isFavorite ? "var(--signal)" : "none"} />
          </button>
        )}
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="kulto-btn absolute left-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(21,19,26,0.55)", color: "var(--bone)" }}
              aria-label="Foto anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={next}
              className="kulto-btn absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(21,19,26,0.55)", color: "var(--bone)" }}
              aria-label="Foto siguiente"
            >
              <ChevronRight size={18} />
            </button>
            <div className="absolute bottom-1.5 left-0 right-0 flex items-center justify-center gap-1">
              {images.map((_, i) => (
                <span key={i} className="rounded-full" style={{ width: i === idx ? 12 : 5, height: 5, background: i === idx ? "var(--sun)" : "rgba(243,239,230,0.5)", transition: "width .15s" }} />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <span className="text-xs" style={{ color: "var(--slate)" }}>{product.category}</span>
        <span
          className="font-semibold leading-snug"
          style={{
            color: "var(--bone)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: "2.6em",
          }}
        >
          {product.name}
        </span>
        {colors.length > 0 && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {colors.slice(0, 5).map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => pickColor(e, i)}
                className="kulto-btn rounded-full shrink-0"
                style={{
                  width: 14,
                  height: 14,
                  background: c.hex,
                  border: i === activeColorIdx ? "2px solid var(--sun)" : "1px solid rgba(243,239,230,0.3)",
                }}
                title={c.name}
                aria-label={`Ver ${product.name} en color ${c.name}`}
              />
            ))}
            {colors.length > 5 && (
              <span className="text-xs" style={{ color: "var(--slate)" }}>+{colors.length - 5}</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 mt-auto pt-1">
          {onSale ? (
            <>
              <span className="font-bold" style={{ color: "var(--sun)" }}>{formatPrice(product.salePrice)}</span>
              <span className="text-sm line-through" style={{ color: "var(--slate)" }}>{formatPrice(product.price)}</span>
            </>
          ) : (
            <span className="font-bold" style={{ color: "var(--sun)" }}>{formatPrice(product.price)}</span>
          )}
          {canQuickAdd && (
            <button
              type="button"
              onClick={openQuickAdd}
              className="kulto-btn ml-auto w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--signal)", color: "var(--bone)" }}
              title="Agregar al carrito"
              aria-label={`Agregar ${product.name} al carrito`}
            >
              <ShoppingBag size={15} />
            </button>
          )}
        </div>
      </div>
      {quickOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={(e) => { e.stopPropagation(); setQuickOpen(false); }}
        >
          <div onClick={(e) => e.stopPropagation()} className="rounded-2xl p-5 max-w-xs w-full" style={{ background: "var(--ink)", border: "1px solid var(--line)" }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold pr-3" style={{ color: "var(--bone)" }}>{product.name}</p>
              <button onClick={() => setQuickOpen(false)} className="kulto-btn shrink-0" style={{ color: "var(--slate)" }}><X size={18} /></button>
            </div>
            {colors.length > 0 && (
              <div className="mb-4">
                <p className="text-xs mb-1.5" style={{ color: "var(--slate)" }}>Color</p>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setQuickColorIdx(i)}
                      className="kulto-btn rounded-full shrink-0"
                      style={{ width: 26, height: 26, background: c.hex, border: i === quickColorIdx ? "2px solid var(--sun)" : "1px solid var(--line)" }}
                      title={c.name}
                      aria-label={`Color ${c.name}`}
                    />
                  ))}
                </div>
              </div>
            )}
            {hasSizes && (
              <div className="mb-4">
                <p className="text-xs mb-1.5" style={{ color: "var(--slate)" }}>Talle</p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((s, i) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setQuickSizeIdx(i)}
                      className="kulto-btn text-xs font-semibold rounded-full px-3 py-1.5"
                      style={{ background: quickSizeIdx === i ? "var(--sun)" : "var(--ink-2)", color: quickSizeIdx === i ? "var(--ink)" : "var(--bone)", border: "1px solid var(--line)" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs" style={{ color: "var(--slate)" }}>Cantidad</p>
              <div className="flex items-center gap-2">
                <button type="button" className="kulto-btn p-1.5 rounded-full" onClick={() => setQuickQty((q) => Math.max(1, q - 1))} style={{ color: "var(--bone)" }}><Minus size={14} /></button>
                <span style={{ color: "var(--bone)", minWidth: 16, textAlign: "center" }}>{quickQty}</span>
                <button type="button" className="kulto-btn p-1.5 rounded-full" onClick={() => setQuickQty((q) => Math.min(99, q + 1))} style={{ color: "var(--bone)" }}><Plus size={14} /></button>
              </div>
            </div>
            <button
              onClick={handleQuickAdd}
              disabled={hasSizes && quickSizeIdx === null}
              className="kulto-btn w-full rounded-full py-2 text-sm font-medium whitespace-nowrap"
              style={{
                background: quickJustAdded ? "var(--sun)" : (hasSizes && quickSizeIdx === null) ? "var(--ink-3)" : "var(--signal)",
                color: quickJustAdded ? "var(--ink)" : (hasSizes && quickSizeIdx === null) ? "var(--slate)" : "var(--bone)",
                cursor: (hasSizes && quickSizeIdx === null) ? "default" : "pointer",
              }}
            >
              {quickJustAdded ? "Añadido" : hasSizes && quickSizeIdx === null ? "Elegí un talle" : "Añadir al carrito"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Product configurator (used in modal & in the wizard)               */
/* ------------------------------------------------------------------ */

function ImageLightbox({ image, overlay, background, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <button onClick={onClose} className="kulto-btn absolute top-4 right-4 p-2 rounded-full" style={{ background: "rgba(21,19,26,0.7)", color: "var(--bone)" }}>
        <X size={24} />
      </button>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl overflow-hidden flex items-center justify-center"
        style={{ background: background || "var(--ink-3)", aspectRatio: "4 / 5" }}
      >
        <img loading="lazy" src={image} alt="" className="w-full h-full object-contain" />
        {overlay && (
          <img
            src={overlay}
            alt=""
            className="absolute"
            style={{ width: "48%", top: "26%", left: "26%", objectFit: "contain", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))" }}
          />
        )}
      </div>
    </div>
  );
}

// Botón + formulario chico para pedir que avisemos por mail cuando un
// producto sin stock vuelva a tener — aparece en vez del botón de compra
// mientras product.stock esté en 0. Ver notifyRestockSubscribers, que se
// dispara solo al publicar cambios si el stock pasa de 0 a más de 0.
function RestockNotifyForm({ product }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // null | "sending" | "ok" | "already" | "error"

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    try {
      const res = await addRestockSubscriber(product.id, email.trim());
      setStatus(res.already ? "already" : "ok");
    } catch {
      setStatus("error");
    }
  };

  if (status === "ok" || status === "already") {
    return (
      <p className="text-xs mt-3 text-center" style={{ color: "var(--sun)" }}>
        {status === "already" ? "Ya te tenemos anotado — te escribimos apenas vuelva." : "¡Listo! Te avisamos por mail apenas vuelva el stock."}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 mt-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Tu mail para avisarte"
        className="flex-1 rounded-full px-4 py-2.5 text-sm"
        style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full shrink-0"
        style={{ background: "var(--signal)", color: "var(--bone)", opacity: status === "sending" ? 0.6 : 1 }}
      >
        Notificarme
      </button>
      {status === "error" && <p className="text-xs" style={{ color: "var(--signal)" }}>No se pudo guardar, probá de nuevo.</p>}
    </form>
  );
}

// Reseñas de ESTE producto puntual (no todas las de la tienda) — usa
// productIds si la reseña ya lo tiene guardado, y si no (reseñas viejas de
// antes de este campo) cae al nombre del producto en items[] como respaldo.
function ProductReviewsBlock({ product, reviews }) {
  const matching = (reviews || []).filter(
    (r) => r.status === "aprobada" && (r.productIds?.includes(product.id) || (!r.productIds && r.items?.includes(product.name)))
  );
  if (!matching.length) return null;
  const avg = matching.reduce((s, r) => s + r.rating, 0) / matching.length;
  return (
    <div className="mt-8 pt-6" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="flex items-center gap-3 mb-4">
        <StarRow rating={Math.round(avg)} />
        <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>
          {avg.toFixed(1)} · {matching.length} reseña{matching.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {matching.map((r) => (
          <div key={r.id} className="rounded-2xl p-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
            <StarRow rating={r.rating} />
            <p className="text-sm mt-2" style={{ color: "var(--bone)" }}>{r.text}</p>
            <p className="text-xs mt-2 font-semibold" style={{ color: "var(--slate)" }}>
              {r.name}
              {r.source === "customer" && <span className="ml-1" style={{ color: "var(--sun)" }}>· Compra verificada</span>}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductConfigurator({ product, settings, onAddToCart, compact, reviews = [] }) {
  const [colorIdx, setColorIdx] = useState(0);
  const [imgIdx, setImgIdx] = useState(0);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [designMode, setDesignMode] = useState(product.designs && product.designs.length ? "design" : "custom");
  const [designIdx, setDesignIdx] = useState(0);
  const [customNote, setCustomNote] = useState("");
  const [customImage, setCustomImage] = useState(null);
  const [customImageProcessed, setCustomImageProcessed] = useState(null);
  const [useProcessed, setUseProcessed] = useState(true);
  const [removingBg, setRemovingBg] = useState(false);
  const [qualityAnswer, setQualityAnswer] = useState(null); // null | "yes" | "no"
  const [feedbackSelected, setFeedbackSelected] = useState([]);
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const touchStartX = useRef(null);
  const [hoverZoom, setHoverZoom] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });

  useEffect(() => {
    setColorIdx(0);
    setImgIdx(0);
    setSizeIdx(0);
    setDesignMode(product.designs && product.designs.length ? "design" : "custom");
    setDesignIdx(0);
    setCustomNote("");
    setCustomImage(null);
    setCustomImageProcessed(null);
    setUseProcessed(true);
    setRemovingBg(false);
    setQualityAnswer(null);
    setFeedbackSelected([]);
    setQty(1);
    setJustAdded(false);
    setZoomOpen(false);
  }, [product.id]);

  useEffect(() => { setImgIdx(0); }, [colorIdx]);

  const color = product.colors && product.colors[colorIdx];
  const images = color ? getColorImages(color) : (product.photoPool || []);
  const activeImage = images[imgIdx] || null;
  const isCover = product.imageFit === "cover";
  const previewBg = product.imageBackground || (color ? color.hex : "var(--ink-3)");
  const hasSizes = product.sizes && product.sizes.length > 0;
  const size = hasSizes ? product.sizes[sizeIdx] : null;
  const design = product.designs && product.designs[designIdx];
  const hasPresetDesigns = product.designs && product.designs.length > 0;
  const allowCustomDesign = product.tags?.customDesign === true;
  // El paso de "elegí tu diseño" solo se muestra si el producto tiene diseños
  // cargados para elegir, o si el admin habilitó que el cliente suba el suyo.
  // Si no, es un producto que se vende tal cual está en la foto.
  const showDesignStep = hasPresetDesigns || allowCustomDesign;
  const unitPrice = product.tags?.oferta && product.salePrice ? product.salePrice : product.price;
  const finalCustomImage = customImage ? (useProcessed && customImageProcessed ? customImageProcessed : customImage) : null;
  // El stock es un número total del producto (no por talle/color todavía), así
  // que cuando llega a 0 bloqueamos la compra entera en vez de un talle puntual.
  const outOfStock = (product.stock ?? 0) <= 0;

  const handleCustomImageUpload = async (file) => {
    if (!file) return;
    const isPng = file.type === "image/png";
    const b64 = await new Promise((resolve) => fileToBase64(file, resolve, 1400, isPng ? 1 : 0.9, isPng ? "image/png" : "image/jpeg"));
    setCustomImage(b64);
    setCustomImageProcessed(null);
    setUseProcessed(true);
    setQualityAnswer(null);
    setFeedbackSelected([]);
    setRemovingBg(true);
    const processed = await removeImageBackground(b64);
    setCustomImageProcessed(processed);
    setUseProcessed(!!processed);
    setRemovingBg(false);
  };

  const toggleFeedbackOption = (opt) => {
    setFeedbackSelected((prev) => (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]));
  };

  const handleAdd = () => {
    const feedbackNote = feedbackSelected.length ? `Pidió cambios: ${feedbackSelected.join(", ")}.` : "";
    const combinedNote = [customNote, feedbackNote].filter(Boolean).join(" ");
    const item = {
      cartId: genId("c"),
      productId: product.id,
      sku: product.sku || product.id,
      name: product.name,
      category: product.category,
      subcategory: product.subcategory || "",
      colorName: color ? color.name : "Único",
      colorHex: color ? color.hex : "#999",
      size,
      designName: !showDesignStep
        ? null
        : designMode === "design" && design
        ? design.name
        : `Personalizado${combinedNote ? `: ${combinedNote}` : customImage ? "" : " (a coordinar por WhatsApp)"}`,
      designImage: showDesignStep && designMode === "custom" ? finalCustomImage : null,
      qty,
      unitPrice,
      // Puntos de fidelización de ESTA prenda en particular (null = todavía
      // no se resolvió acá, se usa el general de Ajustes al momento de sumar
      // — ver handleCheckout, que hace lo mismo que ya hacíamos con el precio).
      points: product.points ?? null,
      previewImage: activeImage,
    };
    onAddToCart(item);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2200);
  };

  return (
    <>
    <div className={compact ? "" : "grid md:grid-cols-2 gap-6"}>
      {/* Preview */}
      <div>
        <div
          className="rounded-2xl relative overflow-hidden flex items-center justify-center"
          style={{ background: previewBg, border: "1px solid var(--line)", aspectRatio: "4 / 5" }}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null || images.length < 2) return;
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            if (delta > 40) setImgIdx((i) => (i - 1 + images.length) % images.length);
            else if (delta < -40) setImgIdx((i) => (i + 1) % images.length);
            touchStartX.current = null;
          }}
          onMouseEnter={() => { if (window.matchMedia?.("(hover: hover)").matches) setHoverZoom(true); }}
          onMouseLeave={() => setHoverZoom(false)}
          onMouseMove={(e) => {
            if (!hoverZoom) return;
            const rect = e.currentTarget.getBoundingClientRect();
            setZoomOrigin({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
          }}
        >
          {activeImage ? (
            <img
              src={activeImage}
              alt={color?.name}
              className={`w-full h-full ${isCover ? "object-cover" : "object-contain"}`}
              style={{
                transform: hoverZoom ? "scale(2.2)" : "scale(1)",
                transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                transition: hoverZoom ? "none" : "transform .25s ease",
                cursor: hoverZoom ? "zoom-in" : "default",
              }}
            />
          ) : (
            <Shirt size={64} style={{ color: "rgba(243,239,230,0.35)" }} />
          )}
          {designMode === "design" && design && design.image && (
            <img
              src={design.image}
              alt={design.name}
              className="absolute"
              style={{ width: "48%", top: "26%", left: "26%", objectFit: "contain", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))" }}
            />
          )}
          {designMode === "custom" && finalCustomImage && !removingBg && (
            <img
              src={finalCustomImage}
              alt="Tu diseño"
              className="absolute"
              style={{ width: "48%", top: "26%", left: "26%", objectFit: "contain", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))" }}
            />
          )}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
                className="kulto-btn absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "rgba(21,19,26,0.6)", color: "var(--bone)" }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => setImgIdx((i) => (i + 1) % images.length)}
                className="kulto-btn absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "rgba(21,19,26,0.6)", color: "var(--bone)" }}
              >
                <ChevronRight size={18} />
              </button>
              <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
                {images.map((_, i) => (
                  <span key={i} className="rounded-full" style={{ width: i === imgIdx ? 14 : 6, height: 6, background: i === imgIdx ? "var(--sun)" : "rgba(243,239,230,0.5)", transition: "width .15s" }} />
                ))}
              </div>
            </>
          )}
          {activeImage && (
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              className="kulto-btn absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "rgba(21,19,26,0.75)", color: "var(--bone)" }}
              title="Ver foto en grande"
            >
              <ZoomIn size={18} />
            </button>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 mt-2 overflow-x-auto kulto-scrollbar pb-1">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setImgIdx(i)}
                className="kulto-btn shrink-0 rounded-lg overflow-hidden"
                style={{ width: 44, height: 44, border: i === imgIdx ? "2px solid var(--sun)" : "1px solid var(--line)", background: "var(--ink-3)" }}
              >
                <FastImg loading="lazy" src={img} className="w-full h-full object-contain" alt="" />
              </button>
            ))}
          </div>
        )}
        <p className="text-xs mt-2" style={{ color: "var(--slate)" }}>
          Vista previa orientativa. El sublimado final puede variar ligeramente.
        </p>
      </div>

      {zoomOpen && activeImage && (
        <ImageLightbox
          image={activeImage}
          overlay={designMode === "design" ? design?.image : null}
          background={previewBg}
          onClose={() => setZoomOpen(false)}
        />
      )}

      {/* Options */}
      <div className="flex flex-col gap-5 mt-5 md:mt-0">
        <div>
          <span className="text-xs" style={{ color: "var(--slate)" }}>{product.category}</span>
          <h3 className="kulto-display text-xl" style={{ color: "var(--bone)" }}>{product.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            {product.tags?.oferta && product.salePrice ? (
              <>
                <span className="font-bold text-lg" style={{ color: "var(--sun)" }}>{formatPrice(product.salePrice)}</span>
                <span className="text-sm line-through" style={{ color: "var(--slate)" }}>{formatPrice(product.price)}</span>
              </>
            ) : (
              <span className="font-bold text-lg" style={{ color: "var(--sun)" }}>{formatPrice(product.price)}</span>
            )}
          </div>
          {settings?.productionTimeNormal && (
            <p className="text-xs mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: "var(--ink-3)", color: "var(--bone)", width: "fit-content" }}>
              <Package size={12} /> Producción en {settings.productionTimeNormal}
            </p>
          )}
          {product.description && (
            <p className="text-sm mt-2" style={{ color: "var(--slate)" }}>{product.description}</p>
          )}
        </div>

        {/* Step 1: color */}
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>1. Elige el color</p>
          {product.colors && product.colors.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {product.colors.map((c, i) => (
                <ColorSwatch key={i} hex={c.hex} title={c.name} selected={i === colorIdx} onClick={() => setColorIdx(i)} />
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--slate)" }}>Este producto aún no tiene colores cargados.</p>
          )}
        </div>

        {/* Step 2: size */}
        {hasSizes && (
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>2. Elige el talle</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s, i) => (
                <button
                  key={s}
                  onClick={() => setSizeIdx(i)}
                  className="kulto-btn text-sm font-semibold rounded-full"
                  style={{
                    minWidth: 44, padding: "8px 12px",
                    background: i === sizeIdx ? "var(--signal)" : "var(--ink-3)",
                    color: "var(--bone)",
                    border: i === sizeIdx ? "1px solid var(--signal)" : "1px solid var(--line)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <SizeGuideToggle sizeGuide={product.sizeGuide} sizeGuideImage={product.sizeGuideImage} />
          </div>
        )}

        {/* Step 3: design — solo si el producto tiene diseños para elegir o el
            admin habilitó que el cliente suba el suyo; si no, se vende tal
            cual está en la foto y este paso no aparece. */}
        {showDesignStep && (
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>{hasSizes ? "3" : "2"}. Elige el diseño</p>
          {hasPresetDesigns && allowCustomDesign && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setDesignMode("design")}
              className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                background: designMode === "design" ? "var(--signal)" : "var(--ink-3)",
                color: "var(--bone)",
              }}
            >
              Nuestros diseños
            </button>
            <button
              onClick={() => setDesignMode("custom")}
              className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                background: designMode === "custom" ? "var(--signal)" : "var(--ink-3)",
                color: "var(--bone)",
              }}
            >
              Quiero mi propio diseño
            </button>
          </div>
          )}

          {designMode === "design" ? (
            product.designs && product.designs.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {product.designs.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => setDesignIdx(i)}
                    className="kulto-btn rounded-lg overflow-hidden"
                    style={{
                      width: 54, height: 54,
                      border: i === designIdx ? "2px solid var(--sun)" : "1px solid var(--line)",
                      background: "var(--ink-3)",
                    }}
                    title={d.name}
                  >
                    {d.image && <img loading="lazy" src={d.image} alt={d.name} className="w-full h-full object-contain" />}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--slate)" }}>Aún no hay diseños propios cargados para esta prenda.</p>
            )
          ) : (
            <div className="flex flex-col gap-3">
              {!customImage ? (
                <label
                  className="kulto-btn flex flex-col items-center justify-center gap-2 rounded-xl p-6 text-center cursor-pointer"
                  style={{ background: "var(--ink-3)", border: "1px dashed var(--line)" }}
                >
                  <Upload size={22} style={{ color: "var(--sun)" }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Subí tu diseño (PNG o JPG)</span>
                  <span className="text-xs" style={{ color: "var(--slate)" }}>Si tiene fondo, lo intentamos limpiar automáticamente y gratis.</span>
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => handleCustomImageUpload(e.target.files[0])} />
                </label>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="rounded-xl overflow-hidden relative" style={{ aspectRatio: "1 / 1", background: "repeating-conic-gradient(#2a2730 0% 25%, #1e1b24 0% 50%) 0 0 / 20px 20px" }}>
                    {removingBg ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                        <Loader2 size={24} className="animate-spin" style={{ color: "var(--sun)" }} />
                        <span className="text-xs" style={{ color: "var(--bone)" }}>Quitando el fondo...</span>
                      </div>
                    ) : (
                      <img loading="lazy" src={finalCustomImage} alt="Tu diseño" className="w-full h-full object-contain p-2" />
                    )}
                  </div>

                  {!removingBg && customImageProcessed && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setUseProcessed(true)}
                        className="kulto-btn flex-1 text-xs font-semibold rounded-full py-2"
                        style={{ background: useProcessed ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
                      >
                        Sin fondo
                      </button>
                      <button
                        onClick={() => setUseProcessed(false)}
                        className="kulto-btn flex-1 text-xs font-semibold rounded-full py-2"
                        style={{ background: !useProcessed ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
                      >
                        Foto original
                      </button>
                    </div>
                  )}
                  {!removingBg && !customImageProcessed && (
                    <p className="text-xs" style={{ color: "var(--slate)" }}>No pudimos quitar el fondo automáticamente esta vez — se va a usar la foto tal cual la subiste.</p>
                  )}

                  {!removingBg && (
                    <label className="kulto-btn text-xs font-semibold text-center rounded-full py-2 cursor-pointer" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                      Subir otra foto
                      <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => handleCustomImageUpload(e.target.files[0])} />
                    </label>
                  )}

                  {!removingBg && (
                    <div>
                      <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>¿La imagen quedó como la querés?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setQualityAnswer("yes"); setFeedbackSelected([]); }}
                          className="kulto-btn flex-1 text-sm font-semibold rounded-full py-2"
                          style={{ background: qualityAnswer === "yes" ? "var(--sun)" : "var(--ink-3)", color: qualityAnswer === "yes" ? "var(--ink)" : "var(--bone)" }}
                        >
                          Sí, así está bien
                        </button>
                        <button
                          onClick={() => setQualityAnswer("no")}
                          className="kulto-btn flex-1 text-sm font-semibold rounded-full py-2"
                          style={{ background: qualityAnswer === "no" ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
                        >
                          No, quiero ajustar algo
                        </button>
                      </div>
                    </div>
                  )}

                  {qualityAnswer === "no" && (
                    <div className="flex flex-col gap-2 rounded-xl p-3" style={{ background: "var(--ink-3)" }}>
                      {(settings?.designFeedbackOptions || []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {settings.designFeedbackOptions.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => toggleFeedbackOption(opt)}
                              className="kulto-btn text-xs font-semibold rounded-full px-3 py-1.5"
                              style={{
                                background: feedbackSelected.includes(opt) ? "var(--signal)" : "var(--ink-2)",
                                color: "var(--bone)",
                                border: "1px solid var(--line)",
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                      <textarea
                        value={customNote}
                        onChange={(e) => setCustomNote(e.target.value)}
                        placeholder="Contanos qué te gustaría cambiar..."
                        rows={2}
                        className="w-full rounded-lg p-2.5 text-sm"
                        style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
                      />
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="¿Algo más que debamos saber sobre tu diseño? (opcional)"
                rows={2}
                className="w-full rounded-xl p-3 text-sm"
                style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)", display: qualityAnswer === "no" ? "none" : "block" }}
              />

              <p className="text-xs" style={{ color: "var(--sun)" }}>
                Los pedidos personalizados suelen demorar entre 3 y 7 días. Si lo necesitás antes, avisanos por WhatsApp apenas confirmes tu pedido.
              </p>
              {settings?.depositEnabled && (
                <p className="text-xs" style={{ color: "var(--sun)" }}>
                  Para empezar a producirlo pedimos una seña del {settings.depositPercent}% por {settings.depositInfo || "el medio que te indiquemos"}, y el resto al recibirlo.
                </p>
              )}
            </div>
          )}
        </div>
        )}

        {/* Quantity */}
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Cantidad</p>
          <div className="inline-flex items-center gap-3 rounded-full px-2 py-1" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
            <button className="kulto-btn p-1.5 rounded-full" onClick={() => setQty((q) => Math.max(1, q - 1))} style={{ color: "var(--bone)" }}>
              <Minus size={16} />
            </button>
            <span style={{ color: "var(--bone)", minWidth: 20, textAlign: "center" }}>{qty}</span>
            <button
              className="kulto-btn p-1.5 rounded-full"
              onClick={() => setQty((q) => Math.min(99, q + 1))}
              style={{ color: "var(--bone)" }}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={outOfStock}
          className="kulto-btn w-full rounded-full py-3 font-semibold flex items-center justify-center gap-2"
          style={{
            background: outOfStock ? "var(--ink-3)" : justAdded ? "var(--sun)" : "var(--signal)",
            color: outOfStock ? "var(--slate)" : justAdded ? "var(--ink)" : "var(--bone)",
            cursor: outOfStock ? "default" : "pointer",
          }}
        >
          {outOfStock ? "Sin stock por ahora" : justAdded ? (<><Check size={18} /> Añadido al carrito</>) : (<><ShoppingBag size={18} /> Añadir al carrito</>)}
        </button>
        {outOfStock && <RestockNotifyForm product={product} />}
      </div>
    </div>
    <ProductReviewsBlock product={product} reviews={reviews} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Product modal                                                      */
/* ------------------------------------------------------------------ */

function RelatedProducts({ product, allProducts, onOpen, favorites, onToggleFavorite }) {
  const related = allProducts.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 6);
  if (!related.length) return null;
  return (
    <div className="mt-8 pt-6" style={{ borderTop: "1px solid var(--line)" }}>
      <p className="text-sm font-semibold mb-3" style={{ color: "var(--bone)" }}>También puede interesarte</p>
      <div className="flex gap-3 overflow-x-auto kulto-scrollbar pb-1">
        {related.map((p) => (
          <div key={p.id} style={{ minWidth: 150, maxWidth: 150 }}>
            <ProductCard product={p} onOpen={onOpen} isFavorite={favorites?.includes(p.id)} onToggleFavorite={onToggleFavorite} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Cuando el mismo diseño se vende en más de una prenda/estilo (ej: la misma
// estampa en la Beagle y en la Oversize, a distinto precio), esto muestra un
// acceso directo entre esas fichas — sin fusionarlas en un solo producto.
function LinkedStyleProducts({ product, allProducts, onOpen, favorites, onToggleFavorite }) {
  if (!product.designGroup) return null;
  const linked = allProducts.filter((p) => p.designGroup === product.designGroup && p.id !== product.id);
  if (!linked.length) return null;
  return (
    <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--line)" }}>
      <p className="text-sm font-semibold mb-3" style={{ color: "var(--bone)" }}>Este diseño también está disponible en</p>
      <div className="flex gap-3 overflow-x-auto kulto-scrollbar pb-1">
        {linked.map((p) => (
          <div key={p.id} style={{ minWidth: 150, maxWidth: 150 }}>
            <ProductCard product={p} onOpen={onOpen} isFavorite={favorites?.includes(p.id)} onToggleFavorite={onToggleFavorite} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductModal({ product, allProducts, settings, onClose, onSwitchProduct, onAddToCart, favorites, onToggleFavorite, reviews, onGoHome, onGoCatalog, onView }) {
  const isFavorite = favorites?.includes(product.id);
  // Cuenta como "vista" cada vez que se abre la ficha de un producto — es la
  // señal (junto a las ventas) que alimenta el "en tendencia" automático.
  useEffect(() => { onView?.(product.id); }, [product.id]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-3xl max-h-[92vh] overflow-y-auto kulto-scrollbar rounded-t-3xl md:rounded-3xl p-5 md:p-8"
        style={{ background: "var(--ink)", border: "1px solid var(--line)" }}
      >
        <div className="flex justify-between items-center mb-2">
          {onToggleFavorite ? (
            <button
              onClick={() => onToggleFavorite(product.id)}
              className="kulto-btn text-sm font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ border: "1px solid var(--line)", color: isFavorite ? "var(--signal)" : "var(--slate)" }}
            >
              <Heart size={15} fill={isFavorite ? "var(--signal)" : "none"} /> {isFavorite ? "En tus favoritos" : "Guardar en favoritos"}
            </button>
          ) : <div />}
          <button onClick={onClose} className="kulto-btn p-1.5 rounded-full" style={{ color: "var(--slate)" }} aria-label="Cerrar">
            <X size={22} />
          </button>
        </div>
        <Breadcrumbs
          steps={[
            { label: "Inicio", onClick: onGoHome },
            { label: "Catálogo", onClick: onGoCatalog },
            ...(product.category ? [{ label: product.category }] : []),
            { label: product.name },
          ]}
        />
        <ProductConfigurator product={product} settings={settings} onAddToCart={onAddToCart} reviews={reviews} />
        <LinkedStyleProducts product={product} allProducts={allProducts} onOpen={onSwitchProduct} favorites={favorites} onToggleFavorite={onToggleFavorite} />
        <RelatedProducts product={product} allProducts={allProducts} onOpen={onSwitchProduct} favorites={favorites} onToggleFavorite={onToggleFavorite} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Home                                                                */
/* ------------------------------------------------------------------ */

// Contorno para los textos que van encima de una foto (banners): se arma con
// sombras sin desenfoque en un círculo alrededor de cada letra, así se ve igual
// en todos los navegadores. width = grosor en píxeles (0 = sin contorno).
function textOutlineStyle(width, color) {
  const w = Number(width) || 0;
  if (w <= 0) return {};
  const c = color || "#000000";
  const shadows = [];
  const ring = (r, steps) => {
    for (let i = 0; i < steps; i++) {
      const a = (2 * Math.PI * i) / steps;
      shadows.push(`${(Math.cos(a) * r).toFixed(2)}px ${(Math.sin(a) * r).toFixed(2)}px 0 ${c}`);
    }
  };
  ring(w, Math.max(16, Math.round(w * 8)));
  if (w > 2) ring(w / 2, 16);
  return { textShadow: shadows.join(", ") };
}

// Texto largo recortado a unas pocas líneas con "Ver más…" / "Ver menos": así
// una descripción larga no estira ni desarma el banner. El botón solo aparece
// si el texto de verdad no entra.
function ClampText({ text, lines = 3, className = "", style = {}, buttonStyle = {} }) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return undefined;
    const check = () => setOverflow(el.scrollHeight > el.clientHeight + 1);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [text, lines, expanded]);
  const clampStyle = expanded ? {} : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" };
  const stop = (e) => e.stopPropagation();
  return (
    <>
      <p ref={ref} className={className} style={{ ...style, ...clampStyle }}>{text}</p>
      {(overflow || expanded) && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpanded((v) => !v); }}
          onKeyDown={stop}
          className="kulto-btn text-xs font-semibold underline w-fit"
          style={{ color: "var(--sun)", ...buttonStyle }}
        >
          {expanded ? "Ver menos" : "Ver más…"}
        </button>
      )}
    </>
  );
}

function Hero({ onGoCatalog, onGoWizard, onSearch, heroTitle, heroSubtitle, heroImage, heroImages, banners = [] }) {
  const [query, setQuery] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  const activeBanners = (banners || []).filter((b) => b.active !== false && b.placement !== "section");
  const [slide, setSlide] = useState(0);

  useEffect(() => { setSlide(0); }, [activeBanners.length]);

  useEffect(() => {
    if (activeBanners.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % activeBanners.length), 5500);
    return () => clearInterval(t);
  }, [activeBanners.length]);

  // Cuando no hay ningún banner activo arriba de todo, la imagen decorativa
  // puede tener varias fotos cargadas — van rotando solas cada tantos
  // segundos, cada una tal cual se subió (sin recortarla ni deformarla).
  const heroImgList = heroImages && heroImages.length ? heroImages : (heroImage ? [heroImage] : []);
  const [heroImgIdx, setHeroImgIdx] = useState(0);
  useEffect(() => { setHeroImgIdx(0); }, [heroImgList.length]);
  useEffect(() => {
    if (activeBanners.length > 0 || heroImgList.length < 2) return;
    const t = setInterval(() => setHeroImgIdx((i) => (i + 1) % heroImgList.length), 4000);
    return () => clearInterval(t);
  }, [activeBanners.length, heroImgList.length]);

  const runCta = (banner) => {
    if (!banner || banner.ctaAction === "none") return;
    if (banner.ctaAction === "wizard") onGoWizard();
    else if (banner.ctaAction === "url" && banner.ctaUrl) window.open(banner.ctaUrl, "_blank", "noreferrer");
    else if (banner.ctaAction === "group" && banner.ctaGroup) onGoCatalog(banner.ctaGroup);
    else onGoCatalog();
  };

  const current = activeBanners.length ? activeBanners[slide % activeBanners.length] : null;
  const title = current ? current.title : heroTitle;
  const subtitle = current ? current.subtitle : heroSubtitle;
  const image = current ? current.image : (heroImgList[heroImgIdx] || null);

  const prevSlide = () => setSlide((s) => (s - 1 + activeBanners.length) % activeBanners.length);
  const nextSlide = () => setSlide((s) => (s + 1) % activeBanners.length);

  return (
    <section className="relative overflow-hidden" style={{ borderBottom: "1px solid var(--line)" }}>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-14 md:py-24 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <div key={`text-${slide}`} className="kulto-hero-fade">
            <h1 className="kulto-display leading-[0.95] text-4xl sm:text-5xl md:text-6xl whitespace-pre-line" style={{ color: "var(--bone)", ...textOutlineStyle(current?.textOutlineWidth, current?.textOutlineColor) }}>
              {title}
            </h1>
            <div className="mt-5 flex flex-col gap-1 max-w-md">
              <ClampText text={subtitle} lines={4} className="text-base md:text-lg" style={{ color: "var(--slate)", ...textOutlineStyle(current?.textOutlineWidth, current?.textOutlineColor) }} buttonStyle={textOutlineStyle(current?.textOutlineWidth, current?.textOutlineColor)} />
            </div>
          </div>
          <form onSubmit={submit} className="mt-6 max-w-sm relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--slate)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar productos..."
              className="w-full rounded-full pl-10 pr-4 py-3 text-sm"
              style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
            />
          </form>
          <div className="mt-5 flex flex-wrap gap-3">
            {current ? (
              <button onClick={() => runCta(current)} className="kulto-btn rounded-full px-6 py-3 font-semibold" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                {current.ctaLabel || "Ver catálogo"}
              </button>
            ) : (
              <button onClick={onGoCatalog} className="kulto-btn rounded-full px-6 py-3 font-semibold" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                Ver catálogo
              </button>
            )}
            <button onClick={onGoWizard} className="kulto-btn rounded-full px-6 py-3 font-semibold flex items-center gap-2" style={{ background: "transparent", color: "var(--bone)", border: "1px solid var(--line)" }}>
              Personalizar mi prenda <ArrowRight size={16} />
            </button>
          </div>
          {activeBanners.length > 1 && (
            <div className="mt-6 flex items-center gap-3">
              <button onClick={prevSlide} aria-label="Banner anterior" className="kulto-btn w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "var(--bone)" }}>
                <ChevronLeft size={14} />
              </button>
              <div className="flex items-center gap-2">
                {activeBanners.map((b, i) => (
                  <button
                    key={b.id || i}
                    onClick={() => setSlide(i)}
                    aria-label={`Banner ${i + 1}`}
                    className="kulto-btn rounded-full"
                    style={{ width: i === slide ? 22 : 8, height: 8, background: i === slide ? "var(--signal)" : "var(--line)", transition: "width .2s" }}
                  />
                ))}
              </div>
              <button onClick={nextSlide} aria-label="Banner siguiente" className="kulto-btn w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "var(--bone)" }}>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="relative h-64 md:h-96 flex items-center justify-center">
          {image ? (
            <img key={`img-${slide}-${heroImgIdx}`} src={image} alt="" className="w-full h-full object-contain kulto-hero-fade" />
          ) : (
            <>
              <div className="absolute rounded-3xl" style={{ width: "70%", height: "70%", background: "var(--ink-2)", border: "1px solid var(--line)", transform: "rotate(-6deg)" }} />
              <div className="absolute rounded-3xl flex items-center justify-center" style={{ width: "58%", height: "58%", background: "var(--signal)", transform: "rotate(8deg)" }}>
                <Shirt size={64} color="var(--bone)" />
              </div>
              <div className="absolute rounded-full px-4 py-2 font-semibold text-sm kulto-display" style={{ top: "6%", right: "8%", background: "var(--sun)", color: "var(--ink)", transform: "rotate(-10deg)" }}>
                Diseños originales
              </div>
              <div className="absolute rounded-full px-4 py-2 font-semibold text-sm kulto-display" style={{ bottom: "8%", left: "2%", background: "var(--bone)", color: "var(--ink)", transform: "rotate(6deg)" }}>
                Pide por WhatsApp
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// Banner promocional para usar como una sección más del inicio (entre
// "Tendencia", "En oferta", etc.) — no solo arriba de todo como el Hero.
const BANNER_SIZES = { sm: 220, md: 340, lg: 460 };
// Alto de la foto de cada paso en "Crea una prenda única" — el admin elige
// Chico/Mediano/Grande y las tarjetas se agrandan o achican todas juntas,
// siempre del mismo tamaño entre sí (el pie de foto también queda con una
// altura fija de hasta 2 líneas, así ninguna tarjeta queda más alta que
// las demás por tener un texto más largo o no tener texto).
const HOWITWORKS_SIZES = { sm: 90, md: 130, lg: 180 };
// Estilo del recorte para una foto-paso de "Crea una prenda única" según la
// forma elegida — null significa "automática" (no se recorta nada, se
// respeta la proporción real de la foto). Se usa tanto en el panel de
// administrador (para la vista previa) como en el inicio de verdad, así las
// dos quedan siempre idénticas.
function howItWorksShapeBox(shape, size) {
  if (shape === "circular") return { width: size, height: size, borderRadius: "50%" };
  if (shape === "cuadrado") return { width: size, height: size, borderRadius: 12 };
  if (shape === "rectangular") return { width: size * 1.4, height: size, borderRadius: 12 };
  if (shape === "triangular") return { width: size, height: size, clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" };
  return null;
}
// Recorta y hace zoom de una foto adentro de una caja de tamaño fijo,
// respetando el foco (focalX/focalY) y el zoom guardados — la misma lógica
// se usa acá, en la ventana de "Ajustá la posición" (admin) y en el sitio
// público, así lo que el admin ve siempre es exactamente lo que le queda al
// cliente. Sin zoom (zoom=1) se comporta igual que object-fit: cover.
// Dónde poner el borde de la foto (ya escalada) dentro de la caja: si la foto
// agrandada todavía es más grande que la caja, se recorre el sobrante según
// el foco (0-100%, como antes). Si el admin la achicó tanto que ya entra
// entera, no hay nada para recorrer — se centra sola en vez de quedar pegada
// a una esquina.
function focalOffset(disp, boxSize, focal) {
  if (disp >= boxSize) return -((disp - boxSize) * (focal / 100));
  return (boxSize - disp) / 2;
}
function FocalCropImage({ src, box, focalX = 50, focalY = 50, zoom = 1, alt = "" }) {
  const [natural, setNatural] = useState(null);
  const onLoad = (e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight });
  let imgStyle = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: `${focalX}% ${focalY}%` };
  if (natural && natural.w && natural.h && box?.width && box?.height) {
    const baseScale = Math.max(box.width / natural.w, box.height / natural.h);
    const scale = baseScale * (zoom || 1);
    const dispW = natural.w * scale, dispH = natural.h * scale;
    imgStyle = { position: "absolute", width: dispW, height: dispH, left: focalOffset(dispW, box.width, focalX), top: focalOffset(dispH, box.height, focalY), maxWidth: "none" };
  }
  return (
    <div className="relative overflow-hidden" style={{ ...box, background: "#fff" }}>
      <img loading="lazy" src={src} alt={alt} onLoad={onLoad} draggable={false} className="pointer-events-none" style={imgStyle} />
    </div>
  );
}
const BANNER_FOCUS_POSITIONS = { center: "center center", top: "center top", bottom: "center bottom", left: "left center", right: "right center" };

function PromoBanner({ banner, onGoCatalog, onGoWizard }) {
  if (!banner || banner.active === false) return null;

  const clickable = banner.ctaAction && banner.ctaAction !== "none";
  const objectPosition = BANNER_FOCUS_POSITIONS[banner.focus] || "center center";

  const runCta = () => {
    if (!clickable) return;
    if (banner.ctaAction === "wizard") onGoWizard();
    else if (banner.ctaAction === "url" && banner.ctaUrl) window.open(banner.ctaUrl, "_blank", "noreferrer");
    else if (banner.ctaAction === "group" && banner.ctaGroup) onGoCatalog(banner.ctaGroup);
    else onGoCatalog();
  };

  const interactiveProps = clickable
    ? {
        role: "button",
        tabIndex: 0,
        onClick: runCta,
        onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); runCta(); } },
      }
    : {};

  if (banner.layout === "tile") {
    const minHeight = BANNER_SIZES[banner.size] || BANNER_SIZES.md;
    return (
      <div
        {...interactiveProps}
        className={`kulto-banner-tile relative rounded-2xl overflow-hidden flex items-end ${clickable ? "cursor-pointer kulto-banner-clickable" : ""}`}
        style={{ minHeight, background: "var(--ink-3)", border: "1px solid var(--line)", "--banner-glow": banner.highlightColor || "transparent" }}
      >
        {banner.image && (
          <img
            src={banner.image}
            alt=""
            className="kulto-banner-tile-img absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition }}
          />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(21,19,26,0) 45%, rgba(21,19,26,0.88))" }} />
        <div className="relative w-full p-5 flex flex-col gap-1">
          {banner.title && (
            <h3 className="kulto-display text-xl md:text-2xl leading-[0.95] whitespace-pre-line" style={{ color: "var(--bone)", ...textOutlineStyle(banner.textOutlineWidth, banner.textOutlineColor) }}>
              {banner.title}
            </h3>
          )}
          {banner.subtitle && <ClampText text={banner.subtitle} lines={3} className="text-xs md:text-sm" style={{ color: "var(--bone)", ...textOutlineStyle(banner.textOutlineWidth, banner.textOutlineColor) }} buttonStyle={textOutlineStyle(banner.textOutlineWidth, banner.textOutlineColor)} />}
        </div>
      </div>
    );
  }

  const minHeight = BANNER_SIZES[banner.size] || BANNER_SIZES.md;
  // Los banners "ancho del catálogo" van dentro del mismo contenedor angosto
  // que el resto de las secciones (no de punta a punta como los otros), así
  // que quedan como un rectángulo suelto al lado de tarjetas redondeadas —
  // el admin puede elegir que también lleven las puntas redondeadas para
  // que combinen con el resto del estilo.
  const rounded = banner.layout === "row" && banner.roundedCorners;

  return (
    <section
      {...interactiveProps}
      className={`kulto-banner-tile relative w-full overflow-hidden flex items-center ${rounded ? "rounded-2xl" : ""} ${clickable ? "cursor-pointer kulto-banner-clickable" : ""}`}
      style={{ minHeight, background: "var(--ink-2)", border: rounded ? "1px solid var(--line)" : "none", "--banner-glow": banner.highlightColor || "transparent" }}
    >
      {banner.image && (
        <img
          src={banner.image}
          alt=""
          className="kulto-banner-tile-img absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition }}
        />
      )}
      {banner.image && (
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(21,19,26,0.88) 30%, rgba(21,19,26,0.15))" }} />
      )}
      <div className="relative w-full max-w-6xl mx-auto px-4 md:px-6 py-10">
        <div className="flex flex-col gap-3 max-w-lg">
          {banner.title && (
            <h3 className="kulto-display text-2xl md:text-4xl leading-[0.95] whitespace-pre-line" style={{ color: "var(--bone)", ...textOutlineStyle(banner.textOutlineWidth, banner.textOutlineColor) }}>
              {banner.title}
            </h3>
          )}
          {banner.subtitle && <ClampText text={banner.subtitle} lines={3} className="text-sm md:text-base" style={{ color: "var(--bone)", ...textOutlineStyle(banner.textOutlineWidth, banner.textOutlineColor) }} buttonStyle={textOutlineStyle(banner.textOutlineWidth, banner.textOutlineColor)} />}
          {clickable && (
            <span className="kulto-btn rounded-full px-6 py-3 font-semibold w-fit mt-1 inline-block" style={{ background: "var(--signal)", color: "var(--bone)" }}>
              {banner.ctaLabel || "Ver catálogo"}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function HorizontalRow({ products, onOpen, favorites, onToggleFavorite, onAddToCart }) {
  return (
    <div className="flex gap-4 overflow-x-auto kulto-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0">
      {products.map((p) => (
        <div key={p.id} style={{ minWidth: 220, maxWidth: 220 }}>
          <ProductCard product={p} onOpen={onOpen} isFavorite={favorites?.includes(p.id)} onToggleFavorite={onToggleFavorite} onAddToCart={onAddToCart} />
        </div>
      ))}
    </div>
  );
}

function StarRow({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} fill={n <= rating ? "var(--sun)" : "none"} color="var(--sun)" />
      ))}
    </div>
  );
}

function ReviewsCarousel({ reviews }) {
  const trackRef = useRef(null);
  const scroll = (dir) => {
    if (!trackRef.current) return;
    trackRef.current.scrollBy({ left: dir * 280, behavior: "smooth" });
  };
  const visible = reviews.filter((r) => r.status === "aprobada");

  return (
    <section>
      <SectionTitle
        eyebrow="Nuestros clientes"
        title="Lo que dicen de Kulto"
        action={
          visible.length > 0 && (
            <div className="hidden md:flex gap-2">
              <button onClick={() => scroll(-1)} className="kulto-btn w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "var(--bone)" }}>
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => scroll(1)} className="kulto-btn w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "var(--bone)" }}>
                <ChevronRight size={16} />
              </button>
            </div>
          )
        }
      />
      {visible.length > 0 ? (
        <div ref={trackRef} className="flex gap-4 overflow-x-auto kulto-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          {visible.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl p-5 flex flex-col gap-3 shrink-0"
              style={{ width: 260, background: "var(--ink-2)", border: "1px solid var(--line)" }}
            >
              {r.photo ? (
                <div className="w-full rounded-xl overflow-hidden" style={{ aspectRatio: "4 / 5", background: "var(--ink-3)" }}>
                  <img loading="lazy" src={r.photo} className="w-full h-full object-cover" alt={`Foto de ${r.name}`} />
                </div>
              ) : (
                <Quote size={20} style={{ color: "var(--signal)" }} />
              )}
              <StarRow rating={r.rating} />
              <p className="text-sm flex-1" style={{ color: "var(--bone)" }}>{r.text}</p>
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--slate)" }}>{r.name}</p>
                {r.source === "customer" && r.items?.length > 0 && (
                  <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--sun)" }}>
                    <Check size={11} /> Compra verificada · {r.items[0]}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl p-6 flex flex-col items-center text-center gap-2"
          style={{ background: "var(--ink-2)", border: "1px dashed var(--line)" }}
        >
          <Quote size={22} style={{ color: "var(--slate)" }} />
          <p className="text-sm" style={{ color: "var(--bone)" }}>Todavía no tenemos reseñas — ¡sé el primero en contarnos qué te pareció!</p>
          <p className="text-xs" style={{ color: "var(--slate)" }}>Buscá tu pedido en "Mi pedido" para dejar la tuya.</p>
        </div>
      )}
    </section>
  );
}

// Tira de fotos de "trabajos personalizados" (pedidos reales ya hechos) para
// mostrar cerca de "Personalizar" en el inicio — desliza de a varias fotos
// (3 o 4 según el ancho de pantalla) con flechas y también arrastrando/
// deslizando con el dedo en el celular (scroll horizontal nativo).
function CustomWorkCarousel({ items = [], speed = 0.5 }) {
  const trackRef = useRef(null);
  const pausedRef = useRef(false);
  // Posición "real" del scroll, en un ref para que tanto el loop de abajo
  // como resume() la lean/escriban sin depender de un cierre viejo.
  const posRef = useRef(0);
  // En un ref para que el loop de abajo (que no se reinicia solo por esto)
  // siempre lea el valor más nuevo sin tener que recrear el requestAnimationFrame.
  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  // Duplicamos el estado de pausa en un state (además del ref que usa el loop
  // de animación) solo para poder desactivar el scroll-snap mientras se
  // desliza solo — con el snap prendido, el navegador "peleaba" con cada
  // empujoncito de 0.5px y el carrusel quedaba visualmente quieto. Al pausarlo
  // (mouse/touch encima, o con los botones) volvemos a activar el snap para
  // que se sienta prolijo al soltar o al usar las flechas.
  const [isPaused, setIsPaused] = useState(false);
  const [lightboxItem, setLightboxItem] = useState(null);
  const scroll = (dir) => {
    if (!trackRef.current) return;
    const cardWidth = trackRef.current.firstChild ? trackRef.current.firstChild.offsetWidth + 16 : 260;
    trackRef.current.scrollBy({ left: dir * cardWidth * 2, behavior: "smooth" });
  };

  // Desliza solo, despacio, hacia la derecha y vuelve al principio al llegar
  // al final — se detiene mientras el mouse está encima (o mientras se toca,
  // en el celular) para no pelear con el usuario si quiere mirar o deslizar.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || items.length < 2) return;
    // Guardamos la posición "real" (con decimales) acá en vez de leerla de
    // vuelta de track.scrollLeft en cada cuadro: el navegador redondea ese
    // valor a un número entero de píxeles, así que con velocidades bajas
    // (menos de 1px por cuadro) cada sumita se perdía al redondear y el
    // carrusel quedaba visualmente quieto en "Lento" — nunca llegaba a
    // acumular ni un píxel entero. Sumando sobre esta variable en vez de
    // sobre el valor ya redondeado, el movimiento es parejo a cualquier
    // velocidad, por lenta que sea.
    posRef.current = track.scrollLeft;
    let raf;
    const step = () => {
      if (!pausedRef.current) {
        const maxScroll = track.scrollWidth - track.clientWidth;
        // Si el carrusel todavía no terminó de acomodar su layout (por ej. las
        // fotos recién se están cargando, o la sección se acaba de volver a
        // mostrar al navegar), maxScroll puede salir 0/negativo o gigante por
        // un instante — en ese caso no tocamos el scroll para no "tirarlo" a
        // una posición rara que deje todo fuera de vista.
        if (Number.isFinite(maxScroll) && maxScroll > 1 && maxScroll < 100000) {
          posRef.current = posRef.current >= maxScroll - 1 ? 0 : posRef.current + speedRef.current;
          track.scrollLeft = posRef.current;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [items.length]);

  const pause = () => { pausedRef.current = true; setIsPaused(true); };
  const resume = () => {
    // Si mientras estaba pausado el navegador movió el scroll de verdad (el
    // snap del CSS, o el usuario arrastrando o usando las flechas), nuestra
    // cuenta interna quedó vieja — la sincronizamos acá para seguir desde
    // donde está en pantalla ahora, no desde antes de pausarlo (eso era lo
    // que hacía que pareciera "reiniciar" al sacar el mouse).
    if (trackRef.current) posRef.current = trackRef.current.scrollLeft;
    pausedRef.current = false;
    setIsPaused(false);
  };

  if (!items.length) return null;

  return (
    <section>
      <SectionTitle
        eyebrow="Hecho por Kulto"
        title="Trabajos personalizados"
        action={
          items.length > 3 && (
            <div className="hidden md:flex gap-2" onMouseEnter={pause} onMouseLeave={resume}>
              <button onClick={() => scroll(-1)} className="kulto-btn w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "var(--bone)" }} aria-label="Ver anteriores">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => scroll(1)} className="kulto-btn w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "var(--bone)" }} aria-label="Ver siguientes">
                <ChevronRight size={16} />
              </button>
            </div>
          )
        }
      />
      <div
        ref={trackRef}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onTouchStart={pause}
        onTouchEnd={() => setTimeout(resume, 1800)}
        className="flex gap-4 overflow-x-auto kulto-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0"
        style={{ scrollSnapType: isPaused ? "x proximity" : "none" }}
      >
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => { pause(); setLightboxItem(it); }}
            className="kulto-btn text-left rounded-2xl overflow-hidden shrink-0 flex flex-col w-[70%] sm:w-[45%] md:w-[31%] lg:w-[23%]"
            style={{ background: "var(--ink-2)", border: "1px solid var(--line)", scrollSnapAlign: "start" }}
          >
            <div style={{ aspectRatio: "4 / 5", background: "var(--ink-3)" }}>
              <img loading="lazy" src={it.image} className="w-full h-full object-cover" alt={it.caption || "Trabajo personalizado"} />
            </div>
            {it.caption && (
              <p className="text-xs p-3" style={{ color: "var(--slate)" }}>{it.caption}</p>
            )}
          </button>
        ))}
      </div>
      {lightboxItem && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.9)", zIndex: 200 }}
          onClick={() => { setLightboxItem(null); resume(); }}
        >
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxItem.image}
              alt={lightboxItem.caption || "Trabajo personalizado"}
              className="w-full max-h-[80vh] object-contain rounded-2xl mx-auto"
            />
            {lightboxItem.caption && (
              <p className="text-sm text-center mt-3" style={{ color: "#fff" }}>{lightboxItem.caption}</p>
            )}
            <button
              type="button"
              onClick={() => { setLightboxItem(null); resume(); }}
              className="kulto-btn absolute -top-3 -right-3 rounded-full p-2"
              style={{ background: "var(--ink)", border: "1px solid var(--line)", color: "#fff" }}
              aria-label="Cerrar vista ampliada"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Home({ products, settings, reviews, customWorkGallery, onOpen, onGoCatalog, onGoWizard, onSearch, favorites, onToggleFavorite, onAddToCart }) {
  // Un mismo diseño puede repetirse en varias prendas (mismo designGroup) —
  // si por error quedaron varias copias con la misma etiqueta ("más
  // vendido", "oferta", "tendencia"), acá se muestra una sola tarjeta por
  // diseño en cada fila, para no repetir el mismo diseño varias veces.
  const dedupeByDesign = (list) => {
    const seen = new Set();
    return list.filter((p) => {
      if (!p.designGroup) return true;
      if (seen.has(p.designGroup)) return false;
      seen.add(p.designGroup);
      return true;
    });
  };
  const bestsellerAutoIds = computeBestsellerIds(products, settings);
  const bestsellers = dedupeByDesign(products.filter((p) => p.tags?.bestseller || bestsellerAutoIds.has(p.id)));
  const ofertas = dedupeByDesign(products.filter((p) => p.tags?.oferta));
  const trendingIds = computeTrendingIds(products, settings);
  const tendencia = dedupeByDesign(products.filter((p) => p.tags?.tendencia || trendingIds.has(p.id)));

  const sectionOrder = getEffectiveHomeSections(settings);

  // Cada fila del inicio muestra solo 4 tarjetas; si hay más, un botón "Ver
  // todo" lleva al catálogo con todos los de esa colección.
  const FeaturedGrid = ({ list, collection }) => (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {list.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} onOpen={onOpen} isFavorite={favorites?.includes(p.id)} onToggleFavorite={onToggleFavorite} onAddToCart={onAddToCart} />)}
      </div>
      {list.length > 4 && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => onGoCatalog({ collection })}
            className="kulto-btn rounded-full px-6 py-3 font-semibold flex items-center gap-2"
            style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
          >
            Ver todo ({list.length}) <ArrowRight size={16} />
          </button>
        </div>
      )}
    </>
  );

  const renderSection = (key) => {
    if (key.startsWith("banner:")) {
      const bannerId = key.slice(7);
      const banner = (settings.banners || []).find((b) => b.id === bannerId);
      if (!banner) return null;
      return <PromoBanner key={key} banner={banner} onGoCatalog={onGoCatalog} onGoWizard={onGoWizard} />;
    }
    switch (key) {
      case "bestsellers":
        return (
          <section key="bestsellers">
            <SectionTitle eyebrow="Los favoritos" title="Lo más vendido" />
            {bestsellers.length ? (
              <FeaturedGrid list={bestsellers} collection="bestsellers" />
            ) : (
              <EmptyState text="Aún no hay productos marcados como más vendidos. Márcalos desde el panel de administrador." />
            )}
          </section>
        );
      case "ofertas":
        return (
          <section key="ofertas">
            <SectionTitle eyebrow="Por tiempo limitado" title="En oferta" />
            {ofertas.length ? (
              <FeaturedGrid list={ofertas} collection="ofertas" />
            ) : (
              <EmptyState text="Todavía no hay ofertas activas." />
            )}
          </section>
        );
      case "tendencia":
        return (
          <section key="tendencia">
            <SectionTitle eyebrow="Lo que se lleva" title="Tendencia" />
            {tendencia.length ? (
              <FeaturedGrid list={tendencia} collection="tendencia" />
            ) : (
              <EmptyState text="Todavía no hay productos en tendencia." />
            )}
          </section>
        );
      case "cta": {
        const steps = settings.howItWorksSteps || [];
        const ctaShape = settings.howItWorksImageShape || "auto";
        const ctaSize = HOWITWORKS_SIZES[settings.howItWorksCardSize] || HOWITWORKS_SIZES.md;
        const ctaShapeBox = howItWorksShapeBox(ctaShape, ctaSize);
        return (
          <section
            key="cta"
            className="rounded-3xl p-8 md:p-12 flex flex-col gap-8"
            style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <h3 className="kulto-display text-2xl md:text-3xl" style={{ color: "var(--bone)" }}>Crea una prenda única</h3>
                <p className="mt-2 max-w-md" style={{ color: "var(--slate)" }}>Elige la prenda, el color y sublima tu propio diseño en tres pasos.</p>
              </div>
              <button onClick={onGoWizard} className="kulto-btn rounded-full px-6 py-3 font-semibold flex items-center gap-2 shrink-0" style={{ background: "var(--sun)", color: "var(--ink)" }}>
                Empezar <ArrowRight size={16} />
              </button>
            </div>
            {steps.length > 0 && (
              // Antes cada tarjeta ocupaba una columna pareja del grid, así que
              // una foto angosta quedaba nadando en medio de mucho espacio
              // vacío. Ahora es una fila que se arma sola: cada tarjeta mide
              // lo que mide su propia foto (alto fijo, ancho según la imagen),
              // así las 4 quedan del mismo alto y alineadas en la fila, sin el
              // espacio negro de sobra a los costados.
              <div className="flex flex-wrap items-start justify-center gap-4">
                {steps.map((s, i) => (
                  // Sin forma elegida: tarjeta rectangular de fondo oscuro, como
                  // siempre. Con forma elegida (círculo, cuadrado redondeado,
                  // triángulo): SIN tarjeta ni fondo alrededor — antes, aunque la
                  // caja de la foto ya era circular, la tarjeta que la envolvía
                  // seguía siendo rectangular y su fondo se asomaba en las 4
                  // puntas alrededor del círculo, dando la sensación de que
                  // seguía "cuadrado". Ahora, con forma, solo queda la foto
                  // recortada con esa forma y el texto debajo, sin caja detrás.
                  <div key={s.id} className={ctaShapeBox ? "flex flex-col items-center" : "rounded-2xl overflow-hidden flex flex-col"} style={ctaShapeBox ? {} : { background: "var(--ink-3)", border: "1px solid var(--line)" }}>
                    <div className="relative flex items-center justify-center shrink-0" style={ctaShapeBox ? { ...ctaShapeBox } : { height: ctaSize, width: ctaSize, background: "var(--ink)", alignSelf: "flex-start" }}>
                      {s.image ? (
                        ctaShapeBox ? (
                          <FocalCropImage
                            src={s.image}
                            box={ctaShapeBox}
                            focalX={s.focalX ?? 50}
                            focalY={s.focalY ?? 50}
                            zoom={s.focalZoom ?? 1}
                            alt={s.caption || `Paso ${i + 1}`}
                          />
                        ) : (
                          <img loading="lazy" src={s.image} className="h-full w-auto object-contain" style={{ maxWidth: "70vw" }} alt={s.caption || `Paso ${i + 1}`} />
                        )
                      ) : (
                        <Shirt size={28} color="rgba(243,239,230,0.4)" />
                      )}
                      <span className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "var(--sun)", color: "var(--ink)" }}>
                        {i + 1}
                      </span>
                    </div>
                    {s.caption && (
                      <p
                        className="text-xs p-3 text-center"
                        style={{
                          color: "var(--slate)",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {s.caption}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      }
      case "customwork":
        return <CustomWorkCarousel key="customwork" items={customWorkGallery || []} speed={settings.customWorkSpeed} />;
      case "reviews":
        return <ReviewsCarousel key="reviews" reviews={reviews} />;
      default:
        return null;
    }
  };

  // Los banners "de punta a punta" ocupan toda la pantalla (como en adidas.es);
  // los banners "tarjeta" se agrupan entre sí en una fila tipo grilla, del
  // ancho normal de la web, del tamaño de las cajas de producto; el resto de
  // las secciones respeta el ancho normal de la web.
  const visibleSections = sectionOrder.filter((s) => s.visible !== false);
  const bannerLayoutOf = (key) => {
    const banner = (settings.banners || []).find((b) => b.id === key.slice(7));
    if (banner?.layout === "tile") return "tile";
    if (banner?.layout === "row") return "row";
    return "full";
  };
  const renderGroups = [];
  for (let i = 0; i < visibleSections.length; i++) {
    const s = visibleSections[i];
    if (s.key.startsWith("banner:") && bannerLayoutOf(s.key) === "tile") {
      const group = [s];
      while (i + 1 < visibleSections.length && visibleSections[i + 1].key.startsWith("banner:") && bannerLayoutOf(visibleSections[i + 1].key) === "tile") {
        group.push(visibleSections[++i]);
      }
      renderGroups.push({ type: "tiles", keys: group.map((g) => g.key) });
    } else {
      renderGroups.push({ type: "single", key: s.key });
    }
  }

  return (
    <div>
      <Hero onGoCatalog={onGoCatalog} onGoWizard={onGoWizard} onSearch={onSearch} heroTitle={settings.heroTitle} heroSubtitle={settings.heroSubtitle} heroImage={settings.heroImage} heroImages={settings.heroImages} banners={settings.banners} />

      <div className="flex flex-col gap-14 py-12">
        {renderGroups.map((g) => {
          if (g.type === "tiles") {
            const contents = g.keys.map((key) => renderSection(key)).filter(Boolean);
            if (!contents.length) return null;
            return (
              <div key={g.keys.join("|")} className="max-w-6xl mx-auto px-4 md:px-6 w-full">
                <div className={`grid gap-4 ${contents.length >= 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"}`}>
                  {contents}
                </div>
              </div>
            );
          }
          const content = renderSection(g.key);
          if (!content) return null;
          // Los banners "de punta a punta" van sin el contenedor, para que
          // lleguen a los bordes reales de la pantalla. Los "ancho del
          // catálogo" sí llevan el mismo contenedor que el resto de las
          // secciones, para quedar exactamente del ancho de la grilla de
          // productos (ni más angostos ni más anchos que ella).
          if (g.key.startsWith("banner:") && bannerLayoutOf(g.key) === "full") return content;
          return (
            <div key={g.key} className="max-w-6xl mx-auto px-4 md:px-6 w-full">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Catalog                                                             */
/* ------------------------------------------------------------------ */

// Lista de filtros desplegable (como el panel de la izquierda de las tiendas
// grandes): cada sección se abre y se cierra tocando su título.
function FilterAccordion({ title, defaultOpen = false, badge = null, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="kulto-btn w-full flex items-center justify-between py-3.5 text-left" aria-expanded={open}>
        <span className="text-sm" style={{ color: "var(--bone)" }}>
          {title}
          {badge ? <span className="ml-2 text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: "var(--signal)", color: "var(--bone)" }}>{badge}</span> : null}
        </span>
        <ChevronDown size={16} style={{ color: "var(--slate)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && <div className="pb-3 flex flex-col gap-1">{children}</div>}
    </div>
  );
}
function FilterOption({ active, onClick, label, count = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="kulto-btn flex items-center justify-between gap-2 text-left text-sm rounded-lg px-3 py-1.5"
      style={{ background: active ? "var(--ink-3)" : "transparent", color: active ? "var(--sun)" : "var(--bone)", fontWeight: active ? 600 : 400 }}
    >
      <span className="truncate">{label}</span>
      {count !== null && <span className="text-[11px] shrink-0" style={{ color: "var(--slate)" }}>{count}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Catálogo: paginador (1 2 3 … con flechas) y comparador de productos.
// ---------------------------------------------------------------------------
const CATALOG_PAGE_SIZE = 12;
function pageWindow(page, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(total - 1, page + 1);
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 1) out.push("…");
  out.push(total);
  return out;
}
function Paginator({ page, total, onChange }) {
  if (total <= 1) return null;
  const arrow = { color: "var(--bone)" };
  return (
    <nav className="flex justify-center mt-8" aria-label="Páginas del catálogo">
      <div className="inline-flex items-center gap-1 rounded-xl px-3 py-2" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="kulto-btn p-1.5" style={{ ...arrow, opacity: page <= 1 ? 0.3 : 1 }} aria-label="Página anterior">
          <ChevronLeft size={18} />
        </button>
        {pageWindow(page, total).map((n, i) =>
          n === "…" ? (
            <span key={`d${i}`} className="px-2 text-sm" style={{ color: "var(--slate)" }}>…</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-current={n === page ? "page" : undefined}
              className="kulto-btn relative px-3 py-1.5 text-sm"
              style={{ color: n === page ? "var(--bone)" : "var(--slate)", fontWeight: n === page ? 600 : 400 }}
            >
              {n}
              {n === page && <span className="absolute left-0 right-0 -bottom-2 h-0.5 rounded" style={{ background: "var(--signal)" }} />}
            </button>
          )
        )}
        <button type="button" disabled={page >= total} onClick={() => onChange(page + 1)} className="kulto-btn p-1.5" style={{ ...arrow, opacity: page >= total ? 0.3 : 1 }} aria-label="Página siguiente">
          <ChevronRight size={18} />
        </button>
      </div>
    </nav>
  );
}

const productThumbSrc = (p) => p?.photoPool?.[0] || getColorImages(p?.colors?.[0])[0] || null;
const effectivePrice = (p) => (p.tags?.oferta && p.salePrice ? p.salePrice : p.price);
const fabricOf = (p) => (p.material || "").trim();

// Arma, en palabras simples, qué cambia entre los productos elegidos.
function buildComparison(list) {
  const names = list.map((p) => p.name);
  const lines = [];
  const rows = [];
  const money = (v) => formatPrice(v);

  // Precio
  const prices = list.map(effectivePrice);
  const priceDiffers = new Set(prices).size > 1;
  rows.push({ label: "Precio", values: list.map((p) => (p.tags?.oferta && p.salePrice ? `${money(p.salePrice)} (antes ${money(p.price)})` : money(p.price))), differs: priceDiffers });
  if (priceDiffers) {
    const min = Math.min(...prices), max = Math.max(...prices);
    const cheapest = list.filter((p) => effectivePrice(p) === min).map((p) => p.name).join(" y ");
    lines.push(`Precio: ${cheapest} ${list.filter((p) => effectivePrice(p) === min).length > 1 ? "son las más baratas" : "es la más barata"} (${money(min)}). La diferencia con la más cara (${money(max)}) es de ${money(max - min)}.`);
  } else {
    lines.push(`Precio: todas cuestan lo mismo (${money(prices[0])}).`);
  }

  // Tela / composición
  const fabrics = list.map(fabricOf);
  const anyFabric = fabrics.some(Boolean);
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const fabricDiffers = anyFabric && new Set(fabrics.map(norm)).size > 1;
  rows.push({ label: "Tela / composición", values: fabrics.map((f) => f || "No indicada"), differs: fabricDiffers });
  if (!anyFabric) lines.push("Tela: ninguna de las dos tiene la tela cargada todavía.");
  else if (fabricDiffers) lines.push("Tela: " + list.map((p, i) => `${p.name} → ${fabrics[i] || "no indicada"}`).join(" · "));
  else lines.push(`Tela: es la misma (${fabrics.find(Boolean)}).`);

  // Modelo / categoría
  const models = list.map((p) => [p.category, p.subcategory].filter(Boolean).join(" · ") || "—");
  const modelDiffers = new Set(models).size > 1;
  rows.push({ label: "Modelo / categoría", values: models, differs: modelDiffers });
  if (modelDiffers) lines.push("Modelo: " + list.map((p, i) => `${p.name} → ${models[i]}`).join(" · "));

  // Listas (colores y talles): qué tiene cada uno que los otros no
  const listCompare = (label, getItems, emptyText) => {
    const sets = list.map((p) => getItems(p));
    const all = [...new Set(sets.flat())];
    const inAll = all.filter((x) => sets.every((s) => s.includes(x)));
    const differs = sets.some((s) => s.length !== all.length);
    rows.push({ label, values: sets.map((s) => (s.length ? s.join(", ") : emptyText)), differs });
    if (!all.length) return;
    if (!differs) { lines.push(`${label}: son los mismos en todos (${all.join(", ")}).`); return; }
    const parts = list.map((p, i) => {
      const only = sets[i].filter((x) => !sets.some((s, j) => j !== i && s.includes(x)));
      return only.length ? `solo ${p.name} tiene ${only.join(", ")}` : null;
    }).filter(Boolean);
    const missing = list.map((p, i) => {
      const lack = all.filter((x) => !sets[i].includes(x));
      return lack.length && !parts.length ? `${p.name} no tiene ${lack.join(", ")}` : null;
    }).filter(Boolean);
    lines.push(`${label}: ${[...parts, ...missing].join("; ")}${inAll.length ? `. En común: ${inAll.join(", ")}` : ""}.`);
  };
  listCompare("Colores", (p) => [...new Set((p.colors || []).map((c) => c.name).filter(Boolean))], "Sin colores");
  listCompare("Talles", (p) => p.sizes || [], "Sin talles");

  return { names, lines, rows };
}

function CompareModal({ products, onClose, onRemove, onOpen }) {
  const { lines, rows } = buildComparison(products);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const cols = { display: "grid", gridTemplateColumns: `110px repeat(${products.length}, minmax(0, 1fr))`, gap: 12 };
  return (
    <div className="fixed inset-0 flex items-center justify-center p-3" style={{ zIndex: 95, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Comparar productos">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-5 flex flex-col gap-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="kulto-display text-xl" style={{ color: "var(--bone)" }}>Comparar productos</h3>
          <button onClick={onClose} className="kulto-btn p-1.5 rounded-full" style={{ color: "var(--slate)" }} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="rounded-xl p-3 flex flex-col gap-1.5" style={{ background: "var(--ink-3)", border: "1px solid var(--sun)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--sun)" }}>Diferencias, en resumen</p>
          {lines.map((l, i) => <p key={i} className="text-sm" style={{ color: "var(--bone)" }}>• {l}</p>)}
        </div>

        <div style={cols}>
          <div />
          {products.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1.5 text-center">
              <button onClick={() => onOpen?.(p)} className="kulto-btn w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
                {productThumbSrc(p) ? <FastImg src={productThumbSrc(p)} alt={p.name} className="w-full h-full object-contain p-1" /> : <Shirt size={26} color="rgba(243,239,230,0.35)" />}
              </button>
              <p className="text-xs font-semibold" style={{ color: "var(--bone)" }}>{p.name}</p>
              <button onClick={() => onRemove(p.id)} className="kulto-btn text-[11px] underline" style={{ color: "var(--slate)" }}>Quitar</button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.label} className="rounded-xl p-2.5" style={{ ...cols, background: r.differs ? "var(--ink-3)" : "transparent", border: `1px solid ${r.differs ? "var(--sun)" : "var(--line)"}` }}>
              <p className="text-xs font-semibold" style={{ color: r.differs ? "var(--sun)" : "var(--slate)" }}>{r.label}{r.differs ? " ≠" : ""}</p>
              {r.values.map((v, i) => <p key={i} className="text-xs break-words" style={{ color: "var(--bone)" }}>{v}</p>)}
            </div>
          ))}
        </div>
        <p className="text-[11px]" style={{ color: "var(--slate)" }}>Las filas resaltadas son donde los productos se diferencian.</p>
      </div>
    </div>
  );
}

function Catalog({ settings, initialCollection, products, categories, groups, onOpen, initialQuery, initialGroup, initialCategory, initialSubcategory, favorites, onToggleFavorite, onlyFavorites = false, onGoHome, onAddToCart }) {
  const [activeGroup, setActiveGroup] = useState(initialGroup || "Todas");
  const [activeCat, setActiveCat] = useState(initialCategory || "Todas");
  const [activeSubcat, setActiveSubcat] = useState(initialSubcategory || "Todas");
  // Destacados: lo mismo que se ve en el inicio (tendencia, ofertas, más vendidos).
  const [activeCollection, setActiveCollection] = useState(initialCollection || "Todas");
  const [query, setQuery] = useState(initialQuery || "");
  const [sortBy, setSortBy] = useState("relevancia");
  const [showFilters, setShowFilters] = useState(false);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [selectedColors, setSelectedColors] = useState([]);

  const allCatalogProducts = products;
  // Paginado y comparador
  const [page, setPage] = useState(1);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  const [compareNotice, setCompareNotice] = useState("");
  const gridTopRef = useRef(null);
  const toggleCompare = (id) => {
    setCompareNotice("");
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) { setCompareNotice("Podés comparar hasta 3 productos a la vez."); return prev; }
      return [...prev, id];
    });
  };
  const comparedProducts = compareIds.map((id) => allCatalogProducts.find((p) => p.id === id)).filter(Boolean);

  const priceOf = (p) => (p.tags?.oferta && p.salePrice ? p.salePrice : p.price);
  if (onlyFavorites) products = products.filter((p) => favorites?.includes(p.id));
  if (activeCollection === "tendencia") {
    const ids = computeTrendingIds(products, settings);
    products = products.filter((p) => p.tags?.tendencia || ids.has(p.id));
  } else if (activeCollection === "ofertas") {
    products = products.filter((p) => p.tags?.oferta);
  } else if (activeCollection === "bestsellers") {
    const ids = computeBestsellerIds(products, settings);
    products = products.filter((p) => p.tags?.bestseller || ids.has(p.id));
  }
  const COLLECTION_LABELS = { tendencia: "Tendencia", ofertas: "En oferta", bestsellers: "Lo más vendido" };

  let filtered = activeGroup === "Todas" ? products : products.filter((p) => (p.group || "") === activeGroup);
  // Un producto puede listarse en varias categorías a la vez sin duplicarse
  // (ver "También listar en otras categorías" en el admin) — p.category es
  // la principal, p.extraCategories las que se suman solo para mostrarlo acá.
  const catsInGroup = [...new Set(filtered.flatMap((p) => [p.category, ...(p.extraCategories || [])]))].filter(Boolean);
  filtered = activeCat === "Todas" ? filtered : filtered.filter((p) => p.category === activeCat || (p.extraCategories || []).includes(activeCat));
  // Subcategoría (ej: dentro de "Sudaderas" separar "Con capucha" de "Sin
  // capucha") — llega sobre todo desde el submenú del header, ver AdminProductForm.
  // Carpetas de diseños (ej: dentro de "anime": Naruto, Dragon Ball) — se
  // arman con la subcategoría de cada producto, según el grupo/prenda elegidos.
  const subcatsInView = [...new Set(filtered.map((p) => p.subcategory).filter(Boolean))].sort((x, y) => x.localeCompare(y, "es"));
  filtered = activeSubcat === "Todas" ? filtered : filtered.filter((p) => p.subcategory === activeSubcat);
  // Un mismo diseño puede estar disponible en varias prendas a la vez
  // (comparten designGroup, ver "Modelos donde está disponible" / "Vincular
  // con otro estilo" en el admin) — acá se muestra una sola tarjeta por
  // diseño en vez de una repetida por cada prenda; el resto de los modelos
  // donde también está se eligen adentro de la ficha del producto.
  const seenDesignGroups = new Set();
  filtered = filtered.filter((p) => {
    if (compareMode) return true; // al comparar se ven todas las versiones (oversize, beagle…) del mismo diseño
    if (!p.designGroup) return true;
    if (seenDesignGroups.has(p.designGroup)) return false;
    seenDesignGroups.add(p.designGroup);
    return true;
  });
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.subcategory || "").toLowerCase().includes(q) ||
        (p.extraCategories || []).some((c) => c.toLowerCase().includes(q))
    );
  }

  // Talles y colores para mostrar como opciones — solo los que existen dentro
  // de lo que ya quedó filtrado por grupo/categoría/búsqueda, para no ofrecer
  // opciones que de todos modos no van a traer ningún resultado.
  const availableSizes = [...new Set(filtered.flatMap((p) => p.sizes || []))];
  const availableColors = [];
  const seenColorKeys = new Set();
  filtered.forEach((p) => (p.colors || []).forEach((c) => {
    const key = (c.name || "").toLowerCase();
    if (key && !seenColorKeys.has(key)) { seenColorKeys.add(key); availableColors.push({ name: c.name, hex: c.hex }); }
  }));

  const minP = priceMin.trim() ? Number(priceMin) : null;
  const maxP = priceMax.trim() ? Number(priceMax) : null;
  if (minP !== null && !Number.isNaN(minP)) filtered = filtered.filter((p) => priceOf(p) >= minP);
  if (maxP !== null && !Number.isNaN(maxP)) filtered = filtered.filter((p) => priceOf(p) <= maxP);
  if (selectedSizes.length) filtered = filtered.filter((p) => (p.sizes || []).some((s) => selectedSizes.includes(s)));
  if (selectedColors.length) filtered = filtered.filter((p) => (p.colors || []).some((c) => selectedColors.includes((c.name || "").toLowerCase())));

  filtered = [...filtered];
  if (sortBy === "precio-asc") filtered.sort((a, b) => priceOf(a) - priceOf(b));
  else if (sortBy === "precio-desc") filtered.sort((a, b) => priceOf(b) - priceOf(a));
  else if (sortBy === "nombre") filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === "reciente") filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  else if (sortBy === "vendido") filtered.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));

  const toggleSize = (s) => setSelectedSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const toggleColor = (name) => {
    const key = name.toLowerCase();
    setSelectedColors((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };
  const activeFilterCount = (minP !== null ? 1 : 0) + (maxP !== null ? 1 : 0) + selectedSizes.length + selectedColors.length;
  const clearFilters = () => { setPriceMin(""); setPriceMax(""); setSelectedSizes([]); setSelectedColors([]); };
  const filterInputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  const totalPages = Math.max(1, Math.ceil(filtered.length / CATALOG_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filtered.slice((safePage - 1) * CATALOG_PAGE_SIZE, safePage * CATALOG_PAGE_SIZE);
  const filterSignature = [activeGroup, activeCat, activeSubcat, activeCollection, query, sortBy, priceMin, priceMax, selectedSizes.join(","), selectedColors.join(",")].join("|");
  useEffect(() => { setPage(1); }, [filterSignature]);
  const goToPage = (n) => {
    setPage(n);
    setTimeout(() => gridTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  const clearAll = () => { clearFilters(); setActiveCollection("Todas"); setActiveGroup("Todas"); setActiveCat("Todas"); setActiveSubcat("Todas"); };
  const anyActive = activeCollection !== "Todas" || activeFilterCount > 0 || activeGroup !== "Todas" || activeCat !== "Todas" || activeSubcat !== "Todas";

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-10">
      <Breadcrumbs
        steps={[
          { label: "Inicio", onClick: onGoHome },
          { label: onlyFavorites ? "Favoritos" : "Catálogo" },
          ...(activeCollection !== "Todas" ? [{ label: COLLECTION_LABELS[activeCollection] }] : []),
          ...(activeGroup !== "Todas" ? [{ label: activeGroup }] : []),
          ...(activeCat !== "Todas" ? [{ label: activeCat }] : []),
          ...(activeSubcat !== "Todas" ? [{ label: activeSubcat }] : []),
        ]}
      />
      <SectionTitle eyebrow={onlyFavorites ? "Guardado por vos" : "Todo Kulto"} title={onlyFavorites ? "Tus favoritos" : (activeCollection !== "Todas" ? COLLECTION_LABELS[activeCollection] : "Catálogo")} />

      <div className="flex flex-col lg:flex-row gap-8 mt-4">
        {/* Filtros a la izquierda (en el celular se abren con el botón "Filtros") */}
        <aside className={`${showFilters ? "block" : "hidden"} lg:block lg:w-60 shrink-0`}>
          <div className="lg:sticky lg:top-24">
            {!onlyFavorites && (
              <FilterAccordion title="Destacados" defaultOpen={activeCollection !== "Todas"} badge={activeCollection !== "Todas" ? "1" : null}>
                <FilterOption label="Todos los productos" active={activeCollection === "Todas"} onClick={() => setActiveCollection("Todas")} />
                {Object.entries(COLLECTION_LABELS).map(([k, label]) => (
                  <FilterOption key={k} label={label} active={activeCollection === k} onClick={() => setActiveCollection(k)} />
                ))}
              </FilterAccordion>
            )}
            {groups.length > 0 && (
              <FilterAccordion title="Temática" defaultOpen badge={activeGroup !== "Todas" ? "1" : null}>
                {["Todas", ...groups].map((g) => (
                  <FilterOption key={g} label={g === "Todas" ? "Todas" : g} active={activeGroup === g} onClick={() => { setActiveGroup(g); setActiveCat("Todas"); setActiveSubcat("Todas"); }} />
                ))}
              </FilterAccordion>
            )}
            <FilterAccordion title="Categoría" defaultOpen badge={activeCat !== "Todas" ? "1" : null}>
              {["Todas", ...catsInGroup].map((c) => (
                <FilterOption key={c} label={c} active={activeCat === c} onClick={() => { setActiveCat(c); setActiveSubcat("Todas"); }} />
              ))}
            </FilterAccordion>
            {(subcatsInView.length > 0 || activeSubcat !== "Todas") && (
              <FilterAccordion title="Carpeta / diseños" defaultOpen badge={activeSubcat !== "Todas" ? "1" : null}>
                {["Todas", ...subcatsInView].map((sc) => (
                  <FilterOption key={sc} label={sc === "Todas" ? "Todos los diseños" : sc} active={activeSubcat === sc} onClick={() => setActiveSubcat(sc)} />
                ))}
              </FilterAccordion>
            )}
            {availableColors.length > 0 && (
              <FilterAccordion title="Color" badge={selectedColors.length ? String(selectedColors.length) : null}>
                <div className="flex flex-wrap gap-2 px-1 pt-1">
                  {availableColors.map((c) => {
                    const key = (c.name || "").toLowerCase();
                    const active = selectedColors.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleColor(c.name)}
                        title={c.name}
                        className="kulto-btn w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ background: c.hex, border: active ? "2px solid var(--sun)" : "1px solid var(--line)" }}
                      >
                        {active && <Check size={14} color="#fff" style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.8))" }} />}
                      </button>
                    );
                  })}
                </div>
              </FilterAccordion>
            )}
            {availableSizes.length > 0 && (
              <FilterAccordion title="Talle" badge={selectedSizes.length ? String(selectedSizes.length) : null}>
                <div className="flex flex-wrap gap-2 px-1 pt-1">
                  {availableSizes.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSize(s)}
                      className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full"
                      style={{ background: selectedSizes.includes(s) ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </FilterAccordion>
            )}
            <FilterAccordion title="Precio" badge={(minP !== null ? 1 : 0) + (maxP !== null ? 1 : 0) ? String((minP !== null ? 1 : 0) + (maxP !== null ? 1 : 0)) : null}>
              <div className="flex items-center gap-2 px-1 pt-1">
                <input type="number" min="0" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="Mín" className="w-full min-w-0 rounded-lg p-2 text-sm" style={filterInputStyle} />
                <span style={{ color: "var(--slate)" }}>—</span>
                <input type="number" min="0" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="Máx" className="w-full min-w-0 rounded-lg p-2 text-sm" style={filterInputStyle} />
              </div>
            </FilterAccordion>
            {anyActive && (
              <button onClick={clearAll} className="kulto-btn text-xs font-semibold flex items-center gap-1.5 mt-3" style={{ color: "var(--signal)" }}>
                <RotateCcw size={13} /> Limpiar todos los filtros
              </button>
            )}
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar productos..."
              className="flex-1 rounded-xl p-2.5 text-sm"
              style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-xl p-2.5 text-sm"
              style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
            >
              <option value="relevancia">Orden: relevancia</option>
              <option value="vendido">Más vendido</option>
              <option value="reciente">Más reciente</option>
              <option value="precio-asc">Precio: menor a mayor</option>
              <option value="precio-desc">Precio: mayor a menor</option>
              <option value="nombre">Nombre A-Z</option>
            </select>
            <button
              type="button"
              onClick={() => { setCompareMode((v) => !v); setCompareIds([]); setCompareNotice(""); }}
              className="kulto-btn flex items-center gap-2 text-sm shrink-0 rounded-xl px-3 py-2.5"
              style={{ background: "var(--ink-2)", color: "var(--bone)", border: `1px solid ${compareMode ? "var(--signal)" : "var(--line)"}` }}
              aria-pressed={compareMode}
            >
              Comparar
              <span className="relative inline-block rounded-full" style={{ width: 34, height: 18, background: compareMode ? "var(--signal)" : "var(--ink-3)", border: "1px solid var(--line)" }}>
                <span className="absolute rounded-full" style={{ top: 1, left: compareMode ? 17 : 1, width: 14, height: 14, background: "var(--bone)", transition: "left .15s" }} />
              </span>
            </button>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="kulto-btn lg:hidden rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 shrink-0"
              style={{ background: anyActive ? "var(--signal)" : "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
            >
              <SlidersHorizontal size={16} /> Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            <span className="hidden lg:block text-xs shrink-0" style={{ color: "var(--slate)" }}>{filtered.length} producto{filtered.length === 1 ? "" : "s"}</span>
          </div>
          <div ref={gridTopRef} style={{ scrollMarginTop: 96 }} />
          {compareMode && (
            <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>
              Modo comparar: tocá las tarjetas de los productos que quieras comparar (hasta 3) y después "Ver diferencias".
            </p>
          )}
          {filtered.length ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {pagedItems.map((p) => {
                  const picked = compareIds.includes(p.id);
                  return (
                    <div key={p.id} className="relative" style={compareMode ? { borderRadius: 16, outline: picked ? "3px solid var(--signal)" : "none", outlineOffset: 2 } : undefined}>
                      <ProductCard product={p} onOpen={onOpen} isFavorite={favorites?.includes(p.id)} onToggleFavorite={onToggleFavorite} onAddToCart={onAddToCart} />
                      {compareMode && (
                        <button
                          type="button"
                          onClick={() => toggleCompare(p.id)}
                          className="absolute inset-0 rounded-2xl flex items-start justify-end p-2"
                          style={{ zIndex: 10, background: picked ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.02)", cursor: "pointer" }}
                          aria-label={picked ? `Quitar ${p.name} de la comparación` : `Comparar ${p.name}`}
                          aria-pressed={picked}
                        >
                          <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: picked ? "var(--signal)" : "var(--ink)", color: "var(--bone)", border: "2px solid var(--bone)" }}>
                            {picked ? <Check size={15} /> : <Plus size={15} />}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <Paginator page={safePage} total={totalPages} onChange={goToPage} />
            </>
          ) : (
            <EmptyState text={onlyFavorites ? "Todavía no guardaste ningún producto — tocá el corazón en cualquier producto para guardarlo acá." : "No hay productos con estos filtros todavía."} />
          )}
        </div>
      </div>

      {compareMode && comparedProducts.length > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-2xl px-3 py-2.5 max-w-[95vw]" style={{ bottom: 16, zIndex: 80, background: "var(--ink-2)", border: "1px solid var(--signal)", boxShadow: "0 12px 40px rgba(0,0,0,0.45)" }}>
          <div className="flex items-center gap-1.5">
            {comparedProducts.map((p) => (
              <button key={p.id} onClick={() => toggleCompare(p.id)} title={`Quitar ${p.name}`} className="kulto-btn w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
                {productThumbSrc(p) ? <FastImg src={productThumbSrc(p)} alt={p.name} className="w-full h-full object-contain" /> : <Shirt size={16} color="rgba(243,239,230,0.35)" />}
              </button>
            ))}
          </div>
          <div className="text-xs" style={{ color: "var(--bone)" }}>
            {comparedProducts.length < 2 ? "Elegí al menos 2" : `${comparedProducts.length} elegidos`}
            {compareNotice && <span className="block" style={{ color: "var(--signal)" }}>{compareNotice}</span>}
          </div>
          <button
            type="button"
            disabled={comparedProducts.length < 2}
            onClick={() => setShowCompare(true)}
            className="kulto-btn rounded-full px-4 py-2 text-sm font-semibold"
            style={{ background: "var(--signal)", color: "var(--bone)", opacity: comparedProducts.length < 2 ? 0.45 : 1 }}
          >
            Ver diferencias
          </button>
          <button type="button" onClick={() => { setCompareIds([]); setCompareNotice(""); }} className="kulto-btn text-xs underline" style={{ color: "var(--slate)" }}>Limpiar</button>
        </div>
      )}
      {showCompare && comparedProducts.length >= 2 && (
        <CompareModal
          products={comparedProducts}
          onClose={() => setShowCompare(false)}
          onRemove={(id) => { toggleCompare(id); if (comparedProducts.length <= 2) setShowCompare(false); }}
          onOpen={(p) => { setShowCompare(false); onOpen?.(p); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Wizard (Personalizar)                                               */
/* ------------------------------------------------------------------ */

/* Interactive placer: lets the customer drag/resize/rotate AS MANY uploaded
   images as they want over a fixed garment photo (front or back). `designs`
   is an array of { id, image, x, y, widthPct, rotation } layers — x/y are %
   of the container (the image's center), widthPct is the image's width as a
   fraction of the container's width, rotation is in degrees. `setDesigns`
   lifts the whole array up so the parent Wizard keeps front and back
   independent. Tap a layer to select it (shows its handles + a size/rotation
   slider + a remove button); drag the layer to move it, its corner handle to
   resize it, and its top handle to rotate it freely. */
function DesignPlacer({ garmentImage, designs, setDesigns, sideLabel, mode = "self", designLibrary = [], designFolders = [], productCategory = null, product = null }) {
  // Una carpeta puede quedar atada a una categoría de producto (ej: "Mates")
  // para que sus diseños solo aparezcan al personalizar esa categoría — las
  // carpetas sin categoría asignada ("Todas") se ven siempre, en cualquier
  // producto.
  const visibleFolders = designFolders.filter((f) => folderAppliesTo(f, product || (productCategory ? { category: productCategory } : null)));
  const containerRef = useRef(null);
  const zoomContainerRef = useRef(null);
  const draggingId = useRef(null);
  const resizingId = useRef(null);
  const rotatingId = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  // Si hay carpetas creadas, la librería se navega por carpeta en vez de
  // mostrar todos los diseños juntos en una sola grilla — null es la vista de
  // carpetas, "__sueltos__" son los diseños sin carpeta asignada.
  const [activeLibraryFolder, setActiveLibraryFolder] = useState(null);
  const [showZoom, setShowZoom] = useState(false);
  // Acercar de verdad en "Ver en grande": la tela crece más que el marco
  // visible y aparece scroll para recorrerla, en vez de solo verla más grande
  // sin poder acercarse a los detalles.
  const [zoom, setZoom] = useState(1);

  const addLayer = (image, folderId = null) => {
    const id = genId("dl");
    setDesigns((prev) => [...prev, { id, image, x: 50, y: 42, widthPct: 0.38, rotation: 0, ...(folderId ? { folderId } : {}) }]);
    setSelectedId(id);
    setShowLibrary(false);
  };

  const handleUpload = async (file) => {
    if (!file) return;
    const isPng = file.type === "image/png";
    const b64 = await new Promise((resolve) => fileToBase64(file, resolve, 1200, isPng ? 1 : 0.9, isPng ? "image/png" : "image/jpeg"));
    addLayer(b64);
  };

  const removeLayer = (id) => {
    setDesigns((prev) => prev.filter((d) => d.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  const onPointerDown = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    draggingId.current = id;
    setSelectedId(id);
    try { e.target.setPointerCapture?.(e.pointerId); } catch {}
  };
  const onResizeStart = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    resizingId.current = id;
    setSelectedId(id);
    try { e.target.setPointerCapture?.(e.pointerId); } catch {}
  };
  const onRotateStart = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    rotatingId.current = id;
    setSelectedId(id);
    try { e.target.setPointerCapture?.(e.pointerId); } catch {}
  };
  // "ref" es el contenedor que se está usando para calcular la posición
  // relativa (%) — el chico de siempre, o el grande de la vista ampliada —
  // así el arrastre/resize/rotación funcionan igual de bien en los dos.
  const onPointerMove = (e, ref = containerRef) => {
    if (!ref.current) return;
    if (draggingId.current) {
      const rect = ref.current.getBoundingClientRect();
      let x = ((e.clientX - rect.left) / rect.width) * 100;
      let y = ((e.clientY - rect.top) / rect.height) * 100;
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));
      const id = draggingId.current;
      setDesigns((prev) => prev.map((d) => (d.id === id ? { ...d, x, y } : d)));
      return;
    }
    if (resizingId.current) {
      const rect = ref.current.getBoundingClientRect();
      const id = resizingId.current;
      setDesigns((prev) => prev.map((d) => {
        if (d.id !== id) return d;
        const cx = rect.left + (d.x / 100) * rect.width;
        const cy = rect.top + (d.y / 100) * rect.height;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        // Deshacemos la rotación actual del diseño para medir el arrastre
        // como si estuviera derecho — así el tamaño responde igual sin
        // importar cuánto esté inclinado.
        const rad = (-(d.rotation || 0) * Math.PI) / 180;
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const widthPct = Math.max(0.05, Math.min(1.5, (localX * 2) / rect.width));
        return { ...d, widthPct };
      }));
      return;
    }
    if (rotatingId.current) {
      const rect = ref.current.getBoundingClientRect();
      const id = rotatingId.current;
      setDesigns((prev) => prev.map((d) => {
        if (d.id !== id) return d;
        const cx = rect.left + (d.x / 100) * rect.width;
        const cy = rect.top + (d.y / 100) * rect.height;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        let rotation = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        rotation = ((rotation + 180) % 360 + 360) % 360 - 180;
        return { ...d, rotation };
      }));
      return;
    }
  };
  const stopDrag = () => { draggingId.current = null; resizingId.current = null; rotatingId.current = null; };

  // Una capa de diseño con sus manijas de mover / agrandar / rotar — se
  // dibuja igual en la vista chica y en "Ver en grande" (misma lógica, sin
  // duplicar el cálculo de ángulos ni de tamaño).
  const renderLayer = (d) => (
    <div
      key={d.id}
      onPointerDown={(e) => onPointerDown(e, d.id)}
      className="absolute cursor-move"
      style={{
        width: `${d.widthPct * 100}%`,
        left: `${d.x}%`,
        top: `${d.y}%`,
        transform: `translate(-50%, -50%) rotate(${d.rotation || 0}deg)`,
        touchAction: "none",
      }}
    >
      <img
        src={d.image}
        alt="Diseño"
        draggable={false}
        className="w-full h-auto block pointer-events-none"
        style={{
          filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))",
          outline: d.id === selectedId ? "2px dashed var(--sun)" : "none",
          outlineOffset: 3,
        }}
      />
      {d.id === selectedId && (
        <>
          <button
            type="button"
            onPointerDown={(e) => onRotateStart(e, d.id)}
            className="kulto-btn absolute rounded-full flex items-center justify-center"
            style={{
              top: -26, left: "50%", transform: "translateX(-50%)",
              width: 22, height: 22, background: "var(--sun)", color: "var(--ink)",
              border: "2px solid var(--ink)", touchAction: "none", cursor: "grab",
            }}
            title="Arrastrá para inclinar"
            aria-label="Rotar diseño"
          >
            <RotateCw size={12} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => onResizeStart(e, d.id)}
            className="kulto-btn absolute rounded-full"
            style={{
              bottom: -8, right: -8, width: 18, height: 18,
              background: "var(--sun)", border: "2px solid var(--ink)",
              touchAction: "none", cursor: "nwse-resize",
            }}
            title="Arrastrá para agrandar o achicar"
            aria-label="Redimensionar diseño"
          />
        </>
      )}
    </div>
  );

  const selected = designs.find((d) => d.id === selectedId) || null;

  if (!garmentImage) {
    return (
      <p className="text-sm text-center" style={{ color: "var(--signal)" }}>
        Todavía no hay foto de {sideLabel} cargada para esta prenda en este color. Escribinos por WhatsApp y lo coordinamos.
      </p>
    );
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden mx-auto select-none"
        style={{ background: "var(--ink-3)", border: "1px solid var(--line)", aspectRatio: "4 / 5", maxWidth: 380, touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
        onPointerCancel={stopDrag}
      >
        <img loading="lazy" src={garmentImage} className="absolute inset-0 w-full h-full object-contain pointer-events-none" alt="" />
        {designs.map(renderLayer)}
        <button
          type="button"
          onClick={() => { setZoom(1); setShowZoom(true); }}
          className="kulto-btn absolute top-2 right-2 rounded-full p-2"
          style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff" }}
          title="Ver en grande y acercarme"
        >
          <ZoomIn size={16} />
        </button>
      </div>

      {designs.length > 0 && (
        <p className="text-xs text-center mt-2" style={{ color: "var(--slate)" }}>
          Tocá una imagen para seleccionarla. Arrastrala para moverla, la manija de arriba para inclinarla y la de la esquina para agrandarla o achicarla.
        </p>
      )}

      {showZoom && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.85)", zIndex: 200 }}
          onClick={() => setShowZoom(false)}
        >
          <div className="relative w-full max-w-2xl my-auto" onClick={(e) => e.stopPropagation()}>
            <div
              className="rounded-2xl overflow-auto mx-auto"
              style={{ background: "var(--ink-3)", maxHeight: "80vh" }}
            >
              <div
                ref={zoomContainerRef}
                className="relative select-none"
                style={{ width: `${zoom * 100}%`, aspectRatio: "4 / 5", touchAction: "none" }}
                onPointerMove={(e) => onPointerMove(e, zoomContainerRef)}
                onPointerUp={stopDrag}
                onPointerLeave={stopDrag}
                onPointerCancel={stopDrag}
              >
                <img loading="lazy" src={garmentImage} className="absolute inset-0 w-full h-full object-contain pointer-events-none" alt="" />
                {designs.map(renderLayer)}
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 mt-3">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.5) * 100) / 100))}
                className="kulto-btn rounded-full p-2"
                style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "#fff" }}
                title="Alejar"
                aria-label="Alejar"
              >
                <ZoomOut size={16} />
              </button>
              <span className="text-xs font-semibold" style={{ color: "#fff", minWidth: 44, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.5) * 100) / 100))}
                className="kulto-btn rounded-full p-2"
                style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "#fff" }}
                title="Acercar"
                aria-label="Acercar"
              >
                <ZoomIn size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowZoom(false)}
              className="kulto-btn absolute -top-3 -right-3 rounded-full p-2"
              style={{ background: "var(--ink)", border: "1px solid var(--line)", color: "#fff" }}
              title="Cerrar"
              aria-label="Cerrar vista ampliada"
            >
              <X size={18} />
            </button>
            <p className="text-xs text-center mt-3" style={{ color: "#fff" }}>
              {zoom > 1 ? "Recorré la tela con scroll — arrastrá el diseño para ubicarlo." : designs.length > 0 ? "Usá +/- para acercarte, o arrastrá el diseño para ubicarlo." : "Tocá afuera para cerrar"}
            </p>
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-2 flex flex-col gap-2 max-w-[380px] mx-auto rounded-xl p-3" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
          <label className="text-xs flex items-center gap-2" style={{ color: "var(--slate)" }}>
            Tamaño de la imagen seleccionada
            <input
              type="range" min="0.05" max="1.5" step="0.01"
              value={selected.widthPct}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setDesigns((prev) => prev.map((d) => (d.id === selected.id ? { ...d, widthPct: val } : d)));
              }}
              className="flex-1"
            />
          </label>
          <label className="text-xs flex items-center gap-2" style={{ color: "var(--slate)" }}>
            Inclinación
            <input
              type="range" min="-180" max="180" step="1"
              value={selected.rotation || 0}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setDesigns((prev) => prev.map((d) => (d.id === selected.id ? { ...d, rotation: val } : d)));
              }}
              className="flex-1"
            />
          </label>
          <div className="flex items-center justify-center gap-2">
            {(selected.rotation || 0) !== 0 && (
              <button
                type="button"
                onClick={() => setDesigns((prev) => prev.map((d) => (d.id === selected.id ? { ...d, rotation: 0 } : d)))}
                className="kulto-btn text-xs font-semibold px-3 py-2 rounded-full"
                style={{ border: "1px solid var(--line)", color: "var(--slate)" }}
              >
                Enderezar
              </button>
            )}
            <button type="button" onClick={() => removeLayer(selected.id)} className="kulto-btn text-xs font-semibold px-3 py-2 rounded-full" style={{ border: "1px solid var(--line)", color: "var(--signal)" }}>
              Quitar esta imagen
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-col items-center gap-2 max-w-[460px] mx-auto">
        {mode === "library" ? (
          showLibrary ? (
            <div className="w-full">
              {visibleFolders.length > 0 && activeLibraryFolder === null ? (
                <>
                  <p className="text-xs text-center mb-2" style={{ color: "var(--slate)" }}>Elegí una carpeta</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {visibleFolders.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setActiveLibraryFolder(f.id)}
                        className="kulto-btn flex flex-col items-center gap-1 rounded-xl p-2"
                        style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}
                      >
                        <FolderCoverThumb coverDesignIds={f.coverDesignIds || []} allDesigns={designLibrary} size={56} />
                        <span className="text-[11px] font-semibold max-w-[70px] truncate" style={{ color: "var(--bone)" }}>{f.name}</span>
                      </button>
                    ))}
                    {designLibrary.some((d) => !d.folderId) && (
                      <button
                        type="button"
                        onClick={() => setActiveLibraryFolder("__sueltos__")}
                        className="kulto-btn flex flex-col items-center gap-1 rounded-xl p-2"
                        style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}
                      >
                        <div className="rounded-lg flex items-center justify-center" style={{ width: 56, height: 56, background: "var(--ink)" }}>
                          <Package size={20} color="rgba(243,239,230,0.4)" />
                        </div>
                        <span className="text-[11px] font-semibold" style={{ color: "var(--bone)" }}>Otros</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {visibleFolders.length > 0 && (
                    <button type="button" onClick={() => setActiveLibraryFolder(null)} className="kulto-btn text-xs font-semibold flex items-center gap-1 mb-2" style={{ color: "var(--slate)" }}>
                      <ArrowLeft size={12} /> Carpetas
                    </button>
                  )}
                  <p className="text-xs text-center mb-2" style={{ color: "var(--slate)" }}>Elegí uno de nuestros diseños</p>
                  {(() => {
                    // Si no hay ninguna carpeta en todo el sistema, se ve todo
                    // suelto como antes. Si hay carpetas pero ninguna aplica a
                    // esta categoría, no mostramos los diseños de carpetas de
                    // otras categorías — solo los sueltos (sin carpeta).
                    const list =
                      designFolders.length === 0
                        ? designLibrary
                        : visibleFolders.length === 0
                          ? designLibrary.filter((d) => !d.folderId)
                          : activeLibraryFolder === "__sueltos__"
                            ? designLibrary.filter((d) => !d.folderId)
                            : designLibrary.filter((d) => d.folderId === activeLibraryFolder);
                    return list.length ? (
                      // Grilla de 3 en vez de 4 por fila (más grande cada una) —
                      // para que el cliente se dé una idea real del diseño de
                      // un vistazo, sin tener que clickearlo para verlo recién
                      // sobre la prenda.
                      <div className="grid grid-cols-3 gap-2">
                        {list.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => addLayer(d.image, d.folderId)}
                            className="kulto-btn rounded-lg overflow-hidden aspect-square"
                            style={{ background: "#fff", border: "1px solid var(--line)" }}
                            title={d.name}
                          >
                            <FastImg loading="lazy" src={d.image} className="w-full h-full object-contain p-1" alt={d.name} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-center" style={{ color: "var(--signal)" }}>Todavía no hay diseños acá.</p>
                    );
                  })()}
                </>
              )}
              <button type="button" onClick={() => { setShowLibrary(false); setActiveLibraryFolder(null); }} className="kulto-btn text-xs mt-2 mx-auto block" style={{ color: "var(--slate)" }}>
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLibrary(true)}
              className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full flex items-center gap-2"
              style={{ background: "var(--signal)", color: "var(--bone)" }}
            >
              <Plus size={16} /> {designs.length ? "Agregar otro diseño" : "Elegir un diseño"}
            </button>
          )
        ) : (
          <label className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full cursor-pointer flex items-center gap-2" style={{ background: "var(--signal)", color: "var(--bone)" }}>
            <Upload size={16} /> {designs.length ? "Agregar otra imagen" : "Subir imagen"}
            <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
          </label>
        )}
      </div>
    </div>
  );
}

// Tarjeta de selección de prenda en el paso 1 de "Personalizar": al pasar el
// mouse (o tocar el ícono "i" en el celular, donde no existe el hover) se da
// vuelta y muestra una descripción libre (de qué está hecha, etc.) más los
// colores disponibles como bolitas de color — con un "+N" si hay más de los
// que entran, para avisar que hay más opciones sin ocupar toda la tarjeta.
const TEMPLATE_CARD_MAX_DOTS = 8;

function TemplateProductCard({ product, onSelect, bg }) {
  const [flipped, setFlipped] = useState(false);
  const thumb = product.cardImage || product.colors?.[0]?.frontImage || product.colors?.[0]?.images?.[0] || product.photoPool?.[0];
  const colors = product.colors || [];
  const shownColors = colors.slice(0, TEMPLATE_CARD_MAX_DOTS);
  const extraColors = colors.length - shownColors.length;
  const hasBackInfo = !!(product.description?.trim() || colors.length > 0);

  return (
    <div className="kulto-flip-outer" style={{ aspectRatio: "4 / 5.6" }}>
      <div className={`kulto-flip-inner ${flipped ? "is-flipped" : ""}`}>
        <button
          onClick={() => onSelect(product)}
          className="kulto-btn kulto-flip-face relative rounded-2xl overflow-hidden flex flex-col items-center text-center"
          style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}
        >
          <div className="w-full flex-1 overflow-hidden flex items-center justify-center" style={{ background: bg || product.colors?.[0]?.hex || "var(--ink-3)" }}>
            {thumb ? <FastImg loading="lazy" src={thumb} className="w-full h-full object-contain" alt={product.name} /> : <Shirt size={32} style={{ color: "rgba(243,239,230,0.4)" }} />}
          </div>
          {product.audience && product.audience !== "unisex" && (
            <span
              className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
            >
              {AUDIENCE_LABELS[product.audience] || product.audience}
            </span>
          )}
          <span
            className="font-semibold text-sm py-2 px-2"
            style={{ color: "var(--bone)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.6em" }}
          >
            {product.name}
          </span>
          {hasBackInfo && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Ver detalles de la prenda"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFlipped(true); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setFlipped(true); } }}
              className="kulto-btn absolute top-2 right-2 rounded-full p-1.5 flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
            >
              <Info size={14} />
            </span>
          )}
        </button>

        {hasBackInfo && (
          <div
            className="kulto-flip-face kulto-flip-back relative rounded-2xl overflow-hidden flex flex-col p-3 gap-2 text-left"
            style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>{product.name}</p>
            <p className="text-xs flex-1 overflow-y-auto kulto-scrollbar" style={{ color: "var(--slate)" }}>
              {product.description?.trim() || "Elegí esta prenda para personalizarla."}
            </p>
            {colors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {shownColors.map((c, i) => (
                  <span key={i} className="w-4 h-4 rounded-full shrink-0" style={{ background: c.hex, border: "1px solid rgba(255,255,255,0.4)" }} title={c.name} />
                ))}
                {extraColors > 0 && <span className="text-[11px] font-semibold" style={{ color: "var(--sun)" }}>+{extraColors}</span>}
              </div>
            )}
            <button
              onClick={() => onSelect(product)}
              className="kulto-btn text-xs font-semibold rounded-full py-2 mt-1"
              style={{ background: "var(--signal)", color: "var(--bone)" }}
            >
              Elegir esta prenda
            </button>
            <span
              role="button"
              tabIndex={0}
              aria-label="Volver"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFlipped(false); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setFlipped(false); } }}
              className="kulto-btn absolute top-2 right-2 rounded-full p-1.5 flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
            >
              <X size={14} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Color de fondo de las tarjetas del paso 1 de "Personalizar": el admin puede
// elegir uno para todas, o uno por categoría ("g:Camisetas") o por estilo
// ("s:Beagle") — ver AdminPersonalizeCardColors. Si no eligió ninguno, se usa
// el color automático de la prenda como siempre.
function cardBgFor(settings, keys, fallback) {
  const map = settings?.personalizeCardBg || {};
  for (const k of keys) if (k && map[k]) return map[k];
  return map.all || fallback;
}

// Tarjeta genérica que se da vuelta (categoría o estilo de prenda en
// "Personalizar"): adelante la foto y el nombre, atrás la información — igual
// que TemplateProductCard. "colors" es la lista de bolitas de color.
function PickFlipCard({ title, thumb, bg, description, details = [], colors = [], onSelect, ctaLabel = "Elegir" }) {
  const [flipped, setFlipped] = useState(false);
  const unique = [];
  colors.forEach((c) => { if (c?.hex && !unique.some((u) => u.hex === c.hex)) unique.push(c); });
  const shown = unique.slice(0, TEMPLATE_CARD_MAX_DOTS);
  const extra = unique.length - shown.length;
  return (
    <div className="kulto-flip-outer" style={{ aspectRatio: "4 / 5.4" }}>
      <div className={`kulto-flip-inner ${flipped ? "is-flipped" : ""}`}>
        <button
          onClick={onSelect}
          className="kulto-btn kulto-flip-face relative rounded-2xl overflow-hidden flex flex-col items-center text-center"
          style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}
        >
          <div className="w-full flex-1 overflow-hidden flex items-center justify-center" style={{ background: bg || "var(--ink-3)" }}>
            {thumb ? <FastImg loading="lazy" src={thumb} className="w-full h-full object-contain p-3" alt={title} /> : <Shirt size={32} style={{ color: "rgba(243,239,230,0.4)" }} />}
          </div>
          <span
            className="font-semibold text-sm py-2 px-2"
            style={{ color: "var(--bone)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.6em" }}
          >
            {title}
          </span>
          <span
            role="button"
            tabIndex={0}
            aria-label="Ver detalles"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFlipped(true); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setFlipped(true); } }}
            className="kulto-btn absolute top-2 right-2 rounded-full p-1.5 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
          >
            <Info size={14} />
          </span>
        </button>

        <div
          className="kulto-flip-face kulto-flip-back relative rounded-2xl overflow-hidden flex flex-col p-3 gap-2 text-left"
          style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}
        >
          <p className="text-sm font-semibold pr-7" style={{ color: "var(--bone)" }}>{title}</p>
          <div className="text-xs flex-1 overflow-y-auto kulto-scrollbar flex flex-col gap-1" style={{ color: "var(--slate)" }}>
            {description ? <p>{description}</p> : null}
            {details.map((d, i) => <p key={i}>{d}</p>)}
            {!description && !details.length && <p>Elegí esta opción para personalizarla.</p>}
          </div>
          {shown.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {shown.map((c, i) => (
                <span key={i} className="w-4 h-4 rounded-full shrink-0" style={{ background: c.hex, border: "1px solid rgba(255,255,255,0.4)" }} title={c.name} />
              ))}
              {extra > 0 && <span className="text-[11px] font-semibold" style={{ color: "var(--sun)" }}>+{extra}</span>}
            </div>
          )}
          <button
            onClick={onSelect}
            className="kulto-btn text-xs font-semibold rounded-full py-2 mt-1"
            style={{ background: "var(--signal)", color: "var(--bone)" }}
          >
            {ctaLabel}
          </button>
          <span
            role="button"
            tabIndex={0}
            aria-label="Volver"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFlipped(false); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setFlipped(false); } }}
            className="kulto-btn absolute top-2 right-2 rounded-full p-1.5 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
          >
            <X size={14} />
          </span>
        </div>
      </div>
    </div>
  );
}

function Wizard({ products, categories, settings, designLibrary, designFolders, onAddToCart, onOpenProduct, favorites, onToggleFavorite, onGoHome }) {
  const [step, setStep] = useState(1); // 1 prenda, 2 color, 3 talla, 4 diseño (fuente/adelante/atrás/vista final)
  const [prod, setProd] = useState(null);
  const [colorIdx, setColorIdx] = useState(0);
  const [sizeIdx, setSizeIdx] = useState(0);
  // "source": null (eligiendo) | "self" (sube su foto) | "library" (elige un diseño de Kulto) | "service" (pide que se lo hagamos)
  const [source, setSource] = useState(null);
  const [consent, setConsent] = useState(false);
  const [side, setSide] = useState("front"); // clave de zona actual ("front", "back", "sleeveLeft", "sleeveRight") o "preview"
  const [frontDesigns, setFrontDesigns] = useState([]); // array de imágenes ajustables, no un límite de una sola
  const [backDesigns, setBackDesigns] = useState([]);
  const [sleeveLeftDesigns, setSleeveLeftDesigns] = useState([]);
  const [sleeveRightDesigns, setSleeveRightDesigns] = useState([]);
  const [composing, setComposing] = useState(false);
  const [composed, setComposed] = useState({ front: null, back: null, sleeveLeft: null, sleeveRight: null });
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  // Qué foto de la vista final se está mostrando (adelante/atrás/mangas, todas
  // en una sola tarjeta que se navega con flechitas en vez de 4 cuadros sueltos).
  const [previewIdx, setPreviewIdx] = useState(0);
  useEffect(() => { setPreviewIdx(0); }, [side]);
  // Hover zoom + vista ampliada en la foto final, igual que en la ficha de un
  // producto normal — antes esta pantalla no tenía ninguna de las dos.
  const [previewHoverZoom, setPreviewHoverZoom] = useState(false);
  const [previewZoomOrigin, setPreviewZoomOrigin] = useState({ x: 50, y: 50 });
  const [previewZoomOpen, setPreviewZoomOpen] = useState(false);

  // Solo las prendas marcadas por el administrador como "base para sublimar"
  // (tags.template) aparecen acá — nunca se mezclan con el catálogo de venta normal.
  const [groupSel, setGroupSel] = useState(null);
  const [subgroupSel, setSubgroupSel] = useState(null);
  // Filtro opcional por "para quién" (Hombre/Mujer/Niños/Unisex) dentro del
  // paso de elegir modelo — solo se muestra si hay más de un valor entre los
  // modelos de ese grupo/subgrupo, para no agregar ruido cuando no hace falta.
  const [audienceFilter, setAudienceFilter] = useState("todos");

  const productsWithColors = products.filter((p) => p.tags?.template && !p.hidden && p.colors && p.colors.length > 0);
  // Grupo → Subgrupo → Modelo: el grupo es la categoría (ej: "Camisetas"), el
  // subgrupo es el estilo dentro de esa categoría (ej: "Oversize") y el modelo
  // es la prenda final con sus fotos y colores (ej: "Beagle").
  const templateGroups = Array.from(new Set(productsWithColors.map((p) => p.category).filter(Boolean)));
  const productsInGroup = groupSel ? productsWithColors.filter((p) => p.category === groupSel) : [];
  const subgroupsInGroup = Array.from(new Set(productsInGroup.map((p) => p.subcategory).filter(Boolean)));
  const hasUngroupedInGroup = productsInGroup.some((p) => !p.subcategory);
  const needsSubgroupStep = subgroupsInGroup.length > 0;
  const modelsToShow = !groupSel
    ? []
    : !needsSubgroupStep
    ? productsInGroup
    : subgroupSel === "__sin_subgrupo__"
    ? productsInGroup.filter((p) => !p.subcategory)
    : subgroupSel
    ? productsInGroup.filter((p) => p.subcategory === subgroupSel)
    : [];
  // El filtro por "para quién" solo se ofrece si hay más de un valor entre
  // los modelos que ya se van a mostrar — unisex cuenta como "le sirve a
  // cualquiera", así que también aparece al filtrar por Hombre/Mujer/Niños.
  const audienceValuesShown = Array.from(new Set(modelsToShow.map((p) => p.audience || "unisex")));
  const showAudienceFilter = audienceValuesShown.length > 1;
  const modelsFiltered = !showAudienceFilter || audienceFilter === "todos"
    ? modelsToShow
    : modelsToShow.filter((p) => {
        const a = p.audience || "unisex";
        return audienceFilter === "unisex" ? a === "unisex" : (a === audienceFilter || a === "unisex");
      });
  const pickStage = !groupSel ? "group" : needsSubgroupStep && !subgroupSel ? "subgroup" : "model";
  const selectGroup = (g) => { setGroupSel(g); setSubgroupSel(null); setAudienceFilter("todos"); };
  // Si el estilo elegido tiene un solo modelo cargado, ese modelo ya está
  // implícito en la elección — pasamos directo a color/talla en vez de
  // mostrar un paso "Elegí el modelo" que repetiría lo mismo que se acaba
  // de elegir con una sola opción para tocar.
  const selectSubgroup = (sg) => {
    setSubgroupSel(sg);
    setAudienceFilter("todos");
    const matches = sg === "__sin_subgrupo__"
      ? productsInGroup.filter((p) => !p.subcategory)
      : productsInGroup.filter((p) => p.subcategory === sg);
    if (matches.length === 1) resetForProduct(matches[0]);
  };
  const backToGroups = () => { setGroupSel(null); setSubgroupSel(null); setAudienceFilter("todos"); };
  const backToSubgroups = () => { setSubgroupSel(null); setAudienceFilter("todos"); };

  const color = prod && prod.colors ? prod.colors[colorIdx] : null;
  const colorsForProduct = prod ? prod.colors || [] : [];
  const hasSizes = prod && prod.sizes && prod.sizes.length > 0;
  const size = hasSizes ? prod.sizes[sizeIdx] : null;
  // Prioridad del precio en Personalizar: (1) precio propio de la prenda
  // base, si el admin le puso uno puntual; (2) el precio que el admin le
  // haya puesto a esa subcategoría/estilo (Beagle, Oversize, etc.) en
  // "Precios por estilo"; (3) el precio general de Personalizar, como
  // último respaldo si no se configuró nada más específico. Si la prenda no
  // tiene un "Subgrupo / estilo" cargado, "Precios por estilo" la identifica
  // por su nombre en su lugar (ver AdminPersonalizeSubcategoryPrices) — acá
  // hay que buscar con esa misma clave para que ese precio se aplique de
  // verdad al comprar, y no solo se vea guardado en el panel.
  const styleKey = prod?.subcategory || prod?.name;
  const subcategoryPrice = styleKey ? settings.personalizeSubcategoryPrices?.[styleKey] : null;
  const unitPrice = prod
    ? (prod.price != null
        ? Number(prod.price)
        : (subcategoryPrice != null ? Number(subcategoryPrice) : Number(settings.personalizedBasePrice) || 0))
    : 0;

  // Al terminar de personalizar, sugerimos productos reales del catálogo
  // (no otras prendas base) para que se sumen al carrito — priorizando la
  // misma categoría de lo que acaba de personalizar.
  const sellableForRecs = products.filter((p) => !p.tags?.template);
  const recommendedProducts = prod
    ? (() => {
        const sameCategory = sellableForRecs.filter((p) => p.category === prod.category);
        const rest = sellableForRecs.filter((p) => p.category !== prod.category);
        return [...sameCategory, ...rest].slice(0, 4);
      })()
    : [];

  // Adelante siempre es el primer paso (incluso sin foto configurada, para avisarlo);
  // atrás y mangas solo aparecen como pasos si el admin cargó esa foto para el color.
  const zoneConfig = {
    front: { image: color?.frontImage, designs: frontDesigns, setDesigns: setFrontDesigns, label: "ADELANTE", sideLabel: "adelante" },
    back: { image: color?.backImage, designs: backDesigns, setDesigns: setBackDesigns, label: "ATRÁS", sideLabel: "atrás" },
    sleeveLeft: { image: color?.sleeveLeftImage, designs: sleeveLeftDesigns, setDesigns: setSleeveLeftDesigns, label: "MANGA IZQ.", sideLabel: "manga izquierda" },
    sleeveRight: { image: color?.sleeveRightImage, designs: sleeveRightDesigns, setDesigns: setSleeveRightDesigns, label: "MANGA DER.", sideLabel: "manga derecha" },
  };
  const availableZones = ["front", "back", "sleeveLeft", "sleeveRight"].filter((z) => zoneConfig[z].image);
  // La primera zona con foto cargada — ya no asumimos que siempre es "adelante",
  // porque el admin puede haber cargado, por ejemplo, solo la foto de atrás.
  const activeZone = availableZones.includes(side) ? side : availableZones[0];

  // Cambiar de prenda sin perder el diseño: el cliente puede ver su diseño en
  // otra prenda (ej: de camiseta normal a oversize) y el precio se actualiza.
  // Solo se ofrecen las prendas donde están disponibles las carpetas de las
  // que sacó sus diseños de la librería (los que subió él mismo no tienen límite).
  const switchLayers = [...frontDesigns, ...backDesigns, ...sleeveLeftDesigns, ...sleeveRightDesigns];
  const switchFolderIds = [...new Set(switchLayers.map((l) => l.folderId).filter(Boolean))];
  const switchOptions = prod
    ? productsWithColors.filter((p) => p.id !== prod.id && switchFolderIds.every((fid) => {
        const f = designFolders.find((x) => x.id === fid);
        return !f || folderAppliesTo(f, p);
      }))
    : [];
  const switchGarment = (p) => {
    const sameColor = (p.colors || []).findIndex((c) => c.name === color?.name);
    const sameSize = (p.sizes || []).findIndex((sz) => JSON.stringify(sz) === JSON.stringify(size));
    setProd(p);
    setColorIdx(sameColor >= 0 ? sameColor : 0);
    setSizeIdx(sameSize >= 0 ? sameSize : 0);
    setComposed({ front: null, back: null, sleeveLeft: null, sleeveRight: null });
    setSide("front");
  };

  const steps = [
    { n: 1, label: "Prenda" },
    { n: 2, label: "Color" },
    { n: 3, label: "Talla" },
    { n: 4, label: "Diseño" },
  ];

  const resetDesignState = () => {
    setSource(null);
    setConsent(false);
    setSide("front");
    setFrontDesigns([]);
    setBackDesigns([]);
    setSleeveLeftDesigns([]);
    setSleeveRightDesigns([]);
    setComposed({ front: null, back: null, sleeveLeft: null, sleeveRight: null });
  };

  const resetForProduct = (p) => {
    setProd(p);
    setColorIdx(0);
    setSizeIdx(0);
    resetDesignState();
    setQty(1);
    setStep(p.colors && p.colors.length > 0 ? 2 : 3);
  };

  const goToStep4 = () => {
    resetDesignState();
    setStep(4);
  };

  const finishSide = async (currentZone) => {
    const idx = availableZones.indexOf(currentZone);
    const next = availableZones[idx + 1];
    if (next) {
      setSide(next);
    } else {
      setSide("preview");
      await renderPreview();
    }
  };

  const renderPreview = async () => {
    setComposing(true);
    const [front, back, sleeveLeft, sleeveRight] = await Promise.all([
      composeDesignImage(color?.frontImage, null, frontDesigns),
      composeDesignImage(color?.backImage, null, backDesigns),
      composeDesignImage(color?.sleeveLeftImage, null, sleeveLeftDesigns),
      composeDesignImage(color?.sleeveRightImage, null, sleeveRightDesigns),
    ]);
    setComposed({ front, back, sleeveLeft, sleeveRight });
    setComposing(false);
  };

  const confirmServiceRequest = async () => {
    setSide("preview");
    await renderPreview();
  };

  const designServiceFee = source === "service" ? Number(settings?.designServiceFee) || 0 : 0;
  const anyDesignsPlaced = frontDesigns.length || backDesigns.length || sleeveLeftDesigns.length || sleeveRightDesigns.length;

  const handleAdd = () => {
    const item = {
      cartId: genId("c"),
      productId: prod.id,
      sku: prod.sku || prod.id,
      name: prod.name,
      category: prod.category,
      subcategory: prod.subcategory || "",
      colorName: color ? color.name : "Único",
      colorHex: color ? color.hex : "#999",
      size,
      designName:
        source === "service"
          ? "Personalizado (diseño a cargo de Kulto — a coordinar por WhatsApp)"
          : `Personalizado${anyDesignsPlaced ? "" : " (sin imagen — a coordinar por WhatsApp)"}`,
      previewImage: composed.front || composed.back || composed.sleeveLeft || composed.sleeveRight || color?.frontImage || null,
      previewImageFront: composed.front || null,
      previewImageBack: composed.back || null,
      previewImageSleeveLeft: composed.sleeveLeft || null,
      previewImageSleeveRight: composed.sleeveRight || null,
      qty,
      unitPrice: unitPrice + designServiceFee,
      points: prod.points ?? null,
    };
    onAddToCart(item);
    setJustAdded(true);
    // Dejamos ver el "¡Agregado!" un momento y despues volvemos al inicio —
    // antes se quedaba trabado en esta pantalla sin avisar que ya terminó.
    setTimeout(() => {
      setJustAdded(false);
      onGoHome?.();
    }, 1400);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-10">
      <SectionTitle eyebrow="Hazlo tuyo" title="Personaliza tu prenda" />

      <div className="flex items-center gap-2 md:gap-3 mb-8 flex-wrap">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2 md:gap-3">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
              style={{ background: step >= s.n ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
            >
              {s.n}
            </div>
            <span className="text-sm" style={{ color: step >= s.n ? "var(--bone)" : "var(--slate)" }}>{s.label}</span>
            {i < steps.length - 1 && <div className="w-6 md:w-8 h-px" style={{ background: "var(--line)" }} />}
          </div>
        ))}
      </div>

      {/* Paso 1: elegí grupo → subgrupo (si aplica) → modelo, estilo "elegí tu personaje" */}
      {step === 1 && (
        <div>
          {pickStage === "group" && (
            <div>
              <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>1. Elegí qué querés personalizar</p>
              {templateGroups.length ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {templateGroups.map((g) => {
                    const gProducts = productsWithColors.filter((p) => p.category === g);
                    const sample = gProducts[0];
                    const thumb = settings.personalizeGroupCovers?.[g] || sample?.colors?.[0]?.frontImage || sample?.colors?.[0]?.images?.[0];
                    const styleCount = new Set(gProducts.map((p) => p.subcategory).filter(Boolean)).size;
                    return (
                      <PickFlipCard
                        key={g}
                        title={g}
                        thumb={thumb}
                        bg={cardBgFor(settings, [`g:${g}`], sample?.colors?.[0]?.hex)}
                        description={gProducts.find((p) => p.description?.trim())?.description?.trim()}
                        details={[`${gProducts.length} modelo${gProducts.length === 1 ? "" : "s"} disponible${gProducts.length === 1 ? "" : "s"}${styleCount > 1 ? ` en ${styleCount} estilos` : ""}.`]}
                        colors={gProducts.flatMap((p) => p.colors || [])}
                        onSelect={() => selectGroup(g)}
                      />
                    );
                  })}
                </div>
              ) : (
                <EmptyState text="Todavía no hay prendas cargadas para personalizar." />
              )}
            </div>
          )}

          {pickStage === "subgroup" && (
            <div>
              <button onClick={backToGroups} className="kulto-btn text-sm flex items-center gap-1 mb-5" style={{ color: "var(--slate)" }}>
                <ChevronLeft size={16} /> Elegir otro grupo
              </button>
              <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>1. Elegí el estilo de {groupSel}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {subgroupsInGroup.map((sg) => {
                  const sgProducts = productsInGroup.filter((p) => p.subcategory === sg);
                  const sample = sgProducts[0];
                  const thumb = settings.personalizeSubcategoryCovers?.[sg] || sample?.colors?.[0]?.frontImage || sample?.colors?.[0]?.images?.[0];
                  const sgPrice = settings.personalizeSubcategoryPrices?.[sg] ?? settings.personalizedBasePrice;
                  return (
                    <PickFlipCard
                      key={sg}
                      title={sg}
                      thumb={thumb}
                      bg={cardBgFor(settings, [`s:${sg}`, `g:${groupSel}`], sample?.colors?.[0]?.hex)}
                      description={sgProducts.find((p) => p.description?.trim())?.description?.trim()}
                      details={[
                        `${sgProducts.length} modelo${sgProducts.length === 1 ? "" : "s"} para elegir.`,
                        ...(sgPrice != null && sgPrice !== "" ? [`Desde ${formatPrice(sgPrice)}.`] : []),
                      ]}
                      colors={sgProducts.flatMap((p) => p.colors || [])}
                      onSelect={() => selectSubgroup(sg)}
                    />
                  );
                })}
                {hasUngroupedInGroup && (
                  <PickFlipCard
                    title="Otros"
                    bg={cardBgFor(settings, [`g:${groupSel}`], null)}
                    details={[`${productsInGroup.filter((p) => !p.subcategory).length} modelo(s) sin estilo asignado.`]}
                    colors={productsInGroup.filter((p) => !p.subcategory).flatMap((p) => p.colors || [])}
                    onSelect={() => selectSubgroup("__sin_subgrupo__")}
                  />
                )}
              </div>
            </div>
          )}

          {pickStage === "model" && (
            <div>
              <button
                onClick={() => (needsSubgroupStep ? backToSubgroups() : backToGroups())}
                className="kulto-btn text-sm flex items-center gap-1 mb-5"
                style={{ color: "var(--slate)" }}
              >
                <ChevronLeft size={16} /> {needsSubgroupStep ? "Elegir otro estilo" : "Elegir otro grupo"}
              </button>
              <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>1. Elegí el modelo</p>
              {showAudienceFilter && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {["todos", ...AUDIENCE_OPTIONS].map((a) => (
                    <button
                      key={a}
                      onClick={() => setAudienceFilter(a)}
                      className="kulto-btn text-xs font-semibold rounded-full px-3 py-1.5"
                      style={{
                        background: audienceFilter === a ? "var(--signal)" : "var(--ink-3)",
                        color: audienceFilter === a ? "var(--bone)" : "var(--slate)",
                      }}
                    >
                      {a === "todos" ? "Todos" : AUDIENCE_LABELS[a]}
                    </button>
                  ))}
                </div>
              )}
              {modelsFiltered.length ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {modelsFiltered.map((p) => (
                    <TemplateProductCard key={p.id} product={p} onSelect={resetForProduct} bg={cardBgFor(settings, [p.subcategory && `s:${p.subcategory}`, `g:${p.category}`], undefined)} />
                  ))}
                </div>
              ) : (
                <EmptyState text="Todavía no hay modelos cargados acá." />
              )}
            </div>
          )}
        </div>
      )}

      {/* Paso 2: color */}
      {step === 2 && prod && (
        <div>
          <button onClick={() => setStep(1)} className="kulto-btn text-sm flex items-center gap-1 mb-5" style={{ color: "var(--slate)" }}>
            <ChevronLeft size={16} /> Elegir otra prenda
          </button>
          <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>2. Elegí el color de {prod.name}</p>
          <div className="flex flex-wrap gap-3">
            {colorsForProduct.map((c, i) => (
              <button
                key={i}
                onClick={() => { setColorIdx(i); if (hasSizes) { setStep(3); } else { resetDesignState(); setStep(4); } }}
                className="kulto-btn flex flex-col items-center gap-2"
              >
                <span
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: c.hex, border: colorIdx === i ? "3px solid var(--sun)" : "1px solid var(--line)" }}
                >
                  {(c.frontImage || c.images?.[0]) && <FastImg loading="lazy" src={c.frontImage || c.images[0]} className="w-10 h-10 object-contain rounded-full" alt="" />}
                </span>
                <span className="text-xs" style={{ color: "var(--bone)" }}>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Paso 3: talla */}
      {step === 3 && prod && (
        <div>
          <button onClick={() => setStep(2)} className="kulto-btn text-sm flex items-center gap-1 mb-5" style={{ color: "var(--slate)" }}>
            <ChevronLeft size={16} /> Elegir otro color
          </button>
          <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>3. Elegí el talle</p>
          {hasSizes ? (
            <div className="flex flex-wrap gap-2">
              {prod.sizes.map((s, i) => (
                <button
                  key={s}
                  onClick={() => { setSizeIdx(i); goToStep4(); }}
                  className="kulto-btn text-sm font-semibold rounded-full px-5 py-2.5"
                  style={{ background: sizeIdx === i ? "var(--sun)" : "var(--ink-2)", color: sizeIdx === i ? "var(--ink)" : "var(--bone)", border: "1px solid var(--line)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState text="Esta prenda no tiene talles configurados." />
          )}
          <SizeGuideToggle sizeGuide={prod.sizeGuide} sizeGuideImage={prod.sizeGuideImage} />
        </div>
      )}

      {/* Paso 4: fuente del diseño / adelante / atrás / vista final */}
      {step === 4 && prod && color && (
        <div>
          <button
            onClick={() => {
              if (source === null) { setStep(hasSizes ? 3 : 2); return; }
              if (source === "service") { setSource(null); setConsent(false); return; }
              if (side === "preview") { setSide(availableZones[availableZones.length - 1]); return; }
              const idx = availableZones.indexOf(activeZone);
              if (idx > 0) { setSide(availableZones[idx - 1]); return; }
              setSource(null);
            }}
            className="kulto-btn text-sm flex items-center gap-1 mb-5"
            style={{ color: "var(--slate)" }}
          >
            <ChevronLeft size={16} /> Volver
          </button>

          {switchOptions.length > 0 && (
            <div className="rounded-2xl p-3 mb-5" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
              <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
                Tu prenda: <span className="font-semibold" style={{ color: "var(--bone)" }}>{prod.name}</span> · <span className="font-semibold" style={{ color: "var(--sun)" }}>{formatPrice(unitPrice)}</span>. ¿Lo querés en otra prenda? Elegila y el precio se actualiza (tu diseño se mantiene):
              </p>
              <div className="flex gap-2 overflow-x-auto kulto-scrollbar pb-1">
                {switchOptions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => switchGarment(p)}
                    className="kulto-btn shrink-0 rounded-xl px-3 py-2 text-left"
                    style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}
                  >
                    <span className="block text-xs font-semibold" style={{ color: "var(--bone)" }}>{p.name}</span>
                    <span className="block text-[10px]" style={{ color: "var(--slate)" }}>{p.category}{p.subcategory ? ` · ${p.subcategory}` : ""}</span>
                    <span className="block text-xs font-semibold" style={{ color: "var(--sun)" }}>{formatPrice(templatePriceFor(p, settings))}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {source === null && (
            <div className="max-w-md mx-auto text-center">
              <p className="text-sm mb-5" style={{ color: "var(--slate)" }}>4. ¿Cómo querés tu diseño?</p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setSource("self")}
                  className="kulto-btn rounded-2xl p-4 text-left"
                  style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}
                >
                  <span className="font-semibold text-sm block" style={{ color: "var(--bone)" }}>Subir mi propia imagen</span>
                  <span className="text-xs" style={{ color: "var(--slate)" }}>La subís vos y la ubicás como quieras.</span>
                </button>
                {designLibrary && designLibrary.length > 0 && (
                  <button
                    onClick={() => setSource("library")}
                    className="kulto-btn rounded-2xl p-4 text-left"
                    style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}
                  >
                    <span className="font-semibold text-sm block" style={{ color: "var(--bone)" }}>Elegir un diseño de Kulto</span>
                    <span className="text-xs" style={{ color: "var(--slate)" }}>Usás uno de nuestros diseños y lo ubicás donde quieras.</span>
                  </button>
                )}
                {settings?.designServiceEnabled && (
                  <button
                    onClick={() => setSource("service")}
                    className="kulto-btn rounded-2xl p-4 text-left"
                    style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}
                  >
                    <span className="font-semibold text-sm block" style={{ color: "var(--bone)" }}>
                      Que Kulto haga el diseño <span style={{ color: "var(--sun)" }}>(+{formatPrice(Number(settings.designServiceFee) || 0)})</span>
                    </span>
                    <span className="text-xs" style={{ color: "var(--slate)" }}>Lo coordinamos por WhatsApp antes de empezar.</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {source === "service" && (
            <div className="max-w-md mx-auto text-center">
              <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>4. Que Kulto haga tu diseño</p>
              <div className="rounded-2xl p-4 mb-4 text-left" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
                <p className="text-sm mb-2" style={{ color: "var(--bone)" }}>
                  Este servicio suma {formatPrice(designServiceFee)} al precio de la prenda.
                </p>
                <p className="text-xs" style={{ color: "var(--slate)" }}>
                  Antes de confirmar nada te escribimos por WhatsApp para saber exactamente qué buscás. Al ser un diseño hecho a medida, pedimos el {settings?.depositPercent || 50}% del pedido por adelantado para empezar a trabajar y evitar cancelaciones de último momento.
                </p>
              </div>
              <label className="flex items-start gap-2 text-xs text-left mb-4" style={{ color: "var(--bone)" }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                Entiendo que me van a contactar por WhatsApp para coordinar el diseño y que se pide una seña del {settings?.depositPercent || 50}% del pedido antes de empezarlo.
              </label>
              <button
                disabled={!consent}
                onClick={confirmServiceRequest}
                className="kulto-btn text-sm font-semibold px-5 py-3 rounded-full w-full flex items-center justify-center gap-2"
                style={{ background: consent ? "var(--signal)" : "var(--ink-3)", color: consent ? "var(--bone)" : "var(--slate)", cursor: consent ? "pointer" : "default" }}
              >
                Solicitar diseño (+{formatPrice(designServiceFee)}) <ChevronRight size={16} />
              </button>
            </div>
          )}

          {(source === "self" || source === "library") && side !== "preview" && availableZones.length === 0 && (
            <div className="max-w-md mx-auto text-center">
              <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>
                Este color todavía no tiene fotos cargadas para personalizar. Elegí otro color, o escribinos por WhatsApp y lo coordinamos.
              </p>
              <button onClick={() => setStep(2)} className="kulto-btn text-sm font-semibold px-5 py-2.5 rounded-full" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                Elegir otro color
              </button>
            </div>
          )}

          {(source === "self" || source === "library") && side !== "preview" && zoneConfig[activeZone] && (
            <div>
              <p className="text-sm mb-1 text-center" style={{ color: "var(--slate)" }}>4. Diseño para {zoneConfig[activeZone].label} (opcional)</p>
              <PrintSizeGuide settings={settings} zone={activeZone} />
              <div className="mt-3">
                <DesignPlacer garmentImage={zoneConfig[activeZone].image} designs={zoneConfig[activeZone].designs} setDesigns={zoneConfig[activeZone].setDesigns} sideLabel={zoneConfig[activeZone].sideLabel} mode={source} designLibrary={designLibrary} designFolders={designFolders} productCategory={prod?.category || null} product={prod} />
              </div>
              <div className="flex justify-center gap-3 mt-5">
                <button onClick={() => { zoneConfig[activeZone].setDesigns([]); finishSide(activeZone); }} className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full" style={{ border: "1px solid var(--line)", color: "var(--slate)" }}>
                  Aquí no quiero nada
                </button>
                <button onClick={() => finishSide(activeZone)} className="kulto-btn text-sm font-semibold px-5 py-2.5 rounded-full flex items-center gap-1" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                  {availableZones.indexOf(activeZone) === availableZones.length - 1 ? "Ver mi prenda personalizada" : "Continuar"} <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {side === "preview" && source && (
            <div>
              <p className="text-sm mb-4 text-center font-semibold" style={{ color: "var(--bone)" }}>Así quedaría tu prenda personalizada</p>
              {source === "service" && (
                <p className="text-xs text-center mb-4" style={{ color: "var(--slate)" }}>
                  El diseño lo vamos a coordinar por WhatsApp — esta es tu prenda tal como está, sin el diseño todavía.
                </p>
              )}
              {composing ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={28} className="animate-spin" style={{ color: "var(--sun)" }} />
                </div>
              ) : (
                <div className="max-w-[420px] mx-auto">
                  <div
                    className="relative rounded-2xl overflow-hidden"
                    style={{ border: "1px solid var(--line)", aspectRatio: "4 / 5", background: color.hex }}
                    onMouseEnter={() => { if (window.matchMedia?.("(hover: hover)").matches) setPreviewHoverZoom(true); }}
                    onMouseLeave={() => setPreviewHoverZoom(false)}
                    onMouseMove={(e) => {
                      if (!previewHoverZoom) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPreviewZoomOrigin({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
                    }}
                  >
                    {composed[availableZones[previewIdx]] ? (
                      <img
                        loading="lazy"
                        src={composed[availableZones[previewIdx]]}
                        className="w-full h-full object-contain"
                        alt={zoneConfig[availableZones[previewIdx]]?.label}
                        style={{
                          transform: previewHoverZoom ? "scale(2.2)" : "scale(1)",
                          transformOrigin: `${previewZoomOrigin.x}% ${previewZoomOrigin.y}%`,
                          transition: previewHoverZoom ? "none" : "transform .25s ease",
                          cursor: previewHoverZoom ? "zoom-in" : "default",
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Shirt size={32} style={{ color: "rgba(243,239,230,0.4)" }} /></div>
                    )}
                    {composed[availableZones[previewIdx]] && (
                      <button
                        type="button"
                        onClick={() => setPreviewZoomOpen(true)}
                        className="kulto-btn absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(21,19,26,0.75)", color: "var(--bone)" }}
                        title="Ver foto en grande"
                      >
                        <ZoomIn size={18} />
                      </button>
                    )}
                    {availableZones.length > 1 && (
                      <>
                        <button
                          onClick={() => setPreviewIdx((i) => (i - 1 + availableZones.length) % availableZones.length)}
                          className="kulto-btn absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(21,19,26,0.55)", color: "var(--bone)" }}
                          aria-label="Foto anterior"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          onClick={() => setPreviewIdx((i) => (i + 1) % availableZones.length)}
                          className="kulto-btn absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(21,19,26,0.55)", color: "var(--bone)" }}
                          aria-label="Foto siguiente"
                        >
                          <ChevronRight size={18} />
                        </button>
                        <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1">
                          {availableZones.map((z, i) => (
                            <button
                              key={z}
                              onClick={() => setPreviewIdx(i)}
                              className="kulto-btn rounded-full"
                              style={{ width: i === previewIdx ? 12 : 5, height: 5, background: i === previewIdx ? "var(--sun)" : "rgba(243,239,230,0.5)", transition: "width .15s" }}
                              aria-label={zoneConfig[z]?.label}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-center mt-2" style={{ color: "var(--slate)" }}>{zoneConfig[availableZones[previewIdx]]?.label}</p>
                </div>
              )}

              {previewZoomOpen && composed[availableZones[previewIdx]] && (
                <ImageLightbox
                  image={composed[availableZones[previewIdx]]}
                  background={color.hex}
                  onClose={() => setPreviewZoomOpen(false)}
                />
              )}

              <div className="max-w-[420px] mx-auto mt-6">
                <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>{prod.name}</p>
                <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>
                  {color.name}{size ? ` · Talle ${size}` : ""} · {formatPrice(unitPrice + designServiceFee)}
                  {designServiceFee > 0 && <span> (incluye {formatPrice(designServiceFee)} de diseño)</span>}
                </p>
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-3 rounded-full px-3 py-1.5" style={{ background: "var(--ink-3)" }}>
                    <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="kulto-btn" style={{ color: "var(--bone)" }}><Minus size={14} /></button>
                    <span className="text-sm" style={{ color: "var(--bone)" }}>{qty}</span>
                    <button onClick={() => setQty((q) => q + 1)} className="kulto-btn" style={{ color: "var(--bone)" }}><Plus size={14} /></button>
                  </div>
                  <button
                    onClick={handleAdd}
                    className="kulto-btn text-sm font-semibold px-5 py-2.5 rounded-full flex items-center gap-2"
                    style={{ background: justAdded ? "var(--sun)" : "var(--signal)", color: justAdded ? "var(--ink)" : "var(--bone)" }}
                  >
                    {justAdded ? <><Check size={16} /> ¡Agregado!</> : "Agregar al carrito"}
                  </button>
                </div>
              </div>

              {recommendedProducts.length > 0 && (
                <div className="max-w-3xl mx-auto mt-10">
                  <p className="text-sm font-semibold mb-3" style={{ color: "var(--bone)" }}>También te puede interesar</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {recommendedProducts.map((p) => (
                      <ProductCard key={p.id} product={p} onOpen={onOpenProduct} isFavorite={favorites?.includes(p.id)} onToggleFavorite={onToggleFavorite} onAddToCart={onAddToCart} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cart Drawer                                                        */
/* ------------------------------------------------------------------ */

// --- Confirmación del mail antes de comprar --------------------------------
// Antes de registrar un pedido se le manda un código de 6 dígitos al mail que
// puso el cliente y tiene que escribirlo — así no entran pedidos con mails
// falsos o mal escritos. El código lo genera y lo comprueba el servidor
// (api/verify-email.js): nunca viaja al navegador.
const VERIFIED_EMAIL_KEY = "kulto:checkout-verified-email";
function getVerifiedCheckoutEmail() {
  try { return sessionStorage.getItem(VERIFIED_EMAIL_KEY) || ""; } catch { return ""; }
}
function setVerifiedCheckoutEmail(email) {
  try { sessionStorage.setItem(VERIFIED_EMAIL_KEY, normalizeEmail(email)); } catch { /* sin storage: se pedirá de nuevo */ }
}
// Un cliente con cuenta ya confirmada que compra con ese mismo mail no tiene
// que volver a verificarlo.
function isCheckoutEmailVerified(email, customer) {
  const e = normalizeEmail(email);
  if (!e) return false;
  if (customer && customer.emailVerified !== false && normalizeEmail(customer.email) === e) return true;
  return getVerifiedCheckoutEmail() === e;
}
async function requestCheckoutCode(email, name, storeName) {
  try {
    const res = await fetch("/api/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", email, name, storeName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) return { ok: false, error: data.error || "No se pudo enviar el código." };
    return { ok: true, token: data.token };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor." };
  }
}
async function checkCheckoutCode(email, code, token) {
  try {
    const res = await fetch("/api/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check", email, code, token }),
    });
    const data = await res.json().catch(() => ({}));
    return data.ok ? { ok: true } : { ok: false, error: data.error || "El código no es correcto." };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor." };
  }
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function CartDrawer({ cart, onClose, onUpdateQty, onRemove, onCheckout, customerName, setCustomerName, customerPhone, setCustomerPhone, customerEmail, setCustomerEmail, comment, setComment, deliveryMethod, setDeliveryMethod, address, setAddress, settings, sending, customer }) {
  const subtotal = cart.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const itemCount = cart.reduce((s, it) => s + it.qty, 0);
  // Suma el puntaje propio de cada prenda (si el admin le puso uno) y si no
  // usa el general de Ajustes → Fidelización, en vez de una cifra pareja por
  // ítem para todo el carrito.
  const pointsEarned = cart.reduce((s, it) => s + it.qty * (Number(it.points ?? settings.loyaltyPointsPerItem) || 0), 0);
  const [touched, setTouched] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError, setPromoError] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const applyPromo = async () => {
    setPromoError("");
    const code = normalizePromoCode(promoInput);
    if (!code) return;
    setPromoBusy(true);
    const usage = await loadPromoUsage();
    const found = findPromo(code, settings, customer, usage);
    setPromoBusy(false);
    if (!found.ok) { setPromoError(found.error); return; }
    const chk = evalPromo(found.promo, subtotal, customer);
    if (!chk.ok) { setPromoError(chk.error); return; }
    setAppliedPromo(found.promo);
    setPromoInput("");
  };
  // Confirmación del mail antes de comprar (ver requestCheckoutCode).
  const [verify, setVerify] = useState(null); // null | { token, code, busy, error, sentAt, args }
  const startVerification = async (args) => {
    setVerify({ token: null, code: "", busy: true, error: "", sentAt: 0, args });
    const r = await requestCheckoutCode(normalizeEmail(customerEmail), customerName, settings?.logoText || "Kulto");
    setVerify((v) => v && (r.ok ? { ...v, token: r.token, busy: false, sentAt: Date.now() } : { ...v, busy: false, error: r.error }));
  };
  const resendVerification = async () => {
    setVerify((v) => v && { ...v, busy: true, error: "" });
    const r = await requestCheckoutCode(normalizeEmail(customerEmail), customerName, settings?.logoText || "Kulto");
    setVerify((v) => v && (r.ok ? { ...v, token: r.token, code: "", busy: false, sentAt: Date.now(), error: "" } : { ...v, busy: false, error: r.error }));
  };
  const confirmCode = async () => {
    if (!verify || !verify.token || verify.code.trim().length !== 6) return;
    setVerify((v) => ({ ...v, busy: true, error: "" }));
    const r = await checkCheckoutCode(normalizeEmail(customerEmail), verify.code.trim(), verify.token);
    if (!r.ok) { setVerify((v) => ({ ...v, busy: false, error: r.error })); return; }
    setVerifiedCheckoutEmail(customerEmail);
    const args = verify.args;
    setVerify(null);
    onCheckout(args);
  };
  const emailOk = isValidEmail(customerEmail);
  const freeShipping = subtotal >= settings.freeShippingThreshold;
  // El costo de envío depende de a qué provincia/comunidad va el pedido —
  // cada una tiene su propio precio configurado en Ajustes → Envío (Canarias,
  // Ceuta y Melilla suelen salir más caras). Si todavía no eligió la
  // provincia, o no hay un precio cargado para esa provincia puntual, usamos
  // el costo de envío por defecto como respaldo.
  const shippingCostForRegion = (region) => {
    const byRegion = settings.shippingRegionPrices?.[region];
    return byRegion != null ? byRegion : settings.shippingFlatRate;
  };
  const shippingCostBase = deliveryMethod === "envio" ? (freeShipping ? 0 : shippingCostForRegion(address.state)) : 0;
  const promoEval = appliedPromo ? evalPromo(appliedPromo, subtotal, customer) : null;
  const promoActive = !!promoEval && promoEval.ok;
  const promoDiscount = promoActive ? promoEval.discount : 0;
  const shippingCost = promoActive && promoEval.freeShipping ? 0 : shippingCostBase;
  const eligibleForSignupDiscount = !!customer && !!settings?.signupDiscountEnabled && !customer.firstDiscountUsed;
  // El código de descuento reemplaza al de bienvenida (no se suman): así el
  // descuento de bienvenida no se "gasta" si el cliente usa un código mejor.
  const discountAmount = eligibleForSignupDiscount && !(promoActive && promoDiscount > 0) ? subtotal * ((settings.signupDiscountPercent || 0) / 100) : 0;
  const total = Math.max(0, subtotal - discountAmount - promoDiscount) + shippingCost;
  const addressOk = deliveryMethod !== "envio" || (address.street.trim() && address.city.trim() && address.state.trim() && address.postalCode.trim());
  const canCheckout = emailOk && addressOk;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[420px] h-full overflow-y-auto kulto-scrollbar p-5 flex flex-col"
        style={{ background: "var(--ink)", borderLeft: "1px solid var(--line)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="kulto-display text-xl" style={{ color: "var(--bone)" }}>Tu carrito</h3>
          <button onClick={onClose} className="kulto-btn p-1.5 rounded-full" style={{ color: "var(--slate)" }} aria-label="Cerrar carrito"><X size={22} /></button>
        </div>

        {cart.length === 0 ? (
          <EmptyState text="Tu carrito está vacío. Explora el catálogo o personaliza una prenda." />
        ) : (
          <>
            <div className="flex flex-col gap-4 flex-1">
              {cart.map((it, idx) => (
                <div key={it.cartId} className="flex gap-3 rounded-2xl p-3" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center" style={{ background: it.colorHex }}>
                    {it.previewImage ? <FastImg loading="lazy" src={it.previewImage} className="w-full h-full object-contain p-1" alt={it.name} /> : <Shirt size={22} color="rgba(243,239,230,0.5)" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs" style={{ color: "var(--slate)" }}>Ítem {idx + 1} · ref. {it.sku}</span>
                      <button onClick={() => onRemove(it.cartId)} className="kulto-btn" style={{ color: "var(--slate)" }}><Trash2 size={15} /></button>
                    </div>
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--bone)" }}>{it.name}</p>
                    <p className="text-xs" style={{ color: "var(--slate)" }}>{it.colorName}{it.size ? ` · Talle ${it.size}` : ""}{it.designName ? ` · ${it.designName}` : ""}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="inline-flex items-center gap-2 rounded-full px-2 py-0.5" style={{ background: "var(--ink-3)" }}>
                        <button onClick={() => onUpdateQty(it.cartId, Math.max(1, it.qty - 1))} className="kulto-btn" style={{ color: "var(--bone)" }}><Minus size={13} /></button>
                        <span className="text-sm" style={{ color: "var(--bone)" }}>{it.qty}</span>
                        <button onClick={() => onUpdateQty(it.cartId, it.qty + 1)} className="kulto-btn" style={{ color: "var(--bone)" }}><Plus size={13} /></button>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: "var(--sun)" }}>{formatPrice(it.qty * it.unitPrice)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Tu nombre (opcional)"
                className="w-full rounded-xl p-3 text-sm"
                style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
              />
              <div>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="Tu email — te avisamos si tu carrito queda pendiente"
                  className="w-full rounded-xl p-3 text-sm"
                  style={{ background: "var(--ink-2)", color: "var(--bone)", border: touched && !emailOk ? "1px solid var(--signal)" : "1px solid var(--line)" }}
                />
                {touched && !emailOk && (
                  <p className="text-xs mt-1" style={{ color: "var(--signal)" }}>Escribe un email válido para poder enviar tu pedido.</p>
                )}
              </div>
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Tu teléfono (opcional)"
                className="w-full rounded-xl p-3 text-sm"
                style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
              />
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Comentario para tu pedido (opcional)"
                rows={2}
                className="w-full rounded-xl p-3 text-sm"
                style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
              />

              <div>
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>¿Cómo lo recibes?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeliveryMethod("recogida")}
                    className="kulto-btn flex-1 text-xs font-semibold px-3 py-2 rounded-full"
                    style={{ background: deliveryMethod === "recogida" ? "var(--signal)" : "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
                  >
                    Recoger en persona
                  </button>
                  <button
                    onClick={() => setDeliveryMethod("envio")}
                    className="kulto-btn flex-1 text-xs font-semibold px-3 py-2 rounded-full"
                    style={{ background: deliveryMethod === "envio" ? "var(--signal)" : "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
                  >
                    Envío a domicilio
                  </button>
                </div>
              </div>

              {deliveryMethod === "envio" && (
                <div className="flex flex-col gap-2 rounded-xl p-3" style={{ background: "var(--ink-2)", border: touched && !addressOk ? "1px solid var(--signal)" : "1px solid var(--line)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Dirección de envío</p>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={address.street}
                      onChange={(e) => setAddress({ ...address, street: e.target.value })}
                      onBlur={() => setTouched(true)}
                      placeholder="Calle"
                      className="col-span-2 rounded-lg p-2.5 text-sm"
                      style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    />
                    <input
                      value={address.number}
                      onChange={(e) => setAddress({ ...address, number: e.target.value })}
                      placeholder="Número"
                      className="rounded-lg p-2.5 text-sm"
                      style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    />
                  </div>
                  <input
                    value={address.apartment}
                    onChange={(e) => setAddress({ ...address, apartment: e.target.value })}
                    placeholder="Piso, puerta o departamento (opcional)"
                    className="rounded-lg p-2.5 text-sm"
                    style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={address.city}
                      onChange={(e) => setAddress({ ...address, city: e.target.value })}
                      onBlur={() => setTouched(true)}
                      placeholder="Ciudad"
                      className="rounded-lg p-2.5 text-sm"
                      style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    />
                    <select
                      value={address.state}
                      onChange={(e) => setAddress({ ...address, state: e.target.value })}
                      onBlur={() => setTouched(true)}
                      className="rounded-lg p-2.5 text-sm"
                      style={{ background: "var(--ink-3)", color: address.state ? "var(--bone)" : "var(--slate)", border: "1px solid var(--line)" }}
                    >
                      <option value="">Provincia / comunidad</option>
                      {SPAIN_REGIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={address.postalCode}
                      onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                      onBlur={() => setTouched(true)}
                      placeholder="Código postal"
                      className="rounded-lg p-2.5 text-sm"
                      style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    />
                    <input
                      value={address.country}
                      onChange={(e) => setAddress({ ...address, country: e.target.value })}
                      placeholder="País"
                      className="rounded-lg p-2.5 text-sm"
                      style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    />
                  </div>
                  <textarea
                    value={address.reference}
                    onChange={(e) => setAddress({ ...address, reference: e.target.value })}
                    placeholder="Comentario para la entrega: color de puerta, horario, referencia (opcional)"
                    rows={2}
                    className="rounded-lg p-2.5 text-sm"
                    style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                  />
                  {touched && !addressOk && (
                    <p className="text-xs" style={{ color: "var(--signal)" }}>Completa al menos calle, ciudad, provincia y código postal para el envío.</p>
                  )}
                  {!freeShipping && (
                    <p className="text-xs" style={{ color: "var(--slate)" }}>
                      Te faltan {formatPrice(settings.freeShippingThreshold - subtotal)} para envío gratis.
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {appliedPromo && promoEval?.ok ? (
                  <div className="rounded-xl p-3 flex items-center justify-between gap-2" style={{ background: "var(--ink-3)", border: `1px solid ${appliedPromo.color || "var(--sun)"}` }}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: appliedPromo.color || "var(--sun)" }}><Gift size={14} /> {appliedPromo.code}</p>
                      <p className="text-xs" style={{ color: "var(--slate)" }}>{appliedPromo.label ? `${appliedPromo.label} · ` : ""}{describeBenefit(appliedPromo)}</p>
                    </div>
                    <button onClick={() => { setAppliedPromo(null); setPromoError(""); }} className="kulto-btn text-xs underline" style={{ color: "var(--slate)" }}>Quitar</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") applyPromo(); }}
                      placeholder="Código promocional"
                      autoComplete="off"
                      className="flex-1 min-w-0 rounded-lg p-2.5 text-sm uppercase"
                      style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    />
                    <button
                      onClick={applyPromo}
                      disabled={promoBusy || !promoInput.trim()}
                      className="kulto-btn rounded-lg px-4 text-sm font-semibold"
                      style={{ background: promoInput.trim() ? "var(--signal)" : "var(--ink-3)", color: promoInput.trim() ? "var(--bone)" : "var(--slate)" }}
                    >
                      {promoBusy ? <Loader2 size={14} className="animate-spin" /> : "Aplicar"}
                    </button>
                  </div>
                )}
                {customer && !appliedPromo && (customer.rewardCodes || []).some((r) => !r.usedAt) && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs" style={{ color: "var(--slate)" }}>Tus códigos:</span>
                    {(customer.rewardCodes || []).filter((r) => !r.usedAt).map((r) => (
                      <button key={r.code} onClick={() => setPromoInput(r.code)} className="kulto-btn text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: "var(--ink-3)", color: r.color || "var(--sun)", border: `1px solid ${r.color || "var(--sun)"}` }}>
                        {r.code}
                      </button>
                    ))}
                  </div>
                )}
                {(promoError || (appliedPromo && promoEval && !promoEval.ok)) && (
                  <p className="text-xs" style={{ color: "var(--signal)" }}>{promoError || promoEval.error}</p>
                )}
              </div>

              <div className="flex flex-col gap-1 text-sm" style={{ color: "var(--slate)" }}>
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span style={{ color: "var(--bone)" }}>{formatPrice(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex items-center justify-between" style={{ color: "var(--sun)" }}>
                    <span>Descuento de bienvenida ({settings.signupDiscountPercent}%)</span>
                    <span>-{formatPrice(discountAmount)}</span>
                  </div>
                )}
                {promoActive && promoDiscount > 0 && (
                  <div className="flex items-center justify-between" style={{ color: appliedPromo.color || "var(--sun)" }}>
                    <span>Código {appliedPromo.code}</span>
                    <span>-{formatPrice(promoDiscount)}</span>
                  </div>
                )}
                {promoActive && promoEval.freeShipping && (
                  <div className="flex items-center justify-between" style={{ color: appliedPromo.color || "var(--sun)" }}>
                    <span>Código {appliedPromo.code}</span>
                    <span>Envío gratis</span>
                  </div>
                )}
                {promoActive && promoEval.gift && (
                  <div className="flex items-center justify-between" style={{ color: appliedPromo.color || "var(--sun)" }}>
                    <span>Premio</span>
                    <span>{promoEval.gift}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span>Envío</span>
                  <span style={{ color: "var(--bone)" }}>{deliveryMethod === "envio" ? (shippingCost > 0 ? formatPrice(shippingCost) : "Gratis") : "Recoges en persona"}</span>
                </div>
                <div className="flex items-center justify-between text-base font-bold mt-1" style={{ color: "var(--bone)" }}>
                  <span>Total</span>
                  <span>{formatPrice(total)}</span>
                </div>
                {customer && settings?.loyaltyEnabled && (
                  <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
                    Vas a sumar {pointsEarned} puntos con este pedido.
                  </p>
                )}
              </div>
              {verify ? (
                <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "var(--ink-2)", border: "1px solid var(--sun)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Confirme su mail para finalizar la compra</p>
                  {verify.busy && !verify.token && !verify.error ? (
                    <p className="text-xs flex items-center gap-2" style={{ color: "var(--slate)" }}><Loader2 size={14} className="animate-spin" /> Enviando el código…</p>
                  ) : verify.token ? (
                    <>
                      <p className="text-xs" style={{ color: "var(--slate)" }}>
                        Le enviamos un código de 6 dígitos a <span style={{ color: "var(--bone)" }}>{customerEmail}</span>. Escríbalo acá para confirmar su pedido (revise también la carpeta de spam).
                      </p>
                      <input
                        value={verify.code}
                        onChange={(e) => setVerify((v) => ({ ...v, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                        onKeyDown={(e) => e.key === "Enter" && confirmCode()}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        className="rounded-xl p-3 text-center text-xl font-bold tracking-widest"
                        style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                      />
                    </>
                  ) : null}
                  {verify.error && <p className="text-xs" style={{ color: "var(--signal)" }}>{verify.error}</p>}
                  <div className="flex flex-wrap gap-2">
                    {verify.token && (
                      <button
                        onClick={confirmCode}
                        disabled={verify.busy || verify.code.length !== 6}
                        className="kulto-btn flex-1 rounded-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
                        style={{ background: verify.code.length === 6 ? "var(--signal)" : "var(--ink-3)", color: verify.code.length === 6 ? "var(--bone)" : "var(--slate)" }}
                      >
                        {verify.busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Confirmar compra
                      </button>
                    )}
                    <button onClick={resendVerification} disabled={verify.busy} className="kulto-btn rounded-full px-4 py-2.5 text-xs font-semibold" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                      {verify.token ? "Reenviar código" : "Reintentar"}
                    </button>
                    <button onClick={() => setVerify(null)} className="kulto-btn rounded-full px-4 py-2.5 text-xs" style={{ color: "var(--slate)" }}>
                      Cambiar mail
                    </button>
                  </div>
                </div>
              ) : (
              <>
              <button
                disabled={sending || !canCheckout}
                onClick={() => {
                  setTouched(true);
                  if (!canCheckout) return;
                  const args = {
                    subtotal, shippingCost, total, discountAmount, itemCount,
                    promo: promoActive ? { code: appliedPromo.code, label: appliedPromo.label || "", type: appliedPromo.type, personal: !!appliedPromo.personal, perCustomerOnce: !!appliedPromo.perCustomerOnce, discount: promoDiscount, freeShipping: promoEval.freeShipping, gift: promoEval.gift } : null,
                  };
                  if (isCheckoutEmailVerified(customerEmail, customer)) onCheckout(args);
                  else startVerification(args);
                }}
                className="kulto-btn w-full rounded-full py-3 font-semibold flex items-center justify-center gap-2"
                style={{ background: !canCheckout ? "var(--ink-3)" : "var(--signal)", color: !canCheckout ? "var(--slate)" : "var(--bone)", cursor: !canCheckout ? "not-allowed" : "pointer" }}
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <ShoppingBag size={18} />}
                Comprar
              </button>
              <p className="text-xs text-center" style={{ color: "var(--slate)" }}>
                Antes de registrar el pedido le pedimos confirmar su mail con un código que le enviamos.
              </p>
              </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Order confirmation                                                 */
/* ------------------------------------------------------------------ */

// El pedido ya queda guardado en el panel y le avisamos al dueño por mail
// apenas se confirma — eso pasa siempre, sin depender de WhatsApp. El botón
// de WhatsApp acá es solo una opción extra para el cliente que quiera avisar
// también por ese medio, nunca un paso obligatorio del pedido.
// Barra de etapas ("globos") de un pedido de entrega personal. Si se pasa
// "onSelect", cada globo se puede tocar para marcar esa etapa (lo usa el dueño).
function LocalOrderProgress({ order, onSelect }) {
  const current = Math.max(0, LOCAL_ORDER_STEPS.findIndex((s) => s.key === (order?.localStatus || "realizado")));
  return (
    <div className="flex items-start w-full py-2">
      {LOCAL_ORDER_STEPS.map((s, i) => {
        const done = i <= current;
        const Tag = onSelect ? "button" : "div";
        return (
          <React.Fragment key={s.key}>
            <Tag
              {...(onSelect ? { type: "button", onClick: () => onSelect(s.key) } : {})}
              className={`flex flex-col items-center gap-1.5 shrink-0 ${onSelect ? "kulto-btn" : ""}`}
              style={{ width: 64 }}
            >
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: done ? "var(--sun)" : "var(--ink-3)",
                  color: done ? "var(--ink)" : "var(--slate)",
                  border: i === current ? "3px solid var(--signal)" : "1px solid var(--line)",
                }}
              >
                {done ? <Check size={15} /> : i + 1}
              </span>
              <span className="text-[10px] leading-tight text-center font-semibold" style={{ color: done ? "var(--bone)" : "var(--slate)" }}>{s.label}</span>
            </Tag>
            {i < LOCAL_ORDER_STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mt-4" style={{ background: i < current ? "var(--sun)" : "var(--line)" }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function OrderConfirm({ orderId, hasCustom, whatsappText, whatsappNumber, onClose, isLocal }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-3xl p-8 max-w-sm w-full text-center" style={{ background: "var(--ink)", border: "1px solid var(--line)" }}>
        <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-4" style={{ background: "var(--sun)" }}>
          <Check size={28} color="var(--ink)" />
        </div>
        <h3 className="kulto-display text-xl mb-2" style={{ color: "var(--bone)" }}>¡Gracias por su compra!</h3>
        <p className="text-sm mb-1" style={{ color: "var(--slate)" }}>Tu número de orden es:</p>
        <p className="font-bold text-lg mb-5" style={{ color: "var(--sun)" }}>{orderId}</p>
        <p className="text-sm mb-3" style={{ color: "var(--slate)" }}>Su pedido se está procesando. Nos pondremos en contacto con usted para coordinar el pago por Bizum o transferencia. Guarde este número por si necesita escribirnos.</p>
        {isLocal && (
          <div className="mb-4">
            <LocalOrderProgress order={{ localStatus: "realizado" }} />
            <p className="text-xs" style={{ color: "var(--slate)" }}>Puede seguir cada etapa en "Mi pedido" con su número de orden.</p>
          </div>
        )}
        {hasCustom && (
          <p className="text-sm mb-6" style={{ color: "var(--sun)" }}>
            Como incluye una prenda personalizada, puede demorar entre 3 y 7 días. Si la necesitás antes, escribinos.
          </p>
        )}
        {whatsappText && whatsappNumber && (
          <a
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappText)}`}
            target="_blank"
            rel="noreferrer"
            className="kulto-btn w-full rounded-full py-3 font-semibold mb-3 flex items-center justify-center gap-2"
            style={{ background: "#25D366", color: "#0b1a12" }}
          >
            <MessageCircle size={18} /> Avisar también por WhatsApp
          </a>
        )}
        <button onClick={onClose} className="kulto-btn w-full rounded-full py-3 font-semibold" style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

function LeaveReviewSection({ order }) {
  const [checking, setChecking] = useState(true);
  const [existing, setExisting] = useState(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(order.customerName || "");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    // Siempre se convierte a JPG (sea cual sea el formato subido), para que
    // todas las fotos de reseñas pesen y se vean de forma consistente.
    const b64 = await new Promise((resolve) => fileToBase64(file, resolve, 1000, 0.85, "image/jpeg"));
    setPhoto(b64);
  };

  const productNames = [...new Set(order.items.map((i) => i.name))];
  const productIds = [...new Set(order.items.map((i) => i.productId).filter(Boolean))];

  useEffect(() => {
    setChecking(true);
    setOpen(false);
    setSubmitted(false);
    loadReviews().then((all) => {
      setExisting(all.find((r) => r.orderId === order.id) || null);
      setChecking(false);
    });
  }, [order.id]);

  const submit = async () => {
    if (!name.trim() || !text.trim()) return;
    const review = {
      id: genId("rev"),
      name: name.trim(),
      rating,
      text: text.trim(),
      photo: photo || null,
      source: "customer",
      status: "pendiente",
      orderId: order.id,
      items: productNames,
      productIds,
      date: new Date().toISOString(),
    };
    await persistReview(review);
    setExisting(review);
    setSubmitted(true);
  };

  if (checking) return null;

  return (
    <div className="rounded-2xl p-5 mt-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      {existing ? (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>
            {submitted ? "¡Gracias por tu reseña!" : "Ya dejaste una reseña para este pedido"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
            {existing.status === "pendiente"
              ? "La estamos revisando antes de publicarla."
              : "Ya está publicada en la web."}
          </p>
        </div>
      ) : !open ? (
        <button onClick={() => setOpen(true)} className="kulto-btn w-full rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: "var(--sun)", color: "var(--ink)" }}>
          <Star size={16} /> Dejar una reseña de {productNames.length > 1 ? "esta compra" : productNames[0]}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Tu reseña de:</p>
            <p className="text-xs" style={{ color: "var(--slate)" }}>{productNames.join(", ")}</p>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            className="rounded-xl p-3 text-sm"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
          />
          <div>
            <p className="text-sm mb-1" style={{ color: "var(--bone)" }}>Puntaje</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} className="kulto-btn">
                  <Star size={24} fill={n <= rating ? "var(--sun)" : "none"} color="var(--sun)" />
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Contanos qué te pareció"
            rows={3}
            className="rounded-xl p-3 text-sm"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
          />
          <div>
            <p className="text-sm mb-1" style={{ color: "var(--bone)" }}>Foto (opcional)</p>
            {photo ? (
              <div className="flex items-center gap-2">
                <img loading="lazy" src={photo} className="w-14 h-14 rounded-lg object-cover" alt="Tu foto" />
                <button onClick={() => setPhoto(null)} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ border: "1px solid var(--line)", color: "var(--slate)" }}>Quitar</button>
              </div>
            ) : (
              <label className="kulto-btn text-xs font-semibold px-3 py-2 rounded-full cursor-pointer inline-flex items-center gap-1" style={{ border: "1px solid var(--line)", color: "var(--bone)" }}>
                <Upload size={13} /> Subir foto de tu prenda
                <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={(e) => handlePhotoUpload(e.target.files?.[0])} />
              </label>
            )}
          </div>
          <button onClick={submit} className="kulto-btn rounded-full py-3 font-semibold" style={{ background: "var(--signal)", color: "var(--bone)" }}>
            Enviar reseña
          </button>
          <p className="text-xs" style={{ color: "var(--slate)" }}>La revisamos antes de publicarla en la web.</p>
        </div>
      )}
    </div>
  );
}

// Cartel de bienvenida: aparece una sola vez al bajar un poco por la web (si
// el visitante no tiene cuenta) y ofrece el descuento de la primera compra a
// cambio de registrarse. Si lo cierra, no vuelve a molestar por 7 días.
const SIGNUP_POPUP_KEY = "kulto:signup-popup-dismissed";
function SignupPromoPopup({ settings, customer, page, onSignup }) {
  const percent = Number(settings?.signupDiscountPercent) || 0;
  const eligible = !!settings?.signupDiscountEnabled && settings?.signupPopupEnabled !== false && percent > 0 && !customer && page !== "cuenta";
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const recentlyDismissed = () => {
    try {
      const t = Number(localStorage.getItem(SIGNUP_POPUP_KEY) || 0);
      return t && Date.now() - t < 7 * 24 * 3600 * 1000;
    } catch { return false; }
  };
  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(SIGNUP_POPUP_KEY, String(Date.now())); } catch { /* sin memoria del navegador */ }
  };

  useEffect(() => {
    if (!eligible || open || recentlyDismissed()) return undefined;
    const onScroll = () => {
      if (window.scrollY > 450) {
        setOpen(true);
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [eligible, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!eligible || !open) return null;

  const submit = () => {
    const v = email.trim();
    if (!isValidEmail(v)) { setError("Escribí un email válido."); return; }
    dismiss();
    onSignup?.(v, "register");
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 90, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Descuento por registrarte"
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col sm:flex-row"
        style={{ background: "var(--ink-2)", border: "1px solid var(--line)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:w-2/5 flex flex-col items-center justify-center gap-1 py-6 sm:py-10 px-4 text-center" style={{ background: "linear-gradient(135deg, var(--signal), var(--sun))", color: "var(--ink)" }}>
          <Sparkles size={26} />
          <span className="font-black leading-none" style={{ fontSize: 64 }}>{percent}%</span>
          <span className="text-xs font-bold tracking-widest uppercase">de descuento</span>
          <span className="text-[11px] opacity-80">en tu primera compra</span>
        </div>
        <div className="flex-1 p-6 sm:p-8 flex flex-col gap-3">
          <button onClick={dismiss} className="kulto-btn absolute top-3 right-3 p-1.5 rounded-full" style={{ color: "var(--slate)" }} aria-label="Cerrar">
            <X size={18} />
          </button>
          <h3 className="text-2xl font-bold leading-tight pr-6" style={{ color: "var(--bone)" }}>¡Regístrate y consigue tu {percent}%!</h3>
          <p className="text-sm" style={{ color: "var(--slate)" }}>
            Crea tu cuenta gratis y el {percent}% de descuento se aplica solo en tu primera compra. Además, sumas puntos con cada pedido.
          </p>
          <div className="flex">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Correo electrónico"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              className="flex-1 min-w-0 rounded-l-xl p-3 text-sm"
              style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
            />
            <button
              onClick={submit}
              className="kulto-btn px-4 rounded-r-xl flex items-center justify-center"
              style={{ background: "var(--signal)", color: "var(--bone)" }}
              aria-label="Registrarme"
            >
              <ArrowRight size={18} />
            </button>
          </div>
          {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
          <p className="text-[11px]" style={{ color: "var(--slate)" }}>
            Al registrarte aceptas recibir correos con novedades y ofertas. Puedes darte de baja cuando quieras.
          </p>
          <button onClick={() => { dismiss(); onSignup?.("", "login"); }} className="kulto-btn text-xs self-start underline" style={{ color: "var(--slate)" }}>
            Ya tengo cuenta
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountPage({ registerIntent, customer, onRegister, onLogin, onLogout, onVerifyEmail, onResendVerification, onRequestPasswordReset, onResetPassword, settings, initialResetEmail, initialResetCode }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // Viene del cartel de descuento: abre directo "Crear cuenta" con el email
  // que el visitante ya escribió (o "Ingresar" si dijo que ya tiene cuenta).
  useEffect(() => {
    if (!registerIntent) return;
    setMode(registerIntent.mode === "login" ? "login" : "register");
    if (registerIntent.email) setEmail(registerIntent.email);
  }, [registerIntent]);

  // Link del mail "Recuperar contraseña" (?resetEmail=&resetCode=): lleva
  // directo al formulario de contraseña nueva con el email y el código ya
  // cargados, sin que el cliente tenga que copiarlos a mano.
  useEffect(() => {
    if (initialResetEmail && initialResetCode) {
      setEmail(initialResetEmail);
      setCode(initialResetCode);
      setMode("resetPassword");
    }
  }, [initialResetEmail, initialResetCode]);

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  if (customer) {
    const _rewards = getActiveRewards(settings);
    const _next = _rewards.find((r) => Number(r.pointsCost) > (customer.points || 0)) || _rewards[_rewards.length - 1];
    const threshold = _rewards.length ? Number(_next.pointsCost) : (Number(settings?.loyaltyRewardThreshold) || 5);
    const progressInCycle = _rewards.length ? Math.min(customer.points || 0, threshold) : (customer.points || 0) % threshold;
    return (
      <div className="max-w-md mx-auto px-4 md:px-6 py-10">
        <SectionTitle eyebrow="Tu cuenta" title={`Hola, ${customer.name || customer.email}`} />
        <div className="rounded-2xl p-5 flex flex-col gap-3 mt-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
          <p className="text-sm" style={{ color: "var(--bone)" }}>Email: {customer.email}</p>
          {settings?.signupDiscountEnabled && (
            <p className="text-sm" style={{ color: customer.firstDiscountUsed ? "var(--slate)" : "var(--sun)" }}>
              {customer.firstDiscountUsed
                ? "Ya usaste tu descuento de bienvenida."
                : `Tenés ${settings.signupDiscountPercent}% de descuento disponible — se aplica automáticamente en tu próxima compra.`}
            </p>
          )}
          {settings?.loyaltyEnabled && (
            <div>
              <p className="text-sm mb-1" style={{ color: "var(--bone)" }}>Puntos: {customer.points || 0}</p>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--ink-3)" }}>
                <div className="h-full" style={{ width: `${Math.min(100, (progressInCycle / threshold) * 100)}%`, background: "var(--sun)" }} />
              </div>
              {_rewards.length > 0
                ? <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>Próximo premio: {_next.name} ({_next.pointsCost} puntos). Canjealo con el botón «{settings.rewardsButtonLabel || "Recompensas"}».</p>
                : settings.loyaltyRewardDescription && <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>{settings.loyaltyRewardDescription}</p>}
            </div>
          )}
          <button onClick={onLogout} className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full mt-2" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    setError("");
    setInfo("");
    if (!email.trim() || !password) { setError("Completá email y contraseña."); return; }
    if (!isValidEmail(email.trim())) { setError("Ingresá un email válido."); return; }
    setLoading(true);
    const result = mode === "register" ? await onRegister({ name, email, password }) : await onLogin({ email, password });
    setLoading(false);
    if (result.needsVerification) {
      setMode("verify");
      if (result.error) setInfo(result.error);
      return;
    }
    if (!result.ok) setError(result.error);
  };

  const submitCode = async () => {
    setError("");
    if (!code.trim()) { setError("Ingresá el código que te mandamos por mail."); return; }
    setLoading(true);
    const result = await onVerifyEmail({ email, code });
    setLoading(false);
    if (!result.ok) setError(result.error);
  };

  const resendCode = async () => {
    setError("");
    setInfo("");
    setResending(true);
    const result = await onResendVerification({ email });
    setResending(false);
    if (result.ok) setInfo("Te mandamos un código nuevo — revisá tu casilla (y spam, por las dudas).");
    else setError(result.error);
  };

  const submitForgot = async () => {
    setError("");
    setInfo("");
    if (!email.trim() || !isValidEmail(email.trim())) { setError("Ingresá un email válido."); return; }
    setLoading(true);
    const result = await onRequestPasswordReset({ email });
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setCode("");
    setNewPassword("");
    setMode("resetPassword");
  };

  const resendReset = async () => {
    setError("");
    setInfo("");
    setResending(true);
    const result = await onRequestPasswordReset({ email });
    setResending(false);
    if (result.ok) setInfo("Te mandamos un código nuevo — revisá tu casilla (y spam, por las dudas).");
    else setError(result.error);
  };

  const submitReset = async () => {
    setError("");
    setInfo("");
    if (!code.trim()) { setError("Ingresá el código que te mandamos por mail."); return; }
    if (!newPassword || newPassword.length < 6) { setError("La contraseña nueva debe tener al menos 6 caracteres."); return; }
    setLoading(true);
    const result = await onResetPassword({ email, code, newPassword });
    setLoading(false);
    if (!result.ok) setError(result.error);
  };

  if (mode === "forgot") {
    return (
      <div className="max-w-md mx-auto px-4 md:px-6 py-10">
        <SectionTitle eyebrow="Tu cuenta" title="Recuperar contraseña" />
        <p className="text-sm mt-3" style={{ color: "var(--slate)" }}>
          Ingresá el mail de tu cuenta y te mandamos un código para elegir una contraseña nueva.
        </p>
        <div className="flex flex-col gap-3 mt-4">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl p-3 text-sm" style={inputStyle} />
          {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
          <button disabled={loading} onClick={submitForgot} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center" style={{ background: "var(--signal)", color: "var(--bone)" }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Mandar código"}
          </button>
          <button onClick={() => { setMode("login"); setError(""); setInfo(""); }} className="kulto-btn text-xs" style={{ color: "var(--slate)" }}>
            Volver a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  if (mode === "resetPassword") {
    return (
      <div className="max-w-md mx-auto px-4 md:px-6 py-10">
        <SectionTitle eyebrow="Tu cuenta" title="Elegí una contraseña nueva" />
        <p className="text-sm mt-3" style={{ color: "var(--slate)" }}>
          Te mandamos un código de 6 dígitos a <strong style={{ color: "var(--bone)" }}>{email}</strong>. Ingresalo junto con tu contraseña nueva.
        </p>
        <div className="flex flex-col gap-3 mt-4">
          <input
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="rounded-xl p-3 text-center text-2xl tracking-[0.5em] font-bold"
            style={inputStyle}
            inputMode="numeric"
          />
          <input type="password" placeholder="Contraseña nueva" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="rounded-xl p-3 text-sm" style={inputStyle} />
          {info && <p className="text-xs" style={{ color: "var(--sun)" }}>{info}</p>}
          {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
          <button disabled={loading} onClick={submitReset} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center" style={{ background: "var(--signal)", color: "var(--bone)" }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Guardar contraseña"}
          </button>
          <button disabled={resending} onClick={resendReset} className="kulto-btn text-sm font-semibold py-2" style={{ color: "var(--bone)" }}>
            {resending ? "Enviando..." : "Reenviar código"}
          </button>
          <button onClick={() => { setMode("login"); setError(""); setInfo(""); }} className="kulto-btn text-xs" style={{ color: "var(--slate)" }}>
            Volver a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  if (mode === "verify") {
    return (
      <div className="max-w-md mx-auto px-4 md:px-6 py-10">
        <SectionTitle eyebrow="Tu cuenta" title="Confirmá tu mail" />
        <p className="text-sm mt-3" style={{ color: "var(--slate)" }}>
          Te mandamos un código de 6 dígitos a <strong style={{ color: "var(--bone)" }}>{email}</strong>. Ingresalo acá para activar tu cuenta.
        </p>
        <div className="flex flex-col gap-3 mt-4">
          <input
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="rounded-xl p-3 text-center text-2xl tracking-[0.5em] font-bold"
            style={inputStyle}
            inputMode="numeric"
          />
          {info && <p className="text-xs" style={{ color: "var(--sun)" }}>{info}</p>}
          {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
          <button disabled={loading} onClick={submitCode} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center" style={{ background: "var(--signal)", color: "var(--bone)" }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Confirmar cuenta"}
          </button>
          <button disabled={resending} onClick={resendCode} className="kulto-btn text-sm font-semibold py-2" style={{ color: "var(--bone)" }}>
            {resending ? "Enviando..." : "Reenviar código"}
          </button>
          <button onClick={() => { setMode("login"); setError(""); setInfo(""); }} className="kulto-btn text-xs" style={{ color: "var(--slate)" }}>
            Volver a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 md:px-6 py-10">
      <SectionTitle eyebrow="Tu cuenta" title={mode === "login" ? "Iniciar sesión" : "Crear cuenta"} />
      <div className="flex gap-2 mb-5 mt-4">
        <button onClick={() => { setMode("login"); setError(""); }} className="kulto-btn flex-1 text-sm font-semibold py-2 rounded-full" style={{ background: mode === "login" ? "var(--signal)" : "var(--ink-2)", color: "var(--bone)" }}>Ingresar</button>
        <button onClick={() => { setMode("register"); setError(""); }} className="kulto-btn flex-1 text-sm font-semibold py-2 rounded-full" style={{ background: mode === "register" ? "var(--signal)" : "var(--ink-2)", color: "var(--bone)" }}>Registrarme</button>
      </div>
      {mode === "register" && settings?.signupDiscountEnabled && (
        <p className="text-xs mb-3 rounded-xl p-3" style={{ background: "var(--ink-2)", color: "var(--sun)" }}>
          Registrate y llevate {settings.signupDiscountPercent}% de descuento en tu primera compra.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {mode === "register" && (
          <input placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl p-3 text-sm" style={inputStyle} />
        )}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl p-3 text-sm" style={inputStyle} />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl p-3 text-sm" style={inputStyle} />
        {mode === "login" && (
          <button type="button" onClick={() => { setMode("forgot"); setError(""); setInfo(""); }} className="kulto-btn text-xs self-start -mt-1" style={{ color: "var(--slate)" }}>
            ¿Olvidaste tu contraseña?
          </button>
        )}
        {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
        <button disabled={loading} onClick={submit} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center" style={{ background: "var(--signal)", color: "var(--bone)" }}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : mode === "login" ? "Ingresar" : "Crear cuenta"}
        </button>
      </div>
    </div>
  );
}

function OrderLookupPage({ initialOrderId = "", settings }) {
  const [orderId, setOrderId] = useState(initialOrderId);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | notfound

  const search = async (idOverride) => {
    const id = (idOverride ?? orderId).trim();
    if (!id) return;
    setStatus("loading");
    const found = await findOrderById(id);
    if (found) { setResult(found); setStatus("idle"); }
    else { setResult(null); setStatus("notfound"); }
  };

  // Si llegamos acá con un número de pedido ya cargado (ej: desde el link del
  // mail "Pedir reseña"), buscamos automáticamente sin que el cliente tenga
  // que tocar nada.
  useEffect(() => {
    if (initialOrderId.trim()) search(initialOrderId);
  }, [initialOrderId]);

  const trackingIsLink = result?.trackingNumber?.trim().startsWith("http");
  const resultIsLocal = isLocalOrder(result, settings);
  const localStepLabel = LOCAL_ORDER_STEPS.find((x) => x.key === (result?.localStatus || "realizado"))?.label;

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 py-14">
      <SectionTitle eyebrow="¿Dónde está tu pedido?" title="Seguir mi pedido" />
      <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>
        Escribí el número de orden que te dimos por WhatsApp al confirmar la compra (por ejemplo, KULTO-260914-AB12).
      </p>
      <div className="flex gap-2 mb-6">
        <input
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="N° de orden"
          className="flex-1 rounded-xl p-3 text-sm"
          style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
        />
        <button onClick={() => search()} className="kulto-btn rounded-xl px-5 font-semibold" style={{ background: "var(--signal)", color: "var(--bone)" }}>
          Buscar
        </button>
      </div>

      {status === "loading" && <p className="text-sm" style={{ color: "var(--slate)" }}>Buscando...</p>}
      {status === "notfound" && (
        <p className="text-sm" style={{ color: "var(--signal)" }}>No encontramos un pedido con ese número. Revisá que esté bien escrito.</p>
      )}

      {result && (
        <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
          <div className="flex items-center justify-between">
            <p className="font-bold" style={{ color: "var(--bone)" }}>{result.id}</p>
            <span
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ background: result.status === "completado" ? "var(--sun)" : "var(--ink-3)", color: result.status === "completado" ? "var(--ink)" : "var(--bone)" }}
            >
              {resultIsLocal ? localStepLabel : (result.status === "completado" ? "Completado" : "Pendiente")}
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--slate)" }}>{formatDate(result.date)} · {result.items.length} artículo(s) · {formatPrice(result.total)}</p>
          <p className="text-xs" style={{ color: "var(--slate)" }}>
            Entrega: {result.deliveryMethod === "envio" ? "Envío a domicilio" : "Recoge en persona"}
          </p>
          {resultIsLocal && (
            <div className="pt-2" style={{ borderTop: "1px solid var(--line)" }}>
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--bone)" }}>Estado de su pedido</p>
              <LocalOrderProgress order={result} />
            </div>
          )}
          {!resultIsLocal && (result.deliveryMethod === "envio" || result.trackingNumber) && (
            <div className="pt-2" style={{ borderTop: "1px solid var(--line)" }}>
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--bone)" }}>Seguimiento</p>
              {result.trackingNumber ? (
                trackingIsLink ? (
                  <a href={result.trackingNumber} target="_blank" rel="noreferrer" className="text-sm underline" style={{ color: "var(--sun)" }}>
                    Ver seguimiento del envío
                  </a>
                ) : (
                  <p className="text-sm" style={{ color: "var(--sun)" }}>{result.trackingNumber}</p>
                )
              ) : (
                <p className="text-sm" style={{ color: "var(--slate)" }}>Todavía no cargamos el número de seguimiento. Te avisamos por WhatsApp apenas lo tengamos.</p>
              )}
            </div>
          )}
        </div>
      )}
      {result && <LeaveReviewSection order={result} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Admin panel                                                        */
/* ------------------------------------------------------------------ */

const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

/* ------------------------------------------------------------------ */
/*  Crop tool — lets the admin choose exactly what part of a photo     */
/*  shows, instead of an automatic (and sometimes surprising) crop.    */
/* ------------------------------------------------------------------ */

const CROP_FRAME_W = 300;
const CROP_FRAME_H = 375; // 4:5, matches how photos are shown across the site
const CROP_OUT_W = 1000;
const CROP_OUT_H = 1250;

function CropModal({ source, onConfirm, onCancel, frameW = CROP_FRAME_W, frameH = CROP_FRAME_H, outW = CROP_OUT_W, outH = CROP_OUT_H, title = "Elegí qué parte de la foto se ve", fitMode = "cover" }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mimeType, setMimeType] = useState("image/jpeg");
  const dragState = useRef(null);

  // El marco de recorte se ve más chico en pantallas angostas para que
  // siempre entre dentro del modal (antes tenía un tamaño fijo en píxeles
  // que se podía cortar en celulares chicos) — el resultado final se sigue
  // exportando siempre al mismo tamaño (outW x outH), sin importar el
  // celular. La proporción del marco (frameW/frameH) se mantiene igual.
  const [viewportW, setViewportW] = useState(typeof window !== "undefined" ? window.innerWidth : 400);
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const maxBoxW = Math.max(180, viewportW - 96);
  const boxW = Math.min(frameW, maxBoxW);
  const boxH = boxW * (frameH / frameW);

  // "cover" (por defecto) llena el marco entero sin dejar espacios, recortando
  // lo que sobre — ideal cuando el resultado tiene que verse parejo con otros
  // (banners, fotos de producto). "contain" en cambio muestra la foto completa
  // sin cortar nada de entrada (con un margen si la proporción no coincide),
  // dejando que el zoom sea opcional para quien sí quiera recortar más de cerca.
  const getBaseScale = (nw, nh) => (fitMode === "contain" ? Math.min(boxW / nw, boxH / nh) : Math.max(boxW / nw, boxH / nh));
  const baseScale = img ? getBaseScale(img.naturalWidth, img.naturalHeight) : 1;
  const displayScale = baseScale * zoom;
  const displayW = img ? img.naturalWidth * displayScale : 0;
  const displayH = img ? img.naturalHeight * displayScale : 0;

  const clamp = (p, w, h) => ({
    x: w <= boxW ? (boxW - w) / 2 : Math.min(0, Math.max(boxW - w, p.x)),
    y: h <= boxH ? (boxH - h) / 2 : Math.min(0, Math.max(boxH - h, p.y)),
  });

  useEffect(() => {
    let url;
    let isFile = source instanceof File || source instanceof Blob;
    if (isFile) {
      setMimeType(source.type === "image/png" ? "image/png" : "image/jpeg");
      url = URL.createObjectURL(source);
    } else {
      const m = source.match(/^data:(image\/[a-zA-Z+]+);base64,/);
      setMimeType(m && m[1] === "image/png" ? "image/png" : "image/jpeg");
      url = source;
    }
    const image = new Image();
    // Al recortar de nuevo una foto que ya está en Supabase Storage (URL
    // remota, no texto embebido), hace falta "crossOrigin" para poder
    // exportar el canvas después — si no, toDataURL() tira un error.
    image.crossOrigin = "anonymous";
    image.onload = () => {
      setImg(image);
      const bScale = getBaseScale(image.naturalWidth, image.naturalHeight);
      setZoom(1);
      setPan({ x: (boxW - image.naturalWidth * bScale) / 2, y: (boxH - image.naturalHeight * bScale) / 2 });
    };
    image.src = url;
    return () => { if (isFile) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const startDrag = (clientX, clientY) => {
    dragState.current = { startX: clientX, startY: clientY, panX: pan.x, panY: pan.y };
  };
  const moveDrag = (clientX, clientY) => {
    if (!dragState.current) return;
    const dx = clientX - dragState.current.startX;
    const dy = clientY - dragState.current.startY;
    setPan(clamp({ x: dragState.current.panX + dx, y: dragState.current.panY + dy }, displayW, displayH));
  };
  const endDrag = () => { dragState.current = null; };

  const handleZoom = (newZoom) => {
    const z = Math.max(1, Math.min(3, newZoom));
    if (!img) { setZoom(z); return; }
    const newScale = baseScale * z;
    const newW = img.naturalWidth * newScale;
    const newH = img.naturalHeight * newScale;
    // keep the frame's center point anchored while zooming
    const cx = boxW / 2, cy = boxH / 2;
    const ratioX = (cx - pan.x) / displayW;
    const ratioY = (cy - pan.y) / displayH;
    const newPan = clamp({ x: cx - ratioX * newW, y: cy - ratioY * newH }, newW, newH);
    setZoom(z);
    setPan(newPan);
  };

  const confirm = () => {
    if (!img) return;
    const sourceX = -pan.x / displayScale;
    const sourceY = -pan.y / displayScale;
    const sourceW = boxW / displayScale;
    const sourceH = boxH / displayScale;
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (fitMode === "contain") {
      // en "contain" puede quedar un margen si la proporción de la foto no
      // coincide con la del marco — lo pintamos con el mismo tono de fondo
      // que usan las tarjetas, para que se vea prolijo en vez de transparente.
      let bg = "#241f2b";
      try {
        const v = getComputedStyle(document.documentElement).getPropertyValue("--ink-3").trim();
        if (v) bg = v;
      } catch { /* usamos el color de respaldo */ }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, outW, outH);
    const quality = mimeType === "image/png" ? 1 : 0.85;
    try {
      onConfirm(canvas.toDataURL(mimeType, quality));
    } catch {
      alert("No se pudo procesar esta foto. Probá subiéndola de nuevo desde el archivo original.");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
      <div className="rounded-2xl p-5 max-w-sm w-full flex flex-col gap-4" style={{ background: "var(--ink)", border: "1px solid var(--line)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>{title}</p>
        <div
          className="relative overflow-hidden rounded-xl mx-auto touch-none select-none"
          style={{ width: boxW, height: boxH, background: "var(--ink-3)", cursor: img ? "grab" : "default" }}
          onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
          onMouseMove={(e) => { if (dragState.current) moveDrag(e.clientX, e.clientY); }}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={endDrag}
        >
          {img && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              style={{ position: "absolute", left: pan.x, top: pan.y, width: displayW, height: displayH, maxWidth: "none" }}
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--slate)" }}>Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>
        <p className="text-xs" style={{ color: "var(--slate)" }}>Arrastrá la foto para moverla dentro del marco.</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="kulto-btn flex-1 rounded-full py-2.5 text-sm font-semibold" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
            Cancelar
          </button>
          <button onClick={confirm} disabled={!img} className="kulto-btn flex-1 rounded-full py-2.5 text-sm font-semibold" style={{ background: "var(--signal)", color: "var(--bone)" }}>
            Usar esta foto
          </button>
        </div>
      </div>
    </div>
  );
}

const emptyDraft = {
  id: null, name: "", description: "", material: "", category: "", subcategory: "", group: "", price: "", salePrice: "", stock: "", points: "", sku: "",
  tags: { bestseller: false, oferta: false, tendencia: false, template: false, customDesign: false },
  colors: [], designs: [], sizes: [], photoPool: [],
  imageFit: "contain", imageBackground: null,
  sizeGuide: [], // [{ size, measurements }] — guía de talles opcional, por prenda
  sizeGuideImage: null, // alternativa (o complemento) a la tabla: una foto con las medidas
  designGroup: "", // opcional: mismo texto en varios productos = "mismo diseño, otro estilo"
  // Categorías ADEMÁS de la principal donde este MISMO producto (mismo id,
  // mismo precio, mismo stock) también se lista — ver "También listar en
  // otras categorías" más abajo. Distinto de designGroup/"Duplicar", que
  // crean copias independientes con su propio precio y stock.
  extraCategories: [],
  // Foto base (frente/espalda) para generar los demás colores solos — igual
  // que en Personalizar. Se guarda junto con la prenda para no tener que
  // volver a subirla cada vez que se agrega un color nuevo.
  baseImages: null,
};

function AdminProductForm({ categories, groups, onAddCategory, onAddGroup, savedColors, onSaveColorToLibrary, onRemoveColorFromLibrary, onSave, editing, onCancelEdit, defaultTemplate = false, allProducts = [] }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [newCat, setNewCat] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [colorDraft, setColorDraft] = useState({ name: "", hex: "#E8452C", images: [], frontImage: null, backImage: null, sleeveLeftImage: null, sleeveRightImage: null });
  const [colorError, setColorError] = useState("");
  // Cola de colores de Roly cargados por número, esperando su foto — ver
  // "Agregar por número de Roly" más abajo.
  const [rolyInput, setRolyInput] = useState("");
  const [rolyQueue, setRolyQueue] = useState([]);
  const [rolyNotFound, setRolyNotFound] = useState([]);
  const [designDraft, setDesignDraft] = useState({ name: "", image: "" });
  const [editingColorIdx, setEditingColorIdx] = useState(null);
  const [editingDesignIdx, setEditingDesignIdx] = useState(null);
  const [customSize, setCustomSize] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  // Foto base (frente/espalda) para generar automáticamente los demás
  // colores de esta prenda — igual técnica que usa Personalizar.
  const [baseImagesForColors, setBaseImagesForColors] = useState({ frontImage: null, backImage: null });
  const [removingBaseBg, setRemovingBaseBg] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoFromBase, setAutoFromBase] = useState(true);
  // Al crear una prenda nueva, la mostramos paso a paso (como Personalizar) en
  // vez de un formulario larguísimo de una — más fácil de seguir sin perderse.
  // Al editar una ya existente dejamos todo visible junto, como hasta ahora,
  // para poder retocar cualquier cosa sin ir paso por paso de nuevo.
  const [step, setStep] = useState(1);
  const isNew = !draft.id;
  const TOTAL_STEPS = 4;
  const showStep = (n) => !isNew || step === n;

  useEffect(() => {
    if (editing) {
      const migratedColors = (editing.colors || []).map((c) => ({
        name: c.name, hex: c.hex, images: c.images || (c.image ? [c.image] : []),
      }));
      setDraft({
        ...emptyDraft,
        ...editing,
        // editing.points puede venir en null (prenda guardada sin puntaje
        // propio) — un input controlado no acepta null, así que lo pasamos a
        // "" para que se vea vacío en vez de romper el campo.
        points: editing.points == null ? "" : String(editing.points),
        sizes: editing.sizes || [],
        colors: migratedColors,
        photoPool: editing.photoPool || migratedColors.flatMap((c) => c.images),
      });
    } else {
      setDraft({ ...emptyDraft, tags: { ...emptyDraft.tags, template: defaultTemplate } });
    }
    setEditingColorIdx(null);
    setEditingDesignIdx(null);
    setColorDraft({ name: "", hex: "#E8452C", images: [], frontImage: null, backImage: null, sleeveLeftImage: null, sleeveRightImage: null });
    setDesignDraft({ name: "", image: "" });
    setCustomSize("");
    setShowAdvanced(false);
    setAiError("");
    setBaseImagesForColors({ frontImage: editing?.baseImages?.frontImage || null, backImage: editing?.baseImages?.backImage || null });
    setStep(1);
  }, [editing, defaultTemplate]);

  const [cropQueue, setCropQueue] = useState([]); // File objects waiting to be cropped
  const [cropSource, setCropSource] = useState(null); // currently open: File or existing base64 string (re-crop)
  const [recropTarget, setRecropTarget] = useState(null); // existing base64 being replaced, if re-cropping

  const addPhotosToPool = (files) => {
    const list = Array.from(files);
    if (!list.length) return;
    setCropQueue(list.slice(1));
    setCropSource(list[0]);
  };
  const handleCropConfirm = (croppedBase64) => {
    if (recropTarget) {
      setDraft((d) => ({
        ...d,
        photoPool: d.photoPool.map((p) => (p === recropTarget ? croppedBase64 : p)),
        colors: d.colors.map((c) => ({ ...c, images: c.images.map((i) => (i === recropTarget ? croppedBase64 : i)) })),
      }));
      setColorDraft((c) => ({ ...c, images: c.images.map((i) => (i === recropTarget ? croppedBase64 : i)) }));
      setRecropTarget(null);
      setCropSource(null);
      return;
    }
    setDraft((d) => ({ ...d, photoPool: [...d.photoPool, croppedBase64] }));
    if (cropQueue.length) {
      setCropSource(cropQueue[0]);
      setCropQueue((q) => q.slice(1));
    } else {
      setCropSource(null);
    }
  };
  const handleCropCancel = () => {
    setRecropTarget(null);
    if (recropTarget) { setCropSource(null); return; }
    if (cropQueue.length) {
      setCropSource(cropQueue[0]);
      setCropQueue((q) => q.slice(1));
    } else {
      setCropSource(null);
    }
  };
  const recropPoolImage = (img) => { setRecropTarget(img); setCropSource(img); };
  const removeFromPool = (img) => {
    setDraft((d) => ({ ...d, photoPool: d.photoPool.filter((p) => p !== img) }));
  };
  const resortColorsToPool = (colors, pool) =>
    colors.map((c) => ({ ...c, images: [...c.images].sort((a, b) => pool.indexOf(a) - pool.indexOf(b)) }));

  const movePoolImage = (index, direction) => {
    setDraft((d) => {
      const next = [...d.photoPool];
      const target = index + direction;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, photoPool: next, colors: resortColorsToPool(d.colors, next) };
    });
  };
  const makeCoverImage = (index) => {
    setDraft((d) => {
      if (index === 0) return d;
      const next = [...d.photoPool];
      const [img] = next.splice(index, 1);
      next.unshift(img);
      return { ...d, photoPool: next, colors: resortColorsToPool(d.colors, next) };
    });
  };
  // Las 4 zonas que un admin puede marcar en una foto vinculada a un color:
  // adelante, atrás y (opcionalmente) manga izquierda/derecha por separado.
  const ZONE_FIELDS = ["frontImage", "backImage", "sleeveLeftImage", "sleeveRightImage"];
  const togglePoolImageOnColor = (img) => {
    setColorDraft((c) => {
      const included = c.images.includes(img);
      const next = { ...c, images: included ? c.images.filter((i) => i !== img) : [...c.images, img] };
      if (included) {
        ZONE_FIELDS.forEach((f) => { if (next[f] === img) next[f] = null; });
      }
      return next;
    });
  };
  const setColorZoneImage = (zone, img) => {
    setColorDraft((c) => {
      const next = { ...c, [zone]: c[zone] === img ? null : img };
      // una misma foto no puede ser a la vez, por ejemplo, "adelante" y "manga izquierda"
      ZONE_FIELDS.forEach((f) => { if (f !== zone && next[f] === img) next[f] = null; });
      return next;
    });
  };
  // Subida directa: tocás el recuadro "Adelante"/"Atrás"/etc. y elegís la foto
  // de una — sin tener que subirla primero arriba y después ir a marcarla.
  const ZONE_UPLOAD_DEFS = [
    { key: "frontImage", label: "Adelante" },
    { key: "backImage", label: "Atrás" },
    { key: "sleeveLeftImage", label: "Manga izq." },
    { key: "sleeveRightImage", label: "Manga der." },
  ];
  const colorHasAnyZoneImage = (c) => ZONE_FIELDS.some((f) => !!c[f]);
  const handleZoneUpload = (zone, file) => {
    if (!file) return;
    const isPng = file.type === "image/png";
    fileToBase64(
      file,
      (b64) => {
        setColorDraft((c) => {
          const next = { ...c, [zone]: b64 };
          ZONE_FIELDS.forEach((f) => { if (f !== zone && next[f] === b64) next[f] = null; });
          if (!next.images.includes(b64)) next.images = [...next.images, b64];
          return next;
        });
      },
      1400,
      isPng ? 1 : 0.9,
      isPng ? "image/png" : "image/jpeg"
    );
  };
  const removeZoneImage = (zone) => {
    setColorDraft((c) => {
      const img = c[zone];
      const next = { ...c, [zone]: null };
      const stillUsed = ZONE_FIELDS.some((f) => f !== zone && next[f] === img);
      if (img && !stillUsed) next.images = next.images.filter((i) => i !== img);
      return next;
    });
  };

  // Foto base para generar colores solos (ver sección "Generar colores
  // automáticamente" más abajo) — misma técnica que usa Personalizar, pero
  // acá solo con frente/espalda (sin mangas por separado).
  const hasBaseImagesForColors = !!baseImagesForColors.frontImage;
  const handleBaseColorZoneUpload = (zone, file) => {
    if (!file) return;
    const isPng = file.type === "image/png";
    fileToBase64(file, (b64) => setBaseImagesForColors((b) => ({ ...b, [zone]: b64 })), 1400, isPng ? 1 : 0.9, isPng ? "image/png" : "image/jpeg");
  };
  const removeBaseColorZoneImage = (zone) => setBaseImagesForColors((b) => ({ ...b, [zone]: null }));
  // Les quita el fondo a las fotos base de una — para que el recoloreado
  // pinte solo la prenda y no el fondo de la foto.
  const handleRemoveBaseColorBackground = async () => {
    setRemovingBaseBg(true);
    for (const zone of ["frontImage", "backImage"]) {
      const current = baseImagesForColors[zone];
      if (!current) continue;
      const cleaned = await removeImageBackground(current);
      if (cleaned) {
        const uploaded = await uploadDataUrlToStorage(cleaned);
        setBaseImagesForColors((b) => ({ ...b, [zone]: uploaded || cleaned }));
      }
    }
    setRemovingBaseBg(false);
  };

  const handleAiFill = async () => {
    if (!draft.photoPool.length) return;
    setAiLoading(true);
    setAiError("");
    const result = await analyzeProductPhoto(draft.photoPool[0], categories);
    setAiLoading(false);
    if (!result.ok) {
      setAiError(result.error);
      return;
    }
    setDraft((d) => ({
      ...d,
      name: result.name || d.name,
      category: result.category || d.category,
      description: result.description || d.description,
    }));
    if (result.category && !categories.includes(result.category)) {
      onAddCategory(result.category);
    }
  };

  const addColor = async () => {
    // La foto ya no es obligatoria para agregar un color: así podés primero
    // elegir/cargar todos los colores disponibles de la prenda (por nombre o
    // por número de Roly) y después volver, de a uno, a anclarle su foto —
    // en vez de tener que subir la foto en el momento sí o sí. Un color sin
    // foto todavía se ve marcado como "Sin foto" en la lista de abajo.
    setColorError("");
    let source = colorDraft;
    // Si no le subiste fotos propias a este color pero hay una foto base
    // cargada arriba y el modo automático está activado, se la generamos
    // sola antes de agregarlo — misma técnica que Personalizar.
    if (!colorHasAnyZoneImage(colorDraft) && autoFromBase && hasBaseImagesForColors) {
      setAutoGenerating(true);
      const { images: zones } = await generateColorFromBaseImages(baseImagesForColors, colorDraft.hex);
      setAutoGenerating(false);
      const generated = [zones.frontImage, zones.backImage].filter(Boolean);
      source = { ...colorDraft, ...zones, images: [...colorDraft.images, ...generated] };
    }
    const finalColor = source.name.trim()
      ? source
      : { ...source, name: `Color ${draft.colors.length + 1}` };
    if (editingColorIdx !== null) {
      setDraft((d) => ({ ...d, colors: d.colors.map((c, idx) => (idx === editingColorIdx ? finalColor : c)) }));
      setEditingColorIdx(null);
    } else {
      setDraft((d) => ({ ...d, colors: [...d.colors, finalColor] }));
    }
    onSaveColorToLibrary?.({ name: finalColor.name, hex: finalColor.hex });
    setColorDraft({ name: "", hex: "#E8452C", images: [], frontImage: null, backImage: null, sleeveLeftImage: null, sleeveRightImage: null });
  };
  const pickSavedColor = (c) => setColorDraft((d) => ({ ...d, name: c.name, hex: c.hex }));
  const addRolyToQueue = () => {
    if (!rolyInput.trim()) return;
    const { found, notFound } = lookupRolyColorsByNumbers(rolyInput);
    setRolyQueue((q) => {
      const already = new Set(q.map((c) => c.name));
      return [...q, ...found.filter((c) => !already.has(c.name))];
    });
    setRolyNotFound(notFound);
    setRolyInput("");
  };
  const useQueuedRolyColor = (i) => {
    const c = rolyQueue[i];
    if (!c) return;
    pickSavedColor(c);
    setRolyQueue((q) => q.filter((_, idx) => idx !== i));
  };
  const editColor = (i) => { setColorDraft(draft.colors[i]); setEditingColorIdx(i); setColorError(""); };
  const removeColor = (i) => {
    setDraft((d) => ({ ...d, colors: d.colors.filter((_, idx) => idx !== i) }));
    if (editingColorIdx === i) { setEditingColorIdx(null); setColorDraft({ name: "", hex: "#E8452C", images: [], frontImage: null, backImage: null, sleeveLeftImage: null, sleeveRightImage: null }); }
  };

  const addDesign = () => {
    if (!designDraft.name) return;
    if (editingDesignIdx !== null) {
      setDraft((d) => ({ ...d, designs: d.designs.map((x, idx) => (idx === editingDesignIdx ? designDraft : x)) }));
      setEditingDesignIdx(null);
    } else {
      setDraft((d) => ({ ...d, designs: [...d.designs, designDraft] }));
    }
    setDesignDraft({ name: "", image: "" });
  };
  const editDesign = (i) => { setDesignDraft(draft.designs[i]); setEditingDesignIdx(i); };
  const removeDesign = (i) => {
    setDraft((d) => ({ ...d, designs: d.designs.filter((_, idx) => idx !== i) }));
    if (editingDesignIdx === i) { setEditingDesignIdx(null); setDesignDraft({ name: "", image: "" }); }
  };

  // Arma el objeto de producto final a partir del draft actual — lo usa tanto
  // "Guardar" como "Duplicar en otras categorías" (ver más abajo), pasando
  // overrides (id/categoría/designGroup/sku nuevos) para cada copia.
  const buildProductObject = (overrides = {}) => {
    const hasSalePrice = !!(draft.salePrice && Number(draft.salePrice) > 0);
    return {
      ...draft,
      id: draft.id || genId("p"),
      price: Number(draft.price),
      salePrice: hasSalePrice ? Number(draft.salePrice) : null,
      tags: { ...draft.tags, oferta: hasSalePrice },
      stock: Number(draft.stock) || 0,
      // Vacío = usa el puntaje general de Ajustes → Fidelización para esta
      // prenda; un número acá lo pisa (ver handleCheckout, que suma esto por
      // cada prenda del pedido en vez de una sola cifra fija para todo).
      points: draft.points === "" || draft.points === null || draft.points === undefined ? null : Number(draft.points) || 0,
      // Código corto de referencia (ej: "BEAGLE-001") en vez del id interno —
      // se genera solo a partir del nombre si el admin no cargó uno propio.
      sku: draft.sku.trim() || generateSku(draft.name, allProducts.filter((p) => p.id !== draft.id)),
      createdAt: draft.createdAt || Date.now(),
      salesCount: draft.salesCount || 0,
      viewsCount: draft.viewsCount || 0,
      designGroup: (draft.designGroup || "").trim(),
      subcategory: (draft.subcategory || "").trim(),
      // Foto base para generar colores solos (si se cargó una) — se guarda
      // junto con la prenda para no tener que volver a subirla cada vez.
      baseImages: hasBaseImagesForColors
        ? { frontImage: baseImagesForColors.frontImage || null, backImage: baseImagesForColors.backImage || null }
        : null,
      ...overrides,
    };
  };

  const handleSave = async () => {
    if (!draft.name || !draft.category || !draft.price) return;
    setSaving(true);
    const product = buildProductObject();
    await onSave(product);
    setSaving(false);
    setDraft({ ...emptyDraft, tags: { ...emptyDraft.tags, template: defaultTemplate } });
    setStep(1);
  };

  // Duplicar en otras categorías: para no tener que subir 1000 diseños 3
  // veces cada uno cuando la misma foto sirve para varias prendas (ej: la
  // misma estampa en Oversize, Remera normal y Buzo) — reusa las mismas
  // fotos/colores/talles del producto actual, crea una copia por cada
  // categoría elegida, y las vincula todas con "Vincular con otro estilo"
  // (designGroup) para que en la ficha se vea "también disponible en".
  const [dupCats, setDupCats] = useState([]);
  const [duplicating, setDuplicating] = useState(false);
  const [dupDone, setDupDone] = useState(0);
  const toggleDupCat = (cat) => setDupCats((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));

  const handleDuplicateToCategories = async () => {
    if (!draft.name || !draft.category || !draft.price || dupCats.length === 0) return;
    setDuplicating(true);
    setDupDone(0);
    // Si el producto original no tenía un texto en "Vincular con otro
    // estilo", le generamos uno (con el nombre, para reconocerlo fácil en la
    // lista) y se lo aplicamos también al original — sin esto, las copias
    // quedarían vinculadas entre sí pero NO con el producto original.
    const group = (draft.designGroup || "").trim() || `${draft.name.trim()} (${genId("dg").slice(-5)})`;
    const original = buildProductObject({ designGroup: group });
    await onSave(original);
    setDraft((d) => ({ ...d, id: original.id, designGroup: group }));
    // Cada copia necesita su propio código (sku) — vamos sumando las que ya
    // creamos en esta misma tanda a la lista de "usados", porque todas
    // comparten el mismo nombre y si no, generateSku les daría el mismo código.
    let knownProducts = allProducts;
    let count = 0;
    for (const cat of dupCats) {
      const copy = buildProductObject({
        id: genId("p"),
        category: cat,
        designGroup: group,
        sku: "",
        // Que un diseño esté disponible en otra prenda no significa que
        // también sea "más vendido", "oferta" o "tendencia" — cada modelo
        // arranca sin esas etiquetas, aunque el original ya las tuviera.
        tags: { ...draft.tags, bestseller: false, oferta: false, tendencia: false },
      });
      copy.sku = generateSku(copy.name, knownProducts);
      knownProducts = [...knownProducts, copy];
      await onSave(copy);
      count += 1;
      setDupDone(count);
    }
    setDuplicating(false);
    setDupCats([]);
  };

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };
  const step1Ready = draft.name.trim() && draft.category && String(draft.price).trim();
  // Sugerencias para "vincular con otro estilo": todos los textos ya usados
  // en otros productos, así el admin puede reusar exactamente el mismo en
  // vez de tener que escribirlo igual a mano cada vez.
  const designGroupSuggestions = Array.from(new Set(allProducts.map((p) => p.designGroup).filter(Boolean)));
  // Sugerencias de subcategoría: los textos que ya se usaron en OTROS
  // productos de esta misma categoría (ej: dentro de "Sudaderas" ya usaste
  // "Con capucha" y "Sin capucha") — el admin escribe libre, esto solo le
  // evita tipear de nuevo algo que ya existe.
  const subcategorySuggestionsProd = Array.from(
    new Set(allProducts.filter((p) => p.category === draft.category && p.subcategory).map((p) => p.subcategory))
  );

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>{draft.id ? "Editar producto" : "Nuevo producto"}</h4>

      {isNew && (
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {[
            { n: 1, label: "Datos y fotos" },
            { n: 2, label: "Etiquetas y talles" },
            { n: 3, label: "Fotos por color" },
            { n: 4, label: "Diseños y publicar" },
          ].map((s, i, arr) => (
            <div key={s.n} className="flex items-center gap-1.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                style={{ background: step >= s.n ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
              >
                {s.n}
              </div>
              <span className="text-xs" style={{ color: step >= s.n ? "var(--bone)" : "var(--slate)" }}>{s.label}</span>
              {i < arr.length - 1 && <div className="w-4 h-px" style={{ background: "var(--line)" }} />}
            </div>
          ))}
        </div>
      )}

      {showStep(1) && (
      <>
      {/* Photos — first and prominent, like listing an item on a marketplace app */}
      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Fotos</p>
        <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>La primera es la portada. Usá las flechas para ordenarlas, o la estrella para poner una de portada.</p>
        {draft.photoPool.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-2">
            {draft.photoPool.map((img, i) => (
              <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden" style={{ background: "var(--ink-3)", border: i === 0 ? "2px solid var(--sun)" : "1px solid var(--line)" }}>
                <img loading="lazy" src={img} className="w-full h-full object-contain" alt="" />
                <button
                  onClick={() => recropPoolImage(img)}
                  className="kulto-btn absolute top-0.5 left-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(21,19,26,0.8)", color: "var(--bone)" }}
                  title="Recortar de nuevo"
                >
                  <Pencil size={10} />
                </button>
                <button
                  onClick={() => removeFromPool(img)}
                  className="kulto-btn absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(21,19,26,0.8)", color: "var(--bone)" }}
                  title="Quitar"
                >
                  <X size={11} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-1 py-0.5" style={{ background: "rgba(21,19,26,0.8)" }}>
                  <button
                    onClick={() => movePoolImage(i, -1)}
                    disabled={i === 0}
                    className="kulto-btn w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ color: i === 0 ? "rgba(243,239,230,0.25)" : "var(--bone)" }}
                    title="Mover a la izquierda"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  {i === 0 ? (
                    <span className="text-[9px] font-semibold" style={{ color: "var(--sun)" }}>Portada</span>
                  ) : (
                    <button onClick={() => makeCoverImage(i)} className="kulto-btn w-5 h-5 rounded-full flex items-center justify-center" style={{ color: "var(--sun)" }} title="Poner de portada">
                      <Star size={11} />
                    </button>
                  )}
                  <button
                    onClick={() => movePoolImage(i, 1)}
                    disabled={i === draft.photoPool.length - 1}
                    className="kulto-btn w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ color: i === draft.photoPool.length - 1 ? "rgba(243,239,230,0.25)" : "var(--bone)" }}
                    title="Mover a la derecha"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            ))}
            <label
              className="kulto-btn w-20 h-20 rounded-xl flex flex-col items-center justify-center gap-1"
              style={{ background: "var(--ink-3)", border: "1px dashed var(--line)", color: "var(--slate)" }}
            >
              <Upload size={18} />
              <span className="text-[10px]">Agregar</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files.length) addPhotosToPool(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        ) : (
          <label
            className="kulto-btn w-full rounded-xl flex flex-col items-center justify-center gap-2 py-8"
            style={{ background: "var(--ink-3)", border: "1px dashed var(--line)", color: "var(--slate)" }}
          >
            <Upload size={24} />
            <span className="text-sm">Tocá para subir las fotos de esta prenda</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files.length) addPhotosToPool(e.target.files); e.target.value = ""; }} />
          </label>
        )}
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Se ven así, tal cual, en la web — sin pasos extra. La primera foto es la que aparece de portada.
        </p>
      </div>

      {/* AI autofill */}
      {draft.photoPool.length > 0 && (
        <div>
          <button
            onClick={handleAiFill}
            disabled={aiLoading}
            className="kulto-btn w-full rounded-xl py-3 font-semibold flex items-center justify-center gap-2"
            style={{ background: "var(--ink-3)", color: "var(--sun)", border: "1px solid var(--line)" }}
          >
            {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {aiLoading ? "Analizando la foto..." : "Rellenar nombre, categoría y descripción con IA"}
          </button>
          {aiError && <p className="text-xs mt-1" style={{ color: "var(--signal)" }}>{aiError}</p>}
        </div>
      )}

      <input placeholder="Nombre del producto" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="rounded-xl p-3 text-sm" style={inputStyle} />

      <textarea
        placeholder="Descripción breve (opcional)"
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        rows={2}
        className="rounded-xl p-3 text-sm"
        style={inputStyle}
      />

      <div>
        <input
          placeholder="Tela / composición (ej: 100% algodón peinado, 220 g/m²)"
          value={draft.material || ""}
          onChange={(e) => setDraft({ ...draft, material: e.target.value })}
          className="w-full rounded-xl p-3 text-sm"
          style={inputStyle}
        />
        <p className="text-[11px] mt-1" style={{ color: "var(--slate)" }}>Opcional. Se usa para que los clientes puedan comparar productos en el catálogo.</p>
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--slate)" }}>Grupo / temática (opcional — ej: Anime, Diseños Kulto, Música)</label>
        <div className="flex gap-2">
          <select value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })} className="flex-1 rounded-xl p-3 text-sm" style={inputStyle}>
            <option value="">Sin grupo</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-2">
          <input placeholder="Nuevo grupo" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} className="flex-1 rounded-xl p-3 text-sm" style={inputStyle} />
          <button
            className="kulto-btn rounded-xl px-4 text-sm font-semibold"
            style={{ background: "var(--ink-3)", color: "var(--bone)" }}
            onClick={() => { if (newGroup.trim()) { onAddGroup(newGroup.trim()); setDraft({ ...draft, group: newGroup.trim() }); setNewGroup(""); } }}
          >
            Añadir
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="flex-1 rounded-xl p-3 text-sm" style={inputStyle}>
          <option value="">Selecciona categoría</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <input placeholder="Nueva categoría" value={newCat} onChange={(e) => setNewCat(e.target.value)} className="flex-1 rounded-xl p-3 text-sm" style={inputStyle} />
        <button
          className="kulto-btn rounded-xl px-4 text-sm font-semibold"
          style={{ background: "var(--ink-3)", color: "var(--bone)" }}
          onClick={() => { if (newCat.trim()) { onAddCategory(newCat.trim()); setDraft({ ...draft, category: newCat.trim() }); setNewCat(""); } }}
        >
          Añadir
        </button>
      </div>

      {draft.category && (
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--slate)" }}>Subcategoría dentro de "{draft.category}" (opcional)</label>
          <input
            list="product-subcategory-options"
            placeholder='Ej: "Con capucha", "Beagle", "Oversize"'
            value={draft.subcategory}
            onChange={(e) => setDraft({ ...draft, subcategory: e.target.value })}
            className="w-full rounded-xl p-3 text-sm"
            style={inputStyle}
          />
          <datalist id="product-subcategory-options">
            {subcategorySuggestionsProd.map((s) => <option key={s} value={s} />)}
          </datalist>
          <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
            Sirve para separar modelos o variantes dentro de la misma categoría (ej: en "Sudaderas", separar "Con capucha" de "Sin capucha"; en "Camisetas", separar por modelo como "Beagle" u "Oversize"). El cliente los va a ver agrupados en el menú "Productos" del header. Dejalo vacío si esta categoría no necesita esa división.
          </p>
        </div>
      )}

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--slate)" }}>Vincular con otro estilo del mismo diseño (opcional)</label>
        <input
          list="design-group-options"
          placeholder='Ej: "Dragón Ancestral" — poné el mismo texto en cada estilo (Beagle, Oversize, etc.)'
          value={draft.designGroup}
          onChange={(e) => setDraft({ ...draft, designGroup: e.target.value })}
          className="w-full rounded-xl p-3 text-sm"
          style={inputStyle}
        />
        <datalist id="design-group-options">
          {designGroupSuggestions.map((g) => <option key={g} value={g} />)}
        </datalist>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Si vendés el mismo diseño en varias prendas a distinto precio, escribí el mismo texto acá en cada una — el cliente va a ver un botón para pasar de un estilo al otro sin perder el diseño que le gustó.
        </p>
      </div>

      {categories.filter((c) => c !== draft.category).length > 0 && (
        <div className="rounded-2xl p-3" style={{ background: "var(--ink-3)", border: "1px dashed var(--line)" }}>
          <label className="text-xs mb-1 block font-semibold" style={{ color: "var(--bone)" }}>También listar en otras categorías (opcional)</label>
          <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
            Es el MISMO producto (misma foto, mismo precio, mismo stock) — tildá en qué otras categorías también querés que aparezca. Si cambiás el precio o el stock, se actualiza en todas a la vez porque es uno solo. (Distinto de "Duplicar", más abajo, que crea copias independientes.)
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.filter((c) => c !== draft.category).map((c) => {
              const checked = (draft.extraCategories || []).includes(c);
              return (
                <label
                  key={c}
                  className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 cursor-pointer"
                  style={{ background: checked ? "var(--sun)" : "var(--ink)", color: checked ? "var(--ink)" : "var(--bone)", border: "1px solid var(--line)" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setDraft((d) => ({
                        ...d,
                        extraCategories: (d.extraCategories || []).includes(c)
                          ? d.extraCategories.filter((x) => x !== c)
                          : [...(d.extraCategories || []), c],
                      }))
                    }
                    className="hidden"
                  />
                  {c}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {categories.filter((c) => c !== draft.category).length > 0 && (
        <div className="rounded-2xl p-3" style={{ background: "var(--ink-3)", border: "1px dashed var(--line)" }}>
          <label className="text-xs mb-1 block font-semibold" style={{ color: "var(--bone)" }}>Duplicar este diseño en otras categorías (opcional)</label>
          <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
            Para no tener que subir la misma foto varias veces: elegí en qué otras categorías también se vende este mismo diseño (ej: Oversize, Remera normal, Buzo) y se crea una copia en cada una, con las mismas fotos y colores, ya vinculadas entre sí.
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            {categories.filter((c) => c !== draft.category).map((c) => (
              <label
                key={c}
                className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 cursor-pointer"
                style={{ background: dupCats.includes(c) ? "var(--signal)" : "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
              >
                <input type="checkbox" checked={dupCats.includes(c)} onChange={() => toggleDupCat(c)} className="hidden" />
                {c}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={dupCats.length === 0 || duplicating || !draft.name || !draft.category || !draft.price}
            onClick={handleDuplicateToCategories}
            className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full flex items-center gap-2"
            style={{ background: dupCats.length === 0 ? "var(--ink)" : "var(--sun)", color: dupCats.length === 0 ? "var(--slate)" : "var(--ink)", opacity: duplicating ? 0.7 : 1 }}
          >
            {duplicating ? <Loader2 size={16} className="animate-spin" /> : <Boxes size={16} />}
            {duplicating ? `Creando… (${dupDone}/${dupCats.length})` : `Duplicar en ${dupCats.length || ""} categoría${dupCats.length === 1 ? "" : "s"}`.trim()}
          </button>
          {!draft.name || !draft.category || !draft.price ? (
            <p className="text-xs mt-1" style={{ color: "var(--signal)" }}>Completá nombre, categoría y precio arriba antes de duplicar.</p>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input type="number" placeholder="Precio (€)" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="rounded-xl p-3 text-sm" style={inputStyle} />
        <input type="number" placeholder="Stock" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} className="rounded-xl p-3 text-sm" style={inputStyle} />
      </div>
      <div>
        <input type="number" min="0" placeholder="Puntos de fidelización (vacío = usar el general)" value={draft.points} onChange={(e) => setDraft({ ...draft, points: e.target.value })} className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Cuántos puntos suma comprar esta prenda (por unidad). Dejalo vacío para usar el puntaje general de Ajustes → Fidelización.
        </p>
      </div>
      <div>
        <input type="text" placeholder="Código de referencia (vacío = se genera solo, ej: BEAGLE-001)" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value.toUpperCase() })} className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Se usa como referencia corta en vez de un código largo — aparece en el mensaje de WhatsApp del pedido. Dejalo vacío para que se arme solo con el nombre de la prenda.
        </p>
      </div>

      {isNew && (
        <div className="flex justify-end">
          <button
            disabled={!step1Ready}
            onClick={() => setStep(2)}
            className="kulto-btn text-sm font-semibold px-5 py-2.5 rounded-full flex items-center gap-1"
            style={{ background: step1Ready ? "var(--signal)" : "var(--ink-3)", color: step1Ready ? "var(--bone)" : "var(--slate)", cursor: step1Ready ? "pointer" : "default" }}
          >
            Continuar <ChevronRight size={16} />
          </button>
        </div>
      )}
      </>
      )}

      {!isNew && (
      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="kulto-btn text-sm font-semibold flex items-center gap-1 py-1"
        style={{ color: "var(--sun)" }}
      >
        {showAdvanced ? "Ocultar" : "Mostrar"} opciones avanzadas (talles, colores, etiquetas, diseños)
        <ChevronRight size={15} style={{ transform: showAdvanced ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
      </button>
      )}

      {(showAdvanced || (isNew && step >= 2)) && (
        <div className="flex flex-col gap-4 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
          {showStep(2) && (
          <>
          <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--bone)" }}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.tags.bestseller} onChange={(e) => setDraft({ ...draft, tags: { ...draft.tags, bestseller: e.target.checked } })} /> Más vendido
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.tags.tendencia} onChange={(e) => setDraft({ ...draft, tags: { ...draft.tags, tendencia: e.target.checked } })} /> Tendencia
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--bone)" }}>
            <input type="checkbox" checked={draft.tags.template} onChange={(e) => setDraft({ ...draft, tags: { ...draft.tags, template: e.target.checked } })} />
            Solo para personalizar — no aparece en el catálogo, solo como estilo de prenda al armar un pedido personalizado
          </label>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--slate)" }}>
              Precio de oferta (opcional) — si cargás uno, esta prenda pasa automáticamente a la sección "En oferta" de la web, con el precio tachado y el nuevo precio al lado. Dejalo vacío para venderla al precio normal.
            </label>
            <input
              type="number"
              placeholder="Ej: 15.99"
              value={draft.salePrice}
              onChange={(e) => {
                const val = e.target.value;
                setDraft({ ...draft, salePrice: val, tags: { ...draft.tags, oferta: !!val.trim() } });
              }}
              className="rounded-xl p-3 text-sm w-full"
              style={inputStyle}
            />
          </div>

          {/* Sizes */}
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Talles que maneja esta prenda</p>
            <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>Dejalo vacío si el producto no usa talles (ej. llaveros).</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {SIZE_PRESETS.map((s) => {
                const active = draft.sizes.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => setDraft((d) => ({ ...d, sizes: active ? d.sizes.filter((x) => x !== s) : [...d.sizes, s] }))}
                    className="kulto-btn text-sm font-semibold rounded-full px-3 py-1.5"
                    style={{ background: active ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)", border: active ? "1px solid var(--signal)" : "1px solid var(--line)" }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            {draft.sizes.filter((s) => !SIZE_PRESETS.includes(s)).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {draft.sizes.filter((s) => !SIZE_PRESETS.includes(s)).map((s) => (
                  <div key={s} className="flex items-center gap-1 rounded-full pl-3 pr-2 py-1" style={{ background: "var(--ink-3)" }}>
                    <span className="text-xs" style={{ color: "var(--bone)" }}>{s}</span>
                    <button onClick={() => setDraft((d) => ({ ...d, sizes: d.sizes.filter((x) => x !== s) }))} style={{ color: "var(--slate)" }}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                placeholder="Otro talle (ej. Único, 6-8 años)"
                value={customSize}
                onChange={(e) => setCustomSize(e.target.value)}
                className="rounded-xl p-2 text-sm flex-1"
                style={inputStyle}
              />
              <button
                onClick={() => { const v = customSize.trim(); if (v && !draft.sizes.includes(v)) { setDraft((d) => ({ ...d, sizes: [...d.sizes, v] })); } setCustomSize(""); }}
                className="kulto-btn text-xs font-semibold rounded-xl px-3 py-2"
                style={{ background: "var(--sun)", color: "var(--ink)" }}
              >
                Agregar
              </button>
            </div>
          </div>

          {/* Size guide */}
          {draft.sizes.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Guía de talles (opcional)</p>
              <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>Medidas por talle — el cliente la ve antes de elegir. Dejalo vacío si no querés mostrar guía en esta prenda.</p>
              {draft.sizes.map((s) => {
                const row = draft.sizeGuide?.find((g) => g.size === s);
                return (
                  <div key={s} className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold w-14 shrink-0" style={{ color: "var(--bone)" }}>{s}</span>
                    <input
                      placeholder="Ej: Pecho 96cm · Largo 70cm"
                      value={row?.measurements || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft((d) => {
                          const rest = (d.sizeGuide || []).filter((g) => g.size !== s);
                          const next = val.trim() ? [...rest, { size: s, measurements: val }] : rest;
                          return { ...d, sizeGuide: next };
                        });
                      }}
                      className="rounded-xl p-2 text-sm flex-1"
                      style={inputStyle}
                    />
                  </div>
                );
              })}
              <div className="mt-3">
                <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
                  ¿Preferís mostrar una foto con las medidas (por ejemplo, la tabla de talles del fabricante) en vez de escribirlas a mano? Subila acá — se muestra junto con (o en lugar de) la tabla de arriba.
                </p>
                <div className="flex items-center gap-3">
                  {draft.sizeGuideImage && (
                    <img src={draft.sizeGuideImage} alt="Guía de talles" className="w-20 h-20 object-cover rounded-xl" style={{ border: "1px solid var(--line)" }} />
                  )}
                  <label className="kulto-btn text-xs font-semibold rounded-xl px-3 py-2 cursor-pointer" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}>
                    {draft.sizeGuideImage ? "Cambiar imagen" : "Subir imagen"}
                    <input
                      type="file" accept="image/png, image/jpeg" className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const isPng = f.type === "image/png";
                        fileToBase64(f, (b64) => setDraft((d) => ({ ...d, sizeGuideImage: b64 })), 1200, isPng ? 1 : 0.88, isPng ? "image/png" : "image/jpeg");
                      }}
                    />
                  </label>
                  {draft.sizeGuideImage && (
                    <button onClick={() => setDraft((d) => ({ ...d, sizeGuideImage: null }))} className="kulto-btn text-xs" style={{ color: "var(--signal)" }}>Quitar</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {isNew && (
            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full flex items-center gap-1" style={{ border: "1px solid var(--line)", color: "var(--slate)" }}>
                <ChevronLeft size={16} /> Atrás
              </button>
              <button onClick={() => setStep(3)} className="kulto-btn text-sm font-semibold px-5 py-2.5 rounded-full flex items-center gap-1" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                Continuar <ChevronRight size={16} />
              </button>
            </div>
          )}
          </>
          )}

          {showStep(3) && (
          <>
          {/* Photo display */}
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Cómo se ven las fotos</p>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setDraft((d) => ({ ...d, imageFit: "contain" }))}
                className="kulto-btn flex-1 text-xs font-semibold px-3 py-2 rounded-full"
                style={{ background: draft.imageFit !== "cover" ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
              >
                Ajustar (se ve completa)
              </button>
              <button
                onClick={() => setDraft((d) => ({ ...d, imageFit: "cover" }))}
                className="kulto-btn flex-1 text-xs font-semibold px-3 py-2 rounded-full"
                style={{ background: draft.imageFit === "cover" ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
              >
                Llenar el marco (recorta un poco)
              </button>
            </div>
            {draft.imageFit !== "cover" && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs" style={{ color: "var(--bone)" }}>
                  <input
                    type="checkbox"
                    checked={draft.imageBackground !== null}
                    onChange={(e) => setDraft((d) => ({ ...d, imageBackground: e.target.checked ? "#FFFFFF" : null }))}
                  />
                  Elegir un color de fondo para el espacio que sobra
                </label>
                {draft.imageBackground !== null && (
                  <input
                    type="color"
                    value={draft.imageBackground}
                    onChange={(e) => setDraft((d) => ({ ...d, imageBackground: e.target.value }))}
                    className="w-9 h-9 rounded"
                    style={{ background: "transparent" }}
                  />
                )}
              </div>
            )}
            <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
              {draft.imageBackground === null
                ? "Por defecto, el espacio alrededor de la foto usa el color de la prenda."
                : "Ese color se usa detrás de la foto en vez del color de la prenda."}
            </p>
          </div>

          {/* Colors */}
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Colores (opcional)</p>
            <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
              Si no agregás colores, la web muestra directamente todas las fotos de arriba. Agregá colores solo si querés que, al elegir uno, cambien las fotos que se ven.
            </p>

            <div className="mb-3 rounded-xl p-3 flex flex-col gap-3" style={{ background: "var(--ink-3)", border: "1px dashed var(--sun)" }}>
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--sun)" }}>Generar colores automáticamente (opcional)</p>
                <p className="text-xs" style={{ color: "var(--slate)" }}>
                  Subí acá la foto de esta prenda — lo ideal es que sea blanca o de un color bien clarito. A partir de esto, el sistema puede generar solo la foto de cualquier otro color que agregues (sin tener que fotografiar cada uno), conservando los pliegues y las sombras de la tela. Funciona mejor si primero le quitás el fondo con el botón de abajo.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-xs">
                {[{ key: "frontImage", label: "Frente" }, { key: "backImage", label: "Espalda" }].map((zdef) => {
                  const img = baseImagesForColors[zdef.key];
                  return (
                    <div key={zdef.key} className="flex flex-col items-center gap-1">
                      <label
                        className="kulto-btn relative w-full rounded-xl overflow-hidden flex items-center justify-center cursor-pointer"
                        style={{ aspectRatio: "4 / 5", background: "var(--ink)", border: img ? "2px solid var(--sun)" : "1px dashed var(--line)" }}
                      >
                        {img ? (
                          <img loading="lazy" src={img} className="w-full h-full object-contain" alt={zdef.label} />
                        ) : (
                          <span className="flex flex-col items-center gap-1 px-1 text-center">
                            <Upload size={18} style={{ color: "var(--slate)" }} />
                            <span className="text-[10px]" style={{ color: "var(--slate)" }}>Subir foto</span>
                          </span>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => { const f = e.target.files[0]; if (f) handleBaseColorZoneUpload(zdef.key, f); e.target.value = ""; }}
                        />
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-semibold" style={{ color: img ? "var(--sun)" : "var(--slate)" }}>{zdef.label}</span>
                        {img && (
                          <button type="button" onClick={() => removeBaseColorZoneImage(zdef.key)} className="kulto-btn" style={{ color: "var(--slate)" }} title="Quitar foto">
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasBaseImagesForColors && (
                <button
                  type="button"
                  onClick={handleRemoveBaseColorBackground}
                  disabled={removingBaseBg}
                  className="kulto-btn text-xs font-semibold rounded-xl px-3 py-2 self-start"
                  style={{ background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
                >
                  {removingBaseBg ? "Quitando fondo…" : "Quitar fondo automáticamente a estas fotos"}
                </button>
              )}
              {hasBaseImagesForColors && (
                <label className="flex items-center gap-2 text-xs" style={{ color: "var(--bone)" }}>
                  <input type="checkbox" checked={autoFromBase} onChange={(e) => setAutoFromBase(e.target.checked)} />
                  Generar automáticamente los colores que agregue de ahora en más (si no les subo fotos propias)
                </label>
              )}
              {autoGenerating && <p className="text-xs" style={{ color: "var(--sun)" }}>Generando el color…</p>}
            </div>

            <div className="flex flex-wrap gap-2 mb-2">
              {draft.colors.map((c, i) => (
                <div
                  key={i}
                  onClick={() => editColor(i)}
                  className="kulto-btn flex items-center gap-1 rounded-full pl-1 pr-2 py-1"
                  style={{ background: editingColorIdx === i ? "var(--signal)" : "var(--ink-3)" }}
                >
                  <span className="w-5 h-5 rounded-full overflow-hidden" style={{ background: c.hex }}>{c.images && c.images[0] && <img loading="lazy" src={c.images[0]} className="w-full h-full object-cover" alt={c.name || "Color"} />}</span>
                  <span className="text-xs" style={{ color: "var(--bone)" }}>{c.name}</span>
                  {c.images && c.images.length > 1 && <span className="text-[10px]" style={{ color: "var(--bone)", opacity: 0.7 }}>+{c.images.length - 1}</span>}
                  {!colorHasAnyZoneImage(c) && (
                    <span className="text-[10px] font-semibold" style={{ color: "var(--sun)" }} title="Todavía no tiene foto — tocá el color para agregársela">Sin foto</span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); removeColor(i); }} style={{ color: "var(--bone)" }} aria-label="Quitar color"><X size={12} /></button>
                </div>
              ))}
            </div>
            {draft.colors.length > 0 && <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>Toca un color de la lista para editarlo.</p>}

            {savedColors && savedColors.length > 0 && (
              <div className="mb-3">
                <p className="text-xs mb-1" style={{ color: "var(--slate)" }}>Colores guardados — tocá uno para reusarlo:</p>
                <div className="flex flex-wrap gap-2">
                  {savedColors.map((c, i) => (
                    <div
                      key={i}
                      onClick={() => pickSavedColor(c)}
                      className="kulto-btn flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1"
                      style={{ background: "var(--ink-3)", border: colorDraft.name === c.name && colorDraft.hex === c.hex ? "1px solid var(--sun)" : "1px solid var(--line)" }}
                    >
                      <span className="w-4 h-4 rounded-full" style={{ background: c.hex }} />
                      <span className="text-xs" style={{ color: "var(--bone)" }}>{c.name}</span>
                      <button onClick={(e) => { e.stopPropagation(); onRemoveColorFromLibrary?.(c); }} style={{ color: "var(--slate)" }} title="Quitar de la librería">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-3 rounded-xl p-3" style={{ background: "var(--ink-3)", border: "1px dashed var(--line)" }}>
              <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
                Agregar por número de Roly: escribí todos los números de esta prenda de una (ej: "01, 47, 56, 777") y quedan esperando acá para que les subas la foto uno por uno.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  placeholder="ej: 01, 47, 56, 777"
                  value={rolyInput}
                  onChange={(e) => setRolyInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRolyToQueue(); } }}
                  className="rounded-xl p-2 text-sm flex-1 min-w-[160px]"
                  style={inputStyle}
                />
                <button type="button" onClick={addRolyToQueue} className="kulto-btn text-xs font-semibold px-3 py-2 rounded-full" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                  Agregar a la cola
                </button>
              </div>
              {rolyNotFound.length > 0 && (
                <p className="text-xs mt-2" style={{ color: "var(--signal)" }}>
                  No encontré en el catálogo: {rolyNotFound.join(", ")}.
                </p>
              )}
              {rolyQueue.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {rolyQueue.map((c, i) => (
                    <button
                      type="button"
                      key={c.name + i}
                      onClick={() => useQueuedRolyColor(i)}
                      className="kulto-btn flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1"
                      style={{ background: "var(--ink)", border: "1px solid var(--line)" }}
                      title="Usar este color ahora"
                    >
                      <span className="w-4 h-4 rounded-full" style={{ background: c.hex }} />
                      <span className="text-xs" style={{ color: "var(--bone)" }}>{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {rolyQueue.length > 0 && (
                <p className="text-xs mt-2" style={{ color: "var(--slate)" }}>Tocá uno para cargarlo abajo y subirle la foto.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-2">
              <input placeholder="Nombre o número (opcional)" value={colorDraft.name} onChange={(e) => setColorDraft({ ...colorDraft, name: e.target.value })} className="rounded-xl p-2 text-sm w-32" style={inputStyle} />
              <input type="color" value={colorDraft.hex} onChange={(e) => setColorDraft({ ...colorDraft, hex: e.target.value })} className="w-10 h-9 rounded" style={{ background: "transparent" }} />
            </div>
            <div className="mb-2">
              <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
                Subí una foto para cada parte de la prenda en este color (adelante, atrás, mangas). Ninguna es obligatoria en particular, pero necesitás al menos una para que el color funcione en Personalizar.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ZONE_UPLOAD_DEFS.map((zdef) => {
                  const img = colorDraft[zdef.key];
                  return (
                    <div key={zdef.key} className="flex flex-col items-center gap-1">
                      <label
                        className="kulto-btn relative w-full rounded-xl overflow-hidden flex items-center justify-center cursor-pointer"
                        style={{ aspectRatio: "4 / 5", background: "var(--ink-3)", border: img ? "2px solid var(--sun)" : "1px dashed var(--line)" }}
                      >
                        {img ? (
                          <img loading="lazy" src={img} className="w-full h-full object-contain" alt={zdef.label} />
                        ) : (
                          <span className="flex flex-col items-center gap-1 px-1 text-center">
                            <Upload size={18} style={{ color: "var(--slate)" }} />
                            <span className="text-[10px]" style={{ color: "var(--slate)" }}>Subir foto</span>
                          </span>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => { const f = e.target.files[0]; if (f) handleZoneUpload(zdef.key, f); e.target.value = ""; }}
                        />
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-semibold" style={{ color: img ? "var(--sun)" : "var(--slate)" }}>
                          {zdef.label}
                        </span>
                        {img && (
                          <button type="button" onClick={() => removeZoneImage(zdef.key)} className="kulto-btn" style={{ color: "var(--slate)" }} title="Quitar foto">
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!colorHasAnyZoneImage(colorDraft) && (
                <p className="text-xs mt-2" style={{ color: "var(--signal)" }}>
                  Falta subir al menos una foto — sin ninguna, el cliente no puede personalizar este color.
                </p>
              )}
            </div>
            {colorError && (
              <p className="text-xs mb-2" style={{ color: "var(--signal)" }}>{colorError}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={addColor} disabled={autoGenerating} className="kulto-btn text-xs font-semibold rounded-xl px-3 py-2" style={{ background: "var(--sun)", color: "var(--ink)", opacity: autoGenerating ? 0.7 : 1 }}>
                {autoGenerating ? "Generando…" : editingColorIdx !== null ? "Guardar color" : "Agregar color"}
              </button>
              {editingColorIdx !== null && (
                <button onClick={() => { setEditingColorIdx(null); setColorDraft({ name: "", hex: "#E8452C", images: [], frontImage: null, backImage: null, sleeveLeftImage: null, sleeveRightImage: null }); }} className="kulto-btn text-xs px-3 py-2" style={{ color: "var(--slate)" }}>
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {isNew && (
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full flex items-center gap-1" style={{ border: "1px solid var(--line)", color: "var(--slate)" }}>
                <ChevronLeft size={16} /> Atrás
              </button>
              <button onClick={() => setStep(4)} className="kulto-btn text-sm font-semibold px-5 py-2.5 rounded-full flex items-center gap-1" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                Continuar <ChevronRight size={16} />
              </button>
            </div>
          )}
          </>
          )}

          {showStep(4) && (
          <>
          {/* Designs */}
          <div>
            <label className="flex items-center gap-2 text-sm mb-3" style={{ color: "var(--bone)" }}>
              <input
                type="checkbox"
                checked={draft.tags.customDesign === true}
                onChange={(e) => setDraft({ ...draft, tags: { ...draft.tags, customDesign: e.target.checked } })}
              />
              Permitir que el cliente suba su propio diseño en esta prenda
            </label>
            <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>
              Si no tildás esto ni cargás diseños abajo, el producto se vende tal cual está en la foto — no le va a aparecer al cliente el paso de "elegí tu diseño".
            </p>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Diseños propios para sublimar (opcional)</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {draft.designs.map((d, i) => (
                <div
                  key={i}
                  onClick={() => editDesign(i)}
                  className="kulto-btn flex items-center gap-1 rounded-full pl-1 pr-2 py-1"
                  style={{ background: editingDesignIdx === i ? "var(--signal)" : "var(--ink-3)" }}
                >
                  <span className="w-5 h-5 rounded-full overflow-hidden bg-white/10">{d.image && <img loading="lazy" src={d.image} className="w-full h-full object-contain" alt={d.name || "Diseño"} />}</span>
                  <span className="text-xs" style={{ color: "var(--bone)" }}>{d.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeDesign(i); }} style={{ color: "var(--bone)" }} aria-label="Quitar diseño"><X size={12} /></button>
                </div>
              ))}
            </div>
            <p className="text-xs mb-1" style={{ color: "var(--slate)" }}>Toca un diseño de la lista para editarlo.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input placeholder="Nombre del diseño" value={designDraft.name} onChange={(e) => setDesignDraft({ ...designDraft, name: e.target.value })} className="rounded-xl p-2 text-sm w-40" style={inputStyle} />
              <label className="kulto-btn text-xs flex items-center gap-1 rounded-xl px-3 py-2" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                <Upload size={14} /> Imagen
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) { const isPng = f.type === "image/png"; fileToBase64(f, (b64) => setDesignDraft((d) => ({ ...d, image: b64 })), 1000, isPng ? 1 : 0.85, isPng ? "image/png" : "image/jpeg"); } }} />
              </label>
              <button onClick={addDesign} className="kulto-btn text-xs font-semibold rounded-xl px-3 py-2" style={{ background: "var(--sun)", color: "var(--ink)" }}>
                {editingDesignIdx !== null ? "Guardar diseño" : "Agregar diseño"}
              </button>
              {editingDesignIdx !== null && (
                <button onClick={() => { setEditingDesignIdx(null); setDesignDraft({ name: "", image: "" }); }} className="kulto-btn text-xs px-3 py-2" style={{ color: "var(--slate)" }}>
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {isNew && (
            <div className="flex justify-start">
              <button onClick={() => setStep(3)} className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full flex items-center gap-1" style={{ border: "1px solid var(--line)", color: "var(--slate)" }}>
                <ChevronLeft size={16} /> Atrás
              </button>
            </div>
          )}
          </>
          )}
        </div>
      )}

      {showStep(4) && (
      <div className="flex gap-2 mt-2">
        <button disabled={saving} onClick={handleSave} className="kulto-btn flex-1 rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: "var(--signal)", color: "var(--bone)" }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {draft.id ? "Guardar cambios" : "Publicar producto"}
        </button>
        {draft.id && (
          <button onClick={() => { setDraft({ ...emptyDraft, tags: { ...emptyDraft.tags, template: defaultTemplate } }); setStep(1); onCancelEdit(); }} className="kulto-btn rounded-full px-5" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
            Cancelar
          </button>
        )}
      </div>
      )}

      {cropSource && (
        <CropModal source={cropSource} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />
      )}
    </div>
  );
}

// Las 4 fotos que puede tener una prenda para "Personalizar": frontal siempre,
// las otras tres solo si el admin las carga.
const TEMPLATE_ZONE_DEFS = [
  { key: "frontImage", label: "Frontal" },
  { key: "backImage", label: "Espalda" },
  { key: "sleeveLeftImage", label: "Manga izquierda" },
  { key: "sleeveRightImage", label: "Manga derecha" },
];

// Para quién es la prenda — algunos proveedores tienen el mismo modelo en
// talles/cortes de hombre, mujer o niños, y otros (como las oversize, por
// sueltas) sirven para cualquiera. "unisex" es el valor por defecto, así las
// prendas ya cargadas antes de este campo siguen apareciendo para todos.
const AUDIENCE_LABELS = { unisex: "Unisex", hombre: "Hombre", mujer: "Mujer", kids: "Niños" };
const AUDIENCE_OPTIONS = ["unisex", "hombre", "mujer", "kids"];

const emptyTemplateDraft = {
  id: null,
  cardImage: null,
  name: "",
  description: "",
  category: "",
  subcategory: "",
  audience: "unisex",
  price: "",
  points: "",
  sku: "",
  sizes: [],
  sizeGuide: [],
  sizeGuideImage: null,
  colors: [],
  imageFit: "contain",
  imageBackground: null,
};

const emptyTemplateColorDraft = { name: "", hex: "#E8452C", frontImage: null, backImage: null, sleeveLeftImage: null, sleeveRightImage: null };

// Formulario simplificado, solo para "Personalizar": una prenda acá es un
// tipo de prenda (ej: "Camisetas", "Sudaderas con capucha") con TODOS los
// colores en los que la tenés — el cliente los ve juntos, estilo selección de
// personaje, antes de subir su diseño. No lleva stock porque se hace bajo
// pedido, y cada color solo pide sus 4 fotos con nombre de zona (Frontal /
// Espalda / Manga izquierda / Manga derecha) — nada del formulario largo de
// "Productos" (que además maneja ofertas, fotos genéricas, etc.).
function AdminTemplateForm({ categories, templateProducts = [], onAddCategory, onSave, editing, onCancelEdit }) {
  const [draft, setDraft] = useState(emptyTemplateDraft);
  const [newCat, setNewCat] = useState("");
  const [customSize, setCustomSize] = useState("");
  const [saving, setSaving] = useState(false);
  const [colorDraft, setColorDraft] = useState(emptyTemplateColorDraft);
  const [editingColorIdx, setEditingColorIdx] = useState(null);
  const [colorError, setColorError] = useState("");
  // Cola de colores de Roly cargados por número, esperando su foto — ver
  // "Agregar por número de Roly" más abajo.
  const [rolyInput, setRolyInput] = useState("");
  const [rolyQueue, setRolyQueue] = useState([]);
  const [rolyNotFound, setRolyNotFound] = useState([]);

  // "Foto base": una sola tanda de 4 fotos (idealmente de la prenda en blanco
  // o un color bien clarito, con el fondo ya quitado) a partir de la cual se
  // puede generar automáticamente la foto de CUALQUIER color — sin tener que
  // sacarle una foto propia a cada uno. Ver tintImageToColor() más arriba.
  const [baseImages, setBaseImages] = useState({ frontImage: null, backImage: null, sleeveLeftImage: null, sleeveRightImage: null });
  const [removingBaseBg, setRemovingBaseBg] = useState(false);
  const [autoFromBase, setAutoFromBase] = useState(true);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGenProgress, setAutoGenProgress] = useState({ done: 0, total: 0 });
  const hasBaseImages = !!baseImages.frontImage;

  const handleBaseZoneUpload = (zone, file) => {
    if (!file) return;
    const isPng = file.type === "image/png";
    fileToBase64(file, (b64) => setBaseImages((b) => ({ ...b, [zone]: b64 })), 1400, isPng ? 1 : 0.9, isPng ? "image/png" : "image/jpeg");
  };
  const removeBaseZoneImage = (zone) => setBaseImages((b) => ({ ...b, [zone]: null }));

  // Les quita el fondo a las 4 fotos base de una — para que el recoloreado de
  // más abajo pinte solo la prenda y no el fondo de la foto.
  const handleRemoveBaseBackground = async () => {
    setRemovingBaseBg(true);
    const zones = TEMPLATE_ZONE_DEFS.map((z) => z.key);
    for (const zone of zones) {
      const current = baseImages[zone];
      if (!current) continue;
      const cleaned = await removeImageBackground(current);
      if (cleaned) {
        const uploaded = await uploadDataUrlToStorage(cleaned);
        setBaseImages((b) => ({ ...b, [zone]: uploaded || cleaned }));
      }
    }
    setRemovingBaseBg(false);
  };

  // Genera las 4 fotos de UN color a partir de la foto base, ya subidas a
  // Storage (listas para guardarse como un color más, igual que si las
  // hubieras subido a mano). Si la subida a Storage falla, usamos la imagen
  // generada tal cual (más pesada) como respaldo para no perder el color —
  // pero avisamos con "usedFallback" porque guardar muchos colores así de
  // pesados es lo que puede hacer fallar el guardado del producto entero.
  const generateColorFromBase = (hex) => generateColorFromBaseImages(baseImages, hex);

  // Genera y agrega de una todos los colores que estén esperando en la cola
  // de Roly, sin tener que subirles la foto uno por uno.
  const generateAllQueuedFromBase = async () => {
    if (!hasBaseImages || rolyQueue.length === 0) return;
    setAutoGenerating(true);
    setAutoGenProgress({ done: 0, total: rolyQueue.length });
    setSaveError("");
    const queue = rolyQueue;
    const newColors = [];
    let fallbackCount = 0;
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      const { images: zones, usedFallback } = await generateColorFromBase(c.hex);
      if (usedFallback) fallbackCount += 1;
      newColors.push({
        name: c.name,
        hex: c.hex,
        images: [zones.frontImage, zones.backImage, zones.sleeveLeftImage, zones.sleeveRightImage].filter(Boolean),
        frontImage: zones.frontImage || null,
        backImage: zones.backImage || null,
        sleeveLeftImage: zones.sleeveLeftImage || null,
        sleeveRightImage: zones.sleeveRightImage || null,
      });
      setAutoGenProgress({ done: i + 1, total: queue.length });
    }
    setDraft((d) => ({ ...d, colors: [...d.colors, ...newColors] }));
    setRolyQueue([]);
    setAutoGenerating(false);
    // Si varias fotos no se pudieron subir a Storage, quedaron guardadas
    // "pesadas" adentro del color — avisamos ahora, antes de que el admin
    // intente guardar y se encuentre con el problema recién ahí sin saber
    // por qué.
    if (fallbackCount > 0) {
      setSaveError(`${fallbackCount} de ${queue.length} colores no se pudieron subir a Storage y quedaron más pesados de lo normal — revisá tu conexión. Si al guardar da error, probá generarlos de a tandas más chicas.`);
    }
  };

  // Subgrupos ya usados dentro de la categoría elegida (ej: "Con capucha" /
  // "Sin capucha" dentro de "Sudaderas") — para sugerirlos con datalist sin
  // tener que mantener una lista aparte.
  const subcategorySuggestions = Array.from(
    new Set(
      templateProducts
        .filter((p) => p.category === draft.category && p.subcategory)
        .map((p) => p.subcategory)
    )
  );

  useEffect(() => {
    if (editing) {
      setDraft({
        id: editing.id,
        name: editing.name || "",
        description: editing.description || "",
        category: editing.category || "",
        subcategory: editing.subcategory || "",
        audience: editing.audience || "unisex",
        price: editing.price != null ? String(editing.price) : "",
        points: editing.points != null ? String(editing.points) : "",
        sku: editing.sku || "",
        sizes: editing.sizes || [],
        sizeGuide: editing.sizeGuide || [],
        sizeGuideImage: editing.sizeGuideImage || null,
        colors: (editing.colors || []).map((c) => ({
          name: c.name || "",
          hex: c.hex || "#E8452C",
          frontImage: c.frontImage || null,
          backImage: c.backImage || null,
          sleeveLeftImage: c.sleeveLeftImage || null,
          sleeveRightImage: c.sleeveRightImage || null,
        })),
        imageFit: editing.imageFit || "contain",
        imageBackground: editing.imageBackground ?? null,
        cardImage: editing.cardImage || null,
      });
      // La foto base queda guardada junto con la prenda, así no hay que
      // volver a subirla cada vez que se edita (y la carga masiva por
      // subcategoría puede usarla sin pedírsela al admin de nuevo).
      setBaseImages({
        frontImage: editing.baseImages?.frontImage || null,
        backImage: editing.baseImages?.backImage || null,
        sleeveLeftImage: editing.baseImages?.sleeveLeftImage || null,
        sleeveRightImage: editing.baseImages?.sleeveRightImage || null,
      });
    } else {
      setDraft({ ...emptyTemplateDraft, category: categories[0] || "" });
      setBaseImages({ frontImage: null, backImage: null, sleeveLeftImage: null, sleeveRightImage: null });
    }
    setColorDraft(emptyTemplateColorDraft);
    setEditingColorIdx(null);
    setColorError("");
    setCustomSize("");
  }, [editing]);

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  const handleZoneUpload = (zone, file) => {
    if (!file) return;
    const isPng = file.type === "image/png";
    fileToBase64(file, (b64) => setColorDraft((c) => ({ ...c, [zone]: b64 })), 1400, isPng ? 1 : 0.9, isPng ? "image/png" : "image/jpeg");
  };
  const removeZoneImage = (zone) => setColorDraft((c) => ({ ...c, [zone]: null }));
  const colorHasAnyPhoto = (c) => !!(c.frontImage || c.backImage || c.sleeveLeftImage || c.sleeveRightImage);

  const addColor = async () => {
    // Si no subiste fotos a mano para este color pero hay una foto base
    // cargada y el modo automático está activado, las generamos solas antes
    // de guardar — así no hace falta fotografiar cada color por separado.
    let source = colorDraft;
    if (!colorHasAnyPhoto(colorDraft) && autoFromBase && hasBaseImages) {
      setAutoGenerating(true);
      const { images: zones } = await generateColorFromBase(colorDraft.hex);
      setAutoGenerating(false);
      source = { ...colorDraft, ...zones };
    }
    if (!colorHasAnyPhoto(source)) { setColorError("Subí al menos la foto frontal de este color, o cargá una foto base arriba para generarlo solo."); return; }
    setColorError("");
    const finalColor = source.name.trim()
      ? source
      : { ...source, name: `Color ${draft.colors.length + 1}` };
    if (editingColorIdx !== null) {
      setDraft((d) => ({ ...d, colors: d.colors.map((c, i) => (i === editingColorIdx ? finalColor : c)) }));
    } else {
      setDraft((d) => ({ ...d, colors: [...d.colors, finalColor] }));
    }
    setColorDraft(emptyTemplateColorDraft);
    setEditingColorIdx(null);
  };
  const editColor = (i) => { setColorDraft(draft.colors[i]); setEditingColorIdx(i); setColorError(""); };
  const cancelColorEdit = () => { setColorDraft(emptyTemplateColorDraft); setEditingColorIdx(null); setColorError(""); };
  const removeColor = (i) => {
    setDraft((d) => ({ ...d, colors: d.colors.filter((_, idx) => idx !== i) }));
    if (editingColorIdx === i) cancelColorEdit();
  };
  const addRolyToQueue = () => {
    if (!rolyInput.trim()) return;
    const { found, notFound } = lookupRolyColorsByNumbers(rolyInput);
    setRolyQueue((q) => {
      const already = new Set(q.map((c) => c.name));
      return [...q, ...found.filter((c) => !already.has(c.name))];
    });
    setRolyNotFound(notFound);
    setRolyInput("");
  };
  const useQueuedRolyColor = (i) => {
    const c = rolyQueue[i];
    if (!c) return;
    setColorDraft((d) => ({ ...d, name: c.name, hex: c.hex }));
    setRolyQueue((q) => q.filter((_, idx) => idx !== i));
  };
  // La foto que se ve en la tarjeta de esta prenda en el paso 1 de
  // "Personalizar" (y en la lista del panel) es siempre la del primer color
  // de la lista — antes eso quedaba fijado por el orden en que se cargaban
  // los colores, sin forma de elegirlo. Poner un color de "portada" lo manda
  // al principio de la lista, sin tocar nada más.
  const makeColorCover = (i) => {
    setDraft((d) => {
      if (i === 0) return d;
      const next = [...d.colors];
      const [c] = next.splice(i, 1);
      next.unshift(c);
      return { ...d, colors: next };
    });
    // Si estaba editando un color, cancelamos esa edición para no dejar el
    // formulario apuntando a un índice que ya cambió de lugar.
    if (editingColorIdx !== null) cancelColorEdit();
  };

  const toggleSize = (s) => setDraft((d) => ({ ...d, sizes: d.sizes.includes(s) ? d.sizes.filter((x) => x !== s) : [...d.sizes, s] }));
  const addCustomSize = () => {
    const s = customSize.trim().toUpperCase();
    if (!s || draft.sizes.includes(s)) return;
    setDraft((d) => ({ ...d, sizes: [...d.sizes, s] }));
    setCustomSize("");
  };

  const addCat = () => {
    if (!newCat.trim()) return;
    onAddCategory(newCat.trim());
    setDraft((d) => ({ ...d, category: newCat.trim() }));
    setNewCat("");
  };

  const ready = !!(draft.name.trim() && draft.category && draft.colors.length > 0);
  const [saveError, setSaveError] = useState("");

  const handleSave = async () => {
    if (!ready) return;
    setSaving(true);
    setSaveError("");
    const product = {
      id: draft.id || genId("p"),
      name: draft.name.trim(),
      description: draft.description.trim(),
      category: draft.category,
      subcategory: draft.subcategory.trim(),
      audience: draft.audience || "unisex",
      group: "",
      price: draft.price.toString().trim() ? Number(draft.price) : null,
      // Vacío = usa el puntaje general de Ajustes → Fidelización, igual que
      // en el formulario de productos normales.
      points: draft.points === "" || draft.points === null || draft.points === undefined ? null : Number(draft.points) || 0,
      // Código corto de referencia (ej: "BEAGLE-001") en vez del id interno.
      sku: draft.sku.trim() || generateSku(draft.name, templateProducts.filter((p) => p.id !== draft.id)),
      salePrice: null,
      // Bajo pedido — no se controla stock para las prendas de Personalizar.
      stock: 9999,
      tags: { bestseller: false, oferta: false, tendencia: false, template: true, customDesign: false },
      colors: draft.colors.map((c) => ({
        name: c.name.trim() || "Único",
        hex: c.hex,
        images: [c.frontImage, c.backImage, c.sleeveLeftImage, c.sleeveRightImage].filter(Boolean),
        frontImage: c.frontImage,
        backImage: c.backImage,
        sleeveLeftImage: c.sleeveLeftImage,
        sleeveRightImage: c.sleeveRightImage,
      })),
      designs: [],
      sizes: draft.sizes,
      photoPool: [],
      imageFit: draft.imageFit || "contain",
      imageBackground: draft.imageBackground ?? null,
      cardImage: draft.cardImage || null,
      sizeGuide: draft.sizeGuide || [],
      sizeGuideImage: draft.sizeGuideImage || null,
      // Guardamos la foto base junto con la prenda (si se cargó una) para no
      // tener que volver a subirla cada vez, y para que "Aplicar colores a
      // una subcategoría" pueda generar colores de esta prenda sin pedirla.
      baseImages: hasBaseImages
        ? {
            frontImage: baseImages.frontImage || null,
            backImage: baseImages.backImage || null,
            sleeveLeftImage: baseImages.sleeveLeftImage || null,
            sleeveRightImage: baseImages.sleeveRightImage || null,
          }
        : null,
      createdAt: editing?.createdAt || Date.now(),
      salesCount: editing?.salesCount || 0,
    };
    const result = await onSave(product);
    setSaving(false);
    // Si el guardado falló (por ejemplo, porque entre todas las fotos de los
    // colores quedó demasiado pesado para guardarse de una), avisamos y NO
    // reiniciamos el formulario — así no se pierde todo el trabajo de haber
    // generado los colores, y se puede reintentar (por ejemplo, sacando
    // alguno de los colores más pesados) sin tener que cargar todo de nuevo.
    if (result && result.ok === false) {
      setSaveError(result.error || "No se pudo guardar. Revisá tu conexión y probá de nuevo.");
      return;
    }
    setDraft({ ...emptyTemplateDraft, category: categories[0] || "" });
    setColorDraft(emptyTemplateColorDraft);
    setEditingColorIdx(null);
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>{draft.id ? "Editar prenda para personalizar" : "Nueva prenda para personalizar"}</h4>
      <p className="text-xs" style={{ color: "var(--slate)" }}>
        Esta es una prenda (ej: "Camisetas", "Sudaderas con capucha") con todos los colores en los que la tenés — el cliente los va a ver juntos para elegir, como elegir un personaje, y recién ahí sube su diseño. No lleva stock porque se hace bajo pedido.
      </p>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Nombre de la prenda</label>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ej: Camisetas oversize" className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Descripción (de qué está hecha, composición, etc.)</label>
        <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} placeholder="Ej: 100% algodón peinado, 220 g/m², oversize. Sublimación de alta duración." className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Se muestra cuando el cliente pasa el mouse (o toca, en el celular) sobre esta prenda al elegirla en "Personalizar".
        </p>
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Categoría</label>
        <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="w-full rounded-xl p-3 text-sm" style={inputStyle}>
          <option value="">Elegí una...</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex gap-2 mt-2">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nueva categoría" className="flex-1 rounded-xl p-2 text-xs" style={inputStyle} />
          <button onClick={addCat} className="kulto-btn text-xs font-semibold rounded-xl px-3" style={{ background: "var(--sun)", color: "var(--ink)" }}>Añadir</button>
        </div>
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Subgrupo / estilo (opcional)</label>
        <input
          list="template-subcategory-options"
          value={draft.subcategory}
          onChange={(e) => setDraft({ ...draft, subcategory: e.target.value })}
          placeholder="Ej: Con capucha, Oversize, Cuello en V..."
          className="w-full rounded-xl p-3 text-sm"
          style={inputStyle}
        />
        <datalist id="template-subcategory-options">
          {subcategorySuggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Si esta categoría tiene varios estilos (ej: en "Sudaderas": con o sin capucha), agrupalos acá. Si la dejás vacía, la prenda aparece directo dentro de la categoría.
        </p>
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Para quién es</label>
        <select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value })} className="w-full rounded-xl p-3 text-sm" style={inputStyle}>
          {AUDIENCE_OPTIONS.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>)}
        </select>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Elegí "Unisex" si el corte es suelto y le queda bien a cualquiera (ej: la mayoría de las oversize). Si el proveedor la vende puntualmente para hombre, mujer o niños, elegí esa opción — el cliente va a poder filtrar por esto al elegir el modelo.
        </p>
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Fondo de la prenda (opcional)</label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--bone)" }}>
            <input
              type="checkbox"
              checked={draft.imageBackground !== null}
              onChange={(e) => setDraft((d) => ({ ...d, imageBackground: e.target.checked ? "#FFFFFF" : null }))}
            />
            Elegir un color de fondo para el espacio que sobra
          </label>
          {draft.imageBackground !== null && (
            <input
              type="color"
              value={draft.imageBackground}
              onChange={(e) => setDraft((d) => ({ ...d, imageBackground: e.target.value }))}
              className="w-9 h-9 rounded"
              style={{ background: "transparent" }}
            />
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          {draft.imageBackground === null
            ? "Por defecto, el espacio alrededor de la foto usa el color de la prenda."
            : "Ese color se usa detrás de la foto en vez del color de la prenda."}
        </p>
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Precio de esta prenda (opcional)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={draft.price}
          onChange={(e) => setDraft({ ...draft, price: e.target.value })}
          placeholder={`Vacío = usa la tarifa general de Personalizar`}
          className="w-full rounded-xl p-3 text-sm"
          style={inputStyle}
        />
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Dejalo vacío para usar la tarifa fija general (Ajustes → Personalizar). Completalo solo si esta prenda en particular tiene un precio distinto (ej: por su gramaje o tela).
        </p>
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Puntos de fidelización (opcional)</label>
        <input
          type="number"
          min="0"
          value={draft.points}
          onChange={(e) => setDraft({ ...draft, points: e.target.value })}
          placeholder="Vacío = usa el general"
          className="w-full rounded-xl p-3 text-sm"
          style={inputStyle}
        />
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Cuántos puntos suma pedir esta prenda personalizada (por unidad). Dejalo vacío para usar el puntaje general de Ajustes → Fidelización.
        </p>
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Código de referencia (opcional)</label>
        <input
          type="text"
          value={draft.sku}
          onChange={(e) => setDraft({ ...draft, sku: e.target.value.toUpperCase() })}
          placeholder="Vacío = se genera solo, ej: BEAGLE-001"
          className="w-full rounded-xl p-3 text-sm"
          style={inputStyle}
        />
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Se usa como referencia corta en vez de un código largo — aparece en el mensaje de WhatsApp del pedido.
        </p>
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Foto de la tarjeta (al elegir el modelo)</label>
        <div className="flex items-center gap-3">
          <div className="w-16 h-20 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ background: "var(--ink-3)", border: draft.cardImage ? "2px solid var(--sun)" : "1px solid var(--line)" }}>
            {(draft.cardImage || draft.colors?.[0]?.frontImage || draft.colors?.[0]?.images?.[0]) ? (
              <FastImg loading="lazy" src={draft.cardImage || draft.colors?.[0]?.frontImage || draft.colors?.[0]?.images?.[0]} className="w-full h-full object-contain p-1" alt="Foto de la tarjeta" />
            ) : (
              <Shirt size={18} color="rgba(243,239,230,0.4)" />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <label className="kulto-btn text-xs px-3 py-1.5 rounded-full cursor-pointer" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                {draft.cardImage ? "Cambiar foto" : "Elegir foto"}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    e.target.value = "";
                    if (!file) return;
                    fileToBase64(file, (b64) => setDraft((d) => ({ ...d, cardImage: b64 })), 1200, 0.88, file.type === "image/png" ? "image/png" : "image/jpeg");
                  }}
                />
              </label>
              {draft.cardImage && <button onClick={() => setDraft({ ...draft, cardImage: null })} className="kulto-btn text-xs" style={{ color: "var(--signal)" }}>Quitar</button>}
            </div>
            <p className="text-xs" style={{ color: "var(--slate)" }}>
              {draft.cardImage ? "Esta foto se ve en la tarjeta de este modelo." : "Automática: se usa la foto del color de portada. Subí una acá si querés otra distinta."} No cambia las fotos de los colores. Recordá guardar la prenda.
            </p>
          </div>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Colores ({draft.colors.length})</p>
        <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
          Agregá uno por cada color en el que tenés esta prenda — todos van a aparecer juntos para que el cliente elija. El primero (marcado "Portada") es la foto que se muestra en la tarjeta de esta prenda al elegir el modelo — tocá la estrella para cambiarlo.
        </p>
        {draft.colors.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {draft.colors.map((c, i) => (
              <div
                key={i}
                onClick={() => editColor(i)}
                className="kulto-btn flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1"
                style={{ background: editingColorIdx === i ? "var(--signal)" : "var(--ink-3)", border: i === 0 ? "1px solid var(--sun)" : "1px solid var(--line)" }}
              >
                <span className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ background: c.hex }}>
                  {c.frontImage && <FastImg loading="lazy" src={c.frontImage} className="w-full h-full object-contain" alt={c.name || "Color"} />}
                </span>
                <span className="text-xs" style={{ color: "var(--bone)" }}>{c.name || "(sin nombre)"}</span>
                {i === 0 ? (
                  <span className="text-[9px] font-semibold" style={{ color: "var(--sun)" }} title="Esta es la foto de portada">Portada</span>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); makeColorCover(i); }} style={{ color: "var(--sun)" }} title="Poner de portada" aria-label="Poner este color de portada">
                    <Star size={12} />
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); removeColor(i); }} style={{ color: "var(--bone)" }} aria-label="Quitar color"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-3 rounded-xl p-3 flex flex-col gap-3" style={{ background: "var(--ink-3)", border: "1px dashed var(--sun)" }}>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--sun)" }}>Foto base (generar colores automáticamente)</p>
            <p className="text-xs" style={{ color: "var(--slate)" }}>
              Subí acá UNA sola tanda de fotos de esta prenda — lo ideal es que sea blanca o de un color bien clarito. A partir de esto, el sistema puede generar solo la foto de cualquier otro color (sin tener que fotografiar cada uno), conservando los pliegues y las sombras de la tela. Funciona mejor si primero le quitás el fondo con el botón de abajo.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TEMPLATE_ZONE_DEFS.map((zdef) => {
              const img = baseImages[zdef.key];
              return (
                <div key={zdef.key} className="flex flex-col items-center gap-1">
                  <label
                    className="kulto-btn relative w-full rounded-xl overflow-hidden flex items-center justify-center cursor-pointer"
                    style={{ aspectRatio: "4 / 5", background: "var(--ink)", border: img ? "2px solid var(--sun)" : "1px dashed var(--line)" }}
                  >
                    {img ? (
                      <img loading="lazy" src={img} className="w-full h-full object-contain" alt={zdef.label} />
                    ) : (
                      <span className="flex flex-col items-center gap-1 px-1 text-center">
                        <Upload size={18} style={{ color: "var(--slate)" }} />
                        <span className="text-[10px]" style={{ color: "var(--slate)" }}>Subir foto</span>
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files[0]; if (f) handleBaseZoneUpload(zdef.key, f); e.target.value = ""; }}
                    />
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold" style={{ color: img ? "var(--sun)" : "var(--slate)" }}>{zdef.label}</span>
                    {img && (
                      <button type="button" onClick={() => removeBaseZoneImage(zdef.key)} className="kulto-btn" style={{ color: "var(--slate)" }} title="Quitar foto">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {hasBaseImages && (
            <button
              type="button"
              onClick={handleRemoveBaseBackground}
              disabled={removingBaseBg}
              className="kulto-btn text-xs font-semibold rounded-xl px-3 py-2 self-start"
              style={{ background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
            >
              {removingBaseBg ? "Quitando fondo…" : "Quitar fondo automáticamente a estas fotos"}
            </button>
          )}
          {hasBaseImages && (
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--bone)" }}>
              <input type="checkbox" checked={autoFromBase} onChange={(e) => setAutoFromBase(e.target.checked)} />
              Generar automáticamente los colores que agregue de ahora en más (si no les subo fotos propias)
            </label>
          )}
        </div>

        <div className="mb-3 rounded-xl p-3" style={{ background: "var(--ink-3)", border: "1px dashed var(--line)" }}>
          <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
            Agregar por número de Roly: escribí todos los números de esta prenda de una (ej: "01, 47, 56, 777") y quedan esperando acá para que les subas la foto uno por uno{hasBaseImages ? ", o generalas todas de una con el botón de abajo" : ""}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              placeholder="ej: 01, 47, 56, 777"
              value={rolyInput}
              onChange={(e) => setRolyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRolyToQueue(); } }}
              className="rounded-xl p-2 text-sm flex-1 min-w-[160px]"
              style={inputStyle}
            />
            <button type="button" onClick={addRolyToQueue} className="kulto-btn text-xs font-semibold px-3 py-2 rounded-full" style={{ background: "var(--signal)", color: "var(--bone)" }}>
              Agregar a la cola
            </button>
          </div>
          {rolyNotFound.length > 0 && (
            <p className="text-xs mt-2" style={{ color: "var(--signal)" }}>
              No encontré en el catálogo: {rolyNotFound.join(", ")}.
            </p>
          )}
          {rolyQueue.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {rolyQueue.map((c, i) => (
                <button
                  type="button"
                  key={c.name + i}
                  onClick={() => useQueuedRolyColor(i)}
                  className="kulto-btn flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1"
                  style={{ background: "var(--ink)", border: "1px solid var(--line)" }}
                  title="Usar este color ahora"
                >
                  <span className="w-4 h-4 rounded-full" style={{ background: c.hex }} />
                  <span className="text-xs" style={{ color: "var(--bone)" }}>{c.name}</span>
                </button>
              ))}
            </div>
          )}
          {rolyQueue.length > 0 && hasBaseImages && (
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={generateAllQueuedFromBase}
                disabled={autoGenerating}
                className="kulto-btn text-xs font-semibold rounded-full px-4 py-2.5 self-start flex items-center gap-2"
                style={{ background: "var(--sun)", color: "var(--ink)" }}
              >
                {autoGenerating ? <Loader2 size={14} className="animate-spin" /> : null}
                {autoGenerating
                  ? `Generando… (${autoGenProgress.done}/${autoGenProgress.total})`
                  : `Generar fotos para los ${rolyQueue.length} colores de la cola, automáticamente`}
              </button>
              <p className="text-[11px]" style={{ color: "var(--slate)" }}>
                Esto crea los {rolyQueue.length} colores de una, usando la foto base de arriba — no hace falta tocar ninguno a mano. Dejá esta pantalla abierta mientras termina.
              </p>
            </div>
          )}
          {rolyQueue.length > 0 && (
            <p className="text-xs mt-2" style={{ color: "var(--slate)" }}>
              {hasBaseImages ? "O tocá uno para cargarlo abajo y subirle una foto propia." : "Tocá uno para cargarlo abajo y subirle la foto."}
            </p>
          )}
        </div>

        <div className="rounded-2xl p-3 flex flex-col gap-3" style={{ background: "var(--ink-3)", border: "1px dashed var(--line)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--bone)" }}>
            {editingColorIdx !== null ? "Editando color" : "Agregar color"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input placeholder="Nombre o número (opcional)" value={colorDraft.name} onChange={(e) => setColorDraft({ ...colorDraft, name: e.target.value })} className="rounded-xl p-2 text-sm w-36" style={inputStyle} />
            <input type="color" value={colorDraft.hex} onChange={(e) => setColorDraft({ ...colorDraft, hex: e.target.value })} className="w-10 h-9 rounded" style={{ background: "transparent" }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TEMPLATE_ZONE_DEFS.map((zdef) => {
              const img = colorDraft[zdef.key];
              return (
                <div key={zdef.key} className="flex flex-col items-center gap-1">
                  <label
                    className="kulto-btn relative w-full rounded-xl overflow-hidden flex items-center justify-center cursor-pointer"
                    style={{ aspectRatio: "4 / 5", background: "var(--ink)", border: img ? "2px solid var(--sun)" : "1px dashed var(--line)" }}
                  >
                    {img ? (
                      <img loading="lazy" src={img} className="w-full h-full object-contain" alt={zdef.label} />
                    ) : (
                      <span className="flex flex-col items-center gap-1 px-1 text-center">
                        <Upload size={18} style={{ color: "var(--slate)" }} />
                        <span className="text-[10px]" style={{ color: "var(--slate)" }}>Subir foto</span>
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files[0]; if (f) handleZoneUpload(zdef.key, f); e.target.value = ""; }}
                    />
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold" style={{ color: img ? "var(--sun)" : "var(--slate)" }}>{zdef.label}</span>
                    {img && (
                      <button type="button" onClick={() => removeZoneImage(zdef.key)} className="kulto-btn" style={{ color: "var(--slate)" }} title="Quitar foto">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {colorError && <p className="text-xs" style={{ color: "var(--signal)" }}>{colorError}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={addColor} className="kulto-btn text-xs font-semibold rounded-xl px-3 py-2" style={{ background: "var(--sun)", color: "var(--ink)" }}>
              {editingColorIdx !== null ? "Guardar color" : "Agregar color"}
            </button>
            {editingColorIdx !== null && (
              <button onClick={cancelColorEdit} className="kulto-btn text-xs px-3 py-2" style={{ color: "var(--slate)" }}>
                Cancelar edición
              </button>
            )}
          </div>
        </div>
        {draft.colors.length === 0 && (
          <p className="text-xs mt-2" style={{ color: "var(--signal)" }}>Agregá al menos un color antes de publicar.</p>
        )}
      </div>

      <div>
        <label className="text-xs mb-2 block" style={{ color: "var(--bone)" }}>Talles (opcional)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {SIZE_PRESETS.map((s) => (
            <button key={s} onClick={() => toggleSize(s)} className="kulto-btn text-xs font-semibold rounded-full px-3 py-1.5" style={{ background: draft.sizes.includes(s) ? "var(--sun)" : "var(--ink-3)", color: draft.sizes.includes(s) ? "var(--ink)" : "var(--bone)" }}>
              {s}
            </button>
          ))}
          {draft.sizes.filter((s) => !SIZE_PRESETS.includes(s)).map((s) => (
            <button key={s} onClick={() => toggleSize(s)} className="kulto-btn text-xs font-semibold rounded-full px-3 py-1.5" style={{ background: "var(--sun)", color: "var(--ink)" }}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={customSize} onChange={(e) => setCustomSize(e.target.value)} placeholder="Otro talle" className="flex-1 rounded-xl p-2 text-xs" style={inputStyle} />
          <button onClick={addCustomSize} className="kulto-btn text-xs font-semibold rounded-xl px-3" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>Añadir</button>
        </div>
      </div>

      {draft.sizes.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Guía de talles (opcional)</p>
          <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
            El cliente la ve al elegir el talle en "Personalizar" — cargarla ayuda a evitar devoluciones o quejas por el talle equivocado. Dejalo vacío si no querés mostrar guía en esta prenda.
          </p>
          {draft.sizes.map((s) => {
            const row = draft.sizeGuide?.find((g) => g.size === s);
            return (
              <div key={s} className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold w-14 shrink-0" style={{ color: "var(--bone)" }}>{s}</span>
                <input
                  placeholder="Ej: Pecho 96cm · Largo 70cm"
                  value={row?.measurements || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraft((d) => {
                      const rest = (d.sizeGuide || []).filter((g) => g.size !== s);
                      const next = val.trim() ? [...rest, { size: s, measurements: val }] : rest;
                      return { ...d, sizeGuide: next };
                    });
                  }}
                  className="rounded-xl p-2 text-sm flex-1"
                  style={inputStyle}
                />
              </div>
            );
          })}
          <div className="mt-3">
            <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
              ¿Preferís mostrar una foto con las medidas (por ejemplo, la tabla de talles del fabricante) en vez de escribirlas a mano? Subila acá — se muestra junto con (o en lugar de) la tabla de arriba.
            </p>
            <div className="flex items-center gap-3">
              {draft.sizeGuideImage && (
                <img src={draft.sizeGuideImage} alt="Guía de talles" className="w-20 h-20 object-cover rounded-xl" style={{ border: "1px solid var(--line)" }} />
              )}
              <label className="kulto-btn text-xs font-semibold rounded-xl px-3 py-2 cursor-pointer" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}>
                {draft.sizeGuideImage ? "Cambiar imagen" : "Subir imagen"}
                <input
                  type="file" accept="image/png, image/jpeg" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const isPng = f.type === "image/png";
                    fileToBase64(f, (b64) => setDraft((d) => ({ ...d, sizeGuideImage: b64 })), 1200, isPng ? 1 : 0.88, isPng ? "image/png" : "image/jpeg");
                  }}
                />
              </label>
              {draft.sizeGuideImage && (
                <button onClick={() => setDraft((d) => ({ ...d, sizeGuideImage: null }))} className="kulto-btn text-xs" style={{ color: "var(--signal)" }}>Quitar</button>
              )}
            </div>
          </div>
        </div>
      )}

      {saveError && (
        <p className="text-xs rounded-xl p-3" style={{ color: "var(--signal)", background: "var(--ink-2)", border: "1px solid var(--signal)" }}>
          No se guardó: {saveError}
        </p>
      )}
      <div className="flex gap-2 mt-1">
        <button
          disabled={!ready || saving}
          onClick={handleSave}
          className="kulto-btn flex-1 rounded-full py-3 font-semibold flex items-center justify-center gap-2"
          style={{ background: ready ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)", opacity: ready ? 1 : 0.6 }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {draft.id ? "Guardar cambios" : "Publicar prenda"}
        </button>
        {draft.id && (
          <button onClick={() => { setDraft({ ...emptyTemplateDraft, category: categories[0] || "" }); setColorDraft(emptyTemplateColorDraft); setEditingColorIdx(null); onCancelEdit(); }} className="kulto-btn rounded-full px-5" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

function AdminPhotoInbox({ inbox, draftProducts, categories, groups = [], onAddFiles, onCreateProduct, onAddToExisting, onRemove }) {
  const [selected, setSelected] = useState([]);
  const [mode, setMode] = useState(null); // null | "new" | "existing"
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [existingId, setExistingId] = useState("");
  const [busy, setBusy] = useState(false);
  // Para elegir varias fotos rápido sin tocarlas una por una: click normal
  // marca/desmarca una sola; Shift+click marca todo el rango desde la
  // última que tocaste; y arrastrando el mouse sobre la grilla (como
  // seleccionar íconos en el escritorio) se marcan todas las que toque el
  // recuadro. "Marcar todo" hace lo mismo de una.
  const lastClickedRef = useRef(null);
  const itemRefs = useRef({});
  const dragInfoRef = useRef(null); // { startX, startY, moved }
  const [dragRect, setDragRect] = useState(null); // en coordenadas de pantalla (clientX/Y)

  const toggleSelect = (id, index, shiftKey) => {
    if (shiftKey && lastClickedRef.current != null) {
      const [from, to] = [lastClickedRef.current, index].sort((a, b) => a - b);
      const rangeIds = inbox.slice(from, to + 1).map((it) => it.id);
      setSelected((prev) => Array.from(new Set([...prev, ...rangeIds])));
    } else {
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    }
    lastClickedRef.current = index;
  };
  const selectAll = () => setSelected(inbox.map((i) => i.id));
  const selectNone = () => setSelected([]);

  const rectsIntersect = (a, b) => !(b.left > a.right || b.right < a.left || b.top > a.bottom || b.bottom < a.top);

  const onGridMouseDown = (e) => {
    if (e.button !== 0) return;
    dragInfoRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragInfoRef.current) return;
      const { startX, startY } = dragInfoRef.current;
      if (!dragInfoRef.current.moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
      dragInfoRef.current.moved = true;
      setDragRect({
        left: Math.min(startX, e.clientX), right: Math.max(startX, e.clientX),
        top: Math.min(startY, e.clientY), bottom: Math.max(startY, e.clientY),
      });
    };
    const onUp = () => {
      if (dragInfoRef.current?.moved) {
        setDragRect((rect) => {
          if (rect) {
            const idsInRect = [];
            for (const item of inbox) {
              const el = itemRefs.current[item.id];
              if (!el) continue;
              if (rectsIntersect(rect, el.getBoundingClientRect())) idsInRect.push(item.id);
            }
            if (idsInRect.length) setSelected((prev) => Array.from(new Set([...prev, ...idsInRect])));
          }
          return null;
        });
      }
      dragInfoRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [inbox]);

  const selectedImages = inbox.filter((i) => selected.includes(i.id)).map((i) => i.image);
  const inputStyle = { background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" };

  const reset = () => { setSelected([]); setMode(null); setNewName(""); setNewCategory(""); setNewGroup(""); setNewPrice(""); setExistingId(""); };

  const confirmNew = async () => {
    if (!newName.trim() || !newCategory || !newPrice) return;
    setBusy(true);
    await onCreateProduct({ name: newName.trim(), category: newCategory, group: newGroup, price: newPrice }, selectedImages, selected);
    setBusy(false);
    reset();
  };
  const confirmExisting = async () => {
    if (!existingId) return;
    setBusy(true);
    await onAddToExisting(existingId, selectedImages, selected);
    setBusy(false);
    reset();
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Subida masiva de fotos</h4>
          <p className="text-xs" style={{ color: "var(--slate)" }}>Subí todos tus mockups de una vez. Después elegís, foto por foto (o varias juntas), a qué producto van.</p>
        </div>
        <label className="kulto-btn shrink-0 text-xs font-semibold rounded-xl px-3 py-2 flex items-center gap-1" style={{ background: "var(--signal)", color: "var(--bone)" }}>
          <Upload size={14} /> Subir fotos
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files.length) onAddFiles(e.target.files); e.target.value = ""; }}
          />
        </label>
      </div>

      {inbox.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--slate)" }}>No hay fotos esperando para asignar.</p>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs" style={{ color: "var(--sun)" }}>
              {inbox.length} foto(s) sin asignar{selected.length > 0 ? ` · ${selected.length} seleccionada(s)` : ""}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                Marcar todo
              </button>
              {selected.length > 0 && (
                <button onClick={selectNone} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                  Ninguno
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px]" style={{ color: "var(--slate)" }}>
            Tip: arrastrá el mouse sobre las fotos para marcar varias de una, o mantené Shift al hacer click para marcar todo un rango.
          </p>
          <div className="flex flex-wrap gap-2 select-none" onMouseDown={onGridMouseDown}>
            {inbox.map((item, idx) => (
              <div key={item.id} className="relative" ref={(el) => { itemRefs.current[item.id] = el; }}>
                <button
                  onClick={(e) => toggleSelect(item.id, idx, e.shiftKey)}
                  className="kulto-btn w-16 h-16 rounded-lg overflow-hidden"
                  style={{ border: selected.includes(item.id) ? "2px solid var(--sun)" : "1px solid var(--line)", background: "var(--ink-3)" }}
                >
                  <img loading="lazy" src={item.image} className="w-full h-full object-contain pointer-events-none" alt="" />
                  {selected.includes(item.id) && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: "rgba(21,19,26,0.5)" }}>
                      <Check size={18} color="var(--sun)" />
                    </span>
                  )}
                </button>
                <button
                  onClick={() => onRemove([item.id])}
                  className="kulto-btn absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            {dragRect && (
              <div
                className="fixed pointer-events-none"
                style={{
                  left: dragRect.left, top: dragRect.top,
                  width: dragRect.right - dragRect.left, height: dragRect.bottom - dragRect.top,
                  background: "rgba(244,196,48,0.15)", border: "1px solid var(--sun)", zIndex: 999,
                }}
              />
            )}
          </div>

          {selected.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl p-3" style={{ background: "var(--ink-3)" }}>
              {!mode && (
                <div className="flex gap-2">
                  <button onClick={() => setMode("new")} className="kulto-btn flex-1 text-xs font-semibold rounded-xl py-2.5" style={{ background: "var(--sun)", color: "var(--ink)" }}>
                    Crear producto nuevo
                  </button>
                  <button
                    onClick={() => setMode("existing")}
                    disabled={!draftProducts.length}
                    className="kulto-btn flex-1 text-xs font-semibold rounded-xl py-2.5"
                    style={{ background: "var(--ink-2)", color: "var(--bone)", opacity: draftProducts.length ? 1 : 0.5 }}
                  >
                    Agregar a producto existente
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`¿Borrar ${selected.length} foto${selected.length === 1 ? "" : "s"} seleccionada${selected.length === 1 ? "" : "s"}? Esta acción no se puede deshacer.`)) {
                        onRemove(selected);
                        setSelected([]);
                      }
                    }}
                    className="kulto-btn shrink-0 text-xs font-semibold rounded-xl py-2.5 px-3 flex items-center gap-1"
                    style={{ background: "var(--ink-2)", color: "var(--signal)" }}
                  >
                    <Trash2 size={14} /> Borrar
                  </button>
                </div>
              )}

              {mode === "new" && (
                <div className="flex flex-col gap-2">
                  <input placeholder="Nombre del producto" value={newName} onChange={(e) => setNewName(e.target.value)} className="rounded-lg p-2.5 text-sm" style={inputStyle} />
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="rounded-lg p-2.5 text-sm" style={inputStyle}>
                    <option value="">Categoría</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {groups.length > 0 && (
                    <select value={newGroup} onChange={(e) => setNewGroup(e.target.value)} className="rounded-lg p-2.5 text-sm" style={inputStyle}>
                      <option value="">Grupo / temática (opcional)</option>
                      {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                  <input type="number" placeholder="Precio (€)" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} className="rounded-lg p-2.5 text-sm" style={inputStyle} />
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={confirmNew} className="kulto-btn flex-1 text-xs font-semibold rounded-xl py-2.5" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                      Crear con {selected.length} foto{selected.length === 1 ? "" : "s"}
                    </button>
                    <button onClick={reset} className="kulto-btn text-xs px-3" style={{ color: "var(--slate)" }}>Cancelar</button>
                  </div>
                </div>
              )}

              {mode === "existing" && (
                <div className="flex flex-col gap-2">
                  <select value={existingId} onChange={(e) => setExistingId(e.target.value)} className="rounded-lg p-2.5 text-sm" style={inputStyle}>
                    <option value="">Elegí el producto</option>
                    {draftProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={confirmExisting} className="kulto-btn flex-1 text-xs font-semibold rounded-xl py-2.5" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                      Agregar {selected.length} foto{selected.length === 1 ? "" : "s"}
                    </button>
                    <button onClick={reset} className="kulto-btn text-xs px-3" style={{ color: "var(--slate)" }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Carga rápida para cuando hay muchos diseños distintos para subir (ej: más
// de 1000) y cada foto es un producto propio, no varias fotos de la misma
// prenda — a diferencia de "Subida masiva de fotos" de arriba, acá NO hace
// falta escribir un nombre por cada uno: se elige una categoría y un precio
// una sola vez para toda la tanda, se suben todas las fotos juntas (o una
// carpeta entera), y cada una se convierte en un producto propio con nombre
// automático "Categoría_01", "Categoría_02", etc.
function AdminBulkProductUpload({ categories, groups = [], allProducts = [], onSaveProduct }) {
  const [category, setCategory] = useState("");
  // El grupo/temática (ej: "kulto", "anime", "coches") es lo que de verdad
  // organiza los diseños para el dueño — la categoría es solo la prenda
  // física (camiseta, sudadera, etc). Por eso el nombre automático y el
  // agrupado de la lista de productos usan el grupo primero.
  const [group, setGroup] = useState("");
  // Subcategoría (opcional) — queda guardada en cada producto creado (igual
  // que en el formulario normal) y además se puede usar como el nombre de
  // cada producto si se elige esa opción más abajo.
  const [subcategory, setSubcategory] = useState("");
  const [baseName, setBaseName] = useState("");
  // Cómo se nombra cada producto creado: "auto" = nombre base/subcategoría/
  // grupo/categoría + número (como siempre); "filename" = el nombre del
  // archivo tal cual está en la computadora del admin, sin la extensión.
  const [namingMode, setNamingMode] = useState("auto");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };
  const ready = category && String(price).trim();
  const subcategorySuggestions = Array.from(
    new Set(allProducts.filter((p) => p.category === category && p.subcategory).map((p) => p.subcategory))
  );

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type === "image/png" || f.type === "image/jpeg");
    if (!files.length || !ready) return;
    setUploading(true);
    setError("");
    setDone(0);
    setTotal(files.length);
    const name = baseName.trim() || subcategory.trim() || group || category;
    // Cada producto de esta tanda necesita su propio código (sku) — vamos
    // sumando los que ya creamos acá mismo a la lista de "usados", porque
    // todos comparten el mismo nombre base (ej: "Camisetas_01", "_02"...).
    let knownProducts = allProducts;
    let n = 0;
    let failed = 0;
    // Para el modo "nombre del archivo": si dos fotos se llaman igual, a la
    // repetida le agregamos "(2)", "(3)"... para no confundir una con otra.
    const usedFileNames = new Set();
    for (const file of files) {
      n += 1;
      try {
        const isPng = file.type === "image/png";
        const b64 = await new Promise((resolve) => fileToBase64(file, resolve, 1400, isPng ? 1 : 0.88, isPng ? "image/png" : "image/jpeg"));
        let productName;
        if (namingMode === "filename") {
          const base = file.name.replace(/\.[^.]+$/, "").trim() || `foto_${n}`;
          let candidate = base;
          let dupe = 2;
          while (usedFileNames.has(candidate)) {
            candidate = `${base} (${dupe})`;
            dupe += 1;
          }
          usedFileNames.add(candidate);
          productName = candidate;
        } else {
          productName = `${name}_${String(n).padStart(2, "0")}`;
        }
        const product = {
          id: genId("p"),
          name: productName,
          description: "",
          category,
          subcategory: subcategory.trim(),
          group,
          price: Number(price) || 0,
          salePrice: null,
          stock: Number(stock) || 0,
          points: null,
          sku: generateSku(productName, knownProducts),
          tags: { bestseller: false, oferta: false, tendencia: false, template: false, customDesign: false },
          colors: [],
          designs: [],
          sizes: [],
          photoPool: [b64],
          imageFit: "contain",
          imageBackground: null,
          sizeGuide: [],
          sizeGuideImage: null,
          designGroup: "",
          createdAt: Date.now(),
          salesCount: 0,
          viewsCount: 0,
        };
        knownProducts = [...knownProducts, product];
        await onSaveProduct(product);
        setDone(n);
      } catch {
        failed += 1;
      }
    }
    setUploading(false);
    if (failed > 0) setError(`${failed} de ${files.length} no se pudieron subir. Probá de nuevo con esas.`);
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Carga rápida de muchos diseños</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Para cuando tenés un montón de diseños distintos (cada foto es una prenda propia, no varias fotos de la misma). Elegí la categoría y el precio una sola vez, subí todas las fotos juntas (o una carpeta entera) y cada una se crea sola como un producto — sin que tengas que escribirle un nombre a cada una.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {groups.length > 0 && (
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded-xl p-2.5 text-sm flex-1 min-w-[140px]" style={inputStyle}>
            <option value="">Grupo / temática (ej: kulto, anime, coches)…</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl p-2.5 text-sm flex-1 min-w-[140px]" style={inputStyle}>
          <option value="">Elegí la prenda (categoría)…</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          list="bulk-subcategory-options"
          placeholder="Subcategoría (opcional, ej: frutas)"
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          className="rounded-xl p-2.5 text-sm flex-1 min-w-[160px]"
          style={inputStyle}
        />
        <datalist id="bulk-subcategory-options">
          {subcategorySuggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>
      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>¿Cómo se nombra cada producto?</label>
        <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--bone)" }}>
          <label className="flex items-center gap-2">
            <input type="radio" name="bulkNamingMode" checked={namingMode === "auto"} onChange={() => setNamingMode("auto")} />
            Nombre automático + número (como siempre)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="bulkNamingMode" checked={namingMode === "filename"} onChange={() => setNamingMode("filename")} />
            El nombre del archivo, tal como está en tu computadora
          </label>
        </div>
        <input
          placeholder="Nombre base (opcional — si lo dejás vacío usa la subcategoría, el grupo o la categoría)"
          value={baseName}
          onChange={(e) => setBaseName(e.target.value)}
          disabled={namingMode === "filename"}
          className="rounded-xl p-2.5 text-sm w-full mt-2"
          style={{ ...inputStyle, opacity: namingMode === "filename" ? 0.5 : 1 }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input placeholder="Precio (para todas)" type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="rounded-xl p-2.5 text-sm flex-1 min-w-[140px]" style={inputStyle} />
        <input placeholder="Stock (para todas, opcional)" type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="rounded-xl p-2.5 text-sm flex-1 min-w-[140px]" style={inputStyle} />
      </div>
      {!ready && <p className="text-xs" style={{ color: "var(--signal)" }}>Elegí categoría y precio antes de subir las fotos.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full cursor-pointer flex items-center gap-2 shrink-0" style={{ background: !ready || uploading ? "var(--ink-3)" : "var(--signal)", color: "var(--bone)", opacity: !ready ? 0.6 : 1 }}>
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {uploading ? `Subiendo… (${done}/${total})` : "Subir fotos"}
          <input type="file" accept="image/png,image/jpeg" multiple className="hidden" disabled={!ready || uploading} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <label className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full cursor-pointer flex items-center gap-2 shrink-0" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)", opacity: !ready ? 0.6 : 1 }}>
          <FolderPlus size={16} /> Subir carpeta
          <input
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            disabled={!ready || uploading}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
        </label>
      </div>
      {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
      {!uploading && done > 0 && <p className="text-xs flex items-center gap-1" style={{ color: "var(--sun)" }}><Check size={12} /> Se crearon {done} productos en "{group || category}".</p>}
    </div>
  );
}

function AdminTagManager({ title, items, noun, onRename, onDelete }) {
  const [editingItem, setEditingItem] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [warning, setWarning] = useState("");

  const startEdit = (c) => { setEditingItem(c); setRenameValue(c); setWarning(""); };

  const saveRename = async () => {
    if (!renameValue.trim() || renameValue.trim() === editingItem) { setEditingItem(null); return; }
    await onRename(editingItem, renameValue.trim());
    setEditingItem(null);
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`¿Borrar "${c}"? Esta acción no se puede deshacer.`)) return;
    const res = await onDelete(c);
    if (!res.ok) setWarning(`No se puede borrar "${c}" porque todavía hay productos en ese ${noun}.`);
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>{title}</h4>
      {warning && <p className="text-xs" style={{ color: "var(--signal)" }}>{warning}</p>}
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--slate)" }}>Todavía no creaste ninguno.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((c) => (
            <div key={c} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--ink-3)" }}>
              {editingItem === c ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveRename()}
                  className="flex-1 rounded-lg px-2 py-1 text-sm"
                  style={{ background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
                />
              ) : (
                <span className="flex-1 text-sm" style={{ color: "var(--bone)" }}>{c}</span>
              )}
              {editingItem === c ? (
                <button onClick={saveRename} className="kulto-btn p-1.5 rounded-full" style={{ color: "var(--sun)" }}><Check size={15} /></button>
              ) : (
                <button onClick={() => startEdit(c)} className="kulto-btn p-1.5 rounded-full" style={{ color: "var(--bone)" }}><Pencil size={15} /></button>
              )}
              <button onClick={() => handleDelete(c)} className="kulto-btn p-1.5 rounded-full" style={{ color: "var(--signal)" }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminCategoryManager({ categories, onRename, onDelete }) {
  return <AdminTagManager title="Categorías" items={categories} noun="categoría" onRename={onRename} onDelete={onDelete} />;
}

function AdminGroupManager({ groups, onRename, onDelete }) {
  return <AdminTagManager title="Grupos / temáticas" items={groups} noun="grupo" onRename={onRename} onDelete={onDelete} />;
}

function AdminCustomers({ customers, onAdjustPoints, loyaltyThreshold, isOwner, onSetAdminPermissions, onDeleteCustomer, onCreateCustomer, onUpdateCustomerInfo, onSendPasswordHelp }) {
  const [editingEmail, setEditingEmail] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [permissionsOpenFor, setPermissionsOpenFor] = useState(null);
  const [permissionDrafts, setPermissionDrafts] = useState({});
  const [permissionsSavedFor, setPermissionsSavedFor] = useState(null);
  // Editar nombre/email a mano, por si el cliente cargó algo mal.
  const [editingInfoFor, setEditingInfoFor] = useState(null);
  const [infoDraft, setInfoDraft] = useState({ name: "", email: "" });
  const [infoError, setInfoError] = useState("");
  // Crear una cuenta a nombre de un cliente — le llega un mail para que elija
  // su propia contraseña, nosotros nunca la vemos ni la definimos.
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdEmail, setCreatedEmail] = useState("");
  // "Ayudarlo con la contraseña": le mandamos el mismo mail que recibiría si
  // pidiera "olvidé mi contraseña" — nunca vemos ni tocamos la contraseña.
  const [passwordHelpState, setPasswordHelpState] = useState({}); // { [email]: "sending" | "ok" | "error" }

  const startEdit = (c) => { setEditingEmail(c.email); setEditValue(String(c.points || 0)); };
  const save = (email) => {
    onAdjustPoints(email, Number(editValue) || 0);
    setEditingEmail(null);
  };

  const startEditInfo = (c) => { setEditingInfoFor(c.email); setInfoDraft({ name: c.name || "", email: c.email }); setInfoError(""); };
  const saveInfo = async (oldEmail) => {
    if (!infoDraft.email.trim() || !isValidEmail(infoDraft.email.trim())) { setInfoError("Ingresá un email válido."); return; }
    const result = await onUpdateCustomerInfo(oldEmail, { name: infoDraft.name, email: infoDraft.email });
    if (!result.ok) { setInfoError(result.error || "No se pudo guardar."); return; }
    setEditingInfoFor(null);
  };

  const createCustomer = async () => {
    setCreateError("");
    setCreatedEmail("");
    if (!newEmail.trim() || !isValidEmail(newEmail.trim())) { setCreateError("Ingresá un email válido."); return; }
    setCreating(true);
    const result = await onCreateCustomer({ name: newName, email: newEmail });
    setCreating(false);
    if (!result.ok) { setCreateError(result.error || "No se pudo crear la cuenta."); return; }
    setCreatedEmail(newEmail.trim());
    setNewName("");
    setNewEmail("");
  };

  const sendPasswordHelp = async (c) => {
    setPasswordHelpState((s) => ({ ...s, [c.email]: "sending" }));
    const result = await onSendPasswordHelp({ email: c.email });
    setPasswordHelpState((s) => ({ ...s, [c.email]: result.ok ? "ok" : "error" }));
    if (result.ok) setTimeout(() => setPasswordHelpState((s) => ({ ...s, [c.email]: undefined })), 2400);
  };

  // Permisos de admin: solo el dueño de la tienda (isOwner) puede ver y tocar
  // esto — así una cuenta de admin con permisos limitados nunca puede darse a
  // sí misma (ni a otra) más acceso del que ya tiene.
  const permsFor = (c) => permissionDrafts[c.email] || c.adminPermissions || [];
  const togglePerm = (c, key) => {
    const current = permsFor(c);
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    setPermissionDrafts((d) => ({ ...d, [c.email]: next }));
  };
  const savePermissions = async (c) => {
    await onSetAdminPermissions(c.email, permsFor(c));
    setPermissionsSavedFor(c.email);
    setTimeout(() => setPermissionsSavedFor(null), 1800);
  };
  const removeAdmin = async (c) => {
    await onSetAdminPermissions(c.email, []);
    setPermissionDrafts((d) => ({ ...d, [c.email]: [] }));
  };

  const deleteCustomer = (c) => {
    if (window.confirm(`¿Estás seguro que querés eliminar la cuenta de "${c.name || c.email}"? Esta acción no se puede deshacer.`)) {
      onDeleteCustomer(c.email);
    }
  };

  return (
    <div>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--bone)" }}>Clientes registrados ({customers.length})</p>
      <p className="text-xs mb-4" style={{ color: "var(--slate)" }}>
        Acá ves a quién le queda descuento de bienvenida sin usar y cuántos puntos tiene cada uno. Podés ajustar los puntos a mano — por ejemplo, al entregar la recompensa cuando alguien llega al umbral{loyaltyThreshold ? ` (cada ${loyaltyThreshold} puntos)` : ""}.
        {isOwner && " También podés convertir una cuenta en \"admin con permisos limitados\", eligiendo exactamente a qué secciones del panel puede entrar."}
      </p>

      <div className="rounded-2xl p-4 mb-4 flex flex-col gap-3" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
        <p className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--bone)" }}><UserPlus size={16} /> Crear cuenta para un cliente</p>
        <p className="text-xs" style={{ color: "var(--slate)" }}>
          Para cuando el cliente compró por WhatsApp y todavía no tiene cuenta, o pidió que se la crees vos. Le llega un mail para que elija su propia contraseña — nunca la vemos ni la definimos nosotros.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input placeholder="Nombre" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1 rounded-xl p-2.5 text-sm" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }} />
          <input type="email" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="flex-1 rounded-xl p-2.5 text-sm" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }} />
          <button disabled={creating} onClick={createCustomer} className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full shrink-0" style={{ background: "var(--signal)", color: "var(--bone)" }}>
            {creating ? "Creando..." : "Crear y enviar mail"}
          </button>
        </div>
        {createError && <p className="text-xs" style={{ color: "var(--signal)" }}>{createError}</p>}
        {createdEmail && <p className="text-xs" style={{ color: "var(--sun)" }}>Cuenta creada — le mandamos un mail a {createdEmail} para que elija su contraseña.</p>}
      </div>

      {customers.length === 0 ? (
        <EmptyState text="Todavía no hay clientes registrados." />
      ) : (
        <div className="flex flex-col gap-2">
          {customers.map((c) => (
            <div key={c.email} className="rounded-2xl p-3" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
              {editingInfoFor === c.email ? (
                <div className="flex flex-col gap-2 mb-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input placeholder="Nombre" value={infoDraft.name} onChange={(e) => setInfoDraft((d) => ({ ...d, name: e.target.value }))} className="flex-1 rounded-lg p-2 text-sm" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }} />
                    <input type="email" placeholder="Email" value={infoDraft.email} onChange={(e) => setInfoDraft((d) => ({ ...d, email: e.target.value }))} className="flex-1 rounded-lg p-2 text-sm" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }} />
                  </div>
                  {infoError && <p className="text-xs" style={{ color: "var(--signal)" }}>{infoError}</p>}
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveInfo(c.email)} className="kulto-btn text-xs font-semibold rounded-lg px-3 py-1.5" style={{ background: "var(--signal)", color: "var(--bone)" }}>Guardar</button>
                    <button onClick={() => setEditingInfoFor(null)} className="kulto-btn text-xs px-2" style={{ color: "var(--slate)" }}>Cancelar</button>
                  </div>
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate flex items-center gap-2" style={{ color: "var(--bone)" }}>
                    {c.name || c.email}
                    {c.adminPermissions && c.adminPermissions.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: "var(--sun)", color: "var(--ink)" }}>ADMIN</span>
                    )}
                    <button onClick={() => startEditInfo(c)} className="kulto-btn shrink-0" style={{ color: "var(--slate)" }} aria-label={`Editar datos de ${c.name || c.email}`} title="Editar nombre/email"><Pencil size={12} /></button>
                  </p>
                  <p className="text-xs truncate" style={{ color: "var(--slate)" }}>
                    {c.email} · {c.firstDiscountUsed ? "Ya usó su descuento" : "Descuento de bienvenida disponible"}
                  </p>
                </div>
                <button
                  onClick={() => sendPasswordHelp(c)}
                  disabled={passwordHelpState[c.email] === "sending"}
                  className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 flex items-center gap-1"
                  style={{ background: passwordHelpState[c.email] === "ok" ? "var(--sun)" : "var(--ink-3)", color: passwordHelpState[c.email] === "ok" ? "var(--ink)" : "var(--bone)" }}
                  title="Ayudarlo a crear o restablecer su contraseña, sin verla"
                >
                  <KeyRound size={13} />
                  {passwordHelpState[c.email] === "sending" ? "Enviando..." : passwordHelpState[c.email] === "ok" ? "Mail enviado" : passwordHelpState[c.email] === "error" ? "Reintentar" : "Contraseña"}
                </button>
                {editingEmail === c.email ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number" min="0" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                      className="w-16 rounded-lg p-1.5 text-sm text-center"
                      style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    />
                    <button onClick={() => save(c.email)} className="kulto-btn p-1.5 rounded-full" style={{ color: "var(--sun)" }}><Check size={16} /></button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(c)} className="kulto-btn text-sm font-semibold px-3 py-1.5 rounded-full shrink-0" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                    {c.points || 0} pts
                  </button>
                )}
                {isOwner && (
                  <button
                    onClick={() => setPermissionsOpenFor(permissionsOpenFor === c.email ? null : c.email)}
                    className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full shrink-0"
                    style={{ background: permissionsOpenFor === c.email ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
                  >
                    Permisos
                  </button>
                )}
                <button
                  onClick={() => deleteCustomer(c)}
                  className="kulto-btn p-1.5 rounded-full shrink-0"
                  style={{ color: "var(--signal)" }}
                  aria-label={`Eliminar cuenta de ${c.name || c.email}`}
                  title="Eliminar cuenta"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {isOwner && permissionsOpenFor === c.email && (
                <div className="mt-3 pt-3 flex flex-col gap-2" style={{ borderTop: "1px dashed var(--line)" }}>
                  <p className="text-xs" style={{ color: "var(--slate)" }}>Tildá a qué secciones del panel de administrador puede entrar esta cuenta:</p>
                  <div className="flex flex-wrap gap-2">
                    {ADMIN_TABS.map(([key, label]) => (
                      <label
                        key={key}
                        className="kulto-btn flex items-center gap-1.5 text-xs rounded-full pl-2 pr-3 py-1.5"
                        style={{ background: permsFor(c).includes(key) ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
                      >
                        <input type="checkbox" checked={permsFor(c).includes(key)} onChange={() => togglePerm(c, key)} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => savePermissions(c)}
                      className="kulto-btn text-xs font-semibold rounded-lg px-3 py-2"
                      style={{ background: permissionsSavedFor === c.email ? "var(--sun)" : "var(--signal)", color: permissionsSavedFor === c.email ? "var(--ink)" : "var(--bone)" }}
                    >
                      {permissionsSavedFor === c.email ? "Guardado" : "Guardar permisos"}
                    </button>
                    {c.adminPermissions && c.adminPermissions.length > 0 && (
                      <button onClick={() => removeAdmin(c)} className="kulto-btn text-xs px-2" style={{ color: "var(--slate)" }}>Quitar todo el acceso</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminOrders({ orders, settings, onSetLocalStatus, onSetLocalTracking, onToggleStatus, onUpdateTracking, onApplyDiscount, onRequestReview, onBulkComplete, onBulkArchive, onBulkDelete }) {
  const [openId, setOpenId] = useState(null);
  const [trackingDrafts, setTrackingDrafts] = useState({});
  const [savedId, setSavedId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [discountDrafts, setDiscountDrafts] = useState({});
  const [discountSavedId, setDiscountSavedId] = useState(null);
  const [reviewRequestState, setReviewRequestState] = useState({}); // { [orderId]: "sending" | "ok" | "error" }
  // Vista "básica" (por defecto) vs "detallada" de los artículos de un pedido
  // — básica muestra solo lo que el cliente eligió (ítem, modelo, talla,
  // color, diseño); detallada agrega el resto (código/sku, imágenes de
  // diseño o vista previa que subió el cliente).
  const [detailedIds, setDetailedIds] = useState([]);
  const toggleDetailed = (id) => setDetailedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const requestReview = async (o) => {
    setReviewRequestState((s) => ({ ...s, [o.id]: "sending" }));
    const result = await onRequestReview(o);
    setReviewRequestState((s) => ({ ...s, [o.id]: result.ok ? "ok" : "error" }));
  };

  const visible = orders.filter((o) => (showArchived ? o.archived : !o.archived));
  const selectedInView = selected.filter((id) => visible.some((o) => o.id === id));

  const trackingFor = (o) => (o.id in trackingDrafts ? trackingDrafts[o.id] : (o.trackingNumber || ""));
  const saveTracking = async (o) => {
    await onUpdateTracking(o, trackingFor(o));
    setSavedId(o.id);
    setTimeout(() => setSavedId(null), 1800);
  };

  // Descuento manual sobre un pedido ya hecho (ej: compensar algo que pasó).
  // Se guarda por separado del descuento de bienvenida (o.discountAmount) para
  // no pisarlo, y el total del pedido se recalcula al aplicarlo o quitarlo.
  const defaultDiscountDraft = (o) => ({
    mode: o.manualDiscountMode || "monto",
    value: o.manualDiscountMode === "porcentaje" ? String(o.manualDiscountPercent ?? "") : String(o.manualDiscountAmount || ""),
    reason: o.manualDiscountReason || "",
  });
  const discountDraftFor = (o) => discountDrafts[o.id] || defaultDiscountDraft(o);
  const updateDiscountDraft = (o, patch) => setDiscountDrafts((d) => ({ ...d, [o.id]: { ...discountDraftFor(o), ...patch } }));
  const applyDiscount = async (o) => {
    const draft = discountDraftFor(o);
    const numValue = Number(draft.value) || 0;
    const amount = draft.mode === "porcentaje" ? Math.round(o.subtotal * (numValue / 100)) : Math.round(numValue);
    await onApplyDiscount(o, { mode: draft.mode, amount, percent: draft.mode === "porcentaje" ? numValue : null, reason: draft.reason });
    setDiscountSavedId(o.id);
    setTimeout(() => setDiscountSavedId(null), 1800);
  };
  const removeDiscount = async (o) => {
    await onApplyDiscount(o, { mode: null, amount: 0, percent: null, reason: "" });
    setDiscountDrafts((d) => { const next = { ...d }; delete next[o.id]; return next; });
  };

  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const clearSelection = () => { setSelected([]); setConfirmingDelete(false); setPassword(""); setPasswordError(false); };

  const confirmDelete = () => {
    if (password !== ADMIN_PASSWORD) { setPasswordError(true); return; }
    onBulkDelete(selectedInView);
    clearSelection();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          <button
            onClick={() => { setShowArchived(false); clearSelection(); }}
            className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: !showArchived ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
          >
            Activos
          </button>
          <button
            onClick={() => { setShowArchived(true); clearSelection(); }}
            className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: showArchived ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
          >
            Archivados
          </button>
        </div>
      </div>

      {selectedInView.length > 0 && (
        <div className="rounded-xl p-3 flex flex-wrap items-center gap-2" style={{ background: "var(--ink-2)", border: "1px solid var(--sun)" }}>
          <span className="text-xs font-semibold" style={{ color: "var(--sun)" }}>{selectedInView.length} seleccionado(s)</span>
          {!confirmingDelete ? (
            <>
              <button onClick={() => { onBulkComplete(selectedInView); clearSelection(); }} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                Marcar completado
              </button>
              <button onClick={() => { onBulkArchive(selectedInView, !showArchived); clearSelection(); }} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                {showArchived ? "Desarchivar" : "Archivar"}
              </button>
              <button onClick={() => setConfirmingDelete(true)} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                Eliminar
              </button>
              <button onClick={clearSelection} className="kulto-btn text-xs px-2" style={{ color: "var(--slate)" }}>Cancelar</button>
            </>
          ) : (
            <>
              <span className="text-xs" style={{ color: "var(--bone)" }}>Escribí la contraseña de administrador para confirmar:</span>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
                onKeyDown={(e) => e.key === "Enter" && confirmDelete()}
                className="rounded-lg p-1.5 text-xs w-32"
                style={{ background: "var(--ink-3)", color: "var(--bone)", border: passwordError ? "1px solid var(--signal)" : "1px solid var(--line)" }}
              />
              <button onClick={confirmDelete} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                Confirmar eliminación
              </button>
              <button onClick={() => { setConfirmingDelete(false); setPassword(""); setPasswordError(false); }} className="kulto-btn text-xs px-2" style={{ color: "var(--slate)" }}>Cancelar</button>
              {passwordError && <span className="text-xs w-full" style={{ color: "var(--signal)" }}>Contraseña incorrecta.</span>}
            </>
          )}
        </div>
      )}

      {visible.length === 0 && (
        <EmptyState text={showArchived ? "No hay pedidos archivados." : "Todavía no se han recibido pedidos."} />
      )}

      {visible.map((o) => (
        <div key={o.id} className="rounded-2xl p-4 flex gap-3" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
          <input
            type="checkbox"
            checked={selected.includes(o.id)}
            onChange={() => toggleSelect(o.id)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 cursor-pointer" onClick={() => setOpenId(openId === o.id ? null : o.id)}>
              <div>
                <p className="font-semibold text-sm" style={{ color: "var(--bone)" }}>{o.id}</p>
                <p className="text-xs" style={{ color: "var(--slate)" }}>{formatDate(o.date)} · {o.items.length} artículo(s) · {formatPrice(o.total)}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleStatus(o); }}
                className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full shrink-0"
                style={{ background: o.status === "completado" ? "var(--sun)" : "var(--ink-3)", color: o.status === "completado" ? "var(--ink)" : "var(--bone)" }}
              >
                {o.status === "completado" ? "Completado" : "Pendiente"}
              </button>
            </div>
            {openId === o.id && (
              <div className="mt-3 pt-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--line)" }}>
                <button
                  onClick={() => toggleDetailed(o.id)}
                  className="kulto-btn text-xs font-semibold self-start px-2.5 py-1 rounded-full"
                  style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                >
                  {detailedIds.includes(o.id) ? "Ver básico" : "Ver detallado"}
                </button>
                {o.items.map((it, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg p-2" style={{ background: "var(--ink-3)" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: "var(--bone)" }}>{i + 1}. {it.name}{it.qty > 1 ? ` × ${it.qty}` : ""} — {formatPrice(it.unitPrice)}</p>
                      <div className="text-xs mt-1" style={{ color: "var(--slate)" }}>
                        <p>Ítem: {it.category || "—"}</p>
                        {it.subcategory && <p>Modelo: {it.subcategory}</p>}
                        {it.size && <p>Talla: {it.size}</p>}
                        <p>Color: {it.colorName || "—"}</p>
                        {it.designName && <p>Diseño: {it.designName}</p>}
                        {detailedIds.includes(o.id) && <p>Ref. (sku): {it.sku}</p>}
                      </div>
                    </div>
                    {detailedIds.includes(o.id) && (
                      <div className="flex items-start gap-2 shrink-0">
                        {it.designImage && (
                          <a href={it.designImage} target="_blank" rel="noreferrer" className="kulto-btn shrink-0 w-10 h-10 rounded-lg overflow-hidden" style={{ border: "1px solid var(--sun)" }} title="Ver diseño que subió el cliente">
                            <img loading="lazy" src={it.designImage} className="w-full h-full object-cover" alt="Diseño del cliente" />
                          </a>
                        )}
                        {it.previewImageFront && (
                          <a href={it.previewImageFront} target="_blank" rel="noreferrer" className="kulto-btn shrink-0 w-10 h-10 rounded-lg overflow-hidden relative" style={{ border: "1px solid var(--sun)" }} title="Ver cómo quedó adelante">
                            <img loading="lazy" src={it.previewImageFront} className="w-full h-full object-cover" alt="Adelante" />
                            <span className="absolute bottom-0 left-0 right-0 text-center text-[7px] font-bold" style={{ background: "rgba(21,19,26,0.8)", color: "var(--sun)" }}>ADEL.</span>
                          </a>
                        )}
                        {it.previewImageBack && (
                          <a href={it.previewImageBack} target="_blank" rel="noreferrer" className="kulto-btn shrink-0 w-10 h-10 rounded-lg overflow-hidden relative" style={{ border: "1px solid var(--sun)" }} title="Ver cómo quedó atrás">
                            <img loading="lazy" src={it.previewImageBack} className="w-full h-full object-cover" alt="Atrás" />
                            <span className="absolute bottom-0 left-0 right-0 text-center text-[7px] font-bold" style={{ background: "rgba(21,19,26,0.8)", color: "var(--sun)" }}>ATRÁS</span>
                          </a>
                        )}
                        {it.previewImageSleeveLeft && (
                          <a href={it.previewImageSleeveLeft} target="_blank" rel="noreferrer" className="kulto-btn shrink-0 w-10 h-10 rounded-lg overflow-hidden relative" style={{ border: "1px solid var(--sun)" }} title="Ver cómo quedó la manga izquierda">
                            <img loading="lazy" src={it.previewImageSleeveLeft} className="w-full h-full object-cover" alt="Manga izquierda" />
                            <span className="absolute bottom-0 left-0 right-0 text-center text-[6px] font-bold" style={{ background: "rgba(21,19,26,0.8)", color: "var(--sun)" }}>M.IZQ.</span>
                          </a>
                        )}
                        {it.previewImageSleeveRight && (
                          <a href={it.previewImageSleeveRight} target="_blank" rel="noreferrer" className="kulto-btn shrink-0 w-10 h-10 rounded-lg overflow-hidden relative" style={{ border: "1px solid var(--sun)" }} title="Ver cómo quedó la manga derecha">
                            <img loading="lazy" src={it.previewImageSleeveRight} className="w-full h-full object-cover" alt="Manga derecha" />
                            <span className="absolute bottom-0 left-0 right-0 text-center text-[6px] font-bold" style={{ background: "rgba(21,19,26,0.8)", color: "var(--sun)" }}>M.DER.</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {o.customerName && <p className="text-xs" style={{ color: "var(--slate)" }}>Cliente: {o.customerName}</p>}
                {o.customerPhone && <p className="text-xs" style={{ color: "var(--slate)" }}>Teléfono: {o.customerPhone}</p>}
                {o.customerEmail && <p className="text-xs" style={{ color: "var(--slate)" }}>Email: {o.customerEmail}</p>}
                <p className="text-xs" style={{ color: "var(--slate)" }}>
                  Entrega: {o.deliveryMethod === "envio" ? `Envío a domicilio (${formatPrice(o.shippingCost || 0)})` : "Recoge en persona"}
                </p>
                {o.deliveryMethod === "envio" && o.address && <p className="text-xs" style={{ color: "var(--slate)" }}>Dirección: {formatAddress(o.address)}</p>}
                {o.comment && <p className="text-xs" style={{ color: "var(--slate)" }}>Comentario: {o.comment}</p>}

                {isLocalOrder(o, settings) && (
                  <div className="mt-1 rounded-xl p-3 flex flex-col gap-1" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
                    <p className="text-xs font-semibold" style={{ color: "var(--bone)" }}>Entrega personal — tocá una etapa para confirmarla (el cliente la ve al instante en "Mi pedido")</p>
                    <LocalOrderProgress order={o} onSelect={(key) => onSetLocalStatus(o, key)} />
                  </div>
                )}
                {o.deliveryMethod === "envio" && (
                  <button
                    onClick={() => onSetLocalTracking(o, !isLocalOrder(o, settings))}
                    className="kulto-btn text-[11px] self-start underline"
                    style={{ color: "var(--slate)" }}
                  >
                    {isLocalOrder(o, settings) ? "Este pedido lleva link de seguimiento (envío normal)" : "Este pedido lo entrego yo en persona (usar etapas)"}
                  </button>
                )}
                {!isLocalOrder(o, settings) && (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    value={trackingFor(o)}
                    onChange={(e) => setTrackingDrafts((d) => ({ ...d, [o.id]: e.target.value }))}
                    placeholder="Número o link de seguimiento"
                    className="flex-1 rounded-lg p-2 text-xs"
                    style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                  />
                  <button
                    onClick={() => saveTracking(o)}
                    className="kulto-btn text-xs font-semibold rounded-lg px-3 py-2"
                    style={{ background: savedId === o.id ? "var(--sun)" : "var(--signal)", color: savedId === o.id ? "var(--ink)" : "var(--bone)" }}
                  >
                    {savedId === o.id ? "Guardado" : "Guardar"}
                  </button>
                </div>
                )}

                <div className="mt-2 pt-2 flex flex-col gap-2" style={{ borderTop: "1px dashed var(--line)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--bone)" }}>Descuento manual (ej: compensar un problema)</p>
                  {o.manualDiscountAmount > 0 && (
                    <p className="text-xs" style={{ color: "var(--sun)" }}>
                      Descuento aplicado: {formatPrice(o.manualDiscountAmount)}{o.manualDiscountMode === "porcentaje" ? ` (${o.manualDiscountPercent}%)` : ""}{o.manualDiscountReason ? ` — ${o.manualDiscountReason}` : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => updateDiscountDraft(o, { mode: "monto" })}
                      className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full"
                      style={{ background: discountDraftFor(o).mode === "monto" ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
                    >
                      Monto fijo
                    </button>
                    <button
                      onClick={() => updateDiscountDraft(o, { mode: "porcentaje" })}
                      className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full"
                      style={{ background: discountDraftFor(o).mode === "porcentaje" ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
                    >
                      Porcentaje
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={discountDraftFor(o).value}
                      onChange={(e) => updateDiscountDraft(o, { value: e.target.value })}
                      placeholder={discountDraftFor(o).mode === "porcentaje" ? "% de descuento" : "Monto en $"}
                      className="rounded-lg p-2 text-xs w-28"
                      style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    />
                  </div>
                  <input
                    value={discountDraftFor(o).reason}
                    onChange={(e) => updateDiscountDraft(o, { reason: e.target.value })}
                    placeholder="Motivo (opcional, ej: se retrasó el envío)"
                    className="rounded-lg p-2 text-xs"
                    style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => applyDiscount(o)}
                      className="kulto-btn text-xs font-semibold rounded-lg px-3 py-2"
                      style={{ background: discountSavedId === o.id ? "var(--sun)" : "var(--signal)", color: discountSavedId === o.id ? "var(--ink)" : "var(--bone)" }}
                    >
                      {discountSavedId === o.id ? "Aplicado" : "Aplicar descuento"}
                    </button>
                    {o.manualDiscountAmount > 0 && (
                      <button onClick={() => removeDiscount(o)} className="kulto-btn text-xs px-2" style={{ color: "var(--slate)" }}>Quitar descuento</button>
                    )}
                  </div>
                </div>

                {o.status === "completado" && o.customerEmail && (
                  <div className="mt-2 pt-2 flex items-center gap-2 flex-wrap" style={{ borderTop: "1px dashed var(--line)" }}>
                    <button
                      onClick={() => requestReview(o)}
                      disabled={reviewRequestState[o.id] === "sending"}
                      className="kulto-btn text-xs font-semibold rounded-lg px-3 py-2"
                      style={{ background: reviewRequestState[o.id] === "ok" ? "var(--sun)" : "var(--ink-3)", color: reviewRequestState[o.id] === "ok" ? "var(--ink)" : "var(--bone)" }}
                    >
                      {reviewRequestState[o.id] === "sending" ? "Enviando..." : reviewRequestState[o.id] === "ok" ? "Mail enviado" : "Pedir reseña"}
                    </button>
                    {reviewRequestState[o.id] === "error" && (
                      <span className="text-xs" style={{ color: "var(--signal)" }}>No se pudo enviar el mail.</span>
                    )}
                    {o.reviewRequestedAt && !reviewRequestState[o.id] && (
                      <span className="text-xs" style={{ color: "var(--slate)" }}>Ya se pidió el {formatDate(new Date(o.reviewRequestedAt).toISOString())}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel de ventas — resumen de ingresos + "en tendencia" automático  */
/* ------------------------------------------------------------------ */

function AdminSalesPanel({ products, orders, settings, onSaveSettings }) {
  const completedOrders = orders.filter((o) => o.status === "completado" && !o.archived);
  const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const activeOrders = orders.filter((o) => o.status !== "completado" && !o.archived).length;

  const bestsellerIds = computeBestsellerIds(products, settings);
  const [bestAutoEnabled, setBestAutoEnabled] = useState(settings?.bestsellerAutoEnabled ?? true);
  const [bestAutoCount, setBestAutoCount] = useState(settings?.bestsellerAutoCount ?? 8);
  const [bestSaved, setBestSaved] = useState(false);
  useEffect(() => {
    setBestAutoEnabled(settings?.bestsellerAutoEnabled ?? true);
    setBestAutoCount(settings?.bestsellerAutoCount ?? 8);
  }, [settings?.bestsellerAutoEnabled, settings?.bestsellerAutoCount]);
  const saveBestConfig = async () => {
    await onSaveSettings({ ...settings, bestsellerAutoEnabled: bestAutoEnabled, bestsellerAutoCount: Number(bestAutoCount) || 8 });
    setBestSaved(true);
    setTimeout(() => setBestSaved(false), 1800);
  };

  const trendingIds = computeTrendingIds(products, settings);
  const ranked = [...products]
    .map((p) => ({ ...p, score: (p.salesCount || 0) * 3 + (p.viewsCount || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const [autoEnabled, setAutoEnabled] = useState(settings?.trendingAutoEnabled ?? true);
  const [autoCount, setAutoCount] = useState(settings?.trendingAutoCount ?? 8);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setAutoEnabled(settings?.trendingAutoEnabled ?? true);
    setAutoCount(settings?.trendingAutoCount ?? 8);
  }, [settings?.trendingAutoEnabled, settings?.trendingAutoCount]);

  const saveConfig = async () => {
    await onSaveSettings({ ...settings, trendingAutoEnabled: autoEnabled, trendingAutoCount: Number(autoCount) || 8 });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-2xl p-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
          <p className="text-xs" style={{ color: "var(--slate)" }}>Ingresos (completados)</p>
          <p className="text-xl font-bold" style={{ color: "var(--sun)" }}>{formatPrice(totalRevenue)}</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
          <p className="text-xs" style={{ color: "var(--slate)" }}>Pedidos completados</p>
          <p className="text-xl font-bold" style={{ color: "var(--bone)" }}>{completedOrders.length}</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
          <p className="text-xs" style={{ color: "var(--slate)" }}>Pedidos en curso</p>
          <p className="text-xl font-bold" style={{ color: "var(--bone)" }}>{activeOrders}</p>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={16} style={{ color: "var(--sun)" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>"En tendencia" automático</p>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>
          Combina ventas (lo que más pesa) y vistas de cada prenda para armar la sección "Tendencia" del inicio, sin que tengas que estar tildando manualmente — se suma a lo que ya marcás a mano en cada producto, nunca lo reemplaza.
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <label className="kulto-btn flex items-center gap-2 text-sm" style={{ color: "var(--bone)" }}>
            <input type="checkbox" checked={autoEnabled} onChange={(e) => setAutoEnabled(e.target.checked)} />
            Activado
          </label>
          <label className="text-xs flex items-center gap-2" style={{ color: "var(--slate)" }}>
            Máximo de prendas en tendencia:
            <input
              type="number" min="1" max="30" value={autoCount}
              onChange={(e) => setAutoCount(e.target.value)}
              className="w-16 rounded-lg p-1.5 text-sm text-center"
              style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
            />
          </label>
          <button onClick={saveConfig} className="kulto-btn text-xs font-semibold rounded-lg px-3 py-2" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
            {saved ? "Guardado" : "Guardar"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={16} style={{ color: "var(--sun)" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>"Más vendidos" automático</p>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>
          Arma solo la sección "Más vendido" del inicio con las prendas que más se vendieron (cuenta solo ventas reales, no vistas) — se suma a lo que ya marcás a mano en cada producto, nunca lo reemplaza. Un mismo diseño en varias prendas cuenta junto.
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <label className="kulto-btn flex items-center gap-2 text-sm" style={{ color: "var(--bone)" }}>
            <input type="checkbox" checked={bestAutoEnabled} onChange={(e) => setBestAutoEnabled(e.target.checked)} />
            Activado
          </label>
          <label className="text-xs flex items-center gap-2" style={{ color: "var(--slate)" }}>
            Máximo de prendas más vendidas:
            <input
              type="number" min="1" max="30" value={bestAutoCount}
              onChange={(e) => setBestAutoCount(e.target.value)}
              className="w-16 rounded-lg p-1.5 text-sm text-center"
              style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
            />
          </label>
          <button onClick={saveBestConfig} className="kulto-btn text-xs font-semibold rounded-lg px-3 py-2" style={{ background: bestSaved ? "var(--sun)" : "var(--signal)", color: bestSaved ? "var(--ink)" : "var(--bone)" }}>
            {bestSaved ? "Guardado" : "Guardar"}
          </button>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Ranking de interés (ventas + vistas)</p>
        {ranked.length === 0 || ranked[0].score === 0 ? (
          <EmptyState text="Todavía no hay ventas ni vistas registradas." />
        ) : (
          <div className="flex flex-col gap-2">
            {ranked.filter((p) => p.score > 0).map((p, i) => (
              <div key={p.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
                <span className="text-xs font-bold w-5 shrink-0" style={{ color: "var(--slate)" }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate flex items-center gap-2" style={{ color: "var(--bone)" }}>
                    {p.name}
                    {trendingIds.has(p.id) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: "var(--sun)", color: "var(--ink)" }}>TENDENCIA</span>
                    )}
                    {bestsellerIds.has(p.id) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: "var(--signal)", color: "var(--bone)" }}>MÁS VENDIDO</span>
                    )}
                  </p>
                  <p className="text-xs" style={{ color: "var(--slate)" }}>{p.salesCount || 0} vendidas · {p.viewsCount || 0} vistas</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Optimizar fotos — miniaturas para que la web cargue rápido          */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Copia de seguridad — todo el contenido de la web en un solo .zip   */
/*  (datos de la base + fotos de Storage) y forma de restaurarlo.      */
/*  Funciona 100% desde el navegador del admin, sin servidor extra.    */
/* ------------------------------------------------------------------ */

const ZIP_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function zipCrc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = ZIP_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// entries: [{ name, data: Uint8Array | Blob, size, crc }] → Blob .zip (sin comprimir,
// las fotos ya vienen comprimidas). Compatible con cualquier programa de zip.
function buildZipBlob(entries) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  let cdSize = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, e.crc, true); lh.setUint32(18, e.size, true); lh.setUint32(22, e.size, true);
    lh.setUint16(26, nameBytes.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, nameBytes, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, e.crc, true); ch.setUint32(20, e.size, true); ch.setUint32(24, e.size, true);
    ch.setUint16(28, nameBytes.length, true); ch.setUint32(42, offset, true);
    central.push(ch.buffer, nameBytes);
    cdSize += 46 + nameBytes.length;
    offset += 30 + nameBytes.length + e.size;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}
function textEntry(name, text) {
  const bytes = new TextEncoder().encode(text);
  return { name, data: bytes, size: bytes.length, crc: zipCrc32(bytes) };
}
// Lee un .zip (el nuestro, o uno que el usuario haya vuelto a comprimir).
async function readZipEntries(file) {
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
  let p = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { p = i; break; }
  }
  if (p < 0) throw new Error("Ese archivo no es una copia de seguridad de Kulto (.zip).");
  const tv = new DataView(tail.buffer);
  const count = tv.getUint16(p + 10, true);
  const cdSize = tv.getUint32(p + 12, true);
  const cdOff = tv.getUint32(p + 16, true);
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  const list = [];
  let q = 0;
  for (let i = 0; i < count; i++) {
    const method = cd.getUint16(q + 10, true);
    const csize = cd.getUint32(q + 20, true);
    const nlen = cd.getUint16(q + 28, true);
    const xlen = cd.getUint16(q + 30, true);
    const clen = cd.getUint16(q + 32, true);
    const off = cd.getUint32(q + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + q + 46, nlen));
    list.push({
      name,
      async blob() {
        const lh = new DataView(await file.slice(off, off + 30).arrayBuffer());
        const start = off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        const raw = file.slice(start, start + csize);
        if (method === 0) return raw;
        if (method === 8 && typeof DecompressionStream !== "undefined") {
          return new Response(raw.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
        }
        throw new Error("El zip está comprimido de una forma que no puedo leer. Usá el archivo tal cual lo descargaste.");
      },
    });
    q += 46 + nlen + xlen + clen;
  }
  return list;
}

function AdminBackupPanel() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const restoreInput = useRef(null);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const storageBase = () => `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const runPool = async (items, n, fn) => {
    let cursor = 0;
    await Promise.all(Array.from({ length: n }, async () => {
      while (cursor < items.length) { const it = items[cursor++]; await fn(it); }
    }));
  };

  const readRows = async (keys) => {
    const rows = [];
    const go = async (chunk, attempt = 0) => {
      const { data, error } = await supabase.from(KV_TABLE).select("key,value,updated_at").in("key", chunk);
      if (!error) { rows.push(...(data || [])); return; }
      if (chunk.length > 1) { const m = chunk.length >> 1; await go(chunk.slice(0, m)); await go(chunk.slice(m)); return; }
      if (attempt < 2) { await sleep(800); return go(chunk, attempt + 1); }
      throw new Error(`No se pudo leer "${chunk[0]}": ${error.message || error}`);
    };
    await go(keys);
    return rows;
  };

  const downloadBackup = async () => {
    setBusy(true); setResult(null); setProgress({ done: 0, total: 0 });
    try {
      setStatus("Leyendo la lista de datos…");
      const keys = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from(KV_TABLE).select("key").order("key").range(from, from + 999);
        if (error) throw new Error("No se pudo leer la base de datos: " + (error.message || error));
        keys.push(...(data || []).map((r) => r.key));
        if (!data || data.length < 1000) break;
      }
      const chunks = [];
      for (let i = 0; i < keys.length; i += 20) chunks.push(keys.slice(i, i + 20));
      setProgress({ done: 0, total: chunks.length });
      setStatus("Copiando productos, pedidos, clientes y ajustes…");
      const rows = [];
      let doneChunks = 0;
      await runPool(chunks, 4, async (chunk) => {
        rows.push(...(await readRows(chunk)));
        doneChunks++; setProgress({ done: doneChunks, total: chunks.length });
      });
      if (rows.length < keys.length) throw new Error(`Se leyeron ${rows.length} de ${keys.length} datos. Probá de nuevo.`);
      rows.sort((a, b) => (a.key < b.key ? -1 : 1));

      // Fotos: las que aparecen en los datos + todas las que haya en el bucket.
      setStatus("Buscando las fotos…");
      const photoPaths = new Set();
      const re = new RegExp("/storage/v1/object/public/" + STORAGE_BUCKET + "/([^\"'\\s?#)\\\\]+)", "g");
      rows.forEach((r) => {
        const str = typeof r.value === "string" ? r.value : JSON.stringify(r.value);
        let m;
        while ((m = re.exec(str))) { try { photoPaths.add(decodeURIComponent(m[1])); } catch { photoPaths.add(m[1]); } }
      });
      try {
        for (let off = 0; ; off += 1000) {
          const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list("", { limit: 1000, offset: off, sortBy: { column: "name", order: "asc" } });
          if (error) break;
          (data || []).filter((f) => f.id).forEach((f) => photoPaths.add(f.name));
          if (!data || data.length < 1000) break;
        }
      } catch { /* con las que aparecen en los datos alcanza */ }
      const photoList = [...photoPaths].filter((p) => !/_t\.webp$/i.test(p));

      setStatus("Descargando las fotos…");
      setProgress({ done: 0, total: photoList.length });
      const entries = [];
      const failed = [];
      let donePhotos = 0;
      await runPool(photoList, 4, async (path) => {
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          try {
            const url = storageBase() + path.split("/").map(encodeURIComponent).join("/");
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) throw new Error(String(res.status));
            const bytes = new Uint8Array(await res.arrayBuffer());
            entries.push({ name: "photos/" + path, data: new Blob([bytes]), size: bytes.length, crc: zipCrc32(bytes) });
            ok = true;
          } catch { await sleep(500); }
        }
        if (!ok) failed.push(path);
        donePhotos++; setProgress({ done: donePhotos, total: photoList.length });
      });

      setStatus("Armando el archivo…");
      if (entries.length + 3 > 65000) throw new Error("Hay demasiadas fotos para un solo archivo.");
      const meta = { app: "kulto", version: 1, createdAt: new Date().toISOString(), storageBase: storageBase(), rows: rows.length, photos: entries.length, photosFailed: failed };
      const readme = "COPIA DE SEGURIDAD DE KULTO\n\nkv.json  = todos los datos (productos, categorías, carpetas, pedidos, clientes, ajustes, diseños...)\nphotos/  = todas las fotos subidas\nmeta.json = datos de esta copia\n\nPara recuperar todo: Admin > Ajustes > Copia de seguridad > Restaurar desde un archivo.\nGuardá este archivo en un lugar seguro: contiene datos de tus clientes y pedidos.\n";
      const all = [textEntry("LEEME.txt", readme), textEntry("meta.json", JSON.stringify(meta, null, 2)), textEntry("kv.json", JSON.stringify(rows)), ...entries];
      const blob = buildZipBlob(all);
      const a = document.createElement("a");
      const day = new Date().toISOString().slice(0, 10);
      a.href = URL.createObjectURL(blob);
      a.download = `kulto-copia-${day}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      const mb = (blob.size / 1048576).toFixed(1);
      setResult({
        ok: failed.length === 0,
        msg: `Listo: se descargó "kulto-copia-${day}.zip" (${mb} MB) con ${rows.length} datos y ${entries.length} fotos.` + (failed.length ? ` Atención: ${failed.length} foto(s) no se pudieron bajar (${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}). Repetí la copia para reintentar.` : " Guardalo en un lugar seguro (Google Drive, disco externo)."),
      });
    } catch (e) {
      setResult({ ok: false, msg: "No se pudo completar la copia: " + (e?.message || "error desconocido") + ". Podés volver a intentarlo." });
    } finally {
      setBusy(false); setStatus("");
    }
  };

  const restoreBackup = async (file) => {
    if (!file) return;
    setBusy(true); setResult(null); setProgress({ done: 0, total: 0 });
    try {
      setStatus("Leyendo el archivo…");
      const entries = await readZipEntries(file);
      const metaE = entries.find((e) => e.name === "meta.json");
      const kvE = entries.find((e) => e.name === "kv.json");
      if (!metaE || !kvE) throw new Error("Ese archivo no es una copia de seguridad de Kulto.");
      const meta = JSON.parse(await (await metaE.blob()).text());
      const rows = JSON.parse(await (await kvE.blob()).text());
      const photos = entries.filter((e) => e.name.startsWith("photos/"));
      const ok = window.confirm(
        `Vas a restaurar la copia del ${String(meta.createdAt || "").slice(0, 10)}:\n• ${rows.length} datos (productos, carpetas, pedidos, clientes, ajustes…)\n• ${photos.length} fotos\n\nLo que haya ahora con el mismo nombre se va a reemplazar por lo de la copia. ¿Continuar?`
      );
      if (!ok) { setStatus(""); setBusy(false); return; }

      setStatus("Subiendo las fotos…");
      setProgress({ done: 0, total: photos.length });
      let donePhotos = 0; const photoFail = [];
      await runPool(photos, 4, async (e) => {
        const path = e.name.slice("photos/".length);
        try {
          const blob = await e.blob();
          const ext = (path.split(".").pop() || "").toLowerCase();
          const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
          const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, { contentType: type, upsert: true, cacheControl: "31536000" });
          if (error) throw error;
        } catch { photoFail.push(path); }
        donePhotos++; setProgress({ done: donePhotos, total: photos.length });
      });

      setStatus("Recuperando los datos…");
      const oldBase = meta.storageBase, newBase = storageBase();
      const fix = (v) => (oldBase && oldBase !== newBase && typeof v === "string" ? v.split(oldBase).join(newBase) : v);
      const prepared = rows.map((r) => ({ key: r.key, value: fix(r.value), updated_at: new Date().toISOString() }));
      const batches = [];
      for (let i = 0; i < prepared.length; i += 10) batches.push(prepared.slice(i, i + 10));
      setProgress({ done: 0, total: prepared.length });
      let doneRows = 0; const rowFail = [];
      await runPool(batches, 3, async (batch) => {
        const { error } = await supabase.from(KV_TABLE).upsert(batch);
        if (!error) { doneRows += batch.length; }
        else {
          for (const row of batch) {
            const { error: e1 } = await supabase.from(KV_TABLE).upsert(row);
            if (e1) rowFail.push(row.key); else doneRows++;
          }
        }
        setProgress({ done: doneRows, total: prepared.length });
      });
      setResult({
        ok: !photoFail.length && !rowFail.length,
        msg: `Restaurado: ${doneRows} de ${prepared.length} datos y ${photos.length - photoFail.length} de ${photos.length} fotos.` + (rowFail.length || photoFail.length ? ` No se pudieron restaurar ${rowFail.length} dato(s) y ${photoFail.length} foto(s) — repetí la restauración.` : " Recargá la web (Ctrl+F5) para verlo. Después tocá \"Optimizar fotos ahora\" para volver a crear las miniaturas."),
      });
    } catch (e) {
      setResult({ ok: false, msg: "No se pudo restaurar: " + (e?.message || "error desconocido") });
    } finally {
      setBusy(false); setStatus("");
      if (restoreInput.current) restoreInput.current.value = "";
    }
  };

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "var(--ink-2)", border: "1px solid var(--sun)" }}>
      <div className="flex items-center gap-2">
        <Download size={16} style={{ color: "var(--sun)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Copia de seguridad de toda la web</p>
      </div>
      <p className="text-xs" style={{ color: "var(--slate)" }}>
        Descarga un solo archivo (.zip) con todo lo que tenés cargado, tal cual está ahora: productos, grupos, carpetas, colores, categorías, diseños, pedidos, clientes, reseñas, ajustes y todas las fotos. Si algún día se borra algo, lo restaurás desde ese mismo archivo. Hacela cada tanto (por ejemplo, una vez por semana o después de subir mucho contenido) y guardá el archivo fuera de la web: en Google Drive o un disco. Dejá esta pantalla abierta hasta que termine. Ojo: el archivo incluye datos de tus clientes, no lo compartas.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={downloadBackup}
          disabled={busy}
          className="kulto-btn text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2"
          style={{ background: "var(--sun)", color: "var(--ink)", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {busy ? "Trabajando…" : "Descargar copia de seguridad"}
        </button>
        <label
          className="kulto-btn text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2 cursor-pointer"
          style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)", opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }}
        >
          <Upload size={14} /> Restaurar desde un archivo
          <input ref={restoreInput} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => restoreBackup(e.target.files?.[0])} />
        </label>
      </div>
      {busy && (
        <p className="text-xs" style={{ color: "var(--bone)" }}>
          {status}{progress.total > 0 ? ` ${progress.done} de ${progress.total}` : ""}
        </p>
      )}
      {result && <p className="text-xs" style={{ color: result.ok ? "var(--sun)" : "var(--signal)" }}>{result.msg}</p>}
    </div>
  );
}

function AdminImageOptimizer() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);

  const collectUrls = (value, out) => {
    if (Array.isArray(value)) value.forEach((v) => collectUrls(v, out));
    else if (value && typeof value === "object") Object.values(value).forEach((v) => collectUrls(v, out));
    else if (typeof value === "string" && thumbUrl(value) !== value) out.add(value);
  };

  const run = async () => {
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      setStatus("Comprobando el almacenamiento de fotos…");
      const probe = await uploadDataUrlToStorage(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      );
      if (!probe) {
        setResult({ ok: false, msg: 'No se pudo usar el almacenamiento de fotos. Falta crear el "bucket" kulto-photos en Supabase (ejecutá el archivo storage-setup.sql en Supabase → SQL Editor) y volvé a probar.' });
        return;
      }
      setStatus("Leyendo productos, diseños y ajustes…");
      const [products, draftProducts, designLibrary, customWorkGallery, settings] = await Promise.all([
        loadProducts(), loadDraftProducts(), loadDesignLibrary(), loadCustomWorkGallery(), loadSettings(),
      ]);
      // 1) Fotos viejas guardadas como texto dentro de la base → a Storage.
      setStatus("Pasando las fotos viejas a archivos…");
      await migrateLegacyImages({ products, draftProducts, designLibrary, customWorkGallery });
      // 2) Miniaturas de todas las fotos que ya están en Storage.
      const [p2, d2, l2, c2, s2] = await Promise.all([
        loadProducts(), loadDraftProducts(), loadDesignLibrary(), loadCustomWorkGallery(), loadSettings(),
      ]);
      const urls = new Set();
      [p2, d2, l2, c2, s2].forEach((v) => collectUrls(v, urls));
      const list = [...urls];
      setProgress({ done: 0, total: list.length });
      setStatus("Creando miniaturas…");
      let created = 0, already = 0, failed = 0, done = 0;
      let cursor = 0;
      const worker = async () => {
        while (cursor < list.length) {
          const url = list[cursor++];
          try {
            let exists = false;
            try { exists = (await fetch(thumbUrl(url), { method: "HEAD", cache: "no-store" })).ok; } catch { exists = false; }
            if (exists) already++;
            else {
              const img = await loadImageEl(url);
              const fullPath = decodeURIComponent(url.split(`/${STORAGE_BUCKET}/`)[1].split(/[?#]/)[0]);
              if (await uploadThumbFor(fullPath, img)) created++; else failed++;
            }
          } catch { failed++; }
          done++;
          setProgress({ done, total: list.length });
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      setResult({ ok: true, msg: `Listo: ${created} miniaturas nuevas, ${already} ya existían${failed ? `, ${failed} no se pudieron crear` : ""}. Recargá la web (Ctrl+F5) para ver la diferencia.` });
    } catch (e) {
      setResult({ ok: false, msg: "Algo falló: " + (e?.message || "error desconocido") + ". Podés volver a tocar el botón, retoma donde quedó." });
    } finally {
      setRunning(false);
      setStatus("");
    }
  };

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div className="flex items-center gap-2">
        <Zap size={16} style={{ color: "var(--sun)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Velocidad de la web — optimizar fotos</p>
      </div>
      <p className="text-xs" style={{ color: "var(--slate)" }}>
        Las tarjetas del catálogo pasan a cargar una miniatura liviana (los PNG con fondo transparente conservan su transparencia) y la foto original completa solo se descarga al abrir el producto. Las fotos que subas de ahora en más ya generan su miniatura solas. Este botón hace lo mismo con las fotos que ya tenés cargadas. No borra ni cambia ninguna foto original. Puede tardar unos minutos: dejá esta pantalla abierta hasta que termine. Se puede repetir sin problema.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="kulto-btn self-start text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2"
        style={{ background: "var(--sun)", color: "var(--ink)", opacity: running ? 0.6 : 1 }}
      >
        {running ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
        {running ? "Optimizando…" : "Optimizar fotos ahora"}
      </button>
      {running && (
        <p className="text-xs" style={{ color: "var(--bone)" }}>
          {status}{progress.total > 0 ? ` ${progress.done} de ${progress.total}` : ""}
        </p>
      )}
      {result && <p className="text-xs" style={{ color: result.ok ? "var(--sun)" : "var(--signal)" }}>{result.msg}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compras — qué reponer o encargar, según stock y pedidos de aviso   */
/* ------------------------------------------------------------------ */

// Google Analytics en sí no se puede mostrar adentro de otra página (Google
// no lo permite, por seguridad, ni siquiera para el dueño de la cuenta) —
// pero Looker Studio (otra herramienta gratis de Google, que lee los mismos
// datos de Analytics) sí permite insertar un reporte así, con gráficos
// reales que se actualizan solos. Acá el admin pega el link de ESE reporte
// una sola vez y después lo ve directo en esta pestaña, sin entrar a Google.
function AdminAnalyticsPanel({ settings, onSaveSettings }) {
  const [urlDraft, setUrlDraft] = useState(settings?.analyticsEmbedUrl || "");
  const [editing, setEditing] = useState(!settings?.analyticsEmbedUrl);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await onSaveSettings({ ...settings, analyticsEmbedUrl: urlDraft.trim() });
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 1800);
  };

  if (!editing && settings?.analyticsEmbedUrl) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} style={{ color: "var(--sun)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Estadísticas (Google Analytics / Looker Studio)</p>
          </div>
          <button onClick={() => { setUrlDraft(settings.analyticsEmbedUrl); setEditing(true); }} className="kulto-btn text-xs font-semibold rounded-lg px-3 py-2" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}>
            Cambiar link
          </button>
        </div>
        <iframe
          src={settings.analyticsEmbedUrl}
          title="Estadísticas"
          className="w-full rounded-2xl"
          style={{ height: "80vh", border: "1px solid var(--line)", background: "var(--ink-2)" }}
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BarChart3 size={18} style={{ color: "var(--sun)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Estadísticas (Google Analytics / Looker Studio)</p>
      </div>
      <p className="text-xs" style={{ color: "var(--slate)" }}>
        Google no deja mostrar Analytics directamente dentro de otra página. La forma de tener tus estadísticas acá, sin entrar a Google cada vez, es crear un reporte gratis en Looker Studio (conectado a tu misma cuenta de Analytics) y pegar acá el link para "insertar" ese reporte:
      </p>
      <ol className="text-xs flex flex-col gap-1.5 list-decimal pl-4" style={{ color: "var(--slate)" }}>
        <li>Entrá a <span style={{ color: "var(--bone)" }}>lookerstudio.google.com</span> con el mismo Gmail de Analytics y creá un "Informe en blanco".</li>
        <li>Como fuente de datos, elegí el conector "Google Analytics" y seleccioná tu propiedad de Kulto.</li>
        <li>Agregá los gráficos que quieras ver (Looker Studio trae plantillas ya armadas con un clic, si no querés armarlo a mano).</li>
        <li>Arriba a la derecha, "Compartir" → "Insertar informe" → activalo y copiá el link que te da (empieza con lookerstudio.google.com/embed/...).</li>
        <li>Pegá ese link acá abajo y guardá.</li>
      </ol>
      <input
        placeholder="https://lookerstudio.google.com/embed/reporting/..."
        value={urlDraft}
        onChange={(e) => setUrlDraft(e.target.value)}
        className="rounded-xl p-2.5 text-sm w-full"
        style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
      />
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={!urlDraft.trim()} className="kulto-btn text-sm font-semibold rounded-full px-4 py-2.5 self-start" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)", opacity: !urlDraft.trim() ? 0.6 : 1 }}>
          {saved ? "Guardado" : "Guardar"}
        </button>
        {settings?.analyticsEmbedUrl && (
          <button onClick={() => setEditing(false)} className="kulto-btn text-xs font-semibold rounded-lg px-3 py-2" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

function AdminRestockPanel({ products, onQuickRestock, settings, onSaveSettings }) {
  const threshold = settings?.lowStockThreshold ?? 3;
  const lowStock = products.filter((p) => (p.stock ?? 0) <= threshold).sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
  // Se agrupan por grupo/temática (ej: "anime", "kulto") en vez de mostrar
  // todo junto en una sola lista larga — igual que en la pestaña
  // "Productos", para que sea más fácil ubicar qué carpeta conviene
  // reponer. Empiezan todas desplegadas (no se esconde nada, solo se
  // organiza), pero se pueden plegar para ver menos de una vez.
  const groupedLowStock = lowStock.reduce((acc, p) => {
    const grp = p.group || "Sin grupo / temática";
    (acc[grp] = acc[grp] || []).push(p);
    return acc;
  }, {});
  const [collapsedGroups, setCollapsedGroups] = useState([]);
  const toggleGroup = (grp) => setCollapsedGroups((prev) => (prev.includes(grp) ? prev.filter((g) => g !== grp) : [...prev, grp]));

  const [subscriberCounts, setSubscriberCounts] = useState({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(lowStock.map(async (p) => [p.id, (await getRestockSubscribers(p.id)).length]));
      if (!cancelled) setSubscriberCounts(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [products, settings?.lowStockThreshold]);

  const [addDrafts, setAddDrafts] = useState({});
  const [savedId, setSavedId] = useState(null);
  const addStock = async (p) => {
    const amount = Number(addDrafts[p.id]) || 0;
    if (amount <= 0) return;
    await onQuickRestock(p.id, amount);
    setAddDrafts((d) => ({ ...d, [p.id]: "" }));
    setSavedId(p.id);
    setTimeout(() => setSavedId(null), 1800);
  };

  const [thresholdDraft, setThresholdDraft] = useState(threshold);
  useEffect(() => { setThresholdDraft(threshold); }, [threshold]);
  const [thresholdSaved, setThresholdSaved] = useState(false);
  const saveThreshold = async () => {
    await onSaveSettings({ ...settings, lowStockThreshold: Number(thresholdDraft) || 0 });
    setThresholdSaved(true);
    setTimeout(() => setThresholdSaved(false), 1800);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Boxes size={18} style={{ color: "var(--sun)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Prendas que conviene comprar o encargar</p>
      </div>
      <p className="text-xs -mt-2" style={{ color: "var(--slate)" }}>
        Como trabajás bajo pedido, acá ves qué prendas están sin stock o con poco, y cuántos clientes están esperando que vuelvan — para saber qué encargarle al proveedor antes de que te lo pidan.
      </p>

      <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
        <label className="text-xs flex items-center gap-2" style={{ color: "var(--slate)" }}>
          Avisarme cuando el stock de una prenda sea igual o menor a:
          <input
            type="number" min="0" value={thresholdDraft}
            onChange={(e) => setThresholdDraft(e.target.value)}
            className="w-16 rounded-lg p-1.5 text-sm text-center"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
          />
        </label>
        <button onClick={saveThreshold} className="kulto-btn text-xs font-semibold rounded-lg px-3 py-2" style={{ background: thresholdSaved ? "var(--sun)" : "var(--signal)", color: thresholdSaved ? "var(--ink)" : "var(--bone)" }}>
          {thresholdSaved ? "Guardado" : "Guardar"}
        </button>
      </div>

      {lowStock.length === 0 ? (
        <EmptyState text="Por ahora ninguna prenda está por debajo del umbral de stock bajo." />
      ) : (
        <div className="flex flex-col gap-3">
          {Object.entries(groupedLowStock).map(([grp, items]) => {
            const isOpen = !collapsedGroups.includes(grp);
            return (
              <div key={grp} className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                <button
                  type="button"
                  onClick={() => toggleGroup(grp)}
                  className="kulto-btn w-full flex items-center gap-2 p-3 text-left"
                  style={{ background: "var(--ink-2)" }}
                >
                  {isOpen ? <ChevronDown size={16} color="var(--slate)" /> : <ChevronRight size={16} color="var(--slate)" />}
                  <span className="text-sm font-semibold flex-1" style={{ color: "var(--bone)" }}>{grp}</span>
                  <span className="text-xs" style={{ color: "var(--slate)" }}>{items.length} prenda{items.length === 1 ? "" : "s"}</span>
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-2 p-2 pt-0" style={{ background: "var(--ink-2)" }}>
                    {items.map((p) => (
                      <div key={p.id} className="rounded-xl p-3 flex flex-wrap items-center gap-3" style={{ background: "var(--ink-3)", border: (p.stock ?? 0) <= 0 ? "1px solid var(--signal)" : "1px solid var(--line)" }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "var(--bone)" }}>{p.name}</p>
                          <p className="text-xs" style={{ color: (p.stock ?? 0) <= 0 ? "var(--signal)" : "var(--slate)" }}>
                            {p.category}{p.subcategory ? ` · ${p.subcategory}` : ""} · Stock: {p.stock ?? 0}
                            {subscriberCounts[p.id] > 0 && ` · ${subscriberCounts[p.id]} cliente${subscriberCounts[p.id] === 1 ? "" : "s"} esperando aviso`}
                          </p>
                        </div>
                        <input
                          type="number" min="1" placeholder="Cant."
                          value={addDrafts[p.id] || ""}
                          onChange={(e) => setAddDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                          className="w-20 rounded-lg p-2 text-sm text-center"
                          style={{ background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
                        />
                        <button onClick={() => addStock(p)} className="kulto-btn text-xs font-semibold rounded-lg px-3 py-2" style={{ background: savedId === p.id ? "var(--sun)" : "var(--signal)", color: savedId === p.id ? "var(--ink)" : "var(--bone)" }}>
                          {savedId === p.id ? "Sumado" : "Sumar stock"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-xs" style={{ color: "var(--slate)" }}>
            Sumar stock acá lo hace directo, sin pasar por "Publicar cambios" — si el stock pasa de 0 para arriba, se les avisa por mail automáticamente a los clientes que pidieron que les notifiquen.
          </p>
        </div>
      )}
    </div>
  );
}

const BANNER_FOCUS_OPTIONS = [
  ["center", "Centro"],
  ["top", "Arriba"],
  ["bottom", "Abajo"],
  ["left", "Izquierda"],
  ["right", "Derecha"],
];

// Marco ancho (estilo banner) para el recorte manual: dejar que el admin
// arrastre y haga zoom sobre la foto para elegir exactamente qué parte se ve,
// en vez de depender solo de los 5 focos predefinidos de arriba.
const BANNER_CROP_FRAME_W = 320;
const BANNER_CROP_FRAME_H = 130;
const BANNER_CROP_OUT_W = 1600;
const BANNER_CROP_OUT_H = 650;

function AdminBannerSettings({ settings, groups = [], onSave }) {
  const [heroTitle, setHeroTitle] = useState(settings.heroTitle);
  const [heroSubtitle, setHeroSubtitle] = useState(settings.heroSubtitle);
  // Compatibilidad: si la tienda todavía tiene la imagen vieja de portada
  // (un solo campo, "heroImage") y nunca cargó varias, arrancamos la lista
  // con esa — así no se pierde nada al actualizar.
  const initialHeroImages = () => (settings.heroImages && settings.heroImages.length ? settings.heroImages : (settings.heroImage ? [settings.heroImage] : []));
  const [heroImages, setHeroImages] = useState(initialHeroImages());
  const [banners, setBanners] = useState(settings.banners || []);
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(false);
  const [cropSource, setCropSource] = useState(null);

  useEffect(() => {
    setHeroTitle(settings.heroTitle);
    setHeroSubtitle(settings.heroSubtitle);
    setHeroImages(initialHeroImages());
    setBanners(settings.banners || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  // Las fotos de portada son lo primero que carga CUALQUIER visitante, así
  // que acá sí conviene comprimirlas siempre que se pueda. Pero esta misma
  // sección también se usa para imágenes decorativas con transparencia (ej:
  // el logo, que tiene que verse flotando sobre el fondo oscuro, no en un
  // recuadro). fileToBase64 ya detecta solo si la imagen tiene transparencia
  // de verdad: si no la tiene, la comprime como JPG liviano; si la tiene
  // (como un logo en PNG), la mantiene en PNG para no taparla con un fondo
  // negro — por eso acá pedimos "image/png" y dejamos que decida sola.
  const addHeroImages = (fileList) => {
    Array.from(fileList || []).forEach((f) => {
      fileToBase64(f, (b64) => setHeroImages((imgs) => [...imgs, b64]), 1200, 0.85, "image/png");
    });
  };
  const removeHeroImage = (img) => setHeroImages((imgs) => imgs.filter((i) => i !== img));

  const saveDefault = async () => {
    await onSave({ heroTitle, heroSubtitle, heroImages, heroImage: heroImages[0] || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const openNew = () => setDraft({
    id: genId("banner"),
    title: banners.length === 0 ? heroTitle : "",
    subtitle: banners.length === 0 ? heroSubtitle : "",
    image: banners.length === 0 ? (heroImages[0] || null) : null,
    ctaLabel: "Ver catálogo",
    ctaAction: "catalog",
    ctaUrl: "",
    ctaGroup: groups[0] || "",
    active: true,
    placement: "hero",
    size: "md",
    layout: "full",
    focus: "center",
    highlightColor: "#FFD447",
  });
  const openEdit = (b) => setDraft({ ...b });
  const closeDraft = () => setDraft(null);

  const handleDraftUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const isPng = f.type === "image/png";
    fileToBase64(f, (b64) => setDraft((d) => ({ ...d, image: b64 })), 1400, isPng ? 1 : 0.88, isPng ? "image/png" : "image/jpeg");
  };

  const handleCropConfirm = (croppedBase64) => {
    setDraft((d) => ({ ...d, image: croppedBase64 }));
    setCropSource(null);
  };
  const handleCropCancel = () => setCropSource(null);

  const persistBanners = async (next) => {
    setBanners(next);
    await onSave({ banners: next });
  };

  const saveDraft = async () => {
    if (!draft.title.trim()) return;
    const exists = banners.some((b) => b.id === draft.id);
    const next = exists ? banners.map((b) => (b.id === draft.id ? draft : b)) : [...banners, draft];
    await persistBanners(next);
    setDraft(null);
  };

  const removeBanner = (id) => persistBanners(banners.filter((b) => b.id !== id));
  const toggleActive = (id) => persistBanners(banners.map((b) => (b.id === id ? { ...b, active: b.active === false } : b)));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= banners.length) return;
    const next = [...banners];
    [next[i], next[j]] = [next[j], next[i]];
    persistBanners(next);
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-5 max-w-2xl" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Banners</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Armá carteles con imagen, texto y botón, e ideal para ir cambiando según la temporada o el diseño del momento. Cada uno puede ir arriba de todo en el inicio (rotando si hay varios) o como una sección más entre los bloques de la página — vas a poder acomodarlos en "Secciones del inicio" de más abajo.
        </p>
      </div>

      {banners.length === 0 && <EmptyState text="Todavía no armaste ningún banner." />}

      <div className="flex flex-col gap-3">
        {banners.map((b, i) => (
          <div key={b.id} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "var(--ink-3)", border: "1px solid var(--line)", opacity: b.active === false ? 0.5 : 1 }}>
            <div className="flex flex-col gap-1 shrink-0">
              <button disabled={i === 0} onClick={() => move(i, -1)} className="kulto-btn p-1 rounded" style={{ color: i === 0 ? "var(--ink)" : "var(--bone)" }} aria-label="Subir banner"><ArrowUp size={14} /></button>
              <button disabled={i === banners.length - 1} onClick={() => move(i, 1)} className="kulto-btn p-1 rounded" style={{ color: i === banners.length - 1 ? "var(--ink)" : "var(--bone)" }} aria-label="Bajar banner"><ArrowDown size={14} /></button>
            </div>
            <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ background: "var(--ink)", border: "1px solid var(--line)" }}>
              {b.image ? <img loading="lazy" src={b.image} alt="" className="w-full h-full object-contain p-0.5" /> : <Shirt size={18} color="rgba(243,239,230,0.4)" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "var(--bone)" }}>{b.title || "(sin título)"}</p>
              <p className="text-xs truncate" style={{ color: "var(--slate)" }}>
                {b.active === false ? "Oculto" : "Activo"} · {b.placement === "section" ? "sección del inicio" : "portada (arriba de todo)"}
                {b.placement === "section" && (b.layout === "tile" ? " · estilo grilla" : b.layout === "row" ? " · ancho del catálogo" : " · de punta a punta")} · botón: {b.ctaLabel || "Ver catálogo"}
              </p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={() => toggleActive(b.id)} className="kulto-btn text-[11px] px-2 py-1 rounded-full font-semibold" style={{ background: b.active === false ? "var(--ink)" : "var(--sun)", color: b.active === false ? "var(--bone)" : "var(--ink)" }}>
                {b.active === false ? "Mostrar" : "Ocultar"}
              </button>
              <div className="flex gap-1 justify-end">
                <button onClick={() => openEdit(b)} className="kulto-btn p-1.5 rounded-full" style={{ color: "var(--bone)" }} aria-label="Editar banner"><Pencil size={14} /></button>
                <button onClick={() => { if (window.confirm(`¿Borrar el banner "${b.title || "sin título"}"? Esta acción no se puede deshacer.`)) removeBanner(b.id); }} className="kulto-btn p-1.5 rounded-full" style={{ color: "var(--signal)" }} aria-label="Borrar banner"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!draft && (
        <button onClick={openNew} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center gap-2 w-fit px-5" style={{ background: "var(--signal)", color: "var(--bone)" }}>
          <Plus size={16} /> Agregar banner
        </button>
      )}

      {draft && (
        <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
          <h5 className="text-sm font-semibold" style={{ color: "var(--bone)" }}>{banners.some((b) => b.id === draft.id) ? "Editar banner" : "Nuevo banner"}</h5>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Título</label>
            <textarea value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} rows={2} className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Subtítulo</label>
            <textarea value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} rows={2} className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Contorno del texto (para que se lea sobre fotos claras o con mucho detalle)</label>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="range"
                min="0"
                max="8"
                step="0.5"
                value={draft.textOutlineWidth ?? 0}
                onChange={(e) => setDraft({ ...draft, textOutlineWidth: Number(e.target.value) })}
                className="flex-1 min-w-[140px]"
                aria-label="Grosor del contorno"
              />
              <span className="text-xs w-20 text-right" style={{ color: "var(--slate)" }}>{(draft.textOutlineWidth ?? 0) > 0 ? `Grosor ${draft.textOutlineWidth} px` : "Sin contorno"}</span>
              <input type="color" value={draft.textOutlineColor || "#000000"} onChange={(e) => setDraft({ ...draft, textOutlineColor: e.target.value })} className="w-12 h-9 rounded" style={{ background: "transparent" }} aria-label="Color del contorno" />
              <span className="text-xs" style={{ color: "var(--slate)" }}>{draft.textOutlineColor || "#000000"}</span>
            </div>
            <div className="mt-2 rounded-xl p-4 overflow-hidden" style={{ background: "var(--ink)", backgroundImage: draft.image ? `url("${draft.image}")` : "none", backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--line)" }}>
              <p className="kulto-display text-2xl leading-tight whitespace-pre-line" style={{ color: "var(--bone)", ...textOutlineStyle(draft.textOutlineWidth, draft.textOutlineColor) }}>{draft.title || "Título de ejemplo"}</p>
              <p className="text-sm mt-1" style={{ color: "var(--bone)", ...textOutlineStyle(draft.textOutlineWidth, draft.textOutlineColor) }}>{draft.subtitle || "Así se va a ver el texto sobre tu foto."}</p>
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Imagen (PNG o JPG)</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ background: "var(--ink)", border: "1px solid var(--line)" }}>
                {draft.image ? <img loading="lazy" src={draft.image} alt="" className="w-full h-full object-contain p-1" /> : <Shirt size={20} color="rgba(243,239,230,0.4)" />}
              </div>
              <div className="flex flex-col gap-2">
                <label className="kulto-btn text-xs flex items-center gap-1 rounded-xl px-3 py-2 w-fit" style={{ background: "var(--ink)", color: "var(--bone)" }}>
                  <Upload size={14} /> Subir imagen
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleDraftUpload} />
                </label>
                {draft.image && (
                  <button onClick={() => setCropSource(draft.image)} className="kulto-btn text-xs flex items-center gap-1 rounded-xl px-3 py-2 w-fit" style={{ background: "var(--ink)", color: "var(--bone)" }}>
                    <ZoomIn size={14} /> Recortar / acomodar
                  </button>
                )}
                {draft.image && <button onClick={() => setDraft({ ...draft, image: null })} className="kulto-btn text-xs" style={{ color: "var(--signal)" }}>Quitar imagen</button>}
              </div>
            </div>
            {draft.image && (
              <p className="text-xs mt-2" style={{ color: "var(--slate)" }}>
                Tocá "Recortar / acomodar" para arrastrar la foto y hacerle zoom hasta dejar visible exactamente la parte que querés — no hace falta que sea la imagen entera.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Dónde va este banner</label>
            <select value={draft.placement || "hero"} onChange={(e) => setDraft({ ...draft, placement: e.target.value })} className="w-full rounded-xl p-3 text-sm" style={inputStyle}>
              <option value="hero">Arriba de todo, en la portada (rota con los demás)</option>
              <option value="section">Entre los bloques del inicio (por ejemplo, entre "Tendencia" y "En oferta")</option>
            </select>
            {draft.placement === "section" && (
              <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
                Después de guardarlo, andá a "Secciones del inicio" para ubicarlo donde quieras.
              </p>
            )}
          </div>
          {draft.placement === "section" && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Estilo del banner</label>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setDraft({ ...draft, layout: "full" })}
                  className="kulto-btn rounded-xl py-2 text-sm font-semibold"
                  style={{ background: (draft.layout || "full") === "full" ? "var(--signal)" : "var(--ink)", color: "var(--bone)" }}
                >
                  De punta a punta de la pantalla
                </button>
                <button
                  onClick={() => setDraft({ ...draft, layout: "row" })}
                  className="kulto-btn rounded-xl py-2 text-sm font-semibold"
                  style={{ background: draft.layout === "row" ? "var(--signal)" : "var(--ink)", color: "var(--bone)" }}
                >
                  Ancho del catálogo (mismo ancho que la grilla de productos)
                </button>
                <button
                  onClick={() => setDraft({ ...draft, layout: "tile" })}
                  className="kulto-btn rounded-xl py-2 text-sm font-semibold"
                  style={{ background: draft.layout === "tile" ? "var(--signal)" : "var(--ink)", color: "var(--bone)" }}
                >
                  Tarjeta (como los productos)
                </button>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
                {draft.layout === "tile"
                  ? "Se muestra del tamaño de una tarjeta de producto. Si ponés varios banners \"tarjeta\" seguidos en \"Secciones del inicio\", se acomodan solos en una fila tipo grilla."
                  : draft.layout === "row"
                  ? "Ocupa todo el ancho de la grilla de productos, de punta a punta de esa franja (con los mismos márgenes que las cajas de producto), pero sin llegar a los bordes reales de la pantalla."
                  : "Ocupa todo el ancho de la pantalla, como los banners de adidas.es."}
              </p>
            </div>
          )}
          {draft.placement === "section" && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Grosor del banner</label>
              <div className="flex gap-2">
                {[["sm", "Chico"], ["md", "Mediano"], ["lg", "Grande"]].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setDraft({ ...draft, size: val })}
                    className="kulto-btn flex-1 rounded-xl py-2 text-sm font-semibold"
                    style={{ background: (draft.size || "md") === val ? "var(--signal)" : "var(--ink)", color: "var(--bone)" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {draft.placement === "section" && draft.layout === "row" && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Puntas del banner</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setDraft({ ...draft, roundedCorners: false })}
                  className="kulto-btn flex-1 rounded-xl py-2 text-sm font-semibold"
                  style={{ background: !draft.roundedCorners ? "var(--signal)" : "var(--ink)", color: "var(--bone)" }}
                >
                  Rectas
                </button>
                <button
                  onClick={() => setDraft({ ...draft, roundedCorners: true })}
                  className="kulto-btn flex-1 rounded-xl py-2 text-sm font-semibold"
                  style={{ background: draft.roundedCorners ? "var(--signal)" : "var(--ink)", color: "var(--bone)" }}
                >
                  Redondeadas (como el resto)
                </button>
              </div>
            </div>
          )}
          {draft.image && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Qué parte de la foto se ve</label>
              <select value={draft.focus || "center"} onChange={(e) => setDraft({ ...draft, focus: e.target.value })} className="w-full rounded-xl p-3 text-sm" style={inputStyle}>
                {BANNER_FOCUS_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
              <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
                Útil cuando el banner recorta la foto por ser más chico que la imagen original — elegí qué parte querés que quede siempre visible.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Texto del botón</label>
              <input value={draft.ctaLabel} onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })} className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>El banner lleva a</label>
              <select value={draft.ctaAction} onChange={(e) => setDraft({ ...draft, ctaAction: e.target.value, ctaGroup: e.target.value === "group" ? (draft.ctaGroup || groups[0] || "") : draft.ctaGroup })} className="w-full rounded-xl p-3 text-sm" style={inputStyle}>
                <option value="catalog">Catálogo (todo)</option>
                <option value="group">Un grupo del catálogo</option>
                <option value="wizard">Personalizar</option>
                <option value="url">Un link</option>
                <option value="none">A ningún lado (no se puede clickear)</option>
              </select>
            </div>
          </div>
          {draft.ctaAction === "group" && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Grupo</label>
              {groups.length > 0 ? (
                <select value={draft.ctaGroup || ""} onChange={(e) => setDraft({ ...draft, ctaGroup: e.target.value })} className="w-full rounded-xl p-3 text-sm" style={inputStyle}>
                  {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              ) : (
                <p className="text-xs" style={{ color: "var(--slate)" }}>Todavía no creaste grupos de catálogo. Creá uno primero en la pestaña "Productos".</p>
              )}
              <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
                Ej: un banner "Kulto Anime" que lleve directo al grupo "Anime" del catálogo.
              </p>
            </div>
          )}
          {draft.ctaAction === "url" && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Link (https://...)</label>
              <input value={draft.ctaUrl} onChange={(e) => setDraft({ ...draft, ctaUrl: e.target.value })} placeholder="https://" className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
            </div>
          )}
          {draft.ctaAction !== "none" && (
            <>
              <p className="text-xs" style={{ color: "var(--slate)" }}>
                Todo el banner es clickeable (no hace falta tocar justo el botón): al pasar el mouse se agranda un poco y brilla con el color que elijas abajo.
              </p>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Color del brillo al pasar el mouse</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={draft.highlightColor || "#FFD447"} onChange={(e) => setDraft({ ...draft, highlightColor: e.target.value })} className="w-12 h-9 rounded" style={{ background: "transparent" }} />
                  <span className="text-xs" style={{ color: "var(--slate)" }}>{draft.highlightColor || "#FFD447"}</span>
                </div>
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--bone)" }}>
            <input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Mostrarlo en la web
          </label>
          <div className="flex gap-2">
            <button onClick={saveDraft} className="kulto-btn flex-1 rounded-full py-3 font-semibold" style={{ background: "var(--signal)", color: "var(--bone)" }}>
              Guardar banner
            </button>
            <button onClick={closeDraft} className="kulto-btn rounded-full px-4" style={{ background: "var(--ink)", color: "var(--bone)" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="pt-4 flex flex-col gap-4" style={{ borderTop: "1px solid var(--line)" }}>
        <div>
          <h5 className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Cartel por defecto</h5>
          <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>Se usa solo cuando no tenés ningún banner activo arriba.</p>
        </div>
        <div>
          <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>Título</label>
          <textarea value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} rows={2} className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>Subtítulo</label>
          <textarea value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} rows={3} className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>Imagen decorativa (PNG o JPG)</label>
          <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
            Subí una o varias — cada una se ve tal cual la subiste, sin recortarla. Si cargás más de una, van cambiando solas cada 4 segundos.
          </p>
          <div className="flex flex-wrap gap-2">
            {heroImages.map((img, i) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
                <img loading="lazy" src={img} alt="" className="w-full h-full object-contain p-1" />
                <button
                  onClick={() => removeHeroImage(img)}
                  className="kulto-btn absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(21,19,26,0.8)", color: "var(--bone)" }}
                  title="Quitar"
                  aria-label="Quitar imagen"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            <label
              className="kulto-btn w-20 h-20 rounded-xl flex flex-col items-center justify-center gap-1 shrink-0"
              style={{ background: "var(--ink-3)", border: "1px dashed var(--line)", color: "var(--slate)" }}
            >
              <Upload size={16} />
              <span className="text-[10px]">Agregar</span>
              <input type="file" accept="image/png,image/jpeg" multiple className="hidden" onChange={(e) => { addHeroImages(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        </div>
        <button onClick={saveDefault} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
          {saved ? <><Check size={16} /> Guardado</> : "Guardar cartel por defecto"}
        </button>
      </div>

      {cropSource && (
        <CropModal
          source={cropSource}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
          frameW={BANNER_CROP_FRAME_W}
          frameH={BANNER_CROP_FRAME_H}
          outW={BANNER_CROP_OUT_W}
          outH={BANNER_CROP_OUT_H}
          title="Arrastrá y hacé zoom para elegir qué parte del banner se ve"
        />
      )}
    </div>
  );
}

function AdminBrandSettings({ settings, onSave }) {
  const [logoImage, setLogoImage] = useState(settings.logoImage);
  const [logoText, setLogoText] = useState(settings.logoText || "");
  const [socialInstagram, setSocialInstagram] = useState(settings.socialInstagram || "");
  const [socialFacebook, setSocialFacebook] = useState(settings.socialFacebook || "");
  const [socialTiktok, setSocialTiktok] = useState(settings.socialTiktok || "");
  const [contactEmail, setContactEmail] = useState(settings.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(settings.contactPhone || "");
  const [contactAddress, setContactAddress] = useState(settings.contactAddress || "");
  const [whatsappNumber, setWhatsappNumber] = useState(settings.whatsappNumber || "");
  const [whatsappFloatEnabled, setWhatsappFloatEnabled] = useState(!!settings.whatsappFloatEnabled);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLogoImage(settings.logoImage);
    setLogoText(settings.logoText || "");
    setSocialInstagram(settings.socialInstagram || "");
    setSocialFacebook(settings.socialFacebook || "");
    setSocialTiktok(settings.socialTiktok || "");
    setContactEmail(settings.contactEmail || "");
    setContactPhone(settings.contactPhone || "");
    setContactAddress(settings.contactAddress || "");
    setWhatsappNumber(settings.whatsappNumber || "");
    setWhatsappFloatEnabled(!!settings.whatsappFloatEnabled);
  }, [settings]);

  const handleUpload = (e) => {
    const f = e.target.files[0];
    // PNG keeps transparency — important for logos with no background.
    if (f) fileToBase64(f, (b64) => setLogoImage(b64), 512, 1, "image/png");
  };

  const save = async () => {
    // Limpia espacios, "+" y guiones — wa.me necesita el número pelado, en
    // formato internacional (ej: 34612345678).
    const cleanWhatsapp = whatsappNumber.replace(/[^0-9]/g, "");
    await onSave({ logoImage, logoText, socialInstagram, socialFacebook, socialTiktok, contactEmail, contactPhone, contactAddress, whatsappNumber: cleanWhatsapp, whatsappFloatEnabled });
    setWhatsappNumber(cleanWhatsapp);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-md" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Marca</h4>
      <p className="text-xs" style={{ color: "var(--slate)" }}>
        Subí tu logo en PNG con fondo transparente para que se vea bien sobre el fondo oscuro. Se usa en la cabecera de la web, como ícono de la pestaña del navegador (favicon) y como ícono de la app cuando alguien la instala en su celular — para que se vea bien en los tres lugares, que sea cuadrado. Al cambiarlo acá y guardar, ya queda listo: no hace falta tocar nada más ni volver a publicar el sitio.
      </p>
      <p className="text-xs" style={{ color: "var(--sun)" }}>
        Ojo: en los celulares donde la app ya estaba instalada, el ícono nuevo puede tardar en aparecer (Android) o directamente no actualizarse (iPhone — ahí Apple no lo permite). Siempre se ve bien en las instalaciones nuevas.
      </p>
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
          style={{
            backgroundImage: "linear-gradient(45deg, #2a2730 25%, transparent 25%), linear-gradient(-45deg, #2a2730 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2730 75%), linear-gradient(-45deg, transparent 75%, #2a2730 75%)",
            backgroundSize: "10px 10px",
            backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0px",
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--line)",
          }}
        >
          {logoImage ? <img loading="lazy" src={logoImage} alt="Logo" className="w-full h-full object-contain p-1" /> : <Shirt size={22} color="rgba(243,239,230,0.4)" />}
        </div>
        <div className="flex flex-col gap-2">
          <label className="kulto-btn text-xs flex items-center gap-1 rounded-xl px-3 py-2 w-fit" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
            <Upload size={14} /> Subir logo (PNG)
            <input type="file" accept="image/png" className="hidden" onChange={handleUpload} />
          </label>
          {logoImage && (
            <button onClick={() => setLogoImage(null)} className="kulto-btn text-xs" style={{ color: "var(--signal)" }}>Quitar logo</button>
          )}
        </div>
      </div>
      <div>
        <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>Texto junto al logo (opcional)</label>
        <input
          value={logoText}
          onChange={(e) => setLogoText(e.target.value)}
          placeholder="Ej: KULTO"
          className="w-full rounded-xl p-3 text-sm"
          style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
        />
      </div>

      <div className="pt-2" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Redes sociales</p>
        <div className="flex flex-col gap-2">
          <input
            value={socialInstagram}
            onChange={(e) => setSocialInstagram(e.target.value)}
            placeholder="Link de Instagram"
            className="w-full rounded-xl p-3 text-sm"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
          />
          <input
            value={socialFacebook}
            onChange={(e) => setSocialFacebook(e.target.value)}
            placeholder="Link de Facebook (opcional)"
            className="w-full rounded-xl p-3 text-sm"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
          />
          <input
            value={socialTiktok}
            onChange={(e) => setSocialTiktok(e.target.value)}
            placeholder="Link de TikTok (opcional)"
            className="w-full rounded-xl p-3 text-sm"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
          />
        </div>
      </div>

      <div className="pt-2" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>WhatsApp</p>
        <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
          El pedido en sí nunca depende de esto — se guarda y te llega por mail siempre. Este número es para los botones opcionales de "Escribir por WhatsApp" (pie de página y "¿Tienes dudas?"). Mientras lo dejes vacío, esos botones no aparecen en la web.
        </p>
        <input
          value={whatsappNumber}
          onChange={(e) => setWhatsappNumber(e.target.value)}
          placeholder="Ej: 34612345678 (código de país + número, sin + ni espacios)"
          className="w-full rounded-xl p-3 text-sm mb-3"
          style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
        />
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--bone)" }}>
          <input type="checkbox" checked={whatsappFloatEnabled} onChange={(e) => setWhatsappFloatEnabled(e.target.checked)} />
          Mostrar el globito flotante de WhatsApp (abajo a la derecha, en toda la web)
        </label>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Es independiente del número de arriba — lo podés prender o apagar cuando quieras, aunque ya tengas un número cargado. Arranca apagado.
        </p>
      </div>

      <div className="pt-2" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Datos de contacto formales</p>
        <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>Se muestran en el pie de página y en "¿Tienes dudas?".</p>
        <div className="flex flex-col gap-2">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Mail de contacto"
            className="w-full rounded-xl p-3 text-sm"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
          />
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="Teléfono para mostrar (opcional, puede ser distinto al de WhatsApp)"
            className="w-full rounded-xl p-3 text-sm"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
          />
          <input
            value={contactAddress}
            onChange={(e) => setContactAddress(e.target.value)}
            placeholder="Dirección (opcional)"
            className="w-full rounded-xl p-3 text-sm"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
          />
        </div>
      </div>

      <button onClick={save} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
        {saved ? <><Check size={16} /> Guardado</> : "Guardar"}
      </button>
    </div>
  );
}

// Las fotos-paso que se ven debajo del título "Crea una prenda única" en el
// inicio (entre los banners) — cada una representa un paso a seguir para
// personalizar una prenda (ej: elegir la prenda, elegir el color, subir el
// diseño). Se suben tal cual, sin recorte forzado.
// Ventana flotante para reposicionar la foto de un paso dentro de la forma
// elegida (círculo, cuadrado, etc.), arrastrando la imagen directamente con
// el mouse o el dedo — como al elegir la foto de perfil en WhatsApp. Calcula
// el arrastre en base al tamaño real de la imagen para que lo que se ve acá
// sea exactamente lo que después queda en la web.
function ImageFocalPointModal({ image, shape, initialFocalX, initialFocalY, initialFocalZoom, onCancel, onSave }) {
  const MODAL_SIZE = 300;
  const ZOOM_MIN = 0.2, ZOOM_MAX = 4;
  const [focalX, setFocalX] = useState(initialFocalX ?? 50);
  const [focalY, setFocalY] = useState(initialFocalY ?? 50);
  const [zoom, setZoom] = useState(initialFocalZoom ?? 1);
  const [dragging, setDragging] = useState(false);
  const [natural, setNatural] = useState(null); // { w, h }
  const dragRef = useRef(null); // { startX, startY, startFocalX, startFocalY, overflowW, overflowH }
  const box = howItWorksShapeBox(shape, MODAL_SIZE) || { width: MODAL_SIZE, height: MODAL_SIZE };

  const onImgLoad = (e) => {
    setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight });
  };

  // El "overflow" es cuánto se pasa la foto (ya agrandada por el zoom) del
  // tamaño de la caja — es lo que se puede recorrer arrastrando. Con zoom 1x
  // y una foto que ya llena justo la caja en un eje, ese eje no tiene margen
  // para arrastrar (por eso antes, con fotos chicas/cuadradas, el arrastre no
  // hacía nada — antes no había forma de agrandar la foto para poder mover).
  const computeOverflow = (z) => {
    const nat = natural;
    if (!nat || !nat.w || !nat.h) return { overflowW: 0, overflowH: 0 };
    const baseScale = Math.max(box.width / nat.w, box.height / nat.h);
    const scale = baseScale * (z ?? zoom);
    const dispW = nat.w * scale, dispH = nat.h * scale;
    return { overflowW: Math.max(0, dispW - box.width), overflowH: Math.max(0, dispH - box.height) };
  };

  const onPointerMove = (clientX, clientY) => {
    if (!dragRef.current) return;
    const { startX, startY, startFocalX, startFocalY, overflowW, overflowH } = dragRef.current;
    const dx = clientX - startX;
    const dy = clientY - startY;
    const nextX = overflowW > 0 ? Math.max(0, Math.min(100, startFocalX - (dx / overflowW) * 100)) : 50;
    const nextY = overflowH > 0 ? Math.max(0, Math.min(100, startFocalY - (dy / overflowH) * 100)) : 50;
    setFocalX(nextX);
    setFocalY(nextY);
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragRef.current) return;
      e.preventDefault();
      const p = e.touches ? e.touches[0] : e;
      onPointerMove(p.clientX, p.clientY);
    };
    const handleUp = () => { dragRef.current = null; setDragging(false); };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  });

  const startDrag = (e) => {
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    const { overflowW, overflowH } = computeOverflow();
    dragRef.current = { startX: p.clientX, startY: p.clientY, startFocalX: focalX, startFocalY: focalY, overflowW, overflowH };
    setDragging(true);
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="rounded-2xl p-5 flex flex-col gap-4 items-center" style={{ background: "var(--ink-2)", border: "1px solid var(--line)", maxWidth: 360 }}>
        <div className="w-full flex items-center justify-between">
          <h4 className="font-semibold text-sm" style={{ color: "var(--bone)" }}>Ajustá la posición de la foto</h4>
          <button onClick={onCancel} className="kulto-btn p-1 rounded-full" style={{ color: "var(--slate)" }} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <p className="text-xs text-center" style={{ color: "var(--slate)" }}>
          Arrastrá la foto con el mouse o el dedo, y usá el control de abajo para agrandarla o achicarla, hasta que quede como querés adentro de la forma.
        </p>
        <div
          className="relative overflow-hidden select-none"
          style={{ ...box, background: "#fff", cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
          onMouseDown={startDrag}
          onTouchStart={startDrag}
        >
          <img
            src={image}
            alt=""
            onLoad={onImgLoad}
            draggable={false}
            className="pointer-events-none"
            style={(() => {
              const nat = natural;
              if (!nat || !nat.w || !nat.h) return { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: `${focalX}% ${focalY}%` };
              const baseScale = Math.max(box.width / nat.w, box.height / nat.h);
              const scale = baseScale * zoom;
              const dispW = nat.w * scale, dispH = nat.h * scale;
              return { position: "absolute", width: dispW, height: dispH, left: focalOffset(dispW, box.width, focalX), top: focalOffset(dispH, box.height, focalY), maxWidth: "none" };
            })()}
          />
        </div>
        <div className="w-full flex items-center gap-2">
          <ZoomOut size={16} color="var(--slate)" />
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
          <ZoomIn size={16} color="var(--slate)" />
        </div>
        <div className="flex gap-2 w-full">
          <button onClick={() => { setFocalX(50); setFocalY(50); setZoom(1); }} className="kulto-btn flex-1 rounded-xl py-2 text-sm font-semibold" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
            Centrar
          </button>
          <button onClick={onCancel} className="kulto-btn flex-1 rounded-xl py-2 text-sm font-semibold" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
            Cancelar
          </button>
          <button onClick={() => onSave(focalX, focalY, zoom)} className="kulto-btn flex-1 rounded-xl py-2 text-sm font-semibold" style={{ background: "var(--signal)", color: "var(--bone)" }}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminHowItWorksSettings({ settings, onSave }) {
  const [steps, setSteps] = useState(settings.howItWorksSteps || []);
  const [saved, setSaved] = useState(false);
  const [posModalId, setPosModalId] = useState(null);

  useEffect(() => { setSteps(settings.howItWorksSteps || []); }, [settings]);

  const persist = async (next) => {
    setSteps(next);
    await onSave({ howItWorksSteps: next });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const saveCardSize = async (val) => {
    await onSave({ howItWorksCardSize: val });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const saveShape = async (val) => {
    await onSave({ howItWorksImageShape: val });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const addStep = (file) => {
    if (!file) return;
    const isPng = file.type === "image/png";
    fileToBase64(file, (b64) => persist([...steps, { id: genId("step"), image: b64, caption: "" }]), 1200, 0.88, isPng ? "image/png" : "image/jpeg");
  };
  const removeStep = (id) => persist(steps.filter((s) => s.id !== id));
  const updateCaption = (id, caption) => setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, caption } : s)));
  // Cuando la forma recorta la foto (todo menos "Automática"), el admin puede
  // elegir qué parte de la foto queda centrada adentro de esa forma, para que
  // no se corte justo la parte importante (ej: los puntitos de color, las
  // letras de talla). Se guarda como foco en base 0-100 (como object-position).
  const updateFocal = (id, axis, value) => setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, [axis]: value } : s)));
  const saveFocal = (id, focalX, focalY, focalZoom) => {
    const next = steps.map((s) => (s.id === id ? { ...s, focalX, focalY, focalZoom } : s));
    setPosModalId(null);
    persist(next);
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-2xl" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>"Crea una prenda única" — pasos a seguir</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Se muestran debajo del título "Crea una prenda única" en el inicio, entre los banners. Subí una foto por cada paso (ej: elegir la prenda, elegir el color, subir el diseño) y agregale un texto corto si querés.
        </p>
      </div>
      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Tamaño de las tarjetas</label>
        <div className="flex gap-2">
          {[["sm", "Chico"], ["md", "Mediano"], ["lg", "Grande"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => saveCardSize(val)}
              className="kulto-btn flex-1 rounded-xl py-2 text-sm font-semibold"
              style={{ background: (settings.howItWorksCardSize || "md") === val ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Cambia el tamaño de las 3 tarjetas de una — siempre quedan todas iguales entre sí, sin importar cuánto texto tenga cada una.
        </p>
      </div>
      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Forma de las fotos</label>
        <div className="flex gap-2 flex-wrap">
          {[["auto", "Automática"], ["cuadrado", "Cuadrada"], ["circular", "Circular"], ["rectangular", "Rectangular"], ["triangular", "Triangular"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => saveShape(val)}
              className="kulto-btn rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ background: (settings.howItWorksImageShape || "auto") === val ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          "Automática" respeta la proporción real de cada foto. Las demás recortan la foto para que entre en esa forma.
        </p>
      </div>
      {steps.length === 0 && <EmptyState text="Todavía no cargaste ningún paso." />}
      <div className="flex flex-col gap-3">
        {steps.map((s, i) => {
          const shape = settings.howItWorksImageShape || "auto";
          const needsPosition = shape !== "auto" && !!s.image;
          const previewBox = howItWorksShapeBox(shape, 72);
          return (
            <div key={s.id} className="rounded-2xl p-3 flex flex-col gap-3" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1 shrink-0">
                  <button disabled={i === 0} onClick={() => move(i, -1)} className="kulto-btn p-1 rounded" style={{ color: i === 0 ? "var(--ink)" : "var(--bone)" }} aria-label="Subir paso"><ArrowUp size={14} /></button>
                  <button disabled={i === steps.length - 1} onClick={() => move(i, 1)} className="kulto-btn p-1 rounded" style={{ color: i === steps.length - 1 ? "var(--ink)" : "var(--bone)" }} aria-label="Bajar paso"><ArrowDown size={14} /></button>
                </div>
                <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{ background: "var(--ink)", border: "1px solid var(--line)" }}>
                  {s.image ? <img loading="lazy" src={s.image} alt="" className="w-full h-full object-contain p-0.5" /> : <Shirt size={18} color="rgba(243,239,230,0.4)" />}
                </div>
                <input
                  placeholder={`Texto del paso ${i + 1} (opcional)`}
                  value={s.caption || ""}
                  onChange={(e) => updateCaption(s.id, e.target.value)}
                  onBlur={() => persist(steps)}
                  className="flex-1 min-w-0 rounded-xl p-2 text-sm"
                  style={{ background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
                />
                <button onClick={() => removeStep(s.id)} className="kulto-btn p-2 rounded-full" style={{ color: "var(--signal)" }} aria-label="Quitar paso"><Trash2 size={16} /></button>
              </div>
              {needsPosition && (
                <div className="flex items-center gap-4 pl-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                  <div className="shrink-0">
                    <FocalCropImage src={s.image} box={previewBox} focalX={s.focalX ?? 50} focalY={s.focalY ?? 50} zoom={s.focalZoom ?? 1} />
                  </div>
                  <button
                    onClick={() => setPosModalId(s.id)}
                    className="kulto-btn text-sm font-semibold px-3 py-2 rounded-xl flex items-center gap-2"
                    style={{ background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
                  >
                    <Move size={14} /> Ajustar posición y zoom
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <label className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full cursor-pointer flex items-center gap-2 w-fit" style={{ background: "var(--signal)", color: "var(--bone)" }}>
        <Upload size={16} /> Agregar paso
        <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { addStep(e.target.files[0]); e.target.value = ""; }} />
      </label>
      {saved && <p className="text-xs flex items-center gap-1" style={{ color: "var(--sun)" }}><Check size={12} /> Guardado</p>}
      {posModalId && (() => {
        const s = steps.find((x) => x.id === posModalId);
        if (!s) return null;
        return (
          <ImageFocalPointModal
            image={s.image}
            shape={settings.howItWorksImageShape || "auto"}
            initialFocalX={s.focalX ?? 50}
            initialFocalY={s.focalY ?? 50}
            initialFocalZoom={s.focalZoom ?? 1}
            onCancel={() => setPosModalId(null)}
            onSave={(fx, fy, fz) => saveFocal(s.id, fx, fy, fz)}
          />
        );
      })()}
    </div>
  );
}

// Los links que aparecen en el menú flotante "Productos" del header (junto a
// "Catálogo"), elegidos a mano por el admin — a propósito NO se arma solo
// listando todos los grupos/temáticas (esos se usan para los banners del
// inicio, son otra cosa). Cada link puede apuntar a un grupo o a una
// categoría ya creados.
function AdminProductsMenu({ items, categories, groups, onSave }) {
  const [list, setList] = useState(items || []);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setList(items || []); }, [items]);

  const persist = async (next) => {
    setList(next);
    await onSave({ productsMenuItems: next });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const addItem = () => {
    const firstType = groups.length ? "group" : "category";
    const firstValue = (firstType === "group" ? groups[0] : categories[0]) || "";
    persist([...list, { id: genId("pmi"), label: "", type: firstType, value: firstValue }]);
  };
  const updateItem = (id, patch) => setList((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => persist(list.filter((it) => it.id !== id));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  const inputStyle = { background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-2xl" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Menú "Productos" del header</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Al lado de "Catálogo" en el menú flotante, agregá los accesos directos que quieras (ej: "Llaveros", "Lanyards"). Cada uno lleva al catálogo ya filtrado por la categoría o el grupo que elijas. Si un acceso es de tipo "Categoría" y esa categoría tiene productos con "Subcategoría" cargada (ver formulario de producto), automáticamente aparece una flechita para desplegar esas subcategorías debajo — no hace falta configurar nada más acá para eso.
        </p>
      </div>
      {list.length === 0 && <EmptyState text="Por ahora el menú solo muestra 'Catálogo'." />}
      <div className="flex flex-col gap-3">
        {list.map((it, i) => (
          <div key={it.id} className="rounded-2xl p-3 flex flex-wrap items-center gap-2" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
            <div className="flex flex-col gap-1 shrink-0">
              <button disabled={i === 0} onClick={() => move(i, -1)} className="kulto-btn p-1 rounded" style={{ color: i === 0 ? "var(--ink)" : "var(--bone)" }} aria-label="Subir"><ArrowUp size={14} /></button>
              <button disabled={i === list.length - 1} onClick={() => move(i, 1)} className="kulto-btn p-1 rounded" style={{ color: i === list.length - 1 ? "var(--ink)" : "var(--bone)" }} aria-label="Bajar"><ArrowDown size={14} /></button>
            </div>
            <input
              placeholder="Texto a mostrar (ej: Llaveros)"
              value={it.label}
              onChange={(e) => updateItem(it.id, { label: e.target.value })}
              onBlur={() => persist(list)}
              className="rounded-xl p-2 text-sm flex-1 min-w-[140px]"
              style={inputStyle}
            />
            <select
              value={it.type}
              onChange={(e) => {
                const type = e.target.value;
                const value = (type === "group" ? groups[0] : categories[0]) || "";
                const next = list.map((x) => (x.id === it.id ? { ...x, type, value } : x));
                persist(next);
              }}
              className="rounded-xl p-2 text-sm"
              style={inputStyle}
            >
              <option value="category">Categoría</option>
              <option value="group">Grupo / temática</option>
            </select>
            <select
              value={it.value}
              onChange={(e) => persist(list.map((x) => (x.id === it.id ? { ...x, value: e.target.value } : x)))}
              className="rounded-xl p-2 text-sm flex-1 min-w-[140px]"
              style={inputStyle}
            >
              {(it.type === "group" ? groups : categories).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <button onClick={() => removeItem(it.id)} className="kulto-btn p-2 rounded-full" style={{ color: "var(--signal)" }} aria-label="Quitar"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <button
        onClick={addItem}
        disabled={!categories.length && !groups.length}
        className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full flex items-center gap-2 w-fit"
        style={{ background: "var(--signal)", color: "var(--bone)", opacity: !categories.length && !groups.length ? 0.5 : 1 }}
      >
        <Plus size={16} /> Agregar acceso directo
      </button>
      {saved && <p className="text-xs flex items-center gap-1" style={{ color: "var(--sun)" }}><Check size={12} /> Guardado</p>}
    </div>
  );
}

function AdminSectionSettings({ settings, onSave }) {
  const [sections, setSections] = useState(getEffectiveHomeSections(settings));
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  useEffect(() => {
    setSections(getEffectiveHomeSections(settings));
  }, [settings]);

  const persist = (next) => {
    setSections(next);
    onSave({ homeSections: next });
  };

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  const toggleVisible = (key) => {
    persist(sections.map((s) => (s.key === key ? { ...s, visible: s.visible === false } : s)));
  };

  const labelFor = (key) => {
    if (key.startsWith("banner:")) {
      const id = key.slice(7);
      const b = (settings.banners || []).find((x) => x.id === id);
      return b ? `Banner: ${b.title || "(sin título)"}` : "Banner (eliminado)";
    }
    return HOME_SECTION_DEFS.find((d) => d.key === key)?.label || key;
  };

  const sizeFor = (key) => {
    if (!key.startsWith("banner:")) return null;
    const id = key.slice(7);
    const b = (settings.banners || []).find((x) => x.id === id);
    return b?.size || "md";
  };

  const previewBarHeight = (key) => {
    const size = sizeFor(key);
    if (size === "sm") return 14;
    if (size === "lg") return 34;
    if (size === "md") return 22;
    return 18;
  };

  const handleDragStart = (i) => (e) => {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (i) => (e) => {
    e.preventDefault();
    if (i !== overIndex) setOverIndex(i);
  };
  const handleDrop = (i) => (e) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) { setDragIndex(null); setOverIndex(null); return; }
    const next = [...sections];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(i, 0, moved);
    persist(next);
    setDragIndex(null);
    setOverIndex(null);
  };
  const handleDragEnd = () => { setDragIndex(null); setOverIndex(null); };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-3xl" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Secciones del inicio</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Arrastrá cada bloque desde el ícono (o usá las flechas) para cambiar el orden en que aparecen en la página de inicio, y ocultá los que no quieras mostrar por ahora, sin borrar nada. A la derecha vas viendo un esquema de cómo va quedando. Los banners que marcaste como "sección" en la pestaña de Banners también aparecen acá para que los ubiques donde quieras.
        </p>
      </div>
      <div className="grid md:grid-cols-[1fr_auto] gap-5 items-start">
        <div className="flex flex-col gap-2">
          {sections.map((s, i) => (
            <div
              key={s.key}
              draggable
              onDragStart={handleDragStart(i)}
              onDragOver={handleDragOver(i)}
              onDrop={handleDrop(i)}
              onDragEnd={handleDragEnd}
              className="rounded-xl p-3 flex items-center gap-3 cursor-move"
              style={{
                background: "var(--ink-3)",
                border: overIndex === i && dragIndex !== null && dragIndex !== i ? "1px dashed var(--signal)" : "1px solid var(--line)",
                opacity: s.visible === false ? 0.5 : dragIndex === i ? 0.4 : 1,
              }}
            >
              <GripVertical size={16} className="shrink-0" style={{ color: "var(--slate)" }} />
              <div className="flex flex-col gap-1 shrink-0">
                <button disabled={i === 0} onClick={() => move(i, -1)} className="kulto-btn p-1 rounded" style={{ color: i === 0 ? "var(--ink)" : "var(--bone)" }} aria-label="Subir sección"><ArrowUp size={14} /></button>
                <button disabled={i === sections.length - 1} onClick={() => move(i, 1)} className="kulto-btn p-1 rounded" style={{ color: i === sections.length - 1 ? "var(--ink)" : "var(--bone)" }} aria-label="Bajar sección"><ArrowDown size={14} /></button>
              </div>
              <p className="flex-1 text-sm font-semibold" style={{ color: "var(--bone)" }}>{labelFor(s.key)}</p>
              <button onClick={() => toggleVisible(s.key)} className="kulto-btn text-[11px] px-3 py-1.5 rounded-full font-semibold" style={{ background: s.visible === false ? "var(--ink)" : "var(--sun)", color: s.visible === false ? "var(--bone)" : "var(--ink)" }}>
                {s.visible === false ? "Mostrar" : "Ocultar"}
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-3 w-full md:w-40 shrink-0" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
          <p className="text-[11px] font-semibold mb-2" style={{ color: "var(--slate)" }}>Vista previa</p>
          <div className="flex flex-col gap-1">
            <div className="rounded" style={{ height: 20, background: "var(--sun)", opacity: 0.9 }} title="Portada (arriba de todo)" />
            {sections.map((s) => (
              <div
                key={s.key}
                className="rounded"
                style={{
                  height: previewBarHeight(s.key),
                  background: s.key.startsWith("banner:") ? "var(--signal)" : "var(--bone)",
                  opacity: s.visible === false ? 0.25 : 0.85,
                }}
                title={labelFor(s.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminThemeSettings({ settings, onSave }) {
  const [theme, setTheme] = useState(settings.theme || DEFAULT_THEME);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setTheme(settings.theme || DEFAULT_THEME); }, [settings]);

  const fields = [
    { key: "ink", label: "Fondo principal (oscuro)" },
    { key: "bone", label: "Texto e íconos" },
    { key: "signal", label: "Acento principal (botones, ofertas)" },
    { key: "sun", label: "Acento secundario (precios, destacados)" },
    { key: "slate", label: "Texto secundario" },
  ];

  const save = async () => {
    await onSave({ theme });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const setColor = (key, hex) => setTheme((t) => ({ ...t, [key]: hex }));
  const isValidHex = (v) => /^#[0-9A-Fa-f]{6}$/.test(v || "");

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-md" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Colores de la web</h4>
      <p className="text-xs" style={{ color: "var(--slate)" }}>
        Estos son los colores generales del sitio (no los colores de cada producto, que se cargan aparte en cada prenda). Podés pegar directamente el código hexadecimal (ej: #E8452C) en vez de buscarlo en el selector.
      </p>
      <div className="flex flex-col gap-3">
        {fields.map((f) => {
          const raw = theme[f.key] || "";
          const valid = isValidHex(raw);
          return (
            <div key={f.key} className="flex items-center gap-3">
              <input
                type="color"
                value={valid ? raw : "#000000"}
                onChange={(e) => setColor(f.key, e.target.value)}
                className="w-10 h-10 rounded shrink-0"
                style={{ background: "transparent" }}
              />
              <div className="flex-1">
                <p className="text-sm mb-1" style={{ color: "var(--bone)" }}>{f.label}</p>
                <input
                  type="text"
                  value={raw}
                  onChange={(e) => {
                    let v = e.target.value.trim();
                    if (v && !v.startsWith("#")) v = `#${v}`;
                    setColor(f.key, v);
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text").trim();
                    if (pasted) {
                      e.preventDefault();
                      setColor(f.key, pasted.startsWith("#") ? pasted : `#${pasted}`);
                    }
                  }}
                  placeholder="#RRGGBB"
                  spellCheck={false}
                  className="rounded-lg px-2 py-1.5 text-xs w-28 font-mono"
                  style={{ background: "var(--ink-3)", color: "var(--bone)", border: valid ? "1px solid var(--line)" : "1px solid var(--signal)" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-sm mb-2" style={{ color: "var(--bone)" }}>Sombra de las tarjetas de producto</p>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "ninguna", label: "Ninguna" },
            { key: "suave", label: "Suave" },
            { key: "media", label: "Media" },
            { key: "fuerte", label: "Fuerte" },
          ].map((o) => (
            <button
              key={o.key}
              onClick={() => setTheme((t) => ({ ...t, cardShadow: o.key }))}
              className="kulto-btn text-xs font-semibold px-3 py-2 rounded-full"
              style={{
                background: (theme.cardShadow || "media") === o.key ? "var(--signal)" : "var(--ink-3)",
                color: "var(--bone)",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={save} className="kulto-btn flex-1 rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
          {saved ? <><Check size={16} /> Guardado</> : "Guardar"}
        </button>
        <button
          onClick={() => setTheme(DEFAULT_THEME)}
          className="kulto-btn rounded-full px-4 text-sm"
          style={{ background: "var(--ink-3)", color: "var(--bone)" }}
        >
          Restaurar
        </button>
      </div>
    </div>
  );
}

// Zonas donde el dueño entrega en persona (Barcelona y alrededores): los
// pedidos con envío a una de estas ciudades se siguen con la barra de etapas
// en vez del link de seguimiento. Una zona por línea.
function AdminLocalAreasSettings({ settings, onSave }) {
  const current = (settings.localDeliveryAreas?.length ? settings.localDeliveryAreas : DEFAULT_LOCAL_AREAS).join("\n");
  const [text, setText] = useState(current);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setText(current); }, [current]);
  const save = async () => {
    const list = text.split("\n").map((x) => x.trim()).filter(Boolean);
    await onSave({ localDeliveryAreas: list });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Zonas de entrega personal (Barcelona y alrededores)</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Los pedidos que eligen "Recoger en persona", y los de envío a una de estas ciudades, muestran al cliente la barra de etapas (Pedido realizado → Procesando → Terminado → Entregado), que confirmás vos desde Pedidos. Una zona por línea; sirve con parte del nombre (ej: "Hospitalet"). El resto de los envíos sigue con el link de seguimiento.
        </p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        className="rounded-xl p-3 text-sm"
        style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
      />
      <button onClick={save} className="kulto-btn self-start text-sm font-semibold px-4 py-2 rounded-full" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
        {saved ? "Guardado ✓" : "Guardar zonas"}
      </button>
    </div>
  );
}

function AdminShippingSettings({ settings, onSave }) {
  const [flatRate, setFlatRate] = useState(settings.shippingFlatRate);
  const [threshold, setThreshold] = useState(settings.freeShippingThreshold);
  const [regionPrices, setRegionPrices] = useState(settings.shippingRegionPrices || {});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFlatRate(settings.shippingFlatRate);
    setThreshold(settings.freeShippingThreshold);
    setRegionPrices(settings.shippingRegionPrices || {});
  }, [settings]);

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  const save = async () => {
    const cleanedRegionPrices = Object.fromEntries(
      SPAIN_REGIONS.map((region) => [region, Number(regionPrices[region]) || 0])
    );
    await onSave({
      shippingFlatRate: Number(flatRate) || 0,
      freeShippingThreshold: Number(threshold) || 0,
      shippingRegionPrices: cleanedRegionPrices,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-md" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Envío</h4>
      <p className="text-xs" style={{ color: "var(--slate)" }}>
        El cliente puede elegir recoger en persona (sin costo) o pedir envío a domicilio, eligiendo su provincia. Cada provincia puede tener su propio precio de envío.
      </p>
      <div>
        <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>Costo de envío por defecto (€)</label>
        <p className="text-xs mb-1" style={{ color: "var(--slate)" }}>Se usa solo como respaldo, si por algún motivo no hay un precio cargado para la provincia elegida.</p>
        <input type="number" step="0.5" value={flatRate} onChange={(e) => setFlatRate(e.target.value)} className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
      </div>
      <div>
        <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>Envío gratis a partir de (€)</label>
        <input type="number" step="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-full rounded-xl p-3 text-sm" style={inputStyle} />
      </div>
      <div>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--bone)" }}>Precio de envío por provincia / comunidad</p>
        <p className="text-xs mb-2" style={{ color: "var(--slate)" }}>
          Precargué valores de referencia para un paquete chico de ropa: en península suele salir lo mismo enviar a cualquier destino con un transportista de paquetería personal, mientras que Canarias, Ceuta y Melilla salen bastante más caros. Ajustá cada uno a lo que realmente te cobre tu transportista — por ejemplo, si a País Vasco te cobran distinto que a Madrid, cambiá solo esa fila.
        </p>
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
          {SPAIN_REGIONS.map((region) => (
            <div key={region} className="flex items-center gap-2">
              <span className="text-xs flex-1" style={{ color: "var(--bone)" }}>{region}</span>
              <input
                type="number" step="0.5" min="0"
                value={regionPrices[region] ?? ""}
                onChange={(e) => setRegionPrices((prev) => ({ ...prev, [region]: e.target.value }))}
                className="w-20 rounded-lg p-1.5 text-sm text-center"
                style={inputStyle}
              />
            </div>
          ))}
        </div>
      </div>
      <button onClick={save} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
        {saved ? <><Check size={16} /> Guardado</> : "Guardar"}
      </button>
    </div>
  );
}

function AdminDepositSettings({ settings, onSave }) {
  const [enabled, setEnabled] = useState(settings.depositEnabled);
  const [percent, setPercent] = useState(settings.depositPercent);
  const [info, setInfo] = useState(settings.depositInfo || "");
  const [serviceEnabled, setServiceEnabled] = useState(settings.designServiceEnabled ?? true);
  const [serviceFee, setServiceFee] = useState(settings.designServiceFee ?? 2);
  const [basePrice, setBasePrice] = useState(settings.personalizedBasePrice ?? 20);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEnabled(settings.depositEnabled);
    setPercent(settings.depositPercent);
    setInfo(settings.depositInfo || "");
    setServiceEnabled(settings.designServiceEnabled ?? true);
    setServiceFee(settings.designServiceFee ?? 2);
    setBasePrice(settings.personalizedBasePrice ?? 20);
  }, [settings]);

  const save = async () => {
    await onSave({
      depositEnabled: enabled,
      depositPercent: Number(percent) || 0,
      depositInfo: info,
      designServiceEnabled: serviceEnabled,
      designServiceFee: Number(serviceFee) || 0,
      personalizedBasePrice: Number(basePrice) || 0,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-md" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Seña para pedidos personalizados</h4>
      <p className="text-xs" style={{ color: "var(--slate)" }}>
        Como una prenda personalizada no se puede revender si el cliente se arrepiente, le pedimos una parte del pago antes de empezar a producirla. Esto se suma solo a pedidos con diseño personalizado — el resto de la compra sigue igual.
      </p>
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--bone)" }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Pedir seña en pedidos personalizados
      </label>
      {enabled && (
        <>
          <div>
            <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>Porcentaje de seña</label>
            <div className="flex gap-2">
              {[30, 50, 100].map((p) => (
                <button
                  key={p}
                  onClick={() => setPercent(p)}
                  className="kulto-btn flex-1 text-sm font-semibold rounded-full py-2"
                  style={{ background: Number(percent) === p ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>Cómo la reciben (se incluye en el mensaje)</label>
            <input
              value={info}
              onChange={(e) => setInfo(e.target.value)}
              placeholder="Ej: Bizum al +34662317094"
              className="w-full rounded-xl p-3 text-sm"
              style={inputStyle}
            />
          </div>
        </>
      )}
      <div className="pt-2" style={{ borderTop: "1px solid var(--line)" }}>
        <h4 className="font-semibold mb-1" style={{ color: "var(--bone)" }}>Tarifa fija para prendas personalizadas</h4>
        <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>
          Este es el precio único que se cobra por cualquier prenda armada en "Personalizar" (remera, buzo, etc., sin importar cuál). La cambiás acá una sola vez y se aplica sola a todas — ya no hace falta poner un precio al cargar cada prenda base.
        </p>
        <div>
          <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>Precio fijo (€)</label>
          <input
            type="number" min="0" step="0.5"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            className="w-28 rounded-xl p-3 text-sm"
            style={inputStyle}
          />
        </div>
      </div>
      <div className="pt-2" style={{ borderTop: "1px solid var(--line)" }}>
        <h4 className="font-semibold mb-1" style={{ color: "var(--bone)" }}>Servicio "que le hagamos el diseño"</h4>
        <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>
          En Personalizar, el cliente puede pedir que ustedes le hagan el diseño en vez de subir su propia imagen. Se suma este cargo y se aclara que lo coordinan por WhatsApp (con la seña de arriba, si está activada).
        </p>
        <label className="flex items-center gap-2 text-sm mb-3" style={{ color: "var(--bone)" }}>
          <input type="checkbox" checked={serviceEnabled} onChange={(e) => setServiceEnabled(e.target.checked)} />
          Ofrecer este servicio en Personalizar
        </label>
        {serviceEnabled && (
          <div>
            <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>Cargo adicional (€)</label>
            <input
              type="number" min="0" step="0.5"
              value={serviceFee}
              onChange={(e) => setServiceFee(e.target.value)}
              className="w-28 rounded-xl p-3 text-sm"
              style={inputStyle}
            />
          </div>
        )}
      </div>
      <button onClick={save} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
        {saved ? <><Check size={16} /> Guardado</> : "Guardar"}
      </button>
    </div>
  );
}

// Guía de tamaños del diseño en Personalizar — el texto (y opcionalmente una
// imagen de referencia) que se muestra junto a la prenda en el paso 4, para
// que el cliente sepa de antemano qué tamaño aproximado va a tener su diseño
// adelante y atrás, y no se lleve una sorpresa ni reclame después.
function AdminPrintSizeGuideSettings({ settings, onSave }) {
  const [enabled, setEnabled] = useState(settings.printSizeGuideEnabled ?? true);
  const [frontText, setFrontText] = useState(settings.printSizeGuideFrontText || "");
  const [backText, setBackText] = useState(settings.printSizeGuideBackText || "");
  const [frontImage, setFrontImage] = useState(settings.printSizeGuideFrontImage || null);
  const [backImage, setBackImage] = useState(settings.printSizeGuideBackImage || null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEnabled(settings.printSizeGuideEnabled ?? true);
    setFrontText(settings.printSizeGuideFrontText || "");
    setBackText(settings.printSizeGuideBackText || "");
    setFrontImage(settings.printSizeGuideFrontImage || null);
    setBackImage(settings.printSizeGuideBackImage || null);
  }, [settings]);

  const save = async () => {
    await onSave({
      printSizeGuideEnabled: enabled,
      printSizeGuideFrontText: frontText,
      printSizeGuideBackText: backText,
      printSizeGuideFrontImage: frontImage,
      printSizeGuideBackImage: backImage,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  const zoneBlock = (label, text, setText, image, setImage) => (
    <div>
      <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>{label}</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Ej: El diseño grande centrado mide entre 25 y 30 cm de ancho por 30 a 38 cm de alto..."
        className="w-full rounded-xl p-3 text-sm mb-2"
        style={inputStyle}
      />
      <div className="flex items-center gap-3">
        {image && (
          <img src={image} alt={label} className="w-16 h-20 object-cover rounded-lg" style={{ border: "1px solid var(--line)" }} />
        )}
        <label className="kulto-btn text-xs font-semibold rounded-xl px-3 py-2 cursor-pointer" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}>
          {image ? "Cambiar imagen" : "Subir imagen (opcional)"}
          <input
            type="file" accept="image/png, image/jpeg" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const isPng = f.type === "image/png";
              fileToBase64(f, (b64) => setImage(b64), 1200, isPng ? 1 : 0.88, isPng ? "image/png" : "image/jpeg");
            }}
          />
        </label>
        {image && (
          <button onClick={() => setImage(null)} className="kulto-btn text-xs" style={{ color: "var(--signal)" }}>Quitar</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-md" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Guía de tamaños del diseño (Personalizar)</h4>
      <p className="text-xs" style={{ color: "var(--slate)" }}>
        Se muestra en el paso 4 de Personalizar, junto a la prenda, para aclarar qué tamaño aproximado va a tener el diseño adelante y atrás — así el cliente no se lleva una sorpresa cuando le llega el pedido. Podés poner el texto que quieras (por ejemplo, medidas estándar y a qué distancia del cuello queda) y, si querés, sumar una imagen de referencia para cada lado.
      </p>
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--bone)" }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Mostrar esta guía en Personalizar
      </label>
      {enabled && (
        <>
          {zoneBlock("Adelante", frontText, setFrontText, frontImage, setFrontImage)}
          {zoneBlock("Atrás", backText, setBackText, backImage, setBackImage)}
        </>
      )}
      <button onClick={save} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
        {saved ? <><Check size={16} /> Guardado</> : "Guardar"}
      </button>
    </div>
  );
}

// Diagnóstico de mail: manda un mail de prueba real con sendEmail() (el mismo
// código que usan verificación de cuenta, recuperar contraseña y aviso de
// compra) para confirmar de una que RESEND_API_KEY está bien puesta en
// Vercel — sin tener que crear una cuenta de prueba o simular una compra.
function AdminEmailTestSettings({ settings }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  const sendTest = async () => {
    if (!email.trim()) return;
    setSending(true);
    setResult(null);
    const storeName = settings?.logoText || "Kulto";
    const res = await sendEmail({
      to: email.trim(),
      subject: `Mail de prueba de ${storeName}`,
      html: `<div style="font-family:sans-serif;padding:24px;"><h2>¡Funciona! 🎉</h2><p>Este es un mail de prueba desde el panel de administración de ${storeName}. Si te llegó, Resend está bien configurado y los mails de verificación, recuperar contraseña y confirmación de compra van a salir sin problema.</p></div>`,
    });
    setSending(false);
    setResult(res);
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-md" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Probar el envío de mails</h4>
      <p className="text-xs" style={{ color: "var(--slate)" }}>
        Mandate un mail de prueba a vos mismo para confirmar que RESEND_API_KEY está bien configurada en Vercel. Es el mismo mecanismo que usan la verificación de cuenta, "olvidé mi contraseña" y el aviso de compra — si este mail te llega, esos también van a andar.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu-email@ejemplo.com"
          className="flex-1 rounded-xl p-3 text-sm min-w-[200px]"
          style={inputStyle}
        />
        <button
          onClick={sendTest}
          disabled={sending || !email.trim()}
          className="kulto-btn rounded-full px-4 py-3 font-semibold"
          style={{ background: "var(--signal)", color: "var(--bone)", opacity: sending || !email.trim() ? 0.6 : 1 }}
        >
          {sending ? "Enviando…" : "Enviar mail de prueba"}
        </button>
      </div>
      {result && result.ok && (
        <p className="text-xs font-semibold" style={{ color: "var(--sun)" }}>✓ Se mandó bien. Revisá tu bandeja de entrada (y la de spam, sobre todo si todavía no verificaste tu propio dominio en Resend).</p>
      )}
      {result && !result.ok && (
        <p className="text-xs font-semibold" style={{ color: "var(--signal)" }}>✗ No se pudo mandar: {result.error || "error desconocido"}. Si dice que falta RESEND_API_KEY, andá a Vercel → tu proyecto → Settings → Environment Variables y agregala (conseguí la clave gratis en resend.com), después hacé un redeploy.</p>
      )}
    </div>
  );
}

function AdminStoreTrustSettings({ settings, onSave }) {
  const [qualityEnabled, setQualityEnabled] = useState(settings.qualityPolicyEnabled ?? true);
  const [qualityText, setQualityText] = useState(settings.qualityPolicyText || "");
  const [productionTime, setProductionTime] = useState(settings.productionTimeNormal || "");
  const [returnsEnabled, setReturnsEnabled] = useState(settings.returnsPolicyEnabled ?? true);
  const [returnsText, setReturnsText] = useState(settings.returnsPolicyText || "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setQualityEnabled(settings.qualityPolicyEnabled ?? true);
    setQualityText(settings.qualityPolicyText || "");
    setProductionTime(settings.productionTimeNormal || "");
    setReturnsEnabled(settings.returnsPolicyEnabled ?? true);
    setReturnsText(settings.returnsPolicyText || "");
  }, [settings]);

  const save = async () => {
    await onSave({
      qualityPolicyEnabled: qualityEnabled,
      qualityPolicyText: qualityText,
      productionTimeNormal: productionTime,
      returnsPolicyEnabled: returnsEnabled,
      returnsPolicyText: returnsText,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-md" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Confianza y tiempos</h4>

      <div>
        <label className="flex items-center gap-2 text-sm mb-2" style={{ color: "var(--bone)" }}>
          <input type="checkbox" checked={qualityEnabled} onChange={(e) => setQualityEnabled(e.target.checked)} />
          Mostrar política de calidad/reposición en la web
        </label>
        {qualityEnabled && (
          <textarea
            value={qualityText}
            onChange={(e) => setQualityText(e.target.value)}
            rows={2}
            placeholder="Ej: Reponemos sin cargo cualquier prenda con fallas de fabricación."
            className="w-full rounded-xl p-3 text-sm"
            style={inputStyle}
          />
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm mb-2" style={{ color: "var(--bone)" }}>
          <input type="checkbox" checked={returnsEnabled} onChange={(e) => setReturnsEnabled(e.target.checked)} />
          Mostrar política de cambios/devoluciones en el pie de página
        </label>
        {returnsEnabled && (
          <textarea
            value={returnsText}
            onChange={(e) => setReturnsText(e.target.value)}
            rows={3}
            placeholder="Ej: Tenés 10 días desde que recibís tu pedido para pedir un cambio o devolución."
            className="w-full rounded-xl p-3 text-sm"
            style={inputStyle}
          />
        )}
      </div>

      <div>
        <label className="text-sm mb-1 block" style={{ color: "var(--bone)" }}>Tiempo de producción para productos normales</label>
        <p className="text-xs mb-1" style={{ color: "var(--slate)" }}>Se muestra como destacado en catálogo y ficha de producto. Los pedidos personalizados ya avisan aparte que pueden tardar 3-7 días.</p>
        <input
          value={productionTime}
          onChange={(e) => setProductionTime(e.target.value)}
          placeholder="Ej: 3-5 días"
          className="w-full rounded-xl p-3 text-sm"
          style={inputStyle}
        />
      </div>

      <button onClick={save} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
        {saved ? <><Check size={16} /> Guardado</> : "Guardar"}
      </button>
    </div>
  );
}

function AdminFaqSettings({ settings, onSave }) {
  const [items, setItems] = useState(settings.faqItems || []);
  const [enabled, setEnabled] = useState(settings.faqEnabled ?? true);
  const [draft, setDraft] = useState({ question: "", answer: "" });
  const [editingId, setEditingId] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setItems(settings.faqItems || []);
    setEnabled(settings.faqEnabled ?? true);
  }, [settings]);

  const addOrUpdate = () => {
    if (!draft.question.trim() || !draft.answer.trim()) return;
    if (editingId) {
      setItems((prev) => prev.map((f) => (f.id === editingId ? { ...f, question: draft.question.trim(), answer: draft.answer.trim() } : f)));
      setEditingId(null);
    } else {
      setItems((prev) => [...prev, { id: genId("faq"), question: draft.question.trim(), answer: draft.answer.trim() }]);
    }
    setDraft({ question: "", answer: "" });
  };
  const editItem = (f) => { setDraft({ question: f.question, answer: f.answer }); setEditingId(f.id); };
  const cancelEdit = () => { setDraft({ question: "", answer: "" }); setEditingId(null); };
  const removeItem = (id) => {
    setItems((prev) => prev.filter((f) => f.id !== id));
    if (editingId === id) cancelEdit();
  };
  const move = (idx, dir) => {
    setItems((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const save = async () => {
    await onSave({ faqItems: items, faqEnabled: enabled });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-md" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Preguntas frecuentes</h4>
      <p className="text-xs" style={{ color: "var(--slate)" }}>Se muestran como acordeón en el inicio de la web, nada más — no aparecen en el resto de las páginas.</p>

      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--bone)" }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Mostrar preguntas frecuentes en el inicio
      </label>

      <div className="flex flex-col gap-2">
        {items.map((f, i) => (
          <div key={f.id} className="rounded-xl p-3 flex flex-col gap-1" style={{ background: "var(--ink-3)" }}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold flex-1" style={{ color: "var(--bone)" }}>{f.question}</p>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="kulto-btn p-1" style={{ color: i === 0 ? "var(--slate)" : "var(--bone)" }} title="Subir"><ArrowUp size={14} /></button>
                <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="kulto-btn p-1" style={{ color: i === items.length - 1 ? "var(--slate)" : "var(--bone)" }} title="Bajar"><ArrowDown size={14} /></button>
                <button onClick={() => editItem(f)} className="kulto-btn p-1" style={{ color: "var(--sun)" }} title="Editar"><Pencil size={14} /></button>
                <button onClick={() => removeItem(f.id)} className="kulto-btn p-1" style={{ color: "var(--signal)" }} title="Eliminar"><X size={14} /></button>
              </div>
            </div>
            <p className="text-xs" style={{ color: "var(--slate)" }}>{f.answer}</p>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs" style={{ color: "var(--slate)" }}>No hay preguntas cargadas.</p>}
      </div>

      <div className="flex flex-col gap-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
        <input
          value={draft.question}
          onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
          placeholder="Pregunta"
          className="w-full rounded-xl p-2.5 text-sm"
          style={inputStyle}
        />
        <textarea
          value={draft.answer}
          onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))}
          rows={2}
          placeholder="Respuesta"
          className="w-full rounded-xl p-2.5 text-sm"
          style={inputStyle}
        />
        <div className="flex gap-2">
          <button onClick={addOrUpdate} className="kulto-btn flex-1 text-xs font-semibold rounded-xl px-3 py-2" style={{ background: "var(--sun)", color: "var(--ink)" }}>
            {editingId ? "Guardar cambios" : "Agregar pregunta"}
          </button>
          {editingId && (
            <button onClick={cancelEdit} className="kulto-btn text-xs px-3" style={{ color: "var(--slate)" }}>Cancelar</button>
          )}
        </div>
      </div>

      <button onClick={save} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
        {saved ? <><Check size={16} /> Guardado</> : "Guardar"}
      </button>
    </div>
  );
}

function BenefitTypeFields({ item, onChange, inputStyle }) {
  return (
    <>
      <select value={item.type} onChange={(e) => onChange({ type: e.target.value })} className="rounded-xl p-2 text-sm" style={inputStyle}>
        {PROMO_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {(item.type === "percent" || item.type === "fixed") && (
        <div className="flex items-center gap-1">
          <input type="number" min="0" value={item.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} className="w-24 rounded-xl p-2 text-sm" style={inputStyle} />
          <span className="text-sm" style={{ color: "var(--slate)" }}>{item.type === "percent" ? "%" : "de descuento"}</span>
        </div>
      )}
      {item.type === "gift" && (
        <input value={item.giftText || ""} onChange={(e) => onChange({ giftText: e.target.value })} placeholder="Qué premio es (ej: Llavero gratis)" className="flex-1 min-w-[180px] rounded-xl p-2 text-sm" style={inputStyle} />
      )}
    </>
  );
}

function AdminBenefitsPanel({ settings, onSave }) {
  const [enabled, setEnabled] = useState(settings.rewardsEnabled ?? true);
  const [btnLabel, setBtnLabel] = useState(settings.rewardsButtonLabel || "Recompensas");
  const [color, setColor] = useState(settings.rewardsColor || "#E63946");
  const [earnText, setEarnText] = useState(settings.rewardsEarnText || "");
  const [redeemText, setRedeemText] = useState(settings.rewardsRedeemText || "");
  const [rewards, setRewards] = useState(settings.loyaltyRewards || []);
  const [codes, setCodes] = useState(settings.promoCodes || []);
  const [usage, setUsage] = useState({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadPromoUsage().then(setUsage); }, []);
  useEffect(() => {
    setEnabled(settings.rewardsEnabled ?? true);
    setBtnLabel(settings.rewardsButtonLabel || "Recompensas");
    setColor(settings.rewardsColor || "#E63946");
    setEarnText(settings.rewardsEarnText || "");
    setRedeemText(settings.rewardsRedeemText || "");
    setRewards(settings.loyaltyRewards || []);
    setCodes(settings.promoCodes || []);
  }, [settings]);

  const updR = (id, patch) => setRewards((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const updC = (id, patch) => setCodes((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addR = () => setRewards((rs) => [...rs, { id: genId("rw"), name: "Nuevo premio", pointsCost: 10, type: "percent", value: 10, giftText: "", color: PROMO_COLORS[rs.length % PROMO_COLORS.length], active: true }]);
  const addC = () => setCodes((cs) => [...cs, { id: genId("pc"), code: "NUEVO10", label: "", type: "percent", value: 10, giftText: "", minSubtotal: 0, maxUses: 0, startsAt: "", endsAt: "", perCustomerOnce: false, color: PROMO_COLORS[cs.length % PROMO_COLORS.length], active: true }]);

  const save = async () => {
    setError("");
    const cleanCodes = codes
      .map((c) => ({ ...c, code: normalizePromoCode(c.code), value: Number(c.value) || 0, minSubtotal: Number(c.minSubtotal) || 0, maxUses: Number(c.maxUses) || 0 }))
      .filter((c) => c.code);
    const seen = new Set();
    for (const c of cleanCodes) {
      if (seen.has(c.code)) { setError(`El código ${c.code} está repetido. Cada código tiene que ser distinto.`); return; }
      seen.add(c.code);
    }
    const cleanRewards = rewards.map((r) => ({ ...r, pointsCost: Number(r.pointsCost) || 0, value: Number(r.value) || 0 }));
    await onSave({
      rewardsEnabled: enabled,
      rewardsButtonLabel: btnLabel.trim() || "Recompensas",
      rewardsColor: color,
      rewardsEarnText: earnText,
      rewardsRedeemText: redeemText,
      loyaltyRewards: cleanRewards,
      promoCodes: cleanCodes,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };
  const cardStyle = { background: "var(--ink-2)", border: "1px solid var(--line)" };

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div>
        <h3 className="text-lg font-bold" style={{ color: "var(--bone)" }}>Beneficios y recompensas</h3>
        <p className="text-sm" style={{ color: "var(--slate)" }}>
          Acá manejás el botón «Recompensas», los premios que se canjean con puntos y los códigos promocionales del carrito. Cada uno tiene su color. Recordá apretar «Guardar todo» al terminar.
        </p>
      </div>

      <div className="rounded-2xl p-5 flex flex-col gap-3" style={cardStyle}>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Botón y cartel de Recompensas</h4>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--bone)" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Mostrar el botón flotante abajo a la derecha (también se apaga si desactivás la tarjeta de puntos en Ajustes)
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input value={btnLabel} onChange={(e) => setBtnLabel(e.target.value)} placeholder="Texto del botón" className="rounded-xl p-2 text-sm" style={inputStyle} />
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--slate)" }}>
            Color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <span className="rounded-full px-4 py-2 text-sm font-semibold" style={{ background: color, color: "#fff" }}>{btnLabel || "Recompensas"}</span>
        </div>
        <label className="text-xs" style={{ color: "var(--slate)" }}>Texto extra en «Formas de ganar» (opcional)</label>
        <textarea rows={2} value={earnText} onChange={(e) => setEarnText(e.target.value)} className="rounded-xl p-2 text-sm" style={inputStyle} />
        <label className="text-xs" style={{ color: "var(--slate)" }}>Texto en «Formas de canjear» (si lo dejás vacío se usa uno por defecto)</label>
        <textarea rows={2} value={redeemText} onChange={(e) => setRedeemText(e.target.value)} className="rounded-xl p-2 text-sm" style={inputStyle} />
        <p className="text-xs" style={{ color: "var(--slate)" }}>
          Los puntos por prenda se cambian en Ajustes → «Cuentas, descuento y fidelidad», y los puntos de cada producto en su ficha.
        </p>
      </div>

      <div className="rounded-2xl p-5 flex flex-col gap-3" style={cardStyle}>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Premios por puntos</h4>
        <p className="text-xs" style={{ color: "var(--slate)" }}>
          Cuando el cliente llega a los puntos de un premio, lo canjea y recibe un código personal para usar una sola vez en el carrito.
        </p>
        {rewards.map((r) => (
          <div key={r.id} className="rounded-xl p-3 flex flex-wrap items-center gap-2" style={{ background: "var(--ink-3)", borderLeft: `5px solid ${r.color || "#888"}`, opacity: r.active === false ? 0.6 : 1 }}>
            <input value={r.name} onChange={(e) => updR(r.id, { name: e.target.value })} placeholder="Nombre del premio" className="flex-1 min-w-[160px] rounded-xl p-2 text-sm" style={{ ...inputStyle, background: "var(--ink-2)" }} />
            <div className="flex items-center gap-1">
              <input type="number" min="1" value={r.pointsCost} onChange={(e) => updR(r.id, { pointsCost: e.target.value })} className="w-20 rounded-xl p-2 text-sm" style={{ ...inputStyle, background: "var(--ink-2)" }} />
              <span className="text-sm" style={{ color: "var(--slate)" }}>puntos</span>
            </div>
            <BenefitTypeFields item={r} onChange={(p) => updR(r.id, p)} inputStyle={{ ...inputStyle, background: "var(--ink-2)" }} />
            <input type="color" value={r.color || "#E63946"} onChange={(e) => updR(r.id, { color: e.target.value })} title="Color del premio" />
            <label className="flex items-center gap-1 text-xs" style={{ color: "var(--bone)" }}>
              <input type="checkbox" checked={r.active !== false} onChange={(e) => updR(r.id, { active: e.target.checked })} /> Activo
            </label>
            <button onClick={() => setRewards((rs) => rs.filter((x) => x.id !== r.id))} className="kulto-btn" style={{ color: "var(--signal)" }} aria-label="Eliminar"><Trash2 size={16} /></button>
          </div>
        ))}
        <button onClick={addR} className="kulto-btn self-start text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-1" style={{ background: "var(--ink-3)", color: "var(--bone)" }}><Plus size={14} /> Agregar premio</button>
      </div>

      <div className="rounded-2xl p-5 flex flex-col gap-3" style={cardStyle}>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Códigos promocionales del carrito</h4>
        <p className="text-xs" style={{ color: "var(--slate)" }}>
          Códigos que escribe el cliente en el carrito. Los de descuento reemplazan al descuento de bienvenida (no se suman); el envío gratis y los premios sí se pueden combinar con él.
        </p>
        {codes.map((c) => {
          const used = usage[normalizePromoCode(c.code)] || 0;
          return (
            <div key={c.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: "var(--ink-3)", borderLeft: `5px solid ${c.color || "#888"}`, opacity: c.active === false ? 0.6 : 1 }}>
              <div className="flex flex-wrap items-center gap-2">
                <input value={c.code} onChange={(e) => updC(c.id, { code: e.target.value.toUpperCase() })} placeholder="CÓDIGO" className="w-36 rounded-xl p-2 text-sm font-bold" style={{ ...inputStyle, background: "var(--ink-2)" }} />
                <input value={c.label || ""} onChange={(e) => updC(c.id, { label: e.target.value })} placeholder="Nombre (ej: Black Friday)" className="flex-1 min-w-[140px] rounded-xl p-2 text-sm" style={{ ...inputStyle, background: "var(--ink-2)" }} />
                <input type="color" value={c.color || "#E63946"} onChange={(e) => updC(c.id, { color: e.target.value })} title="Color del código" />
                <label className="flex items-center gap-1 text-xs" style={{ color: "var(--bone)" }}>
                  <input type="checkbox" checked={c.active !== false} onChange={(e) => updC(c.id, { active: e.target.checked })} /> Activo
                </label>
                <button onClick={() => setCodes((cs) => cs.filter((x) => x.id !== c.id))} className="kulto-btn" style={{ color: "var(--signal)" }} aria-label="Eliminar"><Trash2 size={16} /></button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <BenefitTypeFields item={c} onChange={(p) => updC(c.id, p)} inputStyle={{ ...inputStyle, background: "var(--ink-2)" }} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--slate)" }}>
                <label className="flex items-center gap-1">Compra mínima
                  <input type="number" min="0" value={c.minSubtotal ?? 0} onChange={(e) => updC(c.id, { minSubtotal: e.target.value })} className="w-24 rounded-lg p-1.5" style={{ ...inputStyle, background: "var(--ink-2)" }} />
                </label>
                <label className="flex items-center gap-1">Usos máx. (0 = sin tope)
                  <input type="number" min="0" value={c.maxUses ?? 0} onChange={(e) => updC(c.id, { maxUses: e.target.value })} className="w-20 rounded-lg p-1.5" style={{ ...inputStyle, background: "var(--ink-2)" }} />
                </label>
                <label className="flex items-center gap-1">Desde
                  <input type="date" value={c.startsAt || ""} onChange={(e) => updC(c.id, { startsAt: e.target.value })} className="rounded-lg p-1.5" style={{ ...inputStyle, background: "var(--ink-2)" }} />
                </label>
                <label className="flex items-center gap-1">Vence
                  <input type="date" value={c.endsAt || ""} onChange={(e) => updC(c.id, { endsAt: e.target.value })} className="rounded-lg p-1.5" style={{ ...inputStyle, background: "var(--ink-2)" }} />
                </label>
                <label className="flex items-center gap-1" style={{ color: "var(--bone)" }}>
                  <input type="checkbox" checked={!!c.perCustomerOnce} onChange={(e) => updC(c.id, { perCustomerOnce: e.target.checked })} /> Una vez por cliente (pide iniciar sesión)
                </label>
                <span>Usado {used} vez/veces</span>
              </div>
            </div>
          );
        })}
        <button onClick={addC} className="kulto-btn self-start text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-1" style={{ background: "var(--ink-3)", color: "var(--bone)" }}><Plus size={14} /> Agregar código</button>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--signal)" }}>{error}</p>}
      <button onClick={save} className="kulto-btn self-start rounded-full px-6 py-3 font-semibold" style={{ background: "var(--signal)", color: "var(--bone)" }}>
        {saved ? "¡Guardado!" : "Guardar todo"}
      </button>
    </div>
  );
}

function AdminLoyaltySettings({ settings, onSave }) {
  const [signupEnabled, setSignupEnabled] = useState(settings.signupDiscountEnabled ?? true);
  const [signupPercent, setSignupPercent] = useState(settings.signupDiscountPercent ?? 10);
  const [popupEnabled, setPopupEnabled] = useState(settings.signupPopupEnabled ?? true);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(settings.loyaltyEnabled ?? true);
  const [pointsPerItem, setPointsPerItem] = useState(settings.loyaltyPointsPerItem ?? 1);
  const [threshold, setThreshold] = useState(settings.loyaltyRewardThreshold ?? 5);
  const [rewardDesc, setRewardDesc] = useState(settings.loyaltyRewardDescription || "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSignupEnabled(settings.signupDiscountEnabled ?? true);
    setSignupPercent(settings.signupDiscountPercent ?? 10);
    setPopupEnabled(settings.signupPopupEnabled ?? true);
    setLoyaltyEnabled(settings.loyaltyEnabled ?? true);
    setPointsPerItem(settings.loyaltyPointsPerItem ?? 1);
    setThreshold(settings.loyaltyRewardThreshold ?? 5);
    setRewardDesc(settings.loyaltyRewardDescription || "");
  }, [settings]);

  const save = async () => {
    await onSave({
      signupDiscountEnabled: signupEnabled,
      signupDiscountPercent: Number(signupPercent) || 0,
      signupPopupEnabled: popupEnabled,
      loyaltyEnabled,
      loyaltyPointsPerItem: Number(pointsPerItem) || 0,
      loyaltyRewardThreshold: Number(threshold) || 0,
      loyaltyRewardDescription: rewardDesc,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-md" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Cuentas, descuento y fidelidad</h4>

      <div>
        <label className="flex items-center gap-2 text-sm mb-2" style={{ color: "var(--bone)" }}>
          <input type="checkbox" checked={signupEnabled} onChange={(e) => setSignupEnabled(e.target.checked)} />
          Descuento por registrarse (primera compra)
        </label>
        {signupEnabled && (
          <div className="flex items-center gap-2">
            <input type="number" min="0" max="100" value={signupPercent} onChange={(e) => setSignupPercent(e.target.value)} className="w-20 rounded-xl p-2 text-sm" style={inputStyle} />
            <span className="text-sm" style={{ color: "var(--slate)" }}>% de descuento en su primer pedido</span>
          </div>
        )}
        {signupEnabled && (
          <label className="flex items-center gap-2 text-sm mt-2" style={{ color: "var(--bone)" }}>
            <input type="checkbox" checked={popupEnabled} onChange={(e) => setPopupEnabled(e.target.checked)} />
            Mostrar un cartel con este descuento cuando el visitante baja un poco por la web
          </label>
        )}
      </div>

      <div className="pt-2" style={{ borderTop: "1px solid var(--line)" }}>
        <label className="flex items-center gap-2 text-sm mb-2" style={{ color: "var(--bone)" }}>
          <input type="checkbox" checked={loyaltyEnabled} onChange={(e) => setLoyaltyEnabled(e.target.checked)} />
          Tarjeta de puntos por compras
        </label>
        {loyaltyEnabled && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input type="number" min="0" step="0.5" value={pointsPerItem} onChange={(e) => setPointsPerItem(e.target.value)} className="w-20 rounded-xl p-2 text-sm" style={inputStyle} />
              <span className="text-sm" style={{ color: "var(--slate)" }}>punto(s) por cada prenda comprada</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-20 rounded-xl p-2 text-sm" style={inputStyle} />
              <span className="text-sm" style={{ color: "var(--slate)" }}>puntos = 1 recompensa</span>
            </div>
            <input
              value={rewardDesc}
              onChange={(e) => setRewardDesc(e.target.value)}
              placeholder="Ej: Cada 5 prendas, la 6ta es gratis"
              className="w-full rounded-xl p-2 text-sm"
              style={inputStyle}
            />
            <p className="text-xs" style={{ color: "var(--slate)" }}>Esto es informativo para el cliente — vos decidís y aplicás la recompensa a mano desde la pestaña Clientes cuando alguien llega al umbral.</p>
          </div>
        )}
      </div>

      <button onClick={save} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
        {saved ? <><Check size={16} /> Guardado</> : "Guardar"}
      </button>
    </div>
  );
}

function AdminDesignFeedbackSettings({ settings, onSave }) {
  const [options, setOptions] = useState(settings.designFeedbackOptions || []);
  const [newOption, setNewOption] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { setOptions(settings.designFeedbackOptions || []); }, [settings]);

  const addOption = () => {
    const v = newOption.trim();
    if (!v || options.includes(v)) return;
    setOptions((prev) => [...prev, v]);
    setNewOption("");
  };
  const removeOption = (v) => setOptions((prev) => prev.filter((o) => o !== v));

  const save = async () => {
    await onSave({ designFeedbackOptions: options });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 max-w-md" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Opciones cuando el diseño no queda bien</h4>
      <p className="text-xs" style={{ color: "var(--slate)" }}>
        Si un cliente dice que su foto no quedó como quería, le mostramos estas opciones para elegir (además de un comentario libre).
      </p>
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <div key={o} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--ink-3)" }}>
            <span className="flex-1 text-sm" style={{ color: "var(--bone)" }}>{o}</span>
            <button onClick={() => removeOption(o)} className="kulto-btn p-1" style={{ color: "var(--signal)" }}><X size={14} /></button>
          </div>
        ))}
        {options.length === 0 && <p className="text-xs" style={{ color: "var(--slate)" }}>No hay opciones cargadas.</p>}
      </div>
      <div className="flex gap-2">
        <input
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addOption()}
          placeholder="Nueva opción"
          className="flex-1 rounded-xl p-2.5 text-sm"
          style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
        />
        <button onClick={addOption} className="kulto-btn text-xs font-semibold rounded-xl px-3" style={{ background: "var(--sun)", color: "var(--ink)" }}>Agregar</button>
      </div>
      <button onClick={save} className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center gap-2" style={{ background: saved ? "var(--sun)" : "var(--signal)", color: saved ? "var(--ink)" : "var(--bone)" }}>
        {saved ? <><Check size={16} /> Guardado</> : "Guardar"}
      </button>
    </div>
  );
}

// El formulario para cargar reseñas "a mano" (crear una desde cero) era
// solo para probar cómo se verían mientras se armaba la web — ya no está:
// acá solo se moderan las que realmente dejan los clientes.
function AdminReviews({ reviews, onSave, onDelete, onReorder }) {
  const pendingCount = reviews.filter((r) => r.status === "pendiente").length;

  const approve = (r) => onSave({ ...r, status: "aprobada" });

  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>
        Reseñas ({reviews.length}){pendingCount > 0 && <span style={{ color: "var(--signal)" }}> · {pendingCount} por aprobar</span>}
      </p>
      <p className="text-xs -mt-2" style={{ color: "var(--slate)" }}>El orden de esta lista es el orden en que se ven en la web. Estas son las que dejan los clientes desde "Seguir mi pedido".</p>
      {reviews.length === 0 && <EmptyState text="Todavía no hay ninguna reseña." />}
      {reviews.map((r, i) => (
        <div key={r.id} className="rounded-2xl p-3 flex items-start gap-3" style={{ background: "var(--ink-2)", border: r.status === "pendiente" ? "1px solid var(--signal)" : "1px solid var(--line)" }}>
          <div className="flex flex-col gap-1 shrink-0">
            <button disabled={i === 0} onClick={() => onReorder(r.id, -1)} className="kulto-btn p-1 rounded" style={{ color: i === 0 ? "var(--ink-3)" : "var(--bone)" }} aria-label="Subir reseña"><ArrowUp size={14} /></button>
            <button disabled={i === reviews.length - 1} onClick={() => onReorder(r.id, 1)} className="kulto-btn p-1 rounded" style={{ color: i === reviews.length - 1 ? "var(--ink-3)" : "var(--bone)" }} aria-label="Bajar reseña"><ArrowDown size={14} /></button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>{r.name}</p>
              <StarRow rating={r.rating} />
            </div>
            {r.items?.length > 0 && <p className="text-xs mt-0.5" style={{ color: "var(--sun)" }}>Compró: {r.items.join(", ")}</p>}
            <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>{r.text}</p>
            {r.photo && <img loading="lazy" src={r.photo} className="w-16 h-16 rounded-lg object-cover mt-2" alt="Foto de la reseña" />}
            {r.status === "pendiente" && (
              <button onClick={() => approve(r)} className="kulto-btn text-xs font-semibold mt-2 px-3 py-1 rounded-full" style={{ background: "var(--sun)", color: "var(--ink)" }}>
                Aprobar y publicar
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button onClick={() => { if (window.confirm(`¿Borrar la reseña de "${r.name}"? Esta acción no se puede deshacer.`)) onDelete(r.id); }} className="kulto-btn p-1.5 rounded-full" style={{ color: "var(--signal)" }} aria-label="Borrar reseña"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Mensajes que llegaron por el formulario de "Contacto" — acá el admin ve
// cada uno, puede marcarlo resuelto o no, aprobar o rechazar un cambio o
// devolución pedido, regalar un % de descuento para la próxima compra (le
// genera un código), y responder por mail directo desde el panel.
function AdminContactMessages({ messages, onUpdate, onDelete, onReply }) {
  const [openId, setOpenId] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [discountDrafts, setDiscountDrafts] = useState({});
  const [sendingId, setSendingId] = useState(null);
  const [sentId, setSentId] = useState(null);

  const pendingCount = messages.filter((m) => m.status !== "resuelto").length;
  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));
  const setStatus = (m, status) => onUpdate({ ...m, status });
  const setDecision = (m, changeDecision) => onUpdate({ ...m, changeDecision });

  const applyDiscount = (m) => {
    const percent = Number(discountDrafts[m.id]);
    if (!percent || percent <= 0) return;
    onUpdate({ ...m, discountPercent: percent, discountCode: genDiscountCode(percent) });
  };
  const removeDiscount = (m) => onUpdate({ ...m, discountPercent: null, discountCode: null });

  const sendReply = async (m) => {
    const text = (replyDrafts[m.id] || "").trim();
    if (!text) return;
    setSendingId(m.id);
    const result = await onReply(m, text);
    setSendingId(null);
    if (result?.ok) {
      setSentId(m.id);
      setReplyDrafts((d) => ({ ...d, [m.id]: "" }));
      setTimeout(() => setSentId(null), 2000);
    }
  };

  const inputStyle = { background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" };

  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>
        Mensajes de contacto ({messages.length}){pendingCount > 0 && <span style={{ color: "var(--signal)" }}> · {pendingCount} pendientes</span>}
      </p>
      <p className="text-xs -mt-2" style={{ color: "var(--slate)" }}>Estos son los mensajes que dejan los clientes desde el botón "Contacto" del sitio.</p>
      {messages.length === 0 && <EmptyState text="Todavía no llegó ningún mensaje por el formulario de contacto." />}
      {messages.map((m) => {
        const isOpen = openId === m.id;
        return (
          <div key={m.id} className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "var(--ink-2)", border: m.status !== "resuelto" ? "1px solid var(--signal)" : "1px solid var(--line)" }}>
            <button onClick={() => toggle(m.id)} className="kulto-btn flex items-start justify-between gap-3 text-left">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--bone)" }}>
                  {m.name} <span className="font-normal" style={{ color: "var(--slate)" }}>· {m.subject}</span>
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--slate)" }}>{m.email} · {new Date(m.createdAt).toLocaleString("es-ES")}</p>
              </div>
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full shrink-0" style={{ background: m.status === "resuelto" ? "var(--ink-3)" : "var(--signal)", color: m.status === "resuelto" ? "var(--slate)" : "var(--bone)" }}>
                {m.status === "resuelto" ? "Resuelto" : "Pendiente"}
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-4 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
                <p className="text-sm whitespace-pre-line" style={{ color: "var(--bone)" }}>{m.message}</p>

                <div>
                  <p className="text-xs mb-1.5" style={{ color: "var(--slate)" }}>Estado</p>
                  <div className="flex gap-2">
                    <button onClick={() => setStatus(m, "pendiente")} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: m.status !== "resuelto" ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}>Pendiente</button>
                    <button onClick={() => setStatus(m, "resuelto")} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: m.status === "resuelto" ? "var(--sun)" : "var(--ink-3)", color: m.status === "resuelto" ? "var(--ink)" : "var(--bone)" }}>Resuelto</button>
                  </div>
                </div>

                <div>
                  <p className="text-xs mb-1.5" style={{ color: "var(--slate)" }}>Cambio / devolución pedido</p>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setDecision(m, "")} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: !m.changeDecision ? "var(--ink)" : "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}>Sin definir</button>
                    <button onClick={() => setDecision(m, "aprobado")} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: m.changeDecision === "aprobado" ? "var(--sun)" : "var(--ink-3)", color: m.changeDecision === "aprobado" ? "var(--ink)" : "var(--bone)" }}>Aprobado</button>
                    <button onClick={() => setDecision(m, "rechazado")} className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: m.changeDecision === "rechazado" ? "var(--signal)" : "var(--ink-3)", color: "var(--bone)" }}>Rechazado</button>
                  </div>
                </div>

                <div>
                  <p className="text-xs mb-1.5" style={{ color: "var(--slate)" }}>Descuento de regalo para su próxima compra</p>
                  {m.discountPercent ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: "var(--sun)" }}>{m.discountPercent}% — código {m.discountCode}</span>
                      <button onClick={() => removeDiscount(m)} className="kulto-btn text-xs" style={{ color: "var(--signal)" }}>Quitar</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="1" max="100" placeholder="%"
                        value={discountDrafts[m.id] || ""}
                        onChange={(e) => setDiscountDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                        className="rounded-lg p-2 text-sm w-20"
                        style={inputStyle}
                      />
                      <button onClick={() => applyDiscount(m)} className="kulto-btn text-xs font-semibold px-3 py-2 rounded-full" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>Regalar descuento</button>
                    </div>
                  )}
                  {m.discountPercent && (
                    <p className="text-[11px] mt-1" style={{ color: "var(--slate)" }}>Es un código para mencionar cuando haga su próximo pedido — como acá el pedido se cierra por WhatsApp, se lo aplicás vos a mano en ese momento.</p>
                  )}
                </div>

                <div>
                  <p className="text-xs mb-1.5" style={{ color: "var(--slate)" }}>Responder por mail</p>
                  <textarea
                    placeholder="Escribí tu respuesta..."
                    value={replyDrafts[m.id] || ""}
                    onChange={(e) => setReplyDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                    rows={3}
                    className="w-full rounded-xl p-2.5 text-sm resize-none"
                    style={inputStyle}
                  />
                  <button
                    onClick={() => sendReply(m)}
                    disabled={sendingId === m.id || !(replyDrafts[m.id] || "").trim()}
                    className="kulto-btn text-sm font-semibold px-4 py-2 rounded-full mt-2 flex items-center gap-2"
                    style={{ background: sentId === m.id ? "var(--sun)" : "var(--signal)", color: sentId === m.id ? "var(--ink)" : "var(--bone)", opacity: sendingId === m.id ? 0.7 : 1 }}
                  >
                    {sendingId === m.id ? <><Loader2 size={14} className="animate-spin" /> Enviando…</> : sentId === m.id ? <><Check size={14} /> Enviado</> : "Enviar respuesta"}
                  </button>
                  {m.adminReply && (
                    <p className="text-[11px] mt-1.5" style={{ color: "var(--slate)" }}>
                      Última respuesta enviada{m.repliedAt ? ` el ${new Date(m.repliedAt).toLocaleString("es-ES")}` : ""}.
                    </p>
                  )}
                </div>

                <button
                  onClick={() => { if (window.confirm(`¿Borrar el mensaje de "${m.name}"?`)) onDelete(m.id); }}
                  className="kulto-btn text-xs font-semibold flex items-center gap-1.5 w-fit"
                  style={{ color: "var(--signal)" }}
                >
                  <Trash2 size={13} /> Borrar mensaje
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Agrega de una el mismo conjunto de colores (por número de Roly) a TODAS
// las prendas de una categoría/subcategoría que ya tengan su propia "foto
// base" cargada — así no hace falta abrir prenda por prenda para repetir la
// misma tanda de colores en, por ejemplo, todos los cortes de "Camisetas".
// Cada prenda se pinta a partir de SU PROPIA foto base (no se mezclan fotos
// entre prendas), así que las que todavía no tengan una quedan afuera y se
// avisan para subirla aparte.
function AdminBulkColorsBySubcategory({ templateProducts = [], onSaveVerbose }) {
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [rolyInput, setRolyInput] = useState("");
  const [queue, setQueue] = useState([]);
  const [notFound, setNotFound] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]); // [{id, name, status: "ok"|"error"|"skipped", detail}]

  const categoryOptions = Array.from(new Set(templateProducts.map((p) => p.category).filter(Boolean)));
  const subcategoryOptions = Array.from(
    new Set(templateProducts.filter((p) => !category || p.category === category).map((p) => p.subcategory).filter(Boolean))
  );

  const matching = templateProducts.filter(
    (p) => (!category || p.category === category) && (!subcategory || p.subcategory === subcategory)
  );
  const withBase = matching.filter((p) => p.baseImages?.frontImage);
  const withoutBase = matching.filter((p) => !p.baseImages?.frontImage);

  const addToQueue = () => {
    if (!rolyInput.trim()) return;
    const { found, notFound: nf } = lookupRolyColorsByNumbers(rolyInput);
    setQueue((q) => {
      const already = new Set(q.map((c) => c.name));
      return [...q, ...found.filter((c) => !already.has(c.name))];
    });
    setNotFound(nf);
    setRolyInput("");
  };

  const removeFromQueue = (i) => setQueue((q) => q.filter((_, idx) => idx !== i));

  const run = async () => {
    if (queue.length === 0 || withBase.length === 0 || running) return;
    setRunning(true);
    setResults([]);
    setProgress({ done: 0, total: withBase.length });
    const outcomes = [];
    for (let i = 0; i < withBase.length; i++) {
      const product = withBase[i];
      const existingNames = new Set((product.colors || []).map((c) => c.name));
      const toAdd = queue.filter((c) => !existingNames.has(c.name));
      if (toAdd.length === 0) {
        outcomes.push({ id: product.id, name: product.name, status: "skipped", detail: "ya tenía todos esos colores" });
        setProgress({ done: i + 1, total: withBase.length });
        continue;
      }
      try {
        const newColors = [];
        for (const c of toAdd) {
          const { images: zones } = await generateColorFromBaseImages(product.baseImages, c.hex);
          newColors.push({
            name: c.name,
            hex: c.hex,
            images: [zones.frontImage, zones.backImage, zones.sleeveLeftImage, zones.sleeveRightImage].filter(Boolean),
            frontImage: zones.frontImage || null,
            backImage: zones.backImage || null,
            sleeveLeftImage: zones.sleeveLeftImage || null,
            sleeveRightImage: zones.sleeveRightImage || null,
          });
        }
        const updated = { ...product, colors: [...(product.colors || []), ...newColors] };
        const res = await onSaveVerbose(updated);
        if (res && res.ok === false) {
          outcomes.push({ id: product.id, name: product.name, status: "error", detail: res.error || "no se pudo guardar" });
        } else {
          outcomes.push({ id: product.id, name: product.name, status: "ok", detail: `${newColors.length} colores agregados` });
        }
      } catch (err) {
        outcomes.push({ id: product.id, name: product.name, status: "error", detail: err?.message || "error inesperado" });
      }
      setProgress({ done: i + 1, total: withBase.length });
      setResults([...outcomes]);
    }
    setRunning(false);
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Aplicar los mismos colores a varias prendas</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Elegí una categoría (y opcionalmente una subcategoría), pegá los números de Roly UNA sola vez, y se generan y guardan esos colores en todas las prendas que entren en ese grupo y ya tengan su propia "Foto base" cargada — cada una pintada con su propia foto, no se mezclan entre sí.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Categoría</label>
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setSubcategory(""); }}
            className="w-full rounded-xl p-3 text-sm"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
          >
            <option value="">Todas</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Subcategoría</label>
          <select
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="w-full rounded-xl p-3 text-sm"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
            disabled={subcategoryOptions.length === 0}
          >
            <option value="">Todas</option>
            {subcategoryOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl p-3 text-xs" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
        {matching.length === 0 ? (
          <p style={{ color: "var(--slate)" }}>No hay prendas cargadas en ese grupo todavía.</p>
        ) : (
          <>
            <p style={{ color: "var(--bone)" }}>
              {withBase.length} de {matching.length} prenda{matching.length === 1 ? "" : "s"} en este grupo tiene{withBase.length === 1 ? "" : "n"} foto base y van a recibir los colores.
            </p>
            {withoutBase.length > 0 && (
              <p className="mt-1" style={{ color: "var(--sun)" }}>
                Sin foto base (no van a recibir nada acá, hay que subírsela primero abriéndolas una por una): {withoutBase.map((p) => p.name).join(", ")}
              </p>
            )}
          </>
        )}
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: "var(--bone)" }}>Números de Roly (ej: "01, 47, 56, 777")</label>
        <div className="flex gap-2">
          <input
            value={rolyInput}
            onChange={(e) => setRolyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addToQueue(); } }}
            placeholder="132, 73, 276, 120..."
            className="flex-1 rounded-xl p-3 text-sm"
            style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
          />
          <button onClick={addToQueue} className="kulto-btn rounded-xl px-4 text-sm font-semibold" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}>
            Agregar
          </button>
        </div>
        {notFound.length > 0 && (
          <p className="text-xs mt-1" style={{ color: "var(--signal)" }}>No encontrado en el catálogo Roly: {notFound.join(", ")}</p>
        )}
      </div>

      {queue.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {queue.map((c, i) => (
            <span key={c.name + i} className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}>
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: c.hex, border: "1px solid var(--line)" }} />
              {c.name}
              <button onClick={() => removeFromQueue(i)} aria-label="Quitar" style={{ color: "var(--slate)" }}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      <button
        onClick={run}
        disabled={running || queue.length === 0 || withBase.length === 0}
        className="kulto-btn rounded-xl p-3 text-sm font-semibold"
        style={{ background: "var(--sun)", color: "var(--ink)", opacity: running || queue.length === 0 || withBase.length === 0 ? 0.5 : 1 }}
      >
        {running
          ? `Generando y guardando… (${progress.done}/${progress.total})`
          : `Generar y guardar en ${withBase.length} prenda${withBase.length === 1 ? "" : "s"}`}
      </button>
      {running && (
        <p className="text-xs" style={{ color: "var(--slate)" }}>Dejá esta pantalla abierta mientras termina — puede tardar varios minutos si son muchas prendas y colores.</p>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-1">
          {results.map((r) => (
            <p key={r.id} className="text-xs" style={{ color: r.status === "error" ? "var(--signal)" : r.status === "skipped" ? "var(--slate)" : "var(--bone)" }}>
              {r.status === "ok" ? "✓" : r.status === "error" ? "✗" : "·"} {r.name}: {r.detail}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// La tarjeta de cada categoría (ej: "Camisetas") en el paso 1 de
// "Personalizar" necesitaba una foto propia, elegida por el admin — antes se
// tomaba automáticamente de cualquiera de los modelos de adentro (Oversize,
// Beagle, etc.), sin forma de elegirla. Esto deja subir una foto
// independiente por categoría, que se usa tal cual (o la automática si no se
// cargó ninguna).
function AdminPersonalizeGroupImages({ templateProducts = [], settings, onSave }) {
  const groupNames = Array.from(new Set(templateProducts.map((p) => p.category).filter(Boolean)));
  const styleNames = Array.from(new Set(templateProducts.map((p) => p.subcategory).filter(Boolean)));
  const [savedKey, setSavedKey] = useState(null);

  const upload = (settingKey, name, file) => {
    if (!file) return;
    const isPng = file.type === "image/png";
    const current = settings[settingKey] || {};
    fileToBase64(file, async (b64) => {
      await onSave({ [settingKey]: { ...current, [name]: b64 } });
      setSavedKey(`${settingKey}:${name}`);
      setTimeout(() => setSavedKey(null), 1500);
    }, 1200, 0.88, isPng ? "image/png" : "image/jpeg");
  };
  const remove = async (settingKey, name) => {
    const next = { ...(settings[settingKey] || {}) };
    delete next[name];
    await onSave({ [settingKey]: next });
  };

  if (!groupNames.length) return null;

  const renderGrid = (names, settingKey, sampleOf) => (
    <div className="flex flex-wrap gap-4">
      {names.map((g) => {
        const covers = settings[settingKey] || {};
        const sample = sampleOf(g);
        const fallback = sample?.colors?.[0]?.frontImage || sample?.colors?.[0]?.images?.[0];
        const img = covers[g] || null;
        return (
          <div key={g} className="flex flex-col items-center gap-1.5">
            <div className="relative w-20 h-24 rounded-xl overflow-hidden flex items-center justify-center" style={{ background: "var(--ink-3)", border: img ? "2px solid var(--sun)" : "1px solid var(--line)" }}>
              {(img || fallback) ? (
                <FastImg loading="lazy" src={img || fallback} className="w-full h-full object-contain p-1" alt={g} />
              ) : (
                <Shirt size={20} color="rgba(243,239,230,0.4)" />
              )}
              {!img && fallback && (
                <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center py-0.5" style={{ background: "rgba(21,19,26,0.8)", color: "var(--slate)" }}>Automática</span>
              )}
            </div>
            <span className="text-xs font-semibold text-center max-w-[80px] truncate" style={{ color: "var(--bone)" }}>{g}</span>
            <div className="flex items-center gap-2">
              <label className="kulto-btn text-[10px] px-2 py-1 rounded-full cursor-pointer" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                {img ? "Cambiar" : "Elegir"}
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { upload(settingKey, g, e.target.files[0]); e.target.value = ""; }} />
              </label>
              {img && <button onClick={() => remove(settingKey, g)} className="kulto-btn text-[10px]" style={{ color: "var(--signal)" }}>Quitar</button>}
            </div>
            {savedKey === `${settingKey}:${g}` && <span className="text-[10px]" style={{ color: "var(--sun)" }}>Guardado ✓</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-5" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Fotos de portada en "Personalizar"</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          El cliente elige en 3 pasos: primero la <b>categoría</b>, después el <b>estilo</b> y por último el <b>modelo</b>. Cada nivel tiene su propia foto, independiente de las demás. Si no subís una, se usa automáticamente la foto de uno de los modelos de adentro.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>1. Portada de cada categoría <span className="text-xs font-normal" style={{ color: "var(--slate)" }}>(ej: Camisetas)</span></p>
        {renderGrid(groupNames, "personalizeGroupCovers", (g) => templateProducts.find((p) => p.category === g))}
      </div>
      {styleNames.length > 0 && (
        <div className="flex flex-col gap-2 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>2. Portada de cada estilo / subcategoría <span className="text-xs font-normal" style={{ color: "var(--slate)" }}>(ej: Oversize, Beagle)</span></p>
          {renderGrid(styleNames, "personalizeSubcategoryCovers", (g) => templateProducts.find((p) => p.subcategory === g))}
        </div>
      )}
      <p className="text-xs pt-3" style={{ borderTop: "1px solid var(--line)", color: "var(--slate)" }}>
        3. La foto de cada <b>modelo</b> (la última tarjeta) se elige dentro de cada prenda, tocando en la lista de abajo el lápiz de editar → «Foto de la tarjeta».
      </p>
    </div>
  );
}

// Color de fondo de las tarjetas de "Personalizar" (paso 1): uno para todas,
// o uno distinto por categoría y por estilo. Se guarda en
// settings.personalizeCardBg ("all", "g:Camisetas", "s:Beagle").
const CARD_BG_PRESETS = ["#ffffff", "#f2f2f2", "#e5ded6", "#bfc5cc", "#15131A", "#000000", "#0057a0", "#7a1f2b"];
function AdminPersonalizeCardColors({ templateProducts = [], settings, onSave }) {
  const map = settings.personalizeCardBg || {};
  const groups = Array.from(new Set(templateProducts.map((p) => p.category).filter(Boolean)));
  const styles = Array.from(new Set(templateProducts.map((p) => p.subcategory).filter(Boolean)));
  const [saved, setSaved] = useState(null);
  const timer = useRef(null);

  const setColor = async (key, hex) => {
    const next = { ...map };
    if (hex) next[key] = hex; else delete next[key];
    await onSave({ personalizeCardBg: next });
    setSaved(key);
    setTimeout(() => setSaved(null), 1200);
  };
  // El selector de color dispara muchos cambios seguidos mientras se arrastra:
  // se guarda recién cuando se suelta (medio segundo sin cambios).
  const setColorDebounced = (key, hex) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setColor(key, hex), 600);
  };

  if (!templateProducts.length) return null;

  const Row = ({ label, k, hint }) => {
    const current = map[k] || "";
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold min-w-[120px]" style={{ color: "var(--bone)" }}>
          {label}{hint ? <span className="block text-[10px] font-normal" style={{ color: "var(--slate)" }}>{hint}</span> : null}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {CARD_BG_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(k, c)}
              className="kulto-btn w-6 h-6 rounded-full"
              style={{ background: c, border: current.toLowerCase() === c.toLowerCase() ? "2px solid var(--sun)" : "1px solid var(--line)" }}
              aria-label={`Fondo ${c}`}
            />
          ))}
          <label className="kulto-btn text-[10px] px-2 py-1 rounded-full cursor-pointer flex items-center gap-1" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
            Otro color
            <input type="color" value={current || "#ffffff"} onChange={(e) => setColorDebounced(k, e.target.value)} className="w-4 h-4 p-0 border-0 bg-transparent" />
          </label>
          <button
            type="button"
            onClick={() => setColor(k, "")}
            className="kulto-btn text-[10px] px-2 py-1 rounded-full"
            style={{ background: current ? "var(--ink-3)" : "var(--sun)", color: current ? "var(--bone)" : "var(--ink)" }}
          >
            Automático
          </button>
          {saved === k && <span className="text-[10px]" style={{ color: "var(--sun)" }}>Guardado ✓</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Color de fondo de las tarjetas en "Personalizar"</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Elegí el color de fondo que se ve detrás de cada prenda en las tarjetas del paso 1. Podés poner uno para todas, o uno distinto para cada categoría y cada estilo (el de la categoría o estilo tiene prioridad sobre el general). "Automático" usa el color de la prenda, como antes.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Row label="Todas las tarjetas" k="all" />
        {groups.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide pt-1" style={{ color: "var(--slate)" }}>Categorías</p>}
        {groups.map((g) => <Row key={`g:${g}`} label={g} k={`g:${g}`} />)}
        {styles.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wide pt-1" style={{ color: "var(--slate)" }}>Estilos</p>}
        {styles.map((s) => <Row key={`s:${s}`} label={s} k={`s:${s}`} />)}
      </div>
    </div>
  );
}

// Precio por subcategoría/estilo (Beagle, Oversize, Vendetta, Chow, etc.) para
// usar en "Personalizar" en vez de tener que ponerle precio a cada prenda base
// una por una. Las subcategorías aparecen solas a medida que se cargan prendas
// base con ese campo completado.
function AdminPersonalizeSubcategoryPrices({ templateProducts = [], settings, onSave }) {
  // Antes esto solo juntaba las prendas que YA tenían un "Subgrupo / estilo"
  // cargado — si una prenda nueva se subía sin llenar ese campo (es
  // opcional), se quedaba afuera de esta lista entera y no se le podía poner
  // precio acá. Ahora, a la prenda que no tiene subgrupo le usamos su nombre
  // como identificador, así SIEMPRE aparece una fila por cada prenda que se
  // suba a "Personalizar", tenga o no un subgrupo cargado.
  const subcategories = Array.from(new Set(templateProducts.map((p) => p.subcategory || p.name).filter(Boolean)));
  const prices = settings.personalizeSubcategoryPrices || {};
  const [drafts, setDrafts] = useState({});
  const [savedSub, setSavedSub] = useState(null);

  useEffect(() => { setDrafts({}); }, [templateProducts.length]);

  const valueFor = (sub) => drafts[sub] !== undefined ? drafts[sub] : (prices[sub] != null ? prices[sub] : "");

  const save = async (sub) => {
    const raw = drafts[sub];
    const next = { ...prices };
    if (raw === "" || raw == null) {
      delete next[sub];
    } else {
      next[sub] = Number(raw) || 0;
    }
    await onSave({ personalizeSubcategoryPrices: next });
    setSavedSub(sub);
    setTimeout(() => setSavedSub(null), 1500);
  };

  if (!subcategories.length) return null;

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Precios por estilo en "Personalizar"</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Ponele un precio a cada estilo de prenda (Beagle, Oversize, Vendetta, Chow, etc.) — así podés vender el mismo diseño en varios estilos a distinto precio, sin tener que poner precio prenda por prenda. Si dejás uno vacío, se usa el precio general de Personalizar.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {subcategories.map((sub) => (
          <div key={sub} className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold min-w-[100px]" style={{ color: "var(--bone)" }}>{sub}</span>
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: "var(--slate)" }}>$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={String(settings.personalizedBasePrice ?? 20)}
                value={valueFor(sub)}
                onChange={(e) => setDrafts((d) => ({ ...d, [sub]: e.target.value }))}
                onBlur={() => save(sub)}
                className="text-sm rounded-lg px-2 py-1 w-24"
                style={inputStyle}
              />
            </div>
            {savedSub === sub && <span className="text-[10px]" style={{ color: "var(--sun)" }}>Guardado ✓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Chiquito bloque de 4 casilleros que arma la "portada" de una carpeta de
// diseños — lo que se ve de afuera de la tarjeta, elegido a mano por el
// admin (coverDesignIds), sin tener que entrar a la carpeta.
function FolderCoverThumb({ coverDesignIds = [], allDesigns, size = 64 }) {
  const imgs = coverDesignIds.map((id) => allDesigns.find((d) => d.id === id)).filter(Boolean).slice(0, 4);
  return (
    <div className="grid grid-cols-2 gap-0.5 rounded-lg overflow-hidden shrink-0" style={{ width: size, height: size, background: "var(--ink)" }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-center overflow-hidden" style={{ background: "var(--ink-2)" }}>
          {imgs[i] ? <img loading="lazy" src={imgs[i].image} className="w-full h-full object-cover" alt="" /> : null}
        </div>
      ))}
    </div>
  );
}

// Librería general de diseños propios (PNG) que el cliente puede elegir y
// posicionar en cualquier prenda dentro de Personalizar — no depende de un
// producto en particular. Se pueden agrupar en carpetas (opcional) para no
// mostrar todo en una sola grilla gigante — cada carpeta muestra de afuera
// hasta 4 diseños "portada" que el admin elige a mano. Una carpeta puede
// además quedar atada a una categoría de producto (ej: "Mates"): en ese caso
// sus diseños solo aparecen al personalizar esa categoría; si se deja en
// "Todas", se ven siempre sin importar qué prenda se esté personalizando.
function AdminDesignLibrary({ designs, onAdd, onRemove, folders = [], categories = [], onAddFolder, onRenameFolder, onRemoveFolder, onToggleCover, onAssignFolder, onSetFolderCategory, onSetFolderGarments, templateProducts = [] }) {
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderCategory, setNewFolderCategory] = useState("");
  const [openFolderId, setOpenFolderId] = useState(null);
  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };
  // Prendas de "Personalizar" donde se puede marcar que una carpeta está
  // disponible: por categoría y, adentro, por estilo/modelo.
  const garmentOptions = Array.from(new Set(templateProducts.map((p) => p.category).filter(Boolean))).map((category) => ({
    category,
    styles: Array.from(new Set(templateProducts.filter((p) => p.category === category).map((p) => garmentStyleKey(p)).filter(Boolean))),
  }));
  const toggleGarment = (key) => {
    const current = openFolder?.garments || [];
    onSetFolderGarments?.(openFolder.id, current.includes(key) ? current.filter((k) => k !== key) : [...current, key]);
  };

  const handleFiles = async (fileList) => {
    // Al subir una carpeta entera del sistema (ver "Subir carpeta" abajo)
    // pueden colarse archivos que no son imágenes — se ignoran solos, sin
    // frenar la carga del resto.
    const files = Array.from(fileList || []).filter((f) => f.type === "image/png" || f.type === "image/jpeg");
    setUploading(true);
    setError("");
    let failed = 0;
    let lastError = "";
    for (const file of files) {
      const isPng = file.type === "image/png";
      // Un poco más chico que otras fotos del sitio — un diseño no necesita
      // tanta resolución para verse bien puesto sobre una prenda, y así pesa
      // menos y es menos probable que falle al guardarlo.
      const b64 = await new Promise((resolve) => fileToBase64(file, resolve, 1000, isPng ? 1 : 0.9, isPng ? "image/png" : "image/jpeg"));
      const baseName = files.length > 1 ? file.name.replace(/\.[^.]+$/, "") : (name.trim() || file.name.replace(/\.[^.]+$/, ""));
      const result = await onAdd({ id: genId("d"), name: baseName, image: b64, folderId: openFolderId || null });
      if (!result.ok) { failed += 1; lastError = result.error || ""; }
    }
    setUploading(false);
    setName("");
    if (failed > 0) {
      const base =
        failed === files.length
          ? "No se pudo guardar ningún diseño."
          : `${failed} de ${files.length} diseños no se pudieron guardar.`;
      setError(lastError ? `${base} Motivo: ${lastError}` : `${base} Revisá tu conexión a internet e intentá de nuevo — si sigue fallando, puede ser que falte configurar Supabase en el proyecto (ver README).`);
    }
  };

  const createFolder = () => {
    if (!newFolderName.trim()) return;
    onAddFolder(newFolderName.trim(), newFolderCategory);
    setNewFolderName("");
    setNewFolderCategory("");
  };

  const openFolder = folders.find((f) => f.id === openFolderId) || null;
  const designsInOpenFolder = openFolder ? designs.filter((d) => d.folderId === openFolder.id) : [];

  const renderDesign = (d) => (
    <div key={d.id} className="flex flex-col items-center gap-1">
      <div className="w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center relative" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
        <FastImg loading="lazy" src={d.image} className="w-full h-full object-contain" alt={d.name} />
        {openFolder && (
          <button
            onClick={() => onToggleCover(openFolder.id, d.id)}
            className="kulto-btn absolute top-0.5 right-0.5 p-0.5 rounded-full"
            title={(openFolder.coverDesignIds || []).includes(d.id) ? "Quitar de la portada" : "Poner en la portada"}
            style={{ background: "rgba(21,19,26,0.75)" }}
          >
            <Star size={12} color={(openFolder.coverDesignIds || []).includes(d.id) ? "var(--sun)" : "var(--bone)"} fill={(openFolder.coverDesignIds || []).includes(d.id) ? "var(--sun)" : "none"} />
          </button>
        )}
      </div>
      <span className="text-[10px] text-center max-w-[64px] truncate" style={{ color: "var(--slate)" }}>{d.name}</span>
      {folders.length > 0 && (
        <select
          value={d.folderId || ""}
          onChange={(e) => onAssignFolder(d.id, e.target.value || null)}
          className="text-[10px] rounded px-1 py-0.5 max-w-[70px]"
          style={inputStyle}
        >
          <option value="">Sin carpeta</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
      <button onClick={() => onRemove(d.id)} className="kulto-btn" style={{ color: "var(--signal)" }} title="Quitar de la librería"><Trash2 size={12} /></button>
    </div>
  );

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Diseños propios de Kulto</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Subí tus diseños en PNG acá una sola vez. Van a aparecer en Personalizar para que el cliente los elija y los ubique en la prenda que quiera, adelante o atrás. Si tenés muchos, agrupalos en carpetas — y si le asignás una categoría a la carpeta (ej: "Mates"), esos diseños van a aparecer solo cuando el cliente esté personalizando esa categoría, en vez de en todas.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input placeholder="Nombre del diseño (opcional, si subís uno solo)" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl p-2 text-sm flex-1 min-w-[160px]" style={inputStyle} />
        <label className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full cursor-pointer flex items-center gap-2 shrink-0" style={{ background: uploading ? "var(--ink-3)" : "var(--signal)", color: "var(--bone)" }}>
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {uploading ? "Subiendo…" : "Subir PNG"}
          <input type="file" accept="image/png" multiple className="hidden" disabled={uploading} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <label className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full cursor-pointer flex items-center gap-2 shrink-0" style={{ background: uploading ? "var(--ink-3)" : "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}>
          <FolderPlus size={16} /> Subir carpeta
          <input
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
        </label>
      </div>
      <p className="text-xs -mt-2" style={{ color: "var(--slate)" }}>
        "Subir carpeta" te deja elegir una carpeta entera de tu compu y sube de una todas las imágenes que tenga adentro (ignora lo que no sea foto).
      </p>
      {openFolder && (
        <p className="text-xs" style={{ color: "var(--slate)" }}>Lo que subas acá va a entrar directo en la carpeta "{openFolder.name}".</p>
      )}
      {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
        <input
          placeholder="Nombre de la carpeta (ej: Anime, Música, Coches)"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") createFolder(); }}
          className="rounded-xl p-2 text-sm flex-1 min-w-[160px]"
          style={inputStyle}
        />
        <select
          value={newFolderCategory}
          onChange={(e) => setNewFolderCategory(e.target.value)}
          className="rounded-xl p-2 text-sm"
          style={inputStyle}
          title="A qué categoría de producto quedan atados los diseños de esta carpeta"
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={createFolder} className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full flex items-center gap-2 shrink-0" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
          <FolderPlus size={16} /> Nueva carpeta
        </button>
      </div>

      {designs.length === 0 && folders.length === 0 ? (
        <EmptyState text="Todavía no subiste diseños a la librería." />
      ) : openFolder ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpenFolderId(null)} className="kulto-btn text-sm font-semibold flex items-center gap-1 shrink-0" style={{ color: "var(--slate)" }}>
              <ArrowLeft size={14} /> Carpetas
            </button>
            <input
              value={openFolder.name}
              onChange={(e) => onRenameFolder(openFolder.id, e.target.value)}
              className="rounded-xl p-2 text-sm flex-1 min-w-[120px]"
              style={inputStyle}
            />
            <button
              onClick={() => {
                if (window.confirm(`¿Borrar la carpeta "${openFolder.name}"? Los diseños de adentro no se borran, quedan sueltos.`)) {
                  onRemoveFolder(openFolder.id);
                  setOpenFolderId(null);
                }
              }}
              className="kulto-btn p-2 rounded-full shrink-0"
              style={{ color: "var(--signal)" }}
              aria-label="Borrar carpeta"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs shrink-0" style={{ color: "var(--slate)" }}>Categoría de esta carpeta:</label>
            <select
              value={openFolder.category || ""}
              onChange={(e) => onSetFolderCategory(openFolder.id, e.target.value)}
              className="rounded-xl p-2 text-sm flex-1 min-w-[140px]"
              style={inputStyle}
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
            <p className="text-xs font-semibold" style={{ color: "var(--bone)" }}>Disponible en estas prendas (opcional)</p>
            <p className="text-[11px]" style={{ color: "var(--slate)" }}>
              Marcá todas las prendas donde el cliente puede usar los diseños de esta carpeta (ej: camisetas Beagle, Jamaica y sudaderas). Si no marcás ninguna, se usa la categoría de arriba (o todas las prendas).
            </p>
            {garmentOptions.length === 0 && <p className="text-[11px]" style={{ color: "var(--slate)" }}>Todavía no hay prendas cargadas en Personalizar.</p>}
            {garmentOptions.map((grp) => (
              <div key={grp.category} className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: "var(--bone)" }}>
                  <input type="checkbox" checked={(openFolder.garments || []).includes(`c:${grp.category}`)} onChange={() => toggleGarment(`c:${grp.category}`)} style={{ accentColor: "var(--signal)" }} />
                  Todas las prendas de {grp.category}
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6">
                  {grp.styles.map((st) => (
                    <label key={st} className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--slate)" }}>
                      <input type="checkbox" checked={(openFolder.garments || []).includes(`s:${st}`)} onChange={() => toggleGarment(`s:${st}`)} style={{ accentColor: "var(--signal)" }} />
                      {st}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs" style={{ color: "var(--slate)" }}>
            {openFolder.category
              ? `Estos diseños solo van a aparecer al personalizar productos de la categoría "${openFolder.category}".`
              : "Sin categoría asignada: estos diseños se ven siempre, sin importar qué producto esté personalizando el cliente."}
          </p>
          <p className="text-xs" style={{ color: "var(--slate)" }}>
            Tocá la estrella de hasta 4 diseños para elegir la portada de esta carpeta — es lo que se ve de afuera, sin entrar.
          </p>
          {designsInOpenFolder.length === 0 ? (
            <EmptyState text="Esta carpeta todavía no tiene diseños — subí uno nuevo arriba, o asignale uno ya existente desde 'Todos los diseños'." />
          ) : (
            <div className="flex flex-wrap gap-3">{designsInOpenFolder.map(renderDesign)}</div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {folders.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--bone)" }}>Carpetas</p>
              <div className="flex flex-wrap gap-3">
                {folders.map((f) => {
                  const count = designs.filter((d) => d.folderId === f.id).length;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setOpenFolderId(f.id)}
                      className="kulto-btn flex flex-col items-center gap-1.5 rounded-xl p-2"
                      style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}
                    >
                      <FolderCoverThumb coverDesignIds={f.coverDesignIds || []} allDesigns={designs} />
                      <span className="text-xs font-semibold max-w-[80px] truncate" style={{ color: "var(--bone)" }}>{f.name}</span>
                      <span className="text-[10px]" style={{ color: "var(--slate)" }}>{count} diseño{count === 1 ? "" : "s"}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full max-w-[80px] truncate" style={{ background: (f.category || (f.garments || []).length) ? "var(--sun)" : "var(--ink)", color: (f.category || (f.garments || []).length) ? "var(--ink)" : "var(--slate)" }}>
                        {(f.garments || []).length ? `${f.garments.length} prenda${f.garments.length === 1 ? "" : "s"}` : (f.category || "Todas")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            {folders.length > 0 && <p className="text-xs font-semibold mb-2" style={{ color: "var(--bone)" }}>Todos los diseños</p>}
            {designs.length === 0 ? (
              <EmptyState text="Todavía no subiste diseños a la librería." />
            ) : (
              <div className="flex flex-wrap gap-3">{designs.map(renderDesign)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Galería de fotos de "trabajos personalizados" (pedidos reales ya hechos)
// para mostrar en el inicio, cerca de "Personalizar" — misma lógica que la
// librería de diseños de arriba: subida múltiple, con una leyenda opcional
// por foto (ej: "Remera oversize a pedido de @usuario").
const CUSTOMWORK_SPEED_MIN = 0.1;
const CUSTOMWORK_SPEED_MAX = 2;

function AdminCustomWorkGallery({ items, onAdd, onRemove, speed = 0.5, onSpeedChange }) {
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // Valor local para que la barra se sienta fluida al arrastrarla — recién se
  // guarda cuando se suelta, para no mandar un guardado por cada pixel movido.
  const [speedDraft, setSpeedDraft] = useState(speed);
  useEffect(() => { setSpeedDraft(speed); }, [speed]);
  // Cola de fotos recién subidas, todavía sin recortar — se recortan de a una;
  // "recropTarget" en cambio es el id de una foto YA en la galería que se está
  // volviendo a recortar (no una nueva).
  const [cropQueue, setCropQueue] = useState([]); // [{ raw, caption }]
  const [cropSource, setCropSource] = useState(null);
  const [recropTarget, setRecropTarget] = useState(null);
  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError("");
    const queued = [];
    for (const file of files) {
      const isPng = file.type === "image/png";
      const b64 = await new Promise((resolve) => fileToBase64(file, resolve, 1600, isPng ? 1 : 0.9, isPng ? "image/png" : "image/jpeg"));
      queued.push({ raw: b64, caption: caption.trim() });
    }
    setCaption("");
    setCropQueue((q) => {
      const next = [...q, ...queued];
      if (!cropSource && !recropTarget && next.length) setCropSource(next[0].raw);
      return next;
    });
  };

  const recropItem = (it) => { setRecropTarget(it.id); setCropSource(it.image); };

  const saveAndAdvance = async (item) => {
    setUploading(true);
    const result = await onAdd(item);
    setUploading(false);
    if (!result.ok) {
      setError(result.error ? `No se pudo guardar la foto. Motivo: ${result.error}` : "No se pudo guardar la foto. Revisá tu conexión a internet e intentá de nuevo.");
    }
  };

  const handleCropConfirm = async (croppedBase64) => {
    if (recropTarget) {
      const target = items.find((i) => i.id === recropTarget);
      await saveAndAdvance({ ...target, image: croppedBase64 });
      setRecropTarget(null);
      setCropSource(null);
      return;
    }
    const current = cropQueue[0];
    await saveAndAdvance({ id: genId("cw"), caption: current?.caption || "", image: croppedBase64 });
    setCropQueue((q) => {
      const next = q.slice(1);
      setCropSource(next.length ? next[0].raw : null);
      return next;
    });
  };

  const handleCropCancel = () => {
    if (recropTarget) { setRecropTarget(null); setCropSource(null); return; }
    setCropQueue((q) => {
      const next = q.slice(1);
      setCropSource(next.length ? next[0].raw : null);
      return next;
    });
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
      <div>
        <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Trabajos personalizados (galería del inicio)</h4>
        <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
          Subí fotos de pedidos personalizados reales que ya entregaste. Después de elegir las fotos vas a poder acomodar cada una (arrastrar y hacer zoom) para que se vea exactamente la parte que querés, sin que se corte feo. Aparecen en el inicio, cerca de "Personalizar", en una tira que se desliza sola despacio y se detiene si pasás el mouse — activala y ubicala en "Secciones del inicio" más abajo.
        </p>
      </div>
      <div className="rounded-xl p-3" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold" style={{ color: "var(--bone)" }}>Velocidad del deslizamiento automático</label>
          <span className="text-xs" style={{ color: "var(--slate)" }}>{speedDraft <= 0.4 ? "Lento" : speedDraft >= 1.2 ? "Rápido" : "Media"}</span>
        </div>
        <input
          type="range"
          min={CUSTOMWORK_SPEED_MIN}
          max={CUSTOMWORK_SPEED_MAX}
          step="0.1"
          value={speedDraft}
          onChange={(e) => setSpeedDraft(Number(e.target.value))}
          onMouseUp={() => onSpeedChange?.(speedDraft)}
          onTouchEnd={() => onSpeedChange?.(speedDraft)}
          className="w-full"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input placeholder="Leyenda de la foto (opcional)" value={caption} onChange={(e) => setCaption(e.target.value)} className="rounded-xl p-2 text-sm flex-1 min-w-[160px]" style={inputStyle} />
        <label className="kulto-btn text-sm font-semibold px-4 py-2.5 rounded-full cursor-pointer flex items-center gap-2 shrink-0" style={{ background: uploading ? "var(--ink-3)" : "var(--signal)", color: "var(--bone)" }}>
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {uploading ? "Subiendo…" : "Subir fotos"}
          <input type="file" accept="image/png,image/jpeg" multiple className="hidden" disabled={uploading} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
      {items.length === 0 ? (
        <EmptyState text="Todavía no subiste fotos de trabajos personalizados." />
      ) : (
        <div className="flex flex-wrap gap-3">
          {items.map((it) => (
            <div key={it.id} className="flex flex-col items-center gap-1">
              <div className="relative w-16 rounded-lg overflow-hidden flex items-center justify-center" style={{ aspectRatio: "4 / 5", background: "var(--ink-3)", border: "1px solid var(--line)" }}>
                <img loading="lazy" src={it.image} className="w-full h-full object-cover" alt={it.caption || "Trabajo personalizado"} />
                <button
                  onClick={() => recropItem(it)}
                  className="kulto-btn absolute top-0.5 left-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(21,19,26,0.8)", color: "var(--bone)" }}
                  title="Recortar de nuevo"
                >
                  <Pencil size={10} />
                </button>
              </div>
              {it.caption && <span className="text-[10px] text-center max-w-[80px] truncate" style={{ color: "var(--slate)" }}>{it.caption}</span>}
              <button onClick={() => onRemove(it.id)} className="kulto-btn" style={{ color: "var(--signal)" }} title="Quitar de la galería"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
      {cropSource && (
        <CropModal
          source={cropSource}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
          fitMode="contain"
          title="Se ve tu foto completa. Si querés recortarla más de cerca, usá el zoom."
        />
      )}
    </div>
  );
}

function AdminPanel({ products, categories, groups, orders, customers, onAdjustCustomerPoints, onDeleteCustomer, onCreateCustomer, onUpdateCustomerInfo, onSendPasswordHelp, reviews, settings, hasDraftChanges, publishing, onPublishChanges, onDiscardChanges, photoInbox, onAddToInbox, onCreateProductFromInbox, onAddInboxToExisting, onRemoveFromInbox, savedColors, onSaveColorToLibrary, onRemoveColorFromLibrary, designLibrary, onAddDesignToLibrary, onRemoveDesignFromLibrary, designFolders, onAddDesignFolder, onRenameDesignFolder, onRemoveDesignFolder, onToggleDesignFolderCover, onAssignDesignToFolder, onSetDesignFolderCategory, onSetDesignFolderGarments, customWorkGallery, onAddCustomWork, onRemoveCustomWork, onAddCategory, onRenameCategory, onDeleteCategory, onAddGroup, onRenameGroup, onDeleteGroup, onSaveProduct, onSaveProductVerbose, onSaveProductsBulk, onQuickRestock, onDeleteProduct, onToggleOrderStatus, onSetLocalStatus, onSetLocalTracking, onUpdateTracking, onApplyDiscount, onRequestReview, onBulkComplete, onBulkArchive, onBulkDelete, onSaveReview, onDeleteReview, onReorderReview, onSaveSettings, onLogout, permissions, isOwner, onSetAdminPermissions, jumpTo }) {
  // El dueño (isOwner) siempre ve todas las pestañas. Una cuenta de admin con
  // permisos limitados solo ve — y solo puede abrir — las que le dieron.
  const allowedTabs = isOwner ? ADMIN_TAB_KEYS : (permissions || []);
  const [tab, setTab] = useState(() => (allowedTabs.includes("productos") ? "productos" : (allowedTabs[0] || "productos")));
  // El menú de accesos rápidos (ver Header) puede pedir saltar directo a una
  // pestaña puntual desde cualquier parte de la web — jumpTo trae un objeto
  // nuevo cada vez que se elige un destino (aunque sea el mismo de antes),
  // para que este efecto siempre dispare.
  useEffect(() => {
    if (jumpTo?.tab && allowedTabs.includes(jumpTo.tab)) setTab(jumpTo.tab);
  }, [jumpTo]);
  // Productos normales y prendas base para Personalizar se editan por separado,
  // cada una en su propia pestaña, para no mezclarlas nunca en la misma lista.
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const templateProducts = products.filter((p) => p.tags?.template);
  const sellableProducts = products.filter((p) => !p.tags?.template);
  // La lista de productos se agrupa por categoría, como carpetas cerradas —
  // togglear una la abre/cierra, para no tener que scrollear una lista larga
  // cuando hay muchos productos.
  const [expandedProductCats, setExpandedProductCats] = useState([]);
  const toggleProductCat = (cat) => setExpandedProductCats((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  // Para borrar varios productos de una en vez de uno por uno.
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const toggleProductSelect = (id) => setSelectedProductIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const deleteSelectedProducts = async () => {
    if (!selectedProductIds.length) return;
    if (!window.confirm(`¿Borrar ${selectedProductIds.length} producto${selectedProductIds.length === 1 ? "" : "s"}? Esta acción no se puede deshacer.`)) return;
    setDeletingSelected(true);
    for (const id of selectedProductIds) await onDeleteProduct(id);
    setDeletingSelected(false);
    setSelectedProductIds([]);
  };
  // Para mandar de una varios productos sueltos ("Sin grupo / temática" o
  // un grupo equivocado) al grupo correcto, sin editarlos uno por uno.
  const [bulkGroupTarget, setBulkGroupTarget] = useState("");
  // Carpetas dentro de un grupo (ej: "anime" → Naruto, Dragon Ball): se
  // guardan en la subcategoría de cada producto.
  const [bulkFolderTarget, setBulkFolderTarget] = useState("");
  const [expandedFolders, setExpandedFolders] = useState([]);
  const toggleFolder = (key) => setExpandedFolders((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const [movingSelected, setMovingSelected] = useState(false);
  // Filtros de la lista de productos (panel de la izquierda).
  const [pfGroup, setPfGroup] = useState("Todos"); // "Todos" | nombre | "__none__"
  const [pfFolder, setPfFolder] = useState("Todas");
  const [pfCat, setPfCat] = useState("Todas");
  const [pfVis, setPfVis] = useState("todos"); // todos | visibles | ocultos
  const [pfQuery, setPfQuery] = useState("");
  const pfActive = pfGroup !== "Todos" || pfFolder !== "Todas" || pfCat !== "Todas" || pfVis !== "todos" || !!pfQuery.trim();
  const pfClear = () => { setPfGroup("Todos"); setPfFolder("Todas"); setPfCat("Todas"); setPfVis("todos"); setPfQuery(""); };
  const pfMatchGroup = (p) => pfGroup === "Todos" || (pfGroup === "__none__" ? !p.group : p.group === pfGroup);
  const pfMatchFolder = (p) => pfFolder === "Todas" || (pfFolder === "__none__" ? !p.subcategory : p.subcategory === pfFolder);
  const pfMatchCat = (p) => pfCat === "Todas" || p.category === pfCat;
  const pfMatchVis = (p) => pfVis === "todos" || (pfVis === "ocultos" ? !!p.hidden : !p.hidden);
  const pfMatchQuery = (p) => {
    const q = pfQuery.trim().toLowerCase();
    return !q || [p.name, p.sku, p.category, p.subcategory, p.group].some((v) => String(v || "").toLowerCase().includes(q));
  };
  const filteredSellable = sellableProducts.filter((p) => pfMatchGroup(p) && pfMatchFolder(p) && pfMatchCat(p) && pfMatchVis(p) && pfMatchQuery(p));
  const pfGroupNames = Array.from(new Set(sellableProducts.map((p) => p.group).filter(Boolean))).sort((x, y) => x.localeCompare(y, "es"));
  const pfHasNoGroup = sellableProducts.some((p) => !p.group);
  const pfFolderNames = Array.from(new Set(sellableProducts.filter(pfMatchGroup).map((p) => p.subcategory).filter(Boolean))).sort((x, y) => x.localeCompare(y, "es"));
  const pfHasNoFolder = sellableProducts.filter(pfMatchGroup).some((p) => !p.subcategory);
  const pfCatNames = Array.from(new Set(sellableProducts.filter((p) => pfMatchGroup(p) && pfMatchFolder(p)).map((p) => p.category).filter(Boolean))).sort((x, y) => x.localeCompare(y, "es"));
  // Al filtrar, o al empezar a editar un producto, se abren solos los grupos y
  // carpetas donde está — pero después se pueden cerrar tocándolos (antes
  // quedaban forzados abiertos y no se podían volver a cerrar).
  useEffect(() => {
    if (!pfActive) return;
    const groupsOpen = new Set();
    const foldersOpen = new Set();
    filteredSellable.forEach((p) => {
      const g = p.group || "Sin grupo / temática";
      groupsOpen.add(g);
      foldersOpen.add(`${g}|${p.subcategory || ""}`);
    });
    setExpandedProductCats((prev) => Array.from(new Set([...prev, ...groupsOpen])));
    setExpandedFolders((prev) => Array.from(new Set([...prev, ...foldersOpen])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pfGroup, pfFolder, pfCat, pfVis, pfQuery]);
  useEffect(() => {
    if (!editingProduct) return;
    const g = editingProduct.group || "Sin grupo / temática";
    const k = `${g}|${editingProduct.subcategory || ""}`;
    setExpandedProductCats((prev) => (prev.includes(g) ? prev : [...prev, g]));
    setExpandedFolders((prev) => (prev.includes(k) ? prev : [...prev, k]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingProduct?.id]);
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total } mientras guarda
  const [bulkMessage, setBulkMessage] = useState("");
  // Aplica un cambio a muchos productos a la vez, siempre con aviso de
  // progreso y de resultado — y pase lo que pase, al final se destraban los
  // botones (antes, si algo fallaba a la mitad, quedaban trabados para siempre).
  const applyBulk = async (changes) => {
    // changes: [{ id, patch }]
    const list = changes
      .map(({ id, patch }) => {
        const p = sellableProducts.find((x) => x.id === id);
        return p ? { ...p, ...patch } : null;
      })
      .filter(Boolean);
    if (!list.length) return { ok: 0, failed: 0 };
    setMovingSelected(true);
    setBulkMessage("");
    setBulkProgress({ done: 0, total: list.length });
    try {
      const res = onSaveProductsBulk
        ? await onSaveProductsBulk(list, (done, total) => setBulkProgress({ done, total }))
        : await (async () => { for (const p of list) await onSaveProduct(p); return { ok: list.length, failed: 0 }; })();
      setBulkMessage(res.failed ? `Se guardaron ${res.ok} y ${res.failed} no se pudieron guardar. Probá de nuevo con esos.` : `Listo: ${res.ok} producto${res.ok === 1 ? "" : "s"} actualizado${res.ok === 1 ? "" : "s"}. Recordá "Publicar cambios" para que lo vean los clientes.`);
      return res;
    } catch (e) {
      setBulkMessage("No se pudo guardar: " + (e?.message || "error de conexión") + ". Probá de nuevo.");
      return { ok: 0, failed: list.length };
    } finally {
      setMovingSelected(false);
      setBulkProgress(null);
    }
  };
  const moveSelectedToFolder = async (clear) => {
    const target = clear ? "" : bulkFolderTarget.trim();
    if (!selectedProductIds.length || (!clear && !target)) return;
    await applyBulk(selectedProductIds.map((id) => ({ id, patch: { subcategory: target } })));
    setSelectedProductIds([]);
    setBulkFolderTarget("");
  };
  // Cambia el nombre de una carpeta (en ese grupo): todos sus productos pasan
  // a llamarse con el nombre nuevo. Dejarlo vacío saca a todos de la carpeta.
  const renameFolder = async (folderItems, oldName) => {
    // "Sin carpeta" (oldName vacío) no es una carpeta de verdad: ponerle nombre
    // crea una carpeta nueva con todos esos productos adentro.
    const input = oldName
      ? window.prompt(`Nuevo nombre para la carpeta "${oldName}" (dejalo vacío para sacar todos los productos de la carpeta):`, oldName)
      : window.prompt(`Escribí el nombre de la carpeta nueva para estos ${folderItems.length} productos sin carpeta:`, "");
    if (input === null) return;
    const next = input.trim();
    if (next === oldName || (!oldName && !next)) return;
    await applyBulk(folderItems.map((p) => ({ id: p.id, patch: { subcategory: next } })));
  };
  // Botón de carpeta en cada producto: no hace falta ir a la barra de arriba.
  // Si el producto está tildado junto a otros, se mueven todos los tildados.
  const moveOneToFolder = async (p) => {
    const ids = selectedProductIds.includes(p.id) ? selectedProductIds : [p.id];
    const existing = Array.from(new Set(sellableProducts.map((x) => x.subcategory).filter(Boolean))).sort((x, y) => x.localeCompare(y, "es"));
    const input = window.prompt(
      `Carpeta para ${ids.length === 1 ? `"${p.name}"` : `${ids.length} productos`}.${existing.length ? `\nYa existen: ${existing.join(", ")}` : ""}\nEscribí el nombre (dejalo vacío para sacarlo de su carpeta):`,
      p.subcategory || ""
    );
    if (input === null) return;
    await applyBulk(ids.map((id) => ({ id, patch: { subcategory: input.trim() } })));
    setSelectedProductIds([]);
  };
  const moveSelectedToGroup = async () => {
    if (!selectedProductIds.length || !bulkGroupTarget) return;
    await applyBulk(selectedProductIds.map((id) => ({ id, patch: { group: bulkGroupTarget } })));
    setSelectedProductIds([]);
    setBulkGroupTarget("");
  };
  // Para decir en qué otras prendas (modelos) está también disponible cada
  // diseño de un grupo — ej: el diseño "kulto_01" en Oversize y Beagle, pero
  // "kulto_07" solo en Oversize — sin entrar a editar cada uno. Usa el mismo
  // mecanismo de "designGroup" que ya vincula un mismo diseño entre estilos
  // (ver "Vincular con otro estilo" / "Duplicar en otras categorías" del
  // formulario de producto): tildar un modelo nuevo crea una copia vinculada
  // en esa categoría, destildar uno borra esa copia.
  const [expandedModelsFor, setExpandedModelsFor] = useState(null);
  const [savingModelsFor, setSavingModelsFor] = useState(null);
  const linkedVariants = (p) => (p.designGroup ? sellableProducts.filter((x) => x.designGroup === p.designGroup) : [p]);
  const toggleModelForProduct = async (p, cat) => {
    if (cat === p.category || savingModelsFor) return;
    const variants = linkedVariants(p);
    const existing = variants.find((x) => x.category === cat);
    setSavingModelsFor(p.id);
    try {
      if (existing) {
        if (window.confirm(`¿Quitar "${p.name}" de "${cat}"? Esto borra esa copia (no afecta a las demás prendas donde está).`)) {
          await onDeleteProduct(existing.id);
        }
      } else {
        let group = p.designGroup;
        let base = p;
        if (!group) {
          group = `${p.name} (${genId("dg").slice(-5)})`;
          base = { ...p, designGroup: group };
          await onSaveProduct(base);
        }
        // Que un diseño esté disponible en otra prenda no significa que
        // también sea "más vendido", "oferta" o "tendencia" — cada modelo
        // arranca sin esas etiquetas, aunque el original ya las tuviera.
        const copy = { ...base, id: genId("p"), category: cat, designGroup: group, sku: generateSku(base.name, sellableProducts), tags: { ...base.tags, bestseller: false, oferta: false, tendencia: false }, createdAt: Date.now(), salesCount: 0, viewsCount: 0 };
        await onSaveProduct(copy);
      }
    } finally {
      setSavingModelsFor(null);
    }
  };
  // Igual que "Modelos donde está disponible" de arriba, pero para varios
  // productos seleccionados de una sola vez. Cada diseño se copia a su
  // propia categoría — nunca quedan todos amontonados en una sola carpeta
  // de prenda, cada copia va a la que corresponde.
  const [bulkModelsOpen, setBulkModelsOpen] = useState(false);
  const [bulkModelCats, setBulkModelCats] = useState([]);
  const [applyingBulkModels, setApplyingBulkModels] = useState(false);
  const toggleBulkModelCat = (cat) => setBulkModelCats((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  const applyBulkModels = async () => {
    if (!selectedProductIds.length || !bulkModelCats.length) return;
    setApplyingBulkModels(true);
    let knownProducts = sellableProducts;
    for (const id of selectedProductIds) {
      const p = knownProducts.find((x) => x.id === id);
      if (!p) continue;
      const existingCats = new Set(knownProducts.filter((x) => x.id === p.id || (p.designGroup && x.designGroup === p.designGroup)).map((x) => x.category));
      let group = p.designGroup;
      let base = p;
      for (const cat of bulkModelCats) {
        if (existingCats.has(cat)) continue;
        if (!group) {
          group = `${p.name} (${genId("dg").slice(-5)})`;
          base = { ...p, designGroup: group };
          await onSaveProduct(base);
          knownProducts = knownProducts.map((x) => (x.id === base.id ? base : x));
        }
        // Que un diseño esté disponible en otra prenda no significa que
        // también sea "más vendido", "oferta" o "tendencia" — cada modelo
        // arranca sin esas etiquetas, aunque el original ya las tuviera.
        const copy = { ...base, id: genId("p"), category: cat, designGroup: group, sku: generateSku(base.name, knownProducts), tags: { ...base.tags, bestseller: false, oferta: false, tendencia: false }, createdAt: Date.now(), salesCount: 0, viewsCount: 0 };
        await onSaveProduct(copy);
        knownProducts = [...knownProducts, copy];
        existingCats.add(cat);
      }
    }
    setApplyingBulkModels(false);
    setBulkModelsOpen(false);
    setBulkModelCats([]);
    setSelectedProductIds([]);
  };
  // Para cambiar precio, stock y/o talles de varios productos seleccionados
  // de una sola vez (además de poder seguir editando cada uno individual
  // con el lápiz, como siempre). Cada campo se aplica solo si se completó —
  // dejar un campo vacío no toca ese dato en los productos seleccionados.
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [bulkSizesOn, setBulkSizesOn] = useState(false);
  const [bulkSizes, setBulkSizes] = useState([]);
  const [applyingBulkEdit, setApplyingBulkEdit] = useState(false);
  const toggleBulkSize = (s) => setBulkSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  // Colores para varios productos a la vez (ej: toda una carpeta): se eligen
  // de la librería de colores guardados o por número de Roly, y se agregan a
  // cada producto sin foto (la foto de cada color se le pone después).
  const [bulkColors, setBulkColors] = useState([]);
  const [bulkColorsReplace, setBulkColorsReplace] = useState(false);
  const [bulkRolyInput, setBulkRolyInput] = useState("");
  const [bulkRolyMissing, setBulkRolyMissing] = useState([]);
  const sameColor = (a, b) => (a.name || "").trim().toLowerCase() === (b.name || "").trim().toLowerCase() || (a.hex || "").toLowerCase() === (b.hex || "").toLowerCase();
  const toggleBulkColor = (c) => setBulkColors((prev) => (prev.some((x) => sameColor(x, c)) ? prev.filter((x) => !sameColor(x, c)) : [...prev, { name: c.name, hex: c.hex }]));
  const addBulkRoly = () => {
    if (!bulkRolyInput.trim()) return;
    const { found, notFound } = lookupRolyColorsByNumbers(bulkRolyInput);
    setBulkColors((prev) => [...prev, ...found.filter((c) => !prev.some((x) => sameColor(x, c))).map((c) => ({ name: c.name, hex: c.hex }))]);
    setBulkRolyMissing(notFound || []);
    setBulkRolyInput("");
  };
  // Oculta (o vuelve a mostrar) de una vez todos los productos de un grupo,
  // carpeta o categoría. Si ya están todos ocultos, los vuelve a mostrar.
  const toggleHideList = async (list) => {
    if (!list.length) return;
    const allHidden = list.every((p) => p.hidden);
    await applyBulk(list.map((p) => ({ id: p.id, patch: { hidden: !allHidden } })));
  };
  const HideListButton = ({ list, what }) => {
    const allHidden = list.length > 0 && list.every((p) => p.hidden);
    const someHidden = list.some((p) => p.hidden);
    return (
      <button
        type="button"
        disabled={movingSelected}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleHideList(list); }}
        className="kulto-btn text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0"
        style={{ background: allHidden ? "var(--ink)" : "var(--sun)", color: allHidden ? "var(--bone)" : "var(--ink)", border: "1px solid var(--line)", opacity: movingSelected ? 0.6 : 1 }}
        title={allHidden ? `Volver a mostrar ${what} a los clientes` : `Ocultar ${what} a los clientes`}
      >
        {allHidden ? <><Eye size={12} /> Mostrar</> : <><EyeOff size={12} /> Ocultar{someHidden ? " resto" : ""}</>}
      </button>
    );
  };
  // Atajo: tilda todos los productos de una carpeta/grupo y abre el panel.
  const openColorsFor = (list) => {
    setSelectedProductIds(list.map((p) => p.id));
    setBulkEditOpen(true);
    setTimeout(() => document.getElementById("kulto-bulk-edit-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  };
  const bulkEditReady = String(bulkPrice).trim() !== "" || String(bulkStock).trim() !== "" || bulkSizesOn || bulkColors.length > 0;
  const applyBulkEdit = async () => {
    if (!selectedProductIds.length || !bulkEditReady) return;
    const hasPrice = String(bulkPrice).trim() !== "";
    const hasStock = String(bulkStock).trim() !== "";
    setApplyingBulkEdit(true);
    try {
      const changes = selectedProductIds.map((id) => {
        const p = sellableProducts.find((x) => x.id === id);
        if (!p) return null;
        const patch = {};
        if (hasPrice) patch.price = Number(bulkPrice) || 0;
        if (hasStock) patch.stock = Number(bulkStock) || 0;
        if (bulkSizesOn) patch.sizes = bulkSizes;
        if (bulkColors.length) {
          const base = bulkColorsReplace ? [] : (p.colors || []);
          const extra = bulkColors
            .filter((c) => !base.some((x) => sameColor(x, c)))
            .map((c) => ({ name: c.name, hex: c.hex, images: [], frontImage: null, backImage: null, sleeveLeftImage: null, sleeveRightImage: null }));
          patch.colors = [...base, ...extra];
        }
        return { id, patch };
      }).filter(Boolean);
      const res = await applyBulk(changes);
      if (res.failed) return; // se deja todo como está para reintentar
    } finally {
      setApplyingBulkEdit(false);
    }
    setBulkEditOpen(false);
    setBulkPrice("");
    setBulkStock("");
    setBulkSizesOn(false);
    setBulkSizes([]);
    setBulkColors([]);
    setBulkColorsReplace(false);
    setBulkRolyMissing([]);
    setSelectedProductIds([]);
  };

  const discard = async () => {
    await onDiscardChanges();
    setEditingProduct(null);
    setEditingTemplate(null);
    setConfirmingDiscard(false);
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <SectionTitle eyebrow="Solo para el equipo Kulto" title="Panel de administrador" />
        <button onClick={onLogout} className="kulto-btn text-sm flex items-center gap-1 px-3 py-2 rounded-full" style={{ color: "var(--slate)", border: "1px solid var(--line)" }}>
          <LogOut size={15} /> Salir
        </button>
      </div>

      <div className="md:flex md:gap-6 md:items-start">
      <nav className="flex md:flex-col gap-2 mb-6 md:mb-0 overflow-x-auto md:overflow-visible kulto-scrollbar pb-1 -mx-4 px-4 md:mx-0 md:px-3 md:py-3 md:w-60 md:shrink-0 md:sticky md:top-4 md:rounded-2xl" style={{ background: "transparent", border: "none" }}>
        <p className="hidden md:block text-xs font-bold px-3 pb-1" style={{ color: "var(--slate)", letterSpacing: "0.08em" }}>MENÚ</p>
        {ADMIN_TABS.filter(([key]) => allowedTabs.includes(key)).map(([key, label]) => {
          const meta = ADMIN_TAB_META[key] || {};
          const Icon = meta.icon || LayoutGrid;
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => { setTab(key); try { window.scrollTo({ top: 0 }); } catch { /* nada */ } }}
              className="kulto-btn shrink-0 whitespace-nowrap flex items-center gap-3 text-left px-3 py-2.5 rounded-xl"
              style={{ background: active ? "var(--signal)" : "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}
            >
              <Icon size={18} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                {meta.hint && <span className="hidden md:block text-xs font-normal" style={{ color: active ? "rgba(255,255,255,0.85)" : "var(--slate)", whiteSpace: "normal" }}>{meta.hint}</span>}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="flex-1 min-w-0">

      {tab === "productos" && (
        <>
          <div
            className="rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            style={{ background: hasDraftChanges ? "var(--ink-2)" : "transparent", border: hasDraftChanges ? "1px solid var(--sun)" : "1px dashed var(--line)" }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: hasDraftChanges ? "var(--sun)" : "var(--slate)" }}>
                {hasDraftChanges ? "Tenés cambios sin publicar" : "No hay cambios pendientes"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--slate)" }}>
                Acá podés subir fotos, armar productos y cambiar categorías con calma — nadie los ve hasta que toques "Subir cambios".
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {confirmingDiscard ? (
                <>
                  <span className="text-xs self-center" style={{ color: "var(--slate)" }}>¿Descartar todo lo sin publicar?</span>
                  <button onClick={discard} className="kulto-btn text-xs font-semibold px-3 py-2 rounded-full" style={{ background: "var(--signal)", color: "var(--bone)" }}>Sí, descartar</button>
                  <button onClick={() => setConfirmingDiscard(false)} className="kulto-btn text-xs px-3 py-2" style={{ color: "var(--slate)" }}>Cancelar</button>
                </>
              ) : (
                <>
                  {hasDraftChanges && (
                    <button onClick={() => setConfirmingDiscard(true)} className="kulto-btn text-xs font-semibold px-3 py-2 rounded-full" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                      Descartar cambios
                    </button>
                  )}
                  <button
                    disabled={!hasDraftChanges || publishing}
                    onClick={onPublishChanges}
                    className="kulto-btn text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2"
                    style={{
                      background: !hasDraftChanges ? "var(--ink-3)" : "var(--sun)",
                      color: !hasDraftChanges ? "var(--slate)" : "var(--ink)",
                      cursor: !hasDraftChanges ? "default" : "pointer",
                    }}
                  >
                    {publishing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    Subir cambios
                  </button>
                </>
              )}
            </div>
          </div>

          <AdminPhotoInbox
            inbox={photoInbox}
            draftProducts={products}
            categories={categories}
            groups={groups}
            onAddFiles={onAddToInbox}
            onCreateProduct={onCreateProductFromInbox}
            onAddToExisting={onAddInboxToExisting}
            onRemove={onRemoveFromInbox}
          />

          <AdminBulkProductUpload categories={categories} groups={groups} allProducts={sellableProducts} onSaveProduct={onSaveProduct} />

          <div className="grid md:grid-cols-2 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)] gap-6 mt-6">
          <aside className="md:col-span-2 lg:col-span-1">
            <div className="lg:sticky lg:top-24 rounded-2xl p-4" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
              <p className="text-sm font-semibold mb-2" style={{ color: "var(--bone)" }}>Filtrar productos</p>
              <input
                value={pfQuery}
                onChange={(e) => setPfQuery(e.target.value)}
                placeholder="Buscar por nombre o SKU…"
                autoComplete="off"
                name="kulto-admin-product-filter"
                className="w-full rounded-xl p-2 text-sm mb-1"
                style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
              />
              <FilterAccordion title="Grupo / temática" defaultOpen badge={pfGroup !== "Todos" ? "1" : null}>
                <FilterOption label="Todos" count={sellableProducts.length} active={pfGroup === "Todos"} onClick={() => { setPfGroup("Todos"); setPfFolder("Todas"); setPfCat("Todas"); }} />
                {pfGroupNames.map((g) => (
                  <FilterOption key={g} label={g} count={sellableProducts.filter((p) => p.group === g).length} active={pfGroup === g} onClick={() => { setPfGroup(g); setPfFolder("Todas"); setPfCat("Todas"); }} />
                ))}
                {pfHasNoGroup && <FilterOption label="Sin grupo" count={sellableProducts.filter((p) => !p.group).length} active={pfGroup === "__none__"} onClick={() => { setPfGroup("__none__"); setPfFolder("Todas"); setPfCat("Todas"); }} />}
              </FilterAccordion>
              {(pfFolderNames.length > 0 || pfFolder !== "Todas") && (
                <FilterAccordion title="Carpeta" defaultOpen badge={pfFolder !== "Todas" ? "1" : null}>
                  <FilterOption label="Todas" active={pfFolder === "Todas"} onClick={() => { setPfFolder("Todas"); setPfCat("Todas"); }} />
                  {pfFolderNames.map((f) => (
                    <FilterOption key={f} label={f} count={sellableProducts.filter((p) => pfMatchGroup(p) && p.subcategory === f).length} active={pfFolder === f} onClick={() => { setPfFolder(f); setPfCat("Todas"); }} />
                  ))}
                  {pfHasNoFolder && <FilterOption label="Sin carpeta" count={sellableProducts.filter((p) => pfMatchGroup(p) && !p.subcategory).length} active={pfFolder === "__none__"} onClick={() => { setPfFolder("__none__"); setPfCat("Todas"); }} />}
                </FilterAccordion>
              )}
              <FilterAccordion title="Categoría (prenda)" badge={pfCat !== "Todas" ? "1" : null}>
                <FilterOption label="Todas" active={pfCat === "Todas"} onClick={() => setPfCat("Todas")} />
                {pfCatNames.map((c) => (
                  <FilterOption key={c} label={c} count={sellableProducts.filter((p) => pfMatchGroup(p) && pfMatchFolder(p) && p.category === c).length} active={pfCat === c} onClick={() => setPfCat(c)} />
                ))}
              </FilterAccordion>
              <FilterAccordion title="Visibilidad" badge={pfVis !== "todos" ? "1" : null}>
                <FilterOption label="Todos" active={pfVis === "todos"} onClick={() => setPfVis("todos")} />
                <FilterOption label="Visibles para clientes" count={sellableProducts.filter((p) => !p.hidden).length} active={pfVis === "visibles"} onClick={() => setPfVis("visibles")} />
                <FilterOption label="Ocultos" count={sellableProducts.filter((p) => p.hidden).length} active={pfVis === "ocultos"} onClick={() => setPfVis("ocultos")} />
              </FilterAccordion>
              {pfActive && (
                <button onClick={pfClear} className="kulto-btn text-xs font-semibold flex items-center gap-1.5 mt-3" style={{ color: "var(--signal)" }}>
                  <RotateCcw size={13} /> Limpiar filtros ({filteredSellable.length} de {sellableProducts.length})
                </button>
              )}
            </div>
          </aside>
            <div className="flex flex-col gap-6">
              <AdminProductForm categories={categories} groups={groups} onAddCategory={onAddCategory} onAddGroup={onAddGroup} savedColors={savedColors} onSaveColorToLibrary={onSaveColorToLibrary} onRemoveColorFromLibrary={onRemoveColorFromLibrary} onSave={async (p) => { await onSaveProduct(p); setEditingProduct(null); }} editing={editingProduct} onCancelEdit={() => setEditingProduct(null)} allProducts={sellableProducts} />
              <AdminGroupManager groups={groups} onRename={onRenameGroup} onDelete={onDeleteGroup} />
              <AdminCategoryManager categories={categories} onRename={onRenameCategory} onDelete={onDeleteCategory} />
            </div>
            <div className="flex flex-col gap-3">
              {selectedProductIds.length === 0 && sellableProducts.length > 0 && (
                <div className="rounded-xl p-3 text-xs flex gap-2 items-start" style={{ background: "var(--ink-2)", border: "1px dashed var(--line)", color: "var(--slate)" }}>
                  <FolderPlus size={14} className="shrink-0 mt-0.5" style={{ color: "var(--sun)" }} />
                  <span>Para crear carpetas dentro de un grupo (ej: Naruto dentro de "anime"): abrí el grupo, tildá los productos que van juntos y arriba va a aparecer el cuadro "Carpeta" — escribí el nombre y tocá "Meter en carpeta".</span>
                </div>
              )}
              {(bulkProgress || bulkMessage) && (
                <div className="rounded-xl p-3 text-xs flex items-center gap-2" style={{ background: "var(--ink-2)", border: "1px solid var(--sun)", color: "var(--bone)" }}>
                  {bulkProgress ? <><Loader2 size={14} className="animate-spin shrink-0" /> Guardando {bulkProgress.done} de {bulkProgress.total}…</> : bulkMessage}
                  {!bulkProgress && <button onClick={() => setBulkMessage("")} className="kulto-btn ml-auto text-[11px]" style={{ color: "var(--slate)" }}>Cerrar</button>}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 flex-wrap" style={selectedProductIds.length > 0 ? { position: "sticky", top: 8, zIndex: 30, background: "var(--ink)", border: "1px solid var(--sun)", borderRadius: 16, padding: 8 } : undefined}>
                <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Productos ({pfActive ? `${filteredSellable.length} de ${sellableProducts.length}` : sellableProducts.length}){selectedProductIds.length > 0 ? ` · ${selectedProductIds.length} tildado${selectedProductIds.length === 1 ? "" : "s"}` : ""}</p>
                {selectedProductIds.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {groups.length > 0 && (
                      <>
                        <select
                          value={bulkGroupTarget}
                          onChange={(e) => setBulkGroupTarget(e.target.value)}
                          className="rounded-full text-xs px-3 py-1.5"
                          style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                        >
                          <option value="">Mover a grupo…</option>
                          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <button
                          type="button"
                          disabled={!bulkGroupTarget || movingSelected}
                          onClick={moveSelectedToGroup}
                          className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1 shrink-0"
                          style={{ background: "var(--sun)", color: "var(--ink)", opacity: !bulkGroupTarget || movingSelected ? 0.5 : 1 }}
                        >
                          {movingSelected ? <Loader2 size={13} className="animate-spin" /> : <FolderPlus size={13} />}
                          Mover {selectedProductIds.length}
                        </button>
                      </>
                    )}
                    <input
                      list="kulto-folder-options"
                      value={bulkFolderTarget}
                      onChange={(e) => setBulkFolderTarget(e.target.value)}
                      placeholder="Carpeta (ej: Naruto)…"
                      className="rounded-full text-xs px-3 py-1.5"
                      style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)", width: 170 }}
                    />
                    <datalist id="kulto-folder-options">
                      {Array.from(new Set(sellableProducts.map((p) => p.subcategory).filter(Boolean))).sort((x, y) => x.localeCompare(y, "es")).map((f) => <option key={f} value={f} />)}
                    </datalist>
                    <button
                      type="button"
                      disabled={!bulkFolderTarget.trim() || movingSelected}
                      onClick={() => moveSelectedToFolder(false)}
                      className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1 shrink-0"
                      style={{ background: "var(--sun)", color: "var(--ink)", opacity: !bulkFolderTarget.trim() || movingSelected ? 0.5 : 1 }}
                    >
                      <FolderPlus size={13} /> Meter en carpeta
                    </button>
                    <button
                      type="button"
                      disabled={movingSelected}
                      onClick={() => moveSelectedToFolder(true)}
                      className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full shrink-0"
                      style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    >
                      Sacar de carpeta
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkModelsOpen((v) => !v)}
                      className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1 shrink-0"
                      style={{ background: bulkModelsOpen ? "var(--sun)" : "var(--ink-3)", color: bulkModelsOpen ? "var(--ink)" : "var(--bone)", border: "1px solid var(--line)" }}
                    >
                      <Boxes size={13} /> Modelos disponibles
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkEditOpen((v) => !v)}
                      className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1 shrink-0"
                      style={{ background: bulkEditOpen ? "var(--sun)" : "var(--ink-3)", color: bulkEditOpen ? "var(--ink)" : "var(--bone)", border: "1px solid var(--line)" }}
                    >
                      <Pencil size={13} /> Precio / stock / talles
                    </button>
                    <button
                      type="button"
                      disabled={deletingSelected}
                      onClick={deleteSelectedProducts}
                      className="kulto-btn text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1 shrink-0"
                      style={{ background: "var(--signal)", color: "var(--bone)", opacity: deletingSelected ? 0.6 : 1 }}
                    >
                      {deletingSelected ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      Borrar {selectedProductIds.length}
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs -mt-2" style={{ color: "var(--slate)" }}>
                Toca un producto para editarlo, o marcá el círculo para seleccionar varios: podés moverlos todos juntos a otro grupo/temática, decir en qué otras prendas están disponibles, o borrarlos de una. Esta lista incluye tus cambios sin publicar. Las prendas base para Personalizar no aparecen acá — tienen su propia pestaña.
              </p>
              {selectedProductIds.length > 0 && bulkModelsOpen && (
                <div className="rounded-xl p-3 flex flex-col gap-2 -mt-1" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
                  <p className="text-[11px]" style={{ color: "var(--slate)" }}>
                    Tildá en qué otras prendas tienen que estar disponibles los {selectedProductIds.length} diseños seleccionados. Cada uno se crea en su propia categoría — no quedan todos amontonados en una sola.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleBulkModelCat(cat)}
                        className="kulto-btn text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1"
                        style={{ background: bulkModelCats.includes(cat) ? "var(--sun)" : "var(--ink)", color: bulkModelCats.includes(cat) ? "var(--ink)" : "var(--bone)", border: "1px solid var(--line)" }}
                      >
                        {bulkModelCats.includes(cat) && <Check size={11} />} {cat}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={!bulkModelCats.length || applyingBulkModels}
                    onClick={applyBulkModels}
                    className="kulto-btn text-xs font-semibold px-3 py-2 rounded-full self-start flex items-center gap-1"
                    style={{ background: "var(--signal)", color: "var(--bone)", opacity: !bulkModelCats.length || applyingBulkModels ? 0.5 : 1 }}
                  >
                    {applyingBulkModels ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {applyingBulkModels ? "Creando…" : `Aplicar a ${selectedProductIds.length} seleccionado${selectedProductIds.length === 1 ? "" : "s"}`}
                  </button>
                </div>
              )}
              {selectedProductIds.length > 0 && bulkEditOpen && (
                <div id="kulto-bulk-edit-panel" className="rounded-xl p-3 flex flex-col gap-3 -mt-1" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
                  <p className="text-[11px]" style={{ color: "var(--slate)" }}>
                    Cambiá precio, stock, talles y/o colores para los {selectedProductIds.length} seleccionados de una sola vez. Dejá un campo vacío (o sin tildar) para no tocar ese dato — podés seguir editando cada producto individualmente con el lápiz cuando quieras.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="number"
                      placeholder="Nuevo precio (€) — opcional"
                      value={bulkPrice}
                      onChange={(e) => setBulkPrice(e.target.value)}
                      className="rounded-lg p-2 text-sm flex-1 min-w-[140px]"
                      style={{ background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    />
                    <input
                      type="number"
                      placeholder="Nuevo stock — opcional"
                      value={bulkStock}
                      onChange={(e) => setBulkStock(e.target.value)}
                      className="rounded-lg p-2 text-sm flex-1 min-w-[140px]"
                      style={{ background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--slate)" }}>
                      <input type="checkbox" checked={bulkSizesOn} onChange={(e) => setBulkSizesOn(e.target.checked)} style={{ accentColor: "var(--signal)" }} />
                      Cambiar talles (reemplaza los talles actuales de cada seleccionado por estos)
                    </label>
                    {bulkSizesOn && (
                      <div className="flex flex-wrap gap-1.5">
                        {SIZE_PRESETS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => toggleBulkSize(s)}
                            className="kulto-btn text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1"
                            style={{ background: bulkSizes.includes(s) ? "var(--sun)" : "var(--ink)", color: bulkSizes.includes(s) ? "var(--ink)" : "var(--bone)", border: "1px solid var(--line)" }}
                          >
                            {bulkSizes.includes(s) && <Check size={11} />} {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 rounded-lg p-2" style={{ background: "var(--ink)", border: "1px dashed var(--line)" }}>
                    <p className="text-[11px] font-semibold" style={{ color: "var(--bone)" }}>Colores para los {selectedProductIds.length} seleccionados</p>
                    {savedColors && savedColors.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {savedColors.map((c, i) => {
                          const on = bulkColors.some((x) => sameColor(x, c));
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => toggleBulkColor(c)}
                              className="kulto-btn flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 text-[11px]"
                              style={{ background: "var(--ink-3)", color: "var(--bone)", border: on ? "2px solid var(--sun)" : "1px solid var(--line)" }}
                            >
                              <span className="w-4 h-4 rounded-full" style={{ background: c.hex, border: "1px solid var(--line)" }} />
                              {c.name}{on && <Check size={11} />}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px]" style={{ color: "var(--slate)" }}>Todavía no hay colores guardados — usá los números de Roly de abajo.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        placeholder="Números de Roly: 01, 47, 56…"
                        value={bulkRolyInput}
                        onChange={(e) => setBulkRolyInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBulkRoly(); } }}
                        className="rounded-lg p-2 text-xs flex-1 min-w-[150px]"
                        style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}
                      />
                      <button type="button" onClick={addBulkRoly} className="kulto-btn text-[11px] font-semibold px-3 py-2 rounded-full" style={{ background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" }}>Agregar</button>
                    </div>
                    {bulkRolyMissing.length > 0 && <p className="text-[11px]" style={{ color: "var(--signal)" }}>No encontré estos números: {bulkRolyMissing.join(", ")}</p>}
                    {bulkColors.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[11px]" style={{ color: "var(--slate)" }}>Elegidos:</span>
                        {bulkColors.map((c, i) => (
                          <span key={i} className="flex items-center gap-1 text-[11px] rounded-full pl-1 pr-2 py-0.5" style={{ background: "var(--ink-3)", color: "var(--bone)" }}>
                            <span className="w-3.5 h-3.5 rounded-full" style={{ background: c.hex }} /> {c.name}
                            <button type="button" onClick={() => setBulkColors((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Quitar"><X size={10} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--slate)" }}>
                      <input type="checkbox" checked={bulkColorsReplace} onChange={(e) => setBulkColorsReplace(e.target.checked)} style={{ accentColor: "var(--signal)" }} />
                      Reemplazar los colores que ya tienen (si no, se agregan a los que ya tienen)
                    </label>
                    <p className="text-[10px]" style={{ color: "var(--slate)" }}>Los colores nuevos quedan "Sin foto": después le subís la foto a cada uno desde el lápiz del producto.</p>
                  </div>
                  <button
                    type="button"
                    disabled={!bulkEditReady || applyingBulkEdit}
                    onClick={applyBulkEdit}
                    className="kulto-btn text-xs font-semibold px-3 py-2 rounded-full self-start flex items-center gap-1"
                    style={{ background: "var(--signal)", color: "var(--bone)", opacity: !bulkEditReady || applyingBulkEdit ? 0.5 : 1 }}
                  >
                    {applyingBulkEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {applyingBulkEdit ? "Guardando…" : `Aplicar a ${selectedProductIds.length} seleccionado${selectedProductIds.length === 1 ? "" : "s"}`}
                  </button>
                </div>
              )}
              {sellableProducts.length === 0 && <EmptyState text="Todavía no cargaste ningún producto." />}
              {sellableProducts.length > 0 && filteredSellable.length === 0 && <EmptyState text="No hay productos con estos filtros." />}
              {Object.entries(
                filteredSellable.reduce((acc, p) => {
                  // Se agrupa por grupo/temática (ej: "kulto", "anime") y no
                  // por categoría — la categoría es solo la prenda física, lo
                  // que de verdad organiza los diseños para el dueño es el
                  // grupo/temática al que pertenecen.
                  const grp = p.group || "Sin grupo / temática";
                  (acc[grp] = acc[grp] || []).push(p);
                  return acc;
                }, {})
              ).map(([grp, items]) => {
                const isOpen = expandedProductCats.includes(grp);
                const allSelected = items.length > 0 && items.every((p) => selectedProductIds.includes(p.id));
                const toggleSelectGroup = (e) => {
                  e.stopPropagation();
                  const ids = items.map((p) => p.id);
                  setSelectedProductIds((prev) => (allSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
                };
                return (
                  <div key={grp} className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                    <div className="w-full flex items-center gap-2 p-3" style={{ background: "var(--ink-2)" }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectGroup}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                        style={{ accentColor: "var(--signal)" }}
                        aria-label={`Seleccionar todo "${grp}"`}
                      />
                      <button
                        type="button"
                        onClick={() => toggleProductCat(grp)}
                        className="kulto-btn flex-1 flex items-center gap-2 text-left"
                      >
                        {isOpen ? <ChevronDown size={16} color="var(--slate)" /> : <ChevronRight size={16} color="var(--slate)" />}
                        <span className="text-sm font-semibold flex-1" style={{ color: "var(--bone)" }}>{grp}</span>
                        <span className="text-xs" style={{ color: "var(--slate)" }}>{items.length} producto{items.length === 1 ? "" : "s"}</span>
                      </button>
                      <HideListButton list={items} what="todo este grupo" />
                      <button
                        type="button"
                        onClick={() => openColorsFor(items)}
                        className="kulto-btn text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
                        style={{ background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
                        title="Elegir colores para todos los productos de este grupo"
                      >
                        Colores
                      </button>
                      {grp !== "Sin grupo / temática" && onRenameGroup && (
                        <button
                          type="button"
                          onClick={() => {
                            const input = window.prompt(`Nuevo nombre para el grupo "${grp}":`, grp);
                            if (input && input.trim() && input.trim() !== grp) onRenameGroup(grp, input.trim());
                          }}
                          className="kulto-btn p-1.5 rounded-full shrink-0"
                          style={{ color: "var(--bone)" }}
                          aria-label={`Cambiar nombre del grupo ${grp}`}
                          title="Cambiar nombre del grupo"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <div className="flex flex-col gap-3 p-2 pt-0" style={{ background: "var(--ink-2)" }}>
                        {Object.entries(
                          items.reduce((acc, p) => {
                            // Dentro de cada grupo/temática (ej: "anime") se arman
                            // carpetas según la subcategoría de cada producto
                            // (ej: Naruto, Dragon Ball). Lo que no tiene carpeta
                            // va aparte, en "Sin carpeta".
                            const f = p.subcategory || "";
                            (acc[f] = acc[f] || []).push(p);
                            return acc;
                          }, {})
                        ).sort(([x], [y]) => (x || "\uffff").localeCompare(y || "\uffff", "es")).map(([folderName, fItems]) => {
                        const hasAnyFolder = items.some((p) => p.subcategory);
                        const folderKey = `${grp}|${folderName}`;
                        const folderOpen = !hasAnyFolder || expandedFolders.includes(folderKey);
                        const folderAllSelected = fItems.length > 0 && fItems.every((x) => selectedProductIds.includes(x.id));
                        const toggleSelectFolder = () => {
                          const ids = fItems.map((x) => x.id);
                          setSelectedProductIds((prev) => (folderAllSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
                        };
                        return (
                        <React.Fragment key={folderName || "__sin_carpeta"}>
                        {hasAnyFolder && (
                          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
                            <input
                              type="checkbox"
                              checked={folderAllSelected}
                              onChange={toggleSelectFolder}
                              style={{ accentColor: "var(--signal)" }}
                              aria-label={`Seleccionar carpeta "${folderName || "Sin carpeta"}"`}
                            />
                            <button type="button" onClick={() => toggleFolder(folderKey)} className="kulto-btn flex-1 flex items-center gap-2 text-left">
                              {folderOpen ? <ChevronDown size={14} color="var(--slate)" /> : <ChevronRight size={14} color="var(--slate)" />}
                              <FolderPlus size={13} color="var(--sun)" />
                              <span className="text-sm font-semibold flex-1" style={{ color: "var(--bone)" }}>{folderName || "Sin carpeta"}</span>
                              <span className="text-[11px]" style={{ color: "var(--slate)" }}>{fItems.length}</span>
                            </button>
                            <HideListButton list={fItems} what="toda esta carpeta" />
                            <button
                              type="button"
                              onClick={() => openColorsFor(fItems)}
                              className="kulto-btn text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
                              style={{ background: "var(--ink)", color: "var(--bone)", border: "1px solid var(--line)" }}
                              title="Elegir colores para todos los productos de esta carpeta"
                            >
                              Colores
                            </button>
                            <button
                              type="button"
                              disabled={movingSelected}
                              onClick={() => renameFolder(fItems, folderName)}
                              className="kulto-btn p-1.5 rounded-full shrink-0"
                              style={{ color: "var(--bone)" }}
                              aria-label={folderName ? `Cambiar nombre de la carpeta ${folderName}` : "Ponerle nombre de carpeta a estos productos"}
                              title={folderName ? "Cambiar nombre de la carpeta" : "Crear una carpeta con estos productos"}
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                        )}
                        {folderOpen && (
                        <div className={`flex flex-col gap-3 ${hasAnyFolder ? "pl-3" : ""}`}>
                        {Object.entries(
                          fItems.reduce((acc, p) => {
                            // Dentro de cada carpeta, a su vez se separa
                            // por categoría (la prenda física) — para que, por
                            // ejemplo, "Sudaderas" quede en su propia carpeta y
                            // no mezclado con "Camisetas" del mismo diseño.
                            const cat = p.category || "Sin categoría";
                            (acc[cat] = acc[cat] || []).push(p);
                            return acc;
                          }, {})
                        ).map(([cat, catItemsRaw]) => {
                          const catItems = catItemsRaw;
                          const catAllSelected = catItems.length > 0 && catItems.every((p) => selectedProductIds.includes(p.id));
                          const toggleSelectCat = () => {
                            const ids = catItems.map((p) => p.id);
                            setSelectedProductIds((prev) => (catAllSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
                          };
                          return (
                          <div key={cat} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                            <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer" style={{ background: "var(--ink-3)" }}>
                              <input
                                type="checkbox"
                                checked={catAllSelected}
                                onChange={toggleSelectCat}
                                style={{ accentColor: "var(--signal)" }}
                                aria-label={`Seleccionar todo "${cat}"`}
                              />
                              <p className="text-[11px] font-semibold flex-1" style={{ color: "var(--slate)" }}>
                                {cat} · {catItems.length}{catItems.some((p) => p.hidden) ? ` · ${catItems.filter((p) => p.hidden).length} oculto${catItems.filter((p) => p.hidden).length === 1 ? "" : "s"}` : ""}
                              </p>
                              <HideListButton list={catItems} what={`todas las "${cat}"`} />
                            </label>
                            <div className="flex flex-col gap-2 p-2">
                        {catItems.map((p) => {
                          const modelsOpen = expandedModelsFor === p.id;
                          const variants = linkedVariants(p);
                          return (
                          <div key={p.id} className="flex flex-col gap-1.5">
                            <div
                              onClick={() => setEditingProduct(p)}
                              className="kulto-btn flex items-center gap-3 rounded-2xl p-3 text-left"
                              style={{ background: editingProduct?.id === p.id ? "var(--ink-3)" : "var(--ink)", border: editingProduct?.id === p.id ? "1px solid var(--sun)" : "1px solid var(--line)", opacity: p.hidden ? 0.5 : 1 }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedProductIds.includes(p.id)}
                                onChange={() => toggleProductSelect(p.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0"
                                style={{ accentColor: "var(--signal)" }}
                                aria-label={`Seleccionar ${p.name}`}
                              />
                              <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center" style={{ background: p.colors?.[0]?.hex || "var(--ink-3)" }}>
                                {(p.photoPool?.[0] || getColorImages(p.colors?.[0])[0]) ? <FastImg loading="lazy" src={p.photoPool?.[0] || getColorImages(p.colors?.[0])[0]} className="w-full h-full object-contain p-0.5" alt={p.name} /> : <Shirt size={18} color="rgba(243,239,230,0.4)" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: "var(--bone)" }}>{p.name}</p>
                                <p className="text-xs" style={{ color: "var(--slate)" }}>{p.category ? `${p.category}${p.subcategory ? ` · ${p.subcategory}` : ""} · ` : ""}{formatPrice(p.price)} · stock {p.stock}{p.hidden ? " · Oculto para clientes" : ""}{variants.length > 1 ? ` · ${variants.length} modelos` : ""}</p>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); onSaveProduct({ ...p, hidden: !p.hidden }); }}
                                className="kulto-btn text-[11px] px-2 py-1.5 rounded-full font-semibold flex items-center gap-1 shrink-0"
                                style={{ background: p.hidden ? "var(--ink)" : "var(--sun)", color: p.hidden ? "var(--bone)" : "var(--ink)" }}
                                aria-label={p.hidden ? "Mostrar producto" : "Ocultar producto"}
                              >
                                {p.hidden ? <><Eye size={13} /> Mostrar</> : <><EyeOff size={13} /> Ocultar</>}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); moveOneToFolder(p); }}
                                disabled={movingSelected}
                                className="kulto-btn p-2 rounded-full"
                                style={{ color: p.subcategory ? "var(--sun)" : "var(--bone)" }}
                                aria-label="Mover a carpeta"
                                title="Mover a carpeta"
                              >
                                <FolderPlus size={16} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedModelsFor(modelsOpen ? null : p.id); }}
                                className="kulto-btn p-2 rounded-full"
                                style={{ color: modelsOpen ? "var(--sun)" : "var(--bone)" }}
                                aria-label="Modelos donde está disponible"
                                title="Modelos donde está disponible"
                              >
                                <Boxes size={16} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setEditingProduct(p); }} className="kulto-btn p-2 rounded-full" style={{ color: "var(--bone)" }} aria-label="Editar producto"><Pencil size={16} /></button>
                              <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Borrar "${p.name}"? Esta acción no se puede deshacer.`)) onDeleteProduct(p.id); }} className="kulto-btn p-2 rounded-full" style={{ color: "var(--signal)" }} aria-label="Borrar producto"><Trash2 size={16} /></button>
                            </div>
                            {modelsOpen && (
                              <div className="rounded-xl p-3 flex flex-col gap-2 ml-2" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }} onClick={(e) => e.stopPropagation()}>
                                <p className="text-[11px]" style={{ color: "var(--slate)" }}>
                                  Tildá los modelos donde también está disponible "{p.name}". Destildá uno para sacarlo de ese modelo.
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {categories.map((cat) => {
                                    const isOwn = cat === p.category;
                                    const isOn = isOwn || variants.some((v) => v.category === cat);
                                    return (
                                      <button
                                        key={cat}
                                        type="button"
                                        disabled={isOwn || savingModelsFor === p.id}
                                        onClick={() => toggleModelForProduct(p, cat)}
                                        className="kulto-btn text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1"
                                        style={{ background: isOn ? "var(--sun)" : "var(--ink)", color: isOn ? "var(--ink)" : "var(--bone)", border: "1px solid var(--line)", opacity: isOwn ? 0.7 : 1 }}
                                      >
                                        {isOn && <Check size={11} />} {cat}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                          );
                        })}
                            </div>
                          </div>
                          );
                        })}
                        </div>
                        )}
                        </React.Fragment>
                        );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {tab === "personalizar" && (
        <div className="flex flex-col gap-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-6">
              <div className="rounded-2xl p-3 text-xs" style={{ background: "var(--ink-2)", border: "1px dashed var(--line)", color: "var(--slate)" }}>
                Acá cargás y editás únicamente las prendas base que se usan en "Personalizar" — no se mezclan con el catálogo de venta normal.
              </div>
              <AdminTemplateForm
                categories={categories}
                templateProducts={templateProducts}
                onAddCategory={onAddCategory}
                onSave={async (p) => {
                  const res = await onSaveProductVerbose(p);
                  if (res && res.ok === false) return res;
                  setEditingTemplate(null);
                  return res;
                }}
                editing={editingTemplate}
                onCancelEdit={() => setEditingTemplate(null)}
              />
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>Prendas base para sublimar ({templateProducts.length})</p>
              <p className="text-xs -mt-2" style={{ color: "var(--slate)" }}>
                Estas son, y solo estas, las prendas que aparecen en el paso 1 de "Personalizar" en la web. Toca una para editarla.
              </p>
              {templateProducts.length === 0 && <EmptyState text="Todavía no cargaste ninguna prenda base para sublimar." />}
              {templateProducts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setEditingTemplate(p)}
                  className="kulto-btn flex items-center gap-3 rounded-2xl p-3 text-left"
                  style={{ background: editingTemplate?.id === p.id ? "var(--ink-3)" : "var(--ink-2)", border: editingTemplate?.id === p.id ? "1px solid var(--sun)" : "1px solid var(--line)", opacity: p.hidden ? 0.5 : 1 }}
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center" style={{ background: p.colors?.[0]?.hex || "var(--ink-3)" }}>
                    {(p.colors?.[0]?.frontImage || p.photoPool?.[0]) ? <FastImg loading="lazy" src={p.colors?.[0]?.frontImage || p.photoPool?.[0]} className="w-full h-full object-contain p-0.5" alt={p.name} /> : <Shirt size={18} color="rgba(243,239,230,0.4)" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--bone)" }}>{p.name}</p>
                    <p className="text-xs" style={{ color: "var(--slate)" }}>
                      {p.category}{p.subcategory ? ` · ${p.subcategory}` : ""} · {p.colors?.length || 0} color{(p.colors?.length || 0) === 1 ? "" : "es"}{p.price != null ? ` · ${formatPrice(p.price)}` : ""}{p.hidden ? " · Oculta para clientes" : ""}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSaveProduct({ ...p, hidden: !p.hidden }); }}
                    className="kulto-btn text-[11px] px-2 py-1.5 rounded-full font-semibold flex items-center gap-1 shrink-0"
                    style={{ background: p.hidden ? "var(--ink)" : "var(--sun)", color: p.hidden ? "var(--bone)" : "var(--ink)" }}
                    aria-label={p.hidden ? "Mostrar prenda" : "Ocultar prenda"}
                  >
                    {p.hidden ? <><Eye size={13} /> Mostrar</> : <><EyeOff size={13} /> Ocultar</>}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setEditingTemplate(p); }} className="kulto-btn p-2 rounded-full" style={{ color: "var(--bone)" }} aria-label="Editar prenda"><Pencil size={16} /></button>
                  <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Borrar "${p.name}"? Esta acción no se puede deshacer.`)) onDeleteProduct(p.id); }} className="kulto-btn p-2 rounded-full" style={{ color: "var(--signal)" }} aria-label="Borrar prenda"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
          <AdminBulkColorsBySubcategory templateProducts={templateProducts} onSaveVerbose={onSaveProductVerbose} />
          <AdminPersonalizeGroupImages templateProducts={templateProducts} settings={settings} onSave={onSaveSettings} />
          <AdminPersonalizeCardColors templateProducts={templateProducts} settings={settings} onSave={onSaveSettings} />
          <AdminPersonalizeSubcategoryPrices templateProducts={templateProducts} settings={settings} onSave={onSaveSettings} />
          <AdminDesignLibrary
            designs={designLibrary}
            onAdd={onAddDesignToLibrary}
            onRemove={onRemoveDesignFromLibrary}
            folders={designFolders}
            categories={categories}
            onAddFolder={onAddDesignFolder}
            onRenameFolder={onRenameDesignFolder}
            onRemoveFolder={onRemoveDesignFolder}
            onToggleCover={onToggleDesignFolderCover}
            onAssignFolder={onAssignDesignToFolder}
            onSetFolderCategory={onSetDesignFolderCategory}
            onSetFolderGarments={onSetDesignFolderGarments}
            templateProducts={templateProducts}
          />
          <AdminCustomWorkGallery items={customWorkGallery} onAdd={onAddCustomWork} onRemove={onRemoveCustomWork} speed={settings.customWorkSpeed} onSpeedChange={(v) => onSaveSettings({ customWorkSpeed: v })} />
        </div>
      )}

      {tab === "pedidos" && <AdminOrders orders={orders} settings={settings} onSetLocalStatus={onSetLocalStatus} onSetLocalTracking={onSetLocalTracking} onToggleStatus={onToggleOrderStatus} onUpdateTracking={onUpdateTracking} onApplyDiscount={onApplyDiscount} onRequestReview={onRequestReview} onBulkComplete={onBulkComplete} onBulkArchive={onBulkArchive} onBulkDelete={onBulkDelete} />}
      {tab === "ventas" && <AdminSalesPanel products={sellableProducts} orders={orders} settings={settings} onSaveSettings={onSaveSettings} />}
      {tab === "estadisticas" && <AdminAnalyticsPanel settings={settings} onSaveSettings={onSaveSettings} />}
      {tab === "compras" && <AdminRestockPanel products={sellableProducts} onQuickRestock={onQuickRestock} settings={settings} onSaveSettings={onSaveSettings} />}
      {tab === "clientes" && <AdminCustomers customers={customers} onAdjustPoints={onAdjustCustomerPoints} loyaltyThreshold={settings?.loyaltyRewardThreshold} isOwner={isOwner} onSetAdminPermissions={onSetAdminPermissions} onDeleteCustomer={onDeleteCustomer} onCreateCustomer={onCreateCustomer} onUpdateCustomerInfo={onUpdateCustomerInfo} onSendPasswordHelp={onSendPasswordHelp} />}
      {tab === "resenas" && <AdminReviews reviews={reviews} onSave={onSaveReview} onDelete={onDeleteReview} onReorder={onReorderReview} />}
      {tab === "beneficios" && <AdminBenefitsPanel settings={settings} onSave={onSaveSettings} />}
      {tab === "ajustes" && (
        <div className="flex flex-col gap-6">
          <AdminBackupPanel />
          <AdminImageOptimizer />
          <AdminBrandSettings settings={settings} onSave={onSaveSettings} />
          <AdminBannerSettings settings={settings} groups={groups} onSave={onSaveSettings} />
          <AdminProductsMenu items={settings.productsMenuItems || []} categories={categories} groups={groups} onSave={onSaveSettings} />
          <AdminHowItWorksSettings settings={settings} onSave={onSaveSettings} />
          <AdminSectionSettings settings={settings} onSave={onSaveSettings} />
          <AdminThemeSettings settings={settings} onSave={onSaveSettings} />
          <AdminShippingSettings settings={settings} onSave={onSaveSettings} />
          <AdminLocalAreasSettings settings={settings} onSave={onSaveSettings} />
          <AdminDesignFeedbackSettings settings={settings} onSave={onSaveSettings} />
          <AdminPrintSizeGuideSettings settings={settings} onSave={onSaveSettings} />
          <AdminDepositSettings settings={settings} onSave={onSaveSettings} />
          <AdminEmailTestSettings settings={settings} />
          <AdminStoreTrustSettings settings={settings} onSave={onSaveSettings} />
          <AdminFaqSettings settings={settings} onSave={onSaveSettings} />
          <AdminLoyaltySettings settings={settings} onSave={onSaveSettings} />
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Header & footer                                                    */
/* ------------------------------------------------------------------ */

function NavLink({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="kulto-btn kulto-nav text-sm font-semibold pb-1"
      style={{ color: "var(--bone)", borderBottom: active ? "2px solid var(--signal)" : "2px solid transparent" }}
    >
      {label}
    </button>
  );
}

function Header({ page, setPage, cartCount, onOpenCart, logoImage, logoText, customer, themeMode, onToggleThemeMode, fontStep, onDecreaseFont, onIncreaseFont, socialLinks = {}, showAdminMenu = false, onGoAdminTab, onPreviewAsCustomer, productsMenuItems = [], onGoCatalog, products = [] }) {
  const [open, setOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef(null);
  // Menú flotante de "Productos" (desktop) — lista "Catálogo" + los accesos
  // directos que el admin haya elegido a mano en Ajustes (no se arma solo
  // listando grupos, esos son otra cosa, se usan para los banners). El
  // desplegable del celular usa su propio estado porque se despliega inline
  // en vez de flotar.
  const [catalogMenuOpen, setCatalogMenuOpen] = useState(false);
  const [catalogMenuOpenMobile, setCatalogMenuOpenMobile] = useState(false);
  const catalogMenuRef = useRef(null);
  // Qué acceso directo (de categoría) tiene desplegado su lista de
  // subcategorías ahora mismo — uno a la vez, y por separado en desktop y
  // celular porque son dos desplegables independientes.
  const [expandedMenuItemId, setExpandedMenuItemId] = useState(null);
  const [expandedMenuItemIdMobile, setExpandedMenuItemIdMobile] = useState(null);
  const goCatalog = (item) => {
    onGoCatalog?.(item ? { group: item.type === "group" ? item.value : "", category: item.type === "category" ? item.value : "" } : {});
    setOpen(false);
    setCatalogMenuOpen(false);
    setCatalogMenuOpenMobile(false);
  };
  const goCatalogSubcategory = (categoryValue, subcat) => {
    onGoCatalog?.({ category: categoryValue, subcategory: subcat });
    setOpen(false);
    setCatalogMenuOpen(false);
    setCatalogMenuOpenMobile(false);
  };
  // Subcategorías ya usadas por productos de esta categoría (texto libre,
  // ver "Subcategoría" en el formulario de producto) — si no hay ninguna,
  // el acceso directo se comporta como antes, sin flecha para desplegar.
  const subcatsForItem = (it) => {
    if (it.type !== "category") return [];
    return Array.from(
      new Set(
        products
          .filter((p) => p.category === it.value || (p.extraCategories || []).includes(it.value))
          .map((p) => p.subcategory)
          .filter(Boolean)
      )
    );
  };
  // Menú grande de "Productos" (escritorio): lista a la izquierda y, a la
  // derecha, tarjetas con foto de lo que hay dentro de la opción elegida
  // (carpetas si las tiene; si no, categorías o los primeros productos).
  const [megaItemId, setMegaItemId] = useState(null);
  const closeMenus = () => { setOpen(false); setCatalogMenuOpen(false); setCatalogMenuOpenMobile(false); };
  const tileImage = (p) => (p ? (p.photoPool?.[0] || getColorImages(p.colors?.[0])[0] || null) : null);
  const productsForItem = (it) => products.filter((p) => (it.type === "group" ? (p.group || "") === it.value : (p.category === it.value || (p.extraCategories || []).includes(it.value))));
  const megaTiles = (it) => {
    const ps = productsForItem(it);
    const withImg = (list) => list.find((p) => tileImage(p)) || list[0];
    const subs = [...new Set(ps.map((p) => p.subcategory).filter(Boolean))].sort((x, y) => x.localeCompare(y, "es"));
    const base = { group: it.type === "group" ? it.value : "", category: it.type === "category" ? it.value : "" };
    if (subs.length) {
      return subs.slice(0, 8).map((sc) => ({ key: `s:${sc}`, label: sc, img: tileImage(withImg(ps.filter((p) => p.subcategory === sc))), onClick: () => { onGoCatalog?.({ ...base, subcategory: sc }); closeMenus(); } }));
    }
    if (it.type === "group") {
      const cats = [...new Set(ps.map((p) => p.category).filter(Boolean))];
      if (cats.length > 1) {
        return cats.slice(0, 8).map((c) => ({ key: `c:${c}`, label: c, img: tileImage(withImg(ps.filter((p) => p.category === c))), onClick: () => { onGoCatalog?.({ group: it.value, category: c }); closeMenus(); } }));
      }
    }
    return ps.slice(0, 4).map((p) => ({ key: p.id, label: p.name, img: tileImage(p), onClick: () => goCatalog(it) }));
  };
  const go = (p) => { setPage(p); setOpen(false); };
  useEffect(() => {
    if (!catalogMenuOpen) return;
    const onDocClick = (e) => {
      if (catalogMenuRef.current && !catalogMenuRef.current.contains(e.target)) setCatalogMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [catalogMenuOpen]);
  useEffect(() => {
    if (!adminMenuOpen) return;
    const onDocClick = (e) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target)) setAdminMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [adminMenuOpen]);
  const ADMIN_QUICK_LINKS = [
    { label: "Clientes", onClick: () => onGoAdminTab?.("clientes") },
    { label: "Ver la web como cliente", onClick: () => onPreviewAsCustomer?.() },
    { label: "Panel de ventas", onClick: () => onGoAdminTab?.("ventas") },
    { label: "Logística / Pedidos", onClick: () => onGoAdminTab?.("pedidos") },
    { label: "Productos a comprar", onClick: () => onGoAdminTab?.("compras") },
    { label: "Diseños PNG", onClick: () => onGoAdminTab?.("personalizar") },
    { label: "Subir productos", onClick: () => onGoAdminTab?.("productos") },
  ];
  // paddingTop con env(safe-area-inset-top): en el iPhone, al instalar la web
  // como app (PWA) con viewport-fit=cover, el contenido puede dibujarse
  // debajo de la barra de la hora/batería — ahí los botones se ven pero no
  // se pueden tocar porque esa franja la reserva el sistema. Este padding
  // empuja el header (y sus botones) para abajo de esa franja, sin perder
  // el fondo que llega hasta el borde.
  return (
    <header className="sticky top-0 z-40" style={{ background: "var(--ink)", borderBottom: "1px solid var(--line)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="max-w-6xl mx-auto px-4 md:px-6 flex items-center justify-between h-16">
        <button onClick={() => go("home")} className="flex items-center gap-2.5">
          {logoImage ? (
            <>
              <img src={logoImage} alt={logoText || "Logo"} className="h-9 w-9 object-contain" />
              {logoText && <span className="kulto-display text-lg tracking-wide" style={{ color: "var(--bone)" }}>{logoText}</span>}
            </>
          ) : (
            <span className="kulto-display text-xl tracking-wide" style={{ color: "var(--bone)" }}>{logoText || "KULTO"}</span>
          )}
        </button>
        <nav className="hidden md:flex items-center gap-8">
          <NavLink label="Inicio" active={page === "home"} onClick={() => go("home")} />
          <div ref={catalogMenuRef}>
            <button
              onClick={() => setCatalogMenuOpen((o) => !o)}
              className="kulto-btn kulto-nav text-sm font-semibold pb-1 flex items-center gap-1"
              style={{ color: "var(--bone)", borderBottom: page === "catalog" ? "2px solid var(--signal)" : "2px solid transparent" }}
            >
              Productos <ChevronDown size={14} />
            </button>
            {catalogMenuOpen && (() => {
              const activeItem = productsMenuItems.find((x) => x.id === megaItemId) || productsMenuItems[0] || null;
              const tiles = activeItem ? megaTiles(activeItem) : [];
              return (
                <div className="absolute left-0 right-0 top-full z-50" style={{ background: "var(--ink)", borderBottom: "1px solid var(--line)", boxShadow: "0 24px 40px rgba(0,0,0,0.25)" }}>
                  <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 grid gap-8" style={{ gridTemplateColumns: "260px minmax(0, 1fr)" }}>
                    <div className="flex flex-col gap-1">
                      {productsMenuItems.map((it) => {
                        const on = activeItem && activeItem.id === it.id;
                        return (
                          <button
                            key={it.id}
                            onMouseEnter={() => setMegaItemId(it.id)}
                            onFocus={() => setMegaItemId(it.id)}
                            onClick={() => goCatalog(it)}
                            className="kulto-btn flex items-center justify-between text-left text-sm rounded-xl px-4 py-2.5"
                            style={{ background: on ? "var(--ink-3)" : "transparent", color: on ? "var(--sun)" : "var(--bone)", fontWeight: on ? 600 : 400 }}
                          >
                            <span className="truncate">{it.label || it.value}</span>
                            <ChevronRight size={14} style={{ color: "var(--slate)" }} />
                          </button>
                        );
                      })}
                      <button onClick={() => goCatalog(null)} className="kulto-btn flex items-center justify-between text-left text-sm rounded-xl px-4 py-2.5 mt-1" style={{ color: "var(--bone)", borderTop: productsMenuItems.length ? "1px solid var(--line)" : "none" }}>
                        <span>Ver todo el catálogo</span>
                        <ChevronRight size={14} style={{ color: "var(--slate)" }} />
                      </button>
                    </div>
                    <div>
                      {activeItem && (
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>{activeItem.label || activeItem.value}</p>
                          <button onClick={() => goCatalog(activeItem)} className="kulto-btn text-xs font-semibold flex items-center gap-1" style={{ color: "var(--sun)" }}>
                            Ver todo <ArrowRight size={12} />
                          </button>
                        </div>
                      )}
                      {tiles.length > 0 ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          {tiles.map((t) => (
                            <button key={t.key} onClick={t.onClick} className="kulto-btn text-left flex flex-col gap-2">
                              <span className="block aspect-[4/3] rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: "var(--ink-3)", border: "1px solid var(--line)" }}>
                                {t.img ? <FastImg loading="lazy" src={t.img} alt={t.label} className="w-full h-full object-contain p-2" /> : <Shirt size={28} color="rgba(243,239,230,0.35)" />}
                              </span>
                              <span className="text-sm truncate" style={{ color: "var(--bone)" }}>{t.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm" style={{ color: "var(--slate)" }}>Elegí una opción de la izquierda para ver sus productos.</p>
                      )}
                    </div>
                  </div>
                  <div className="absolute left-0 right-0 top-full" style={{ height: "100vh", background: "rgba(0,0,0,0.35)", backdropFilter: "blur(3px)" }} onClick={() => setCatalogMenuOpen(false)} />
                </div>
              );
            })()}
          </div>
          <NavLink label="Personalizar" active={page === "wizard"} onClick={() => go("wizard")} />
          <NavLink label="Mi pedido" active={page === "seguimiento"} onClick={() => go("seguimiento")} />
          {customer && <NavLink label="Favoritos" active={page === "favoritos"} onClick={() => go("favoritos")} />}
          <NavLink label={customer ? "Mi cuenta" : "Ingresar"} active={page === "cuenta"} onClick={() => go("cuenta")} />
        </nav>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleThemeMode}
            className="kulto-btn w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ border: "1px solid var(--line)", color: "var(--bone)" }}
            aria-label={themeMode === "light" ? "Activar modo oscuro" : "Activar modo claro"}
            title={themeMode === "light" ? "Modo oscuro" : "Modo claro"}
          >
            {themeMode === "light" ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <div className="hidden sm:flex items-center gap-1 rounded-full px-1.5 py-1 shrink-0" style={{ border: "1px solid var(--line)" }}>
            <button
              onClick={onDecreaseFont}
              disabled={fontStep <= 0}
              className="kulto-btn w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ color: fontStep <= 0 ? "var(--slate)" : "var(--bone)" }}
              aria-label="Achicar el tamaño de letra"
              title="Achicar letra"
            >
              A-
            </button>
            <span className="text-xs px-1 select-none" style={{ color: "var(--slate)" }} aria-hidden="true">Aa</span>
            <button
              onClick={onIncreaseFont}
              disabled={fontStep >= 3}
              className="kulto-btn w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ color: fontStep >= 3 ? "var(--slate)" : "var(--bone)" }}
              aria-label="Agrandar el tamaño de letra"
              title="Agrandar letra"
            >
              A+
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <a
              href={socialLinks.instagram || INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className="kulto-btn p-2 rounded-full"
              style={{ color: "var(--bone)" }}
              title="Seguinos en Instagram"
            >
              <Instagram size={20} />
            </a>
            {socialLinks.facebook && (
              <a href={socialLinks.facebook} target="_blank" rel="noreferrer" className="kulto-btn p-2 rounded-full" style={{ color: "var(--bone)" }} title="Seguinos en Facebook">
                <Facebook size={20} />
              </a>
            )}
            {socialLinks.tiktok && (
              <a href={socialLinks.tiktok} target="_blank" rel="noreferrer" className="kulto-btn p-2 rounded-full" style={{ color: "var(--bone)" }} title="Seguinos en TikTok">
                <Music2 size={20} />
              </a>
            )}
          </div>
          {showAdminMenu && (
            <div className="relative" ref={adminMenuRef}>
              <button
                onClick={() => setAdminMenuOpen((o) => !o)}
                className="kulto-btn p-2 rounded-full"
                style={{ color: "var(--bone)" }}
                aria-label="Accesos rápidos de administrador"
                title="Accesos rápidos"
              >
                <LayoutGrid size={20} />
              </button>
              {adminMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-64 rounded-2xl overflow-hidden shadow-xl z-50"
                  style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}
                >
                  {ADMIN_QUICK_LINKS.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => { item.onClick(); setAdminMenuOpen(false); }}
                      className="kulto-btn w-full text-left px-4 py-3 text-sm"
                      style={{ color: "var(--bone)", borderBottom: "1px solid var(--line)" }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={onOpenCart} className="kulto-btn relative p-2 rounded-full" style={{ color: "var(--bone)" }}>
            <ShoppingBag size={21} />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style={{ background: "var(--signal)", color: "var(--bone)" }}>
                {cartCount}
              </span>
            )}
          </button>
          <button className="md:hidden kulto-btn p-2 rounded-full" onClick={() => setOpen((o) => !o)} style={{ color: "var(--bone)" }} aria-label={open ? "Cerrar menú" : "Abrir menú"}>
            {open ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden px-4 pb-4 flex flex-col gap-3" style={{ borderTop: "1px solid var(--line)" }}>
          <div className="sm:hidden flex items-center justify-center gap-1 rounded-full px-1.5 py-1 mt-3 self-center" style={{ border: "1px solid var(--line)" }}>
            <button
              onClick={onDecreaseFont}
              disabled={fontStep <= 0}
              className="kulto-btn w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ color: fontStep <= 0 ? "var(--slate)" : "var(--bone)" }}
              aria-label="Achicar el tamaño de letra"
              title="Achicar letra"
            >
              A-
            </button>
            <span className="text-xs px-1 select-none" style={{ color: "var(--slate)" }} aria-hidden="true">Aa</span>
            <button
              onClick={onIncreaseFont}
              disabled={fontStep >= 3}
              className="kulto-btn w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ color: fontStep >= 3 ? "var(--slate)" : "var(--bone)" }}
              aria-label="Agrandar el tamaño de letra"
              title="Agrandar letra"
            >
              A+
            </button>
          </div>
          <NavLink label="Inicio" active={page === "home"} onClick={() => go("home")} />
          <div>
            <button
              onClick={() => setCatalogMenuOpenMobile((o) => !o)}
              className="kulto-btn text-sm font-semibold pb-1 flex items-center gap-1 w-full"
              style={{ color: "var(--bone)", borderBottom: page === "catalog" ? "2px solid var(--signal)" : "2px solid transparent" }}
            >
              Productos <ChevronDown size={14} style={{ transform: catalogMenuOpenMobile ? "rotate(180deg)" : "none" }} />
            </button>
            {catalogMenuOpenMobile && (
              <div className="flex flex-col mt-2 ml-2 pl-3" style={{ borderLeft: "1px solid var(--line)" }}>
                <button onClick={() => goCatalog(null)} className="kulto-btn text-left py-2 text-sm" style={{ color: "var(--slate)" }}>
                  Catálogo
                </button>
                {productsMenuItems.map((it) => {
                  const subcats = subcatsForItem(it);
                  const expanded = expandedMenuItemIdMobile === it.id;
                  return (
                    <React.Fragment key={it.id}>
                      <div style={{ height: 1, background: "var(--line)" }} />
                      <div className="flex items-center">
                        <button onClick={() => goCatalog(it)} className="kulto-btn flex-1 text-left py-2 text-sm" style={{ color: "var(--slate)" }}>
                          {it.label || it.value}
                        </button>
                        {subcats.length > 0 && (
                          <button
                            onClick={() => setExpandedMenuItemIdMobile(expanded ? null : it.id)}
                            className="kulto-btn px-2 py-2"
                            style={{ color: "var(--slate)" }}
                            aria-label={`Ver subcategorías de ${it.label || it.value}`}
                          >
                            <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none" }} />
                          </button>
                        )}
                      </div>
                      {expanded && subcats.length > 0 && (
                        <div className="flex flex-col pl-3">
                          {subcats.map((sc) => (
                            <button
                              key={sc}
                              onClick={() => goCatalogSubcategory(it.value, sc)}
                              className="kulto-btn text-left py-1.5 text-sm"
                              style={{ color: "var(--slate)" }}
                            >
                              {sc}
                            </button>
                          ))}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
          <NavLink label="Personalizar" active={page === "wizard"} onClick={() => go("wizard")} />
          <NavLink label="Mi pedido" active={page === "seguimiento"} onClick={() => go("seguimiento")} />
          {customer && <NavLink label="Favoritos" active={page === "favoritos"} onClick={() => go("favoritos")} />}
          <NavLink label={customer ? "Mi cuenta" : "Ingresar"} active={page === "cuenta"} onClick={() => go("cuenta")} />
        </div>
      )}
    </header>
  );
}

function MarqueeStrip() {
  const words = ["Sublimado a color completo", "Diseños originales", "Personaliza tu prenda", "Pide por WhatsApp"];
  const track = [...words, ...words];
  return (
    <div className="overflow-hidden" style={{ background: "var(--signal)", borderBottom: "1px solid var(--line)" }}>
      <div className="kulto-marquee-track py-2">
        {track.map((w, i) => (
          <span key={i} className="kulto-display text-xs whitespace-nowrap px-6" style={{ color: "var(--bone)" }}>
            {w} <span style={{ color: "var(--ink)" }}>·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Botón para instalar la web como app (PWA). En Android/Chrome el navegador
// dispara el evento "beforeinstallprompt" y acá lo guardamos para poder
// mostrar nuestro propio botón "Instalar" (en vez de esperar a que el
// cliente encuentre la opción sola en el menú del navegador). En iPhone/iPad
// (Safari) ese evento no existe — ahí la instalación es manual, así que
// mostramos instrucciones paso a paso en vez de un botón que no haría nada.
function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
    setInstalled(isStandalone);
    const ua = window.navigator.userAgent || "";
    setIsIos(/iphone|ipad|ipod/i.test(ua) && !window.MSStream);
    const handlePrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    const handleInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed || dismissed) return null;
  // Si el navegador no mandó el evento (no es Android/Chrome con soporte) y
  // tampoco es iOS, no hay nada útil que ofrecer — no molestamos a nadie.
  if (!deferredPrompt && !isIos) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      setDeferredPrompt(null);
      setDismissed(true);
    } else if (isIos) {
      setShowIosHelp(true);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm" style={{ background: "var(--sun)", color: "var(--ink)" }}>
        <span className="flex items-center gap-2 font-semibold">
          <Download size={16} /> Instalá Kulto como app en tu celular
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleInstallClick} className="kulto-btn text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "var(--ink)", color: "var(--bone)" }}>
            {deferredPrompt ? "Instalar" : "Cómo instalar"}
          </button>
          <button onClick={() => setDismissed(true)} className="kulto-btn p-1" style={{ color: "var(--ink)" }} aria-label="Cerrar aviso">
            <X size={16} />
          </button>
        </div>
      </div>
      {showIosHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)" }} onClick={() => setShowIosHelp(false)}>
          <div onClick={(e) => e.stopPropagation()} className="rounded-2xl p-6 max-w-sm w-full" style={{ background: "var(--ink)", border: "1px solid var(--line)" }}>
            <h4 className="font-semibold mb-3" style={{ color: "var(--bone)" }}>Instalar en iPhone/iPad — 2 toques</h4>
            <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>
              En iPhone, Apple no deja que las webs se instalen solas con un botón — hay que hacerlo así (una sola vez):
            </p>
            <ol className="text-sm list-decimal pl-5 flex flex-col gap-2" style={{ color: "var(--slate)" }}>
              <li>Tocá el botón <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba, abajo en Safari).</li>
              <li>Elegí <strong>"Agregar a pantalla de inicio"</strong>.</li>
              <li>Tocá <strong>"Agregar"</strong> arriba a la derecha.</li>
            </ol>
            <button onClick={() => { setShowIosHelp(false); setDismissed(true); }} className="kulto-btn w-full rounded-full py-2.5 mt-5 font-semibold" style={{ background: "var(--ink-2)", color: "var(--bone)", border: "1px solid var(--line)" }}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function AbandonedCartBanner({ hours, count, onView, onDismiss }) {
  return (
    <div className="px-4 md:px-6 py-3" style={{ background: "var(--sun)" }}>
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          Tienes {count} producto{count === 1 ? "" : "s"} guardado{count === 1 ? "" : "s"} en tu carrito desde hace {hours >= 24 ? `${Math.floor(hours / 24)} día(s)` : `${hours} h`}. ¿Seguimos con la compra?
        </p>
        <div className="flex items-center gap-2">
          <button onClick={onView} className="kulto-btn text-sm font-semibold px-4 py-1.5 rounded-full" style={{ background: "var(--ink)", color: "var(--bone)" }}>Ver carrito</button>
          <button onClick={onDismiss} className="kulto-btn p-1.5 rounded-full" style={{ color: "var(--ink)" }} aria-label="Cerrar aviso"><X size={16} /></button>
        </div>
      </div>
    </div>
  );
}

// Motivos típicos de una tienda de ropa — el admin no los edita, son fijos.
const CONTACT_SUBJECTS = ["Consulta general", "Estado de mi pedido", "Cambios y devoluciones", "Talles y medidas", "Otro"];

// El formulario de contacto en sí — se abre desde un ícono/botón "Contacto"
// en vez de mostrar el mail o el teléfono del dueño a la vista de cualquiera.
// Siempre manda el mail a ADMIN_EMAIL, que sendEmail() redirige de verdad a
// ADMIN_NOTIFICATION_EMAIL (ver arriba del archivo).
function ContactFormModal({ open, onClose, settings }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(CONTACT_SUBJECTS[0]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState("");

  if (!open) return null;

  const reset = () => { setName(""); setEmail(""); setSubject(CONTACT_SUBJECTS[0]); setMessage(""); setStatus("idle"); setError(""); };
  const close = () => { onClose(); setTimeout(reset, 300); };

  const submit = async () => {
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Completá tu nombre, tu email y el mensaje.");
      return;
    }
    setStatus("sending");
    setError("");
    // Se guarda como ticket para que el admin lo vea y lo gestione desde el
    // panel (Contacto), y por las dudas también se manda el mail de aviso —
    // si el mail falla pero el guardado funcionó, igual queda registrado.
    const ticket = {
      id: genId("ctc"),
      name: name.trim(),
      email: email.trim(),
      subject,
      message: message.trim(),
      createdAt: Date.now(),
      status: "pendiente",
      changeDecision: "",
      discountPercent: null,
      discountCode: null,
      adminReply: "",
      repliedAt: null,
    };
    let saved = false;
    try {
      await persistContactMessage(ticket);
      saved = true;
    } catch { /* seguimos igual e intentamos el mail */ }
    const emailResult = await sendEmail({
      to: ADMIN_EMAIL,
      subject: `Contacto: ${subject}`,
      html: buildContactEmailHtml({ name: ticket.name, email: ticket.email, subject, message: ticket.message }, settings),
    });
    if (saved || emailResult.ok) {
      setStatus("sent");
    } else {
      setStatus("idle");
      setError(emailResult.error || "No se pudo enviar el mensaje. Probá de nuevo o escribinos por WhatsApp.");
    }
  };

  const inputStyle = { background: "var(--ink-3)", color: "var(--bone)", border: "1px solid var(--line)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)" }} onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl p-6 max-w-sm w-full" style={{ background: "var(--ink)", border: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold" style={{ color: "var(--bone)" }}>Contacto</h4>
          <button onClick={close} className="kulto-btn" style={{ color: "var(--slate)" }}><X size={18} /></button>
        </div>
        {status === "sent" ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Check size={32} style={{ color: "var(--sun)" }} />
            <p className="text-sm" style={{ color: "var(--bone)" }}>¡Listo! Recibimos tu mensaje, te respondemos a la brevedad.</p>
            <button onClick={close} className="kulto-btn text-sm mt-2 underline" style={{ color: "var(--slate)" }}>Cerrar</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl p-2.5 text-sm" style={inputStyle} />
            <input type="email" placeholder="Tu email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl p-2.5 text-sm" style={inputStyle} />
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded-xl p-2.5 text-sm" style={inputStyle}>
              {CONTACT_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <textarea
              placeholder="Contanos en qué te podemos ayudar"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="rounded-xl p-2.5 text-sm resize-none"
              style={inputStyle}
            />
            {error && <p className="text-xs" style={{ color: "var(--signal)" }}>{error}</p>}
            <button
              onClick={submit}
              disabled={status === "sending"}
              className="kulto-btn rounded-full py-3 font-semibold flex items-center justify-center gap-2"
              style={{ background: "var(--signal)", color: "var(--bone)", opacity: status === "sending" ? 0.7 : 1 }}
            >
              {status === "sending" ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : "Enviar mensaje"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactSection({ settings }) {
  const hasWhatsapp = !!settings?.whatsappNumber;
  const sendHello = () => openWhatsApp("Hola Kulto, tengo una duda sobre un producto.", settings?.whatsappNumber);
  const [contactOpen, setContactOpen] = useState(false);
  return (
    <section id="contacto" className="max-w-6xl mx-auto px-4 md:px-6 py-16">
      <div className="rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
        <div>
          <h3 className="kulto-display text-2xl" style={{ color: "var(--bone)" }}>¿Tienes dudas?</h3>
          <p className="mt-2 max-w-sm" style={{ color: "var(--slate)" }}>{hasWhatsapp ? "Escríbenos directo a WhatsApp y te respondemos lo antes posible." : "Escríbenos y te respondemos lo antes posible."}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button onClick={() => setContactOpen(true)} className="kulto-btn text-sm flex items-center gap-2 w-fit" style={{ color: "var(--slate)" }}>
              <Mail size={15} /> Contacto
            </button>
            {settings?.contactAddress && (
              <span className="text-sm flex items-center gap-2" style={{ color: "var(--slate)" }}>
                <MapPin size={15} /> {settings.contactAddress}
              </span>
            )}
          </div>
        </div>
        {hasWhatsapp && (
          <button onClick={sendHello} className="kulto-btn rounded-full px-6 py-3 font-semibold flex items-center gap-2 shrink-0" style={{ background: "var(--sun)", color: "var(--ink)" }}>
            <MessageCircle size={18} /> Escribir por WhatsApp
          </button>
        )}
      </div>
      <ContactFormModal open={contactOpen} onClose={() => setContactOpen(false)} settings={settings} />
    </section>
  );
}

function FaqSection({ settings }) {
  const items = settings?.faqItems || [];
  const [openId, setOpenId] = useState(null);
  if (!settings?.faqEnabled || !items.length) return null;
  return (
    <section id="faq" className="max-w-3xl mx-auto px-4 md:px-6 py-16">
      <SectionTitle eyebrow="¿Tenés dudas?" title="Preguntas frecuentes" />
      <div className="flex flex-col gap-2">
        {items.map((f) => (
          <div key={f.id} className="rounded-2xl overflow-hidden" style={{ background: "var(--ink-2)", border: "1px solid var(--line)" }}>
            <button
              onClick={() => setOpenId(openId === f.id ? null : f.id)}
              className="kulto-btn w-full flex items-center justify-between gap-3 text-left px-5 py-4"
              style={{ color: "var(--bone)" }}
            >
              <span className="text-sm font-semibold flex items-center gap-2"><HelpCircle size={16} style={{ color: "var(--signal)" }} /> {f.question}</span>
              <ChevronDown size={18} style={{ transform: openId === f.id ? "rotate(180deg)" : "none", transition: "transform .2s ease", flexShrink: 0 }} />
            </button>
            {openId === f.id && (
              <p className="text-sm px-5 pb-4" style={{ color: "var(--slate)" }}>{f.answer}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// El pie de página se arma en "items" (políticas, contacto, redes) en una
// sola fila que se acomoda sola — el texto largo de políticas ya no ocupa
// espacio fijo: queda como un link chico que abre una ventanita flotante
// con ese mismo texto, así el footer se mantiene bajo de altura.
function Footer({ settings }) {
  const [policyOpen, setPolicyOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const hasQuality = settings?.qualityPolicyEnabled && settings?.qualityPolicyText;
  const hasReturns = settings?.returnsPolicyEnabled && settings?.returnsPolicyText;
  const hasPolicies = hasQuality || hasReturns;

  const items = [];
  if (hasPolicies) {
    items.push(
      <button
        type="button"
        onClick={() => setPolicyOpen(true)}
        className="kulto-btn text-xs font-semibold underline"
        style={{ color: "var(--slate)" }}
      >
        Calidad y devoluciones
      </button>
    );
  }
  // El mail y el teléfono ya no se muestran directo acá — se piden por este
  // formulario, que manda a ADMIN_EMAIL (redirigido de verdad a la casilla
  // real del dueño, ver ADMIN_NOTIFICATION_EMAIL).
  items.push(
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--slate)" }}>
      <button type="button" onClick={() => setContactOpen(true)} className="kulto-btn flex items-center gap-1.5" style={{ color: "var(--slate)" }}>
        <Mail size={13} /> Contacto
      </button>
      {settings.contactAddress && <span className="flex items-center gap-1.5"><MapPin size={13} /> {settings.contactAddress}</span>}
    </div>
  );
  // El ícono de WhatsApp solo se muestra si el admin cargó un número en
  // Ajustes → Marca — las redes son igual de opcionales, según lo que cargue.
  items.push(
    <div className="flex items-center gap-4">
      {settings.socialInstagram && (
        <a href={settings.socialInstagram} target="_blank" rel="noreferrer" className="kulto-btn" style={{ color: "var(--slate)" }} title="Instagram"><Instagram size={18} /></a>
      )}
      {settings.whatsappNumber && (
        <a href={`https://wa.me/${settings.whatsappNumber}`} target="_blank" rel="noreferrer" className="kulto-btn" style={{ color: "var(--slate)" }} title="WhatsApp"><MessageCircle size={18} /></a>
      )}
      {settings.socialFacebook && (
        <a href={settings.socialFacebook} target="_blank" rel="noreferrer" className="kulto-btn" style={{ color: "var(--slate)" }} title="Facebook"><Facebook size={18} /></a>
      )}
      {settings.socialTiktok && (
        <a href={settings.socialTiktok} target="_blank" rel="noreferrer" className="kulto-btn" style={{ color: "var(--slate)" }} title="TikTok"><Music2 size={18} /></a>
      )}
    </div>
  );

  return (
    <footer className="px-4 md:px-6 py-6" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
        {items.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="w-px h-5" style={{ background: "var(--line)" }} />}
            {item}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-4 text-center">
        <span className="kulto-display text-sm" style={{ color: "var(--slate)" }}>KULTO</span>
      </div>
      {policyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)" }} onClick={() => setPolicyOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="rounded-2xl p-6 max-w-sm w-full" style={{ background: "var(--ink)", border: "1px solid var(--line)" }}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm" style={{ color: "var(--bone)" }}>Calidad y devoluciones</h4>
              <button onClick={() => setPolicyOpen(false)} className="kulto-btn" style={{ color: "var(--slate)" }}><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-3">
              {hasQuality && <p className="text-xs leading-relaxed" style={{ color: "var(--slate)" }}>{settings.qualityPolicyText}</p>}
              {hasReturns && <p className="text-xs leading-relaxed" style={{ color: "var(--slate)" }}>{settings.returnsPolicyText}</p>}
            </div>
          </div>
        </div>
      )}
      <ContactFormModal open={contactOpen} onClose={() => setContactOpen(false)} settings={settings} />
    </footer>
  );
}

function RewardsWidget({ settings, customer, onLogin, onRedeem, liftForMobileBar, whatsappVisible }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("home");
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState("");
  if (settings?.rewardsEnabled === false || settings?.loyaltyEnabled === false) return null;
  const accent = settings?.rewardsColor || "#E63946";
  const label = settings?.rewardsButtonLabel || "Recompensas";
  const rewards = getActiveRewards(settings);
  const points = customer?.points || 0;
  const next = rewards.find((r) => Number(r.pointsCost) > points);
  const perItem = settings?.loyaltyPointsPerItem ?? 1;
  const myCodes = (customer?.rewardCodes || []).filter((r) => !r.usedAt);
  const bottomClass = liftForMobileBar
    ? (whatsappVisible ? "bottom-44 md:bottom-24" : "bottom-24 md:bottom-5")
    : (whatsappVisible ? "bottom-24" : "bottom-5");
  const copy = async (code) => {
    try { await navigator.clipboard.writeText(code); } catch { /* sin portapapeles */ }
    setCopied(code);
    setTimeout(() => setCopied(""), 1800);
  };
  const close = () => { setOpen(false); setView("home"); setMsg(null); };
  const redeem = async (r) => {
    setBusyId(r.id);
    setMsg(null);
    const res = await onRedeem(r.id);
    setBusyId(null);
    setMsg(res.ok ? { ok: true, code: res.code, name: r.name } : { ok: false, text: res.error });
  };
  const rowStyle = { background: "var(--ink-3)", border: "1px solid var(--line)" };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`kulto-btn fixed right-5 z-30 rounded-full px-4 h-12 flex items-center gap-2 font-semibold text-sm ${bottomClass}`}
        style={{ background: accent, color: "#fff", boxShadow: "0 8px 20px rgba(0,0,0,0.4)" }}
      >
        <Gift size={18} /> {label}
      </button>
    );
  }

  return (
    <div
      className="fixed z-40 right-3 bottom-3 left-3 sm:left-auto sm:right-5 sm:bottom-5 sm:w-[360px] rounded-2xl overflow-hidden flex flex-col"
      style={{ background: "var(--ink-2)", border: "1px solid var(--line)", boxShadow: "0 20px 50px rgba(0,0,0,0.55)", maxHeight: "calc(100vh - 24px)" }}
    >
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: accent, color: "#fff" }}>
        <div className="flex items-center gap-2">
          {view !== "home" && (
            <button onClick={() => { setView("home"); setMsg(null); }} className="kulto-btn" aria-label="Volver"><ArrowLeft size={18} /></button>
          )}
          <span className="font-bold">
            {view === "home" ? label : view === "earn" ? "Formas de ganar" : "Formas de canjear"}
          </span>
        </div>
        <button onClick={close} className="kulto-btn" aria-label="Cerrar"><X size={20} /></button>
      </div>

      <div className="p-5 flex flex-col gap-3 overflow-y-auto kulto-scrollbar">
        {view === "home" && (
          <>
            {!customer ? (
              <div className="rounded-xl p-4 flex flex-col gap-2" style={rowStyle}>
                <p className="font-semibold" style={{ color: "var(--bone)" }}>Sumá puntos con cada compra</p>
                <p className="text-sm" style={{ color: "var(--slate)" }}>
                  Iniciá sesión para ver tus puntos y canjearlos por descuentos y premios.
                </p>
                <button onClick={() => { close(); onLogin(); }} className="kulto-btn rounded-full py-2.5 font-semibold text-sm" style={{ background: accent, color: "#fff" }}>
                  Iniciar sesión
                </button>
              </div>
            ) : (
              <div className="rounded-xl p-4" style={rowStyle}>
                <p className="text-xs" style={{ color: "var(--slate)" }}>Tus puntos</p>
                <p className="text-3xl font-extrabold" style={{ color: accent }}>{points}</p>
                {next ? (
                  <>
                    <div className="w-full h-2 rounded-full overflow-hidden mt-2" style={{ background: "var(--ink-2)" }}>
                      <div className="h-full" style={{ width: `${Math.min(100, (points / Number(next.pointsCost)) * 100)}%`, background: next.color || accent }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>
                      Te faltan {Number(next.pointsCost) - points} punto(s) para «{next.name}».
                    </p>
                  </>
                ) : rewards.length > 0 ? (
                  <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>¡Ya podés canjear cualquier premio!</p>
                ) : null}
              </div>
            )}

            {customer && myCodes.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold" style={{ color: "var(--slate)" }}>TUS CÓDIGOS PARA USAR EN EL CARRITO</p>
                {myCodes.map((c) => (
                  <div key={c.code} className="rounded-xl p-3 flex items-center justify-between gap-2" style={{ ...rowStyle, borderLeft: `4px solid ${c.color || accent}` }}>
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: "var(--bone)" }}>{c.code}</p>
                      <p className="text-xs" style={{ color: "var(--slate)" }}>{c.name} · {describeBenefit(c)}</p>
                    </div>
                    <button onClick={() => copy(c.code)} className="kulto-btn text-xs font-semibold flex items-center gap-1" style={{ color: c.color || accent }}>
                      {copied === c.code ? <Check size={14} /> : <Copy size={14} />} {copied === c.code ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setView("earn")} className="kulto-btn rounded-xl p-4 flex items-center justify-between text-left" style={rowStyle}>
              <span>
                <span className="block font-semibold" style={{ color: "var(--bone)" }}>Formas de ganar</span>
                <span className="block text-xs" style={{ color: "var(--slate)" }}>Cómo sumar puntos</span>
              </span>
              <ChevronRight size={18} color="var(--slate)" />
            </button>
            <button onClick={() => setView("redeem")} className="kulto-btn rounded-xl p-4 flex items-center justify-between text-left" style={rowStyle}>
              <span>
                <span className="block font-semibold" style={{ color: "var(--bone)" }}>Formas de canjear</span>
                <span className="block text-xs" style={{ color: "var(--slate)" }}>Qué podés pedir con tus puntos</span>
              </span>
              <ChevronRight size={18} color="var(--slate)" />
            </button>
          </>
        )}

        {view === "earn" && (
          <>
            <div className="rounded-xl p-4" style={rowStyle}>
              <p className="font-semibold" style={{ color: "var(--bone)" }}>Comprando en la web</p>
              <p className="text-sm mt-1" style={{ color: "var(--slate)" }}>
                Sumás {perItem} punto(s) por cada prenda. Según el modelo que compres, algunas prendas dan más puntos y otras menos. Solo cuentan las compras hechas desde la web con tu cuenta iniciada.
              </p>
            </div>
            {settings?.signupDiscountEnabled && (
              <div className="rounded-xl p-4" style={rowStyle}>
                <p className="font-semibold" style={{ color: "var(--bone)" }}>Registrándote</p>
                <p className="text-sm mt-1" style={{ color: "var(--slate)" }}>
                  Al crear tu cuenta tenés {settings.signupDiscountPercent}% de descuento en tu primera compra.
                </p>
              </div>
            )}
            {settings?.rewardsEarnText && (
              <p className="text-sm" style={{ color: "var(--slate)", whiteSpace: "pre-line" }}>{settings.rewardsEarnText}</p>
            )}
          </>
        )}

        {view === "redeem" && (
          <>
            <p className="text-sm" style={{ color: "var(--slate)", whiteSpace: "pre-line" }}>
              {settings?.rewardsRedeemText || "Cuando llegás a la cantidad de puntos de un premio, se libera un código. Pegalo en el carrito de compras para usarlo."}
            </p>
            {msg && msg.ok && (
              <div className="rounded-xl p-3" style={{ background: "var(--ink-3)", border: `1px solid ${accent}` }}>
                <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>¡Listo! Canjeaste «{msg.name}»</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-bold" style={{ color: accent }}>{msg.code}</span>
                  <button onClick={() => copy(msg.code)} className="kulto-btn text-xs font-semibold flex items-center gap-1" style={{ color: accent }}>
                    {copied === msg.code ? <Check size={14} /> : <Copy size={14} />} {copied === msg.code ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--slate)" }}>Pegalo en el carrito, en «Código promocional».</p>
              </div>
            )}
            {msg && !msg.ok && <p className="text-xs" style={{ color: "var(--signal)" }}>{msg.text}</p>}
            {rewards.length === 0 && <p className="text-sm" style={{ color: "var(--slate)" }}>Por ahora no hay premios para canjear.</p>}
            {rewards.map((r) => {
              const enough = customer && points >= Number(r.pointsCost);
              return (
                <div key={r.id} className="rounded-xl p-4 flex items-center justify-between gap-3" style={{ ...rowStyle, borderLeft: `4px solid ${r.color || accent}` }}>
                  <div className="min-w-0">
                    <p className="font-semibold" style={{ color: "var(--bone)" }}>{r.name}</p>
                    <p className="text-xs" style={{ color: "var(--slate)" }}>{describeBenefit(r)} · {r.pointsCost} puntos</p>
                  </div>
                  <button
                    disabled={busyId === r.id || (!!customer && !enough)}
                    onClick={() => (customer ? redeem(r) : (close(), onLogin()))}
                    className="kulto-btn rounded-full px-4 py-2 text-xs font-semibold shrink-0"
                    style={{ background: !customer || enough ? (r.color || accent) : "var(--ink-2)", color: !customer || enough ? "#fff" : "var(--slate)", cursor: customer && !enough ? "not-allowed" : "pointer" }}
                  >
                    {busyId === r.id ? <Loader2 size={14} className="animate-spin" /> : !customer ? "Iniciar sesión" : enough ? "Canjear" : "Faltan puntos"}
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function WhatsAppFloat({ liftForMobileBar, whatsappNumber, enabled }) {
  // No se muestra si está apagado o si todavía no hay número cargado
  // (Ajustes → Marca) — las dos cosas se controlan por separado.
  if (!enabled || !whatsappNumber) return null;
  return (
    <button
      onClick={() => openWhatsApp("Hola Kulto, tengo una duda sobre un producto.", whatsappNumber)}
      className={`kulto-btn fixed right-5 z-30 w-14 h-14 rounded-full flex items-center justify-center ${liftForMobileBar ? "bottom-24 md:bottom-5" : "bottom-5"}`}
      style={{ background: "var(--sun)", color: "var(--ink)", boxShadow: "0 8px 20px rgba(0,0,0,0.4)" }}
      title="Escríbenos por WhatsApp"
    >
      <MessageCircle size={26} />
    </button>
  );
}

function MobileCartBar({ count, total, onOpen }) {
  return (
    // paddingBottom extra con env(safe-area-inset-bottom): en iPhones sin
    // botón físico de inicio, evita que la franja del "home indicator" tape
    // parte del botón.
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pt-3" style={{ background: "var(--ink-2)", borderTop: "1px solid var(--line)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
      <button onClick={onOpen} className="kulto-btn w-full rounded-full py-3 px-4 font-semibold flex items-center justify-between" style={{ background: "var(--signal)", color: "var(--bone)" }}>
        <span className="flex items-center gap-2"><ShoppingBag size={18} /> {count} artículo{count === 1 ? "" : "s"}</span>
        <span>{formatPrice(total)} · Ver carrito</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                 */
/* ------------------------------------------------------------------ */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [orders, setOrders] = useState([]);
  const [draftProducts, setDraftProducts] = useState([]);
  const [draftCategories, setDraftCategories] = useState(DEFAULT_CATEGORIES);
  const [draftGroups, setDraftGroups] = useState(DEFAULT_GROUPS);
  const [hasDraftChanges, setHasDraftChanges] = useState(false);
  const [photoInbox, setPhotoInbox] = useState([]);
  const [savedColors, setSavedColors] = useState([]);
  const [designLibrary, setDesignLibrary] = useState([]);
  const [designFolders, setDesignFolders] = useState([]);
  const [customWorkGallery, setCustomWorkGallery] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Accesibilidad: modo claro/oscuro y tamaño de letra — elección de cada
  // visitante, guardada en su propio navegador (no es configuración de la
  // tienda). "fontStep" va de 0 (normal) a 3 (el más grande).
  const FONT_SCALES = [1, 1.15, 1.3, 1.45];
  const [themeMode, setThemeMode] = useState(() => {
    try { return localStorage.getItem("kulto:themeMode") || "dark"; } catch { return "dark"; }
  });
  const [fontStep, setFontStep] = useState(() => {
    try { return Number(localStorage.getItem("kulto:fontStep")) || 0; } catch { return 0; }
  });
  useEffect(() => {
    try { localStorage.setItem("kulto:themeMode", themeMode); } catch { /* localStorage puede estar bloqueado */ }
  }, [themeMode]);
  useEffect(() => {
    try { localStorage.setItem("kulto:fontStep", String(fontStep)); } catch { /* localStorage puede estar bloqueado */ }
    try { document.documentElement.style.fontSize = `${FONT_SCALES[fontStep] * 100}%`; } catch { /* nunca romper la página por esto */ }
  }, [fontStep]);
  const toggleThemeMode = () => setThemeMode((m) => (m === "light" ? "dark" : "light"));
  const decreaseFont = () => setFontStep((s) => Math.max(0, s - 1));
  const increaseFont = () => setFontStep((s) => Math.min(FONT_SCALES.length - 1, s + 1));

  const [page, setPage] = useState("home");
  // Al cambiar de página (por ejemplo, al tocar el botón de un banner) el
  // navegador no reinicia el scroll solo — si la página anterior estaba
  // scrolleada, la nueva podía arrancar mostrando el medio o el final en vez
  // de arriba de todo. Forzamos volver arriba en cada cambio de página.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  // Link del mail "Pedir reseña" (?review=KULTO-...): lleva directo a "Mi
  // pedido" con el número ya cargado, sin que el cliente tenga que escribirlo.
  const [reviewDeepLinkOrderId, setReviewDeepLinkOrderId] = useState("");
  // Link del mail "Recuperar contraseña" (?resetEmail=&resetCode=): lleva
  // directo a "Mi cuenta" con el formulario de contraseña nueva ya armado.
  const [resetDeepLinkEmail, setResetDeepLinkEmail] = useState("");
  const [registerIntent, setRegisterIntent] = useState(null);
  const openSignup = (email, mode = "register") => {
    setRegisterIntent({ email, mode, t: Date.now() });
    setPage("cuenta");
    try { window.scrollTo({ top: 0 }); } catch { /* nada */ }
  };
  const [resetDeepLinkCode, setResetDeepLinkCode] = useState("");
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const review = params.get("review");
      if (review) {
        setReviewDeepLinkOrderId(review);
        setPage("seguimiento");
      }
      const resetEmail = params.get("resetEmail");
      const resetCode = params.get("resetCode");
      if (resetEmail && resetCode) {
        setResetDeepLinkEmail(resetEmail);
        setResetDeepLinkCode(resetCode);
        setPage("cuenta");
      }
    } catch { /* nunca romper la carga de la web por esto */ }
  }, []);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [catalogInitialGroup, setCatalogInitialGroup] = useState("");
  const [catalogInitialCategory, setCatalogInitialCategory] = useState("");
  const [catalogInitialSubcategory, setCatalogInitialSubcategory] = useState("");
  const [catalogInitialCollection, setCatalogInitialCollection] = useState("");
  // Compartida entre el header (menú "Productos", ahora puede filtrar por
  // categoría/subcategoría además de por grupo), el inicio y los banners —
  // lleva al catálogo ya filtrado, o sin filtro si no se pasa nada. Acepta
  // tanto un string suelto (un grupo, como usan los banners de siempre) como
  // un objeto { group, category, subcategory } (como usa el menú "Productos"
  // del header, incluido su submenú de subcategorías).
  const goToCatalog = (filter) => {
    const f = typeof filter === "string" ? { group: filter } : (filter || {});
    setCatalogInitialGroup(f.group || "");
    setCatalogInitialCategory(f.category || "");
    setCatalogInitialSubcategory(f.subcategory || "");
    setCatalogInitialCollection(f.collection || "");
    setCatalogSearchQuery("");
    setPage("catalog");
  };
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [comment, setComment] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("recogida");
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [sending, setSending] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState(null);
  const [confirmedHasCustom, setConfirmedHasCustom] = useState(false);
  const [confirmedIsLocal, setConfirmedIsLocal] = useState(false);
  const [confirmedWhatsappText, setConfirmedWhatsappText] = useState(null);
  const [cartSavedAt, setCartSavedAt] = useState(null);
  const [showAbandonedBanner, setShowAbandonedBanner] = useState(false);

  const [customer, setCustomer] = useState(null); // cuenta de cliente logueada (distinta del formulario de checkout)
  const [customersList, setCustomersList] = useState([]); // para el panel admin — todas las cuentas registradas
  // Si el mail de la cuenta logueada es el de ADMIN_EMAIL, "Mi cuenta" muestra
  // el panel de administrador en vez de la cuenta de cliente normal.
  const isAdminAccount = !!customer && normalizeEmail(customer.email) === normalizeEmail(ADMIN_EMAIL);
  // Cuenta de cliente a la que el dueño le dio acceso limitado al panel (ver
  // AdminCustomers → "Permisos"). Nunca puede ser el propio ADMIN_EMAIL — ese
  // ya entra como dueño con todo el acceso más arriba.
  const isSubAdminAccount = !!customer && !isAdminAccount && Array.isArray(customer.adminPermissions) && customer.adminPermissions.length > 0;
  const hasAdminAccess = isAdminAccount || isSubAdminAccount;
  const adminPermissionsForAccount = isAdminAccount ? ADMIN_TAB_KEYS : (customer?.adminPermissions || []);
  // Para no correr la migración de fotos viejas más de una vez por sesión
  // (por ejemplo, cada vez que el admin entra y sale de "Mi cuenta").
  const legacyImagesMigratedRef = useRef(false);
  // Igual, pero para agregar la paleta de colores de Roly 2026 a la librería
  // de colores guardados una sola vez por sesión.
  const rolyColorsSeededRef = useRef(false);

  // Vista "como cliente" para el admin: navega todo el sitio (inicio,
  // catálogo, personalizar, mi pedido, favoritos, mi cuenta) tal como lo vería
  // un cliente real, sin cerrar la sesión de administrador. El botón
  // "Volver al panel" (más abajo) apaga esta vista.
  const [previewAsCustomer, setPreviewAsCustomer] = useState(false);
  useEffect(() => {
    if (!hasAdminAccess) setPreviewAsCustomer(false);
  }, [hasAdminAccess]);
  const effectiveAdminView = hasAdminAccess && !previewAsCustomer;

  // El menú de accesos rápidos (9 puntos) del header pide saltar a una
  // pestaña puntual del panel de administrador (Ventas, Compras, etc.).
  const [adminTabRequest, setAdminTabRequest] = useState(null);
  const jumpToAdminTab = (tabKey) => {
    setPreviewAsCustomer(false);
    setPage("cuenta");
    setAdminTabRequest({ tab: tabKey, at: Date.now() });
  };

  // Cierre de sesión automático del administrador tras 15 minutos sin
  // actividad (clicks, teclado, scroll, toques) — el panel queda accesible
  // desde cualquier navegador que haya iniciado sesión, así que conviene
  // cerrarla sola si quedó olvidada abierta.
  const adminLastActivityRef = useRef(Date.now());
  useEffect(() => {
    if (!hasAdminAccess) return;
    const markActivity = () => { adminLastActivityRef.current = Date.now(); };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, markActivity, { passive: true }));
    markActivity();
    const IDLE_LIMIT_MS = 15 * 60 * 1000;
    const interval = setInterval(() => {
      if (Date.now() - adminLastActivityRef.current > IDLE_LIMIT_MS) {
        handleLogoutCustomer();
        setPreviewAsCustomer(false);
        setPage("home");
      }
    }, 30 * 1000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActivity));
      clearInterval(interval);
    };
  }, [hasAdminAccess]);

  // Si una conexión lenta o inestable (celular lejos del servidor, wifi
  // que se corta) hace que alguno de estos pedidos se cuelgue, antes la
  // página se quedaba mostrando el esqueleto de carga PARA SIEMPRE, sin
  // avisar nada — eso es lo que hacía "desaparecer" la web para algunos
  // visitantes. Ahora, si pasan 30 segundos sin terminar de cargar, se
  // corta la espera y se muestra un botón para reintentar en vez de dejar
  // a la persona mirando una pantalla en blanco sin poder hacer nada. Son
  // 30s (antes eran 15s) porque para alguien muy lejos del servidor (ej:
  // Argentina, si el servidor está en Europa/EE.UU.) con una conexión de
  // celular floja, 15s a veces no alcanzaban a terminar de traer todo y
  // se mostraba el aviso de error aunque la tienda SÍ estaba funcionando
  // bien, solo yendo más lenta.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 30000));
    (async () => {
      try {
        // Lo que hace falta para mostrar la tienda apenas entra alguien
        // (catálogo, categorías, ajustes, carrito, reseñas, el carrusel de
        // "trabajos personalizados" de la home) se pide primero y es lo
        // único que bloquea la pantalla de carga. La librería de diseños
        // para "Personalizar" (designLibrary/designFolders) solo hace falta
        // cuando alguien abre esa sección puntual — se pide después, en
        // segundo plano, sin hacer esperar a nadie que solo quiere mirar o
        // comprar productos normales. Esto achica bastante la primera
        // carga, que es la que más se siente en una conexión lejana o lenta.
        const [prods, cats, grps, cartState, sett, revs, customWork, customerSessionEmail] = await Promise.race([
          Promise.all([
            loadProducts(), loadCategories(), loadGroups(), loadCartState(), loadSettings(), loadReviews(), loadCustomWorkGallery(), storageGet("kulto:customer-session", false),
          ]),
          timeout,
        ]);
        if (cancelled) return;
        if (customerSessionEmail) {
          loadCustomer(customerSessionEmail).then((c) => { if (c) setCustomer(c); });
        }
        setProducts(prods);
        setCategories(cats);
        setGroups(grps);
        setSettings(sett);
        setReviews(revs);
        setCustomWorkGallery(customWork);
        setCart(cartState.items || []);
        setCustomerEmail(cartState.email || "");
        setCustomerName(cartState.name || "");
        setCustomerPhone(cartState.phone || "");
        setDeliveryMethod(cartState.deliveryMethod || "recogida");
        setAddress(cartState.address && typeof cartState.address === "object" ? { ...EMPTY_ADDRESS, ...cartState.address } : EMPTY_ADDRESS);
        setCartSavedAt(cartState.savedAt || null);
        if (cartState.items && cartState.items.length && hoursSince(cartState.savedAt) >= ABANDONED_HOURS) {
          setShowAbandonedBanner(true);
        }
        setLoading(false);
        // Librería de diseños para "Personalizar" — en segundo plano, no
        // bloquea la tienda. Si tarda o falla, simplemente queda vacía hasta
        // que termine (o hasta que alguien reintente abriendo esa sección).
        Promise.all([loadDesignLibrary(), loadDesignFolders()])
          .then(([designs, folders]) => {
            if (cancelled) return;
            setDesignLibrary(designs);
            setDesignFolders(folders);
          })
          .catch(() => {});
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  // Track when the cart first got items, so we can tell how "abandoned" it is.
  useEffect(() => {
    if (loading) return;
    if (cart.length > 0 && !cartSavedAt) setCartSavedAt(Date.now());
    if (cart.length === 0 && cartSavedAt) setCartSavedAt(null);
  }, [cart, loading, cartSavedAt]);

  useEffect(() => {
    if (loading) return;
    persistCartState({
      items: cart, email: customerEmail, name: customerName, phone: customerPhone,
      deliveryMethod, address, savedAt: cartSavedAt,
    });
  }, [cart, customerEmail, customerName, customerPhone, deliveryMethod, address, cartSavedAt, loading]);

  useEffect(() => {
    if (page === "cuenta" && hasAdminAccess) {
      loadOrders().then(setOrders);
      loadAllCustomers().then(setCustomersList);
      Promise.all([loadDraftProducts(), loadDraftCategories(), loadDraftGroups(), checkDraftChanges(), loadPhotoInbox(), loadSavedColors()]).then(
        ([dProds, dCats, dGroups, changed, inbox, colors]) => {
          setDraftProducts(dProds);
          setDraftCategories(dCats);
          setDraftGroups(dGroups);
          setHasDraftChanges(changed);
          setPhotoInbox(inbox);
          setSavedColors(colors);
          // Migración de fotos viejas a Storage — una sola vez por sesión, en
          // segundo plano, sin bloquear nada de lo que el admin esté viendo.
          // Si el bucket todavía no existe, no hace nada (lo intentará de
          // nuevo la próxima vez que se entre a "Mi cuenta").
          if (!legacyImagesMigratedRef.current) {
            legacyImagesMigratedRef.current = true;
            migrateLegacyImages({ products, draftProducts: dProds, designLibrary, customWorkGallery }).catch(() => {});
          }
          // Suma la paleta de Roly 2026 a la librería de colores guardados,
          // una sola vez por sesión, sin pisar ni duplicar nada.
          if (!rolyColorsSeededRef.current) {
            rolyColorsSeededRef.current = true;
            seedRolyColorsIfNeeded(colors).then((next) => { if (next !== colors) setSavedColors(next); }).catch(() => {});
          }
        }
      );
    }
  }, [page, hasAdminAccess]);

  // Keep the browser tab icon in sync with whatever logo is set in Ajustes.
  useEffect(() => {
    if (!settings.logoImage) return;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = settings.logoImage;
  }, [settings.logoImage]);

  // El logo que el admin sube en Ajustes → Marca también se usa como ícono
  // de la app instalable (PWA) — así, cuando lo cambia, no hay que tocar
  // código ni volver a publicar el sitio para que el ícono se actualice.
  // Dos límites a tener en cuenta (son restricciones de cada sistema, no de
  // Kulto): en Android/Chrome el ícono de una copia YA instalada se termina
  // actualizando solo, pero no al instante (Chrome revisa el manifest cada
  // tanto); en iPhone, Apple directamente NO deja actualizar el ícono de una
  // copia que ya está en la pantalla de inicio — ahí el ícono nuevo sólo lo
  // van a tener quienes la agreguen de ahí en adelante.
  useEffect(() => {
    if (!settings.logoImage) return;
    let appleLink = document.querySelector("link[rel='apple-touch-icon']");
    if (!appleLink) {
      appleLink = document.createElement("link");
      appleLink.rel = "apple-touch-icon";
      document.head.appendChild(appleLink);
    }
    appleLink.href = settings.logoImage;

    const storeName = settings.logoText || "Kulto";
    const manifest = {
      name: `${storeName} — Camisetas y ropa estampada`,
      short_name: storeName,
      description: "Camisetas, sudaderas y accesorios sublimados a tu manera.",
      theme_color: "#15131A",
      background_color: "#15131A",
      display: "standalone",
      start_url: "/",
      scope: "/",
      icons: [
        { src: settings.logoImage, sizes: "192x192", type: "image/png" },
        { src: settings.logoImage, sizes: "512x512", type: "image/png" },
        { src: settings.logoImage, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
    const manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/json" }));
    let manifestLink = document.querySelector("link[rel='manifest']");
    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestUrl;
  }, [settings.logoImage, settings.logoText]);

  const cartCount = cart.reduce((s, it) => s + it.qty, 0);
  // Los productos marcados "oculto" por el admin (ver botón Ocultar/Mostrar
  // en el panel) no deben aparecer para el cliente en ningún lado — inicio,
  // catálogo, buscador, ficha de producto — pero siguen existiendo (stock,
  // pedidos viejos que los referencian, etc.) y el admin los sigue viendo
  // en su panel para poder mostrarlos de nuevo cuando quiera.
  const sellableProducts = products.filter((p) => !p.tags?.template && !p.hidden);

  // Botón "atrás" del navegador: cada pantalla (inicio, catálogo,
  // personalizar, ficha de producto, carrito) se anota en el historial del
  // navegador, así "atrás" vuelve a la pantalla anterior de la web en vez de
  // salirse de la tienda. La dirección (URL) no cambia, solo el historial.
  const navProductsRef = useRef([]);
  navProductsRef.current = sellableProducts;
  useEffect(() => {
    const onPop = (e) => {
      const st = e.state || {};
      setPage(st.page || "home");
      setSelectedProduct(st.sp ? (navProductsRef.current.find((p) => p.id === st.sp) || null) : null);
      setCartOpen(!!st.cart);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (loading) return;
    const cur = { page, sp: selectedProduct?.id || null, cart: !!cartOpen };
    const prev = window.history.state;
    try {
      if (!prev || prev.page === undefined) window.history.replaceState(cur, "");
      // Cerrar el carrito o la ficha con la X equivale a "atrás": así no
      // quedan entradas de más en el historial.
      else if (prev.page === cur.page && ((prev.cart && !cur.cart && prev.sp === cur.sp) || (prev.sp && !cur.sp && prev.cart === cur.cart))) window.history.back();
      else if (prev.page !== cur.page || prev.sp !== cur.sp || prev.cart !== cur.cart) window.history.pushState(cur, "");
    } catch { /* si el navegador no deja tocar el historial, la web sigue igual */ }
  }, [page, selectedProduct, cartOpen, loading]);

  const handleAddToCart = useCallback((item) => {
    setCart((prev) => [...prev, item]);
  }, []);

  const handleUpdateQty = (cartId, qty) => setCart((prev) => prev.map((it) => (it.cartId === cartId ? { ...it, qty } : it)));
  const handleRemove = (cartId) => setCart((prev) => prev.filter((it) => it.cartId !== cartId));

  const handleCheckout = async ({ subtotal, shippingCost, total, discountAmount = 0, itemCount = 0, promo = null }) => {
    if (cart.length === 0) return;
    // Nunca se registra un pedido con un mail sin confirmar (ver CartDrawer).
    if (!isCheckoutEmailVerified(customerEmail, customer)) return;
    setSending(true);
    const order = {
      id: `KULTO-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      date: new Date().toISOString(),
      items: cart,
      customerName, customerPhone, customerEmail, comment,
      deliveryMethod, address: deliveryMethod === "envio" ? address : null,
      subtotal, shippingCost, total, discountAmount,
      promoCode: promo?.code || null,
      promoLabel: promo?.label || "",
      promoDiscount: promo?.discount || 0,
      promoFreeShipping: !!promo?.freeShipping,
      promoGift: promo?.gift || "",
      customerAccountEmail: customer?.email || null,
      status: "pendiente",
      trackingNumber: "",
      archived: false,
    };
    // El pedido ya NO depende de que WhatsApp se abra bien en el celular del
    // cliente (en varios navegadores, sobre todo Safari de iPhone, el popup
    // se bloqueaba y el pedido se podía perder sin que nadie se enterara).
    // Ahora el camino garantizado es: se guarda en el panel (Pedidos, vía
    // persistOrder) y se le avisa al dueño por mail — eso pasa siempre, sin
    // depender del navegador ni del celular de nadie. WhatsApp queda como una
    // opción más para el cliente (ver botón en la pantalla de confirmación),
    // nunca como un paso obligatorio para que el pedido quede registrado.
    try {
      await persistOrder(order);
    } catch {
      try { await persistOrder(order); } catch { /* seguimos igual — el mail de aviso de abajo es el otro respaldo */ }
    }
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `Nuevo pedido ${order.id}`,
      html: buildAdminOrderEmailHtml(order, settings),
    }).catch(() => { /* nunca bloquear el checkout por esto */ });
    if (order.customerEmail) {
      sendEmail({
        to: order.customerEmail,
        subject: `Confirmamos tu pedido ${order.id}`,
        html: buildOrderEmailHtml(order, settings),
      }).catch(() => { /* nunca bloquear el checkout por esto */ });
    }
    if (promo && !promo.personal) bumpPromoUsage(promo.code);
    if (customer) {
      try {
        const pointsEarned = settings?.loyaltyEnabled
          ? cart.reduce((s, it) => s + it.qty * (Number(it.points ?? settings.loyaltyPointsPerItem) || 0), 0)
          : 0;
        const updatedCustomer = {
          ...customer,
          points: (customer.points || 0) + pointsEarned,
          firstDiscountUsed: discountAmount > 0 ? true : customer.firstDiscountUsed,
          ...(promo ? {
            rewardCodes: (customer.rewardCodes || []).map((r) => (promo.personal && normalizePromoCode(r.code) === promo.code ? { ...r, usedAt: new Date().toISOString() } : r)),
            usedPromoCodes: !promo.personal && promo.perCustomerOnce ? [...(customer.usedPromoCodes || []), promo.code] : (customer.usedPromoCodes || []),
          } : {}),
        };
        await persistCustomer(updatedCustomer);
        setCustomer(updatedCustomer);
      } catch { /* nunca bloquear el checkout por esto */ }
    }
    try {
      const salesByProduct = {};
      cart.forEach((it) => { salesByProduct[it.productId] = (salesByProduct[it.productId] || 0) + it.qty; });
      const updates = Object.entries(salesByProduct).map(async ([productId, qty]) => {
        const p = products.find((pr) => pr.id === productId);
        if (!p) return null;
        const updated = { ...p, salesCount: (p.salesCount || 0) + qty };
        await persistProduct(updated);
        return updated;
      });
      const updatedProducts = (await Promise.all(updates)).filter(Boolean);
      if (updatedProducts.length) {
        setProducts((prev) => prev.map((p) => updatedProducts.find((u) => u.id === p.id) || p));
      }
    } catch { /* sales count is a nice-to-have; never block checkout on it */ }
    setCart([]);
    setComment("");
    setCartSavedAt(null);
    setShowAbandonedBanner(false);
    setSending(false);
    setCartOpen(false);
    setConfirmedWhatsappText(buildOrderMessage(order, settings));
    setConfirmedIsLocal(isLocalOrder(order, settings));
    setConfirmedOrderId(order.id);
    setConfirmedHasCustom(order.items.some((it) => it.designName?.startsWith("Personalizado")));
  };

  const handleSaveProduct = async (product) => {
    await persistDraftProduct(product);
    await markDraftChanged();
    setHasDraftChanges(true);
    setDraftProducts((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      return exists ? prev.map((p) => (p.id === product.id ? product : p)) : [...prev, product];
    });
  };

  // Guarda muchos productos de una vez (mover a un grupo, a una carpeta, etc.):
  // en tandas de 5 a la vez, un solo aviso de "cambios sin publicar" y una sola
  // actualización de pantalla al final — antes se guardaba de a uno, con todo
  // el catálogo redibujándose en cada uno, y con muchos productos parecía
  // trabado. Devuelve cuántos se guardaron y cuántos fallaron.
  const handleSaveProductsBulk = async (list, onProgress) => {
    const queue = [...list];
    const failedIds = [];
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        try { await persistProductToPrefix(DRAFT_PREFIX, p, false); } catch { failedIds.push(p.id); }
        done += 1;
        onProgress?.(done, list.length);
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    const okList = list.filter((p) => !failedIds.includes(p.id));
    if (okList.length) {
      // Las filas se guardaron sin tocar el índice (para no pisarse en
      // paralelo): se completa una sola vez acá, así ningún producto queda
      // "guardado pero invisible" al recargar.
      try {
        const idxRaw = await storageGet(`${DRAFT_PREFIX}product-index`, true);
        const ids = idxRaw ? JSON.parse(idxRaw) : [];
        const missing = okList.map((p) => p.id).filter((id) => !ids.includes(id));
        if (missing.length) await storageSet(`${DRAFT_PREFIX}product-index`, JSON.stringify([...ids, ...missing]), true);
      } catch { /* se reintenta en el próximo guardado */ }
      try { await markDraftChanged(); } catch { /* el aviso se reintenta en el próximo cambio */ }
      setHasDraftChanges(true);
      setDraftProducts((prev) => {
        const known = new Set(prev.map((p) => p.id));
        return [...prev.map((p) => okList.find((u) => u.id === p.id) || p), ...okList.filter((u) => !known.has(u.id))];
      });
    }
    return { ok: okList.length, failed: failedIds.length };
  };

  // Igual que handleSaveProduct, pero avisa si de verdad se guardó — la usa
  // "Personalizar" (prendas con muchos colores/fotos) para poder mostrarle al
  // admin un error real en vez de dejarlo creer que guardó cuando en realidad
  // el guardado falló silenciosamente (por ejemplo, por pesar demasiado).
  const handleSaveProductVerbose = async (product) => {
    const res = await persistDraftProductVerbose(product);
    if (!res.ok) return res;
    await markDraftChanged();
    setHasDraftChanges(true);
    setDraftProducts((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      return exists ? prev.map((p) => (p.id === product.id ? product : p)) : [...prev, product];
    });
    return res;
  };

  const handleDeleteProduct = async (id) => {
    await removeDraftProduct(id);
    await markDraftChanged();
    setHasDraftChanges(true);
    setDraftProducts((prev) => prev.filter((p) => p.id !== id));
  };

  // Suma una vista al contador de un producto cada vez que un cliente abre su
  // ficha — igual que salesCount, se escribe directo sobre el producto
  // publicado (nunca sobre el borrador) para que se vea al toque sin tener
  // que "Publicar cambios", y nunca debe frenar la navegación si falla.
  const handleTrackProductView = async (productId) => {
    try {
      const p = products.find((pr) => pr.id === productId);
      if (!p) return;
      const updated = { ...p, viewsCount: (p.viewsCount || 0) + 1 };
      await persistProduct(updated);
      setProducts((prev) => prev.map((pr) => (pr.id === productId ? updated : pr)));
    } catch { /* la vista es un nice-to-have, nunca debe romper la navegación */ }
  };

  const handleAddCategory = async (name) => {
    if (draftCategories.includes(name)) return;
    const next = [...draftCategories, name];
    setDraftCategories(next);
    await persistDraftCategories(next);
    await markDraftChanged();
    setHasDraftChanges(true);
  };

  const handleRenameCategory = async (oldName, newName) => {
    if (!newName || newName === oldName || draftCategories.includes(newName)) return;
    const next = draftCategories.map((c) => (c === oldName ? newName : c));
    setDraftCategories(next);
    await persistDraftCategories(next);
    // Un producto puede tener esta categoría como principal, o solo de
    // "también listar en" (extraCategories) — hay que renombrarla en ambos
    // lados para que no quede una referencia vieja colgada.
    const affected = draftProducts.filter(
      (p) => p.category === oldName || (p.extraCategories || []).includes(oldName)
    );
    const updated = affected.map((p) => ({
      ...p,
      category: p.category === oldName ? newName : p.category,
      extraCategories: (p.extraCategories || []).map((c) => (c === oldName ? newName : c)),
    }));
    if (updated.length) {
      await Promise.all(updated.map((p) => persistDraftProduct(p)));
      setDraftProducts((prev) => prev.map((p) => updated.find((u) => u.id === p.id) || p));
    }
    await markDraftChanged();
    setHasDraftChanges(true);
  };

  const handleDeleteCategory = async (name) => {
    const inUse = draftProducts.some((p) => p.category === name);
    if (inUse) return { ok: false, reason: "en-uso" };
    // Si esta categoría solo se usaba como "también listar en" (no como
    // principal de ningún producto), se puede borrar igual — solo hay que
    // sacarla de esas listas para que no quede una referencia colgada.
    const affected = draftProducts.filter((p) => (p.extraCategories || []).includes(name));
    if (affected.length) {
      const updated = affected.map((p) => ({ ...p, extraCategories: p.extraCategories.filter((c) => c !== name) }));
      await Promise.all(updated.map((p) => persistDraftProduct(p)));
      setDraftProducts((prev) => prev.map((p) => updated.find((u) => u.id === p.id) || p));
    }
    const next = draftCategories.filter((c) => c !== name);
    setDraftCategories(next);
    await persistDraftCategories(next);
    await markDraftChanged();
    setHasDraftChanges(true);
    return { ok: true };
  };

  const handleAddGroup = async (name) => {
    if (draftGroups.includes(name)) return;
    const next = [...draftGroups, name];
    setDraftGroups(next);
    await persistDraftGroups(next);
    await markDraftChanged();
    setHasDraftChanges(true);
  };

  const handleRenameGroup = async (oldName, newName) => {
    if (!newName || newName === oldName || draftGroups.includes(newName)) return;
    const next = draftGroups.map((g) => (g === oldName ? newName : g));
    setDraftGroups(next);
    await persistDraftGroups(next);
    const affected = draftProducts.filter((p) => p.group === oldName);
    const updated = affected.map((p) => ({ ...p, group: newName }));
    if (updated.length) {
      await Promise.all(updated.map((p) => persistDraftProduct(p)));
      setDraftProducts((prev) => prev.map((p) => updated.find((u) => u.id === p.id) || p));
    }
    await markDraftChanged();
    setHasDraftChanges(true);
  };

  const handleDeleteGroup = async (name) => {
    const inUse = draftProducts.some((p) => p.group === name);
    if (inUse) return { ok: false, reason: "en-uso" };
    const next = draftGroups.filter((g) => g !== name);
    setDraftGroups(next);
    await persistDraftGroups(next);
    await markDraftChanged();
    setHasDraftChanges(true);
    return { ok: true };
  };

  const handlePublishChanges = async () => {
    setPublishing(true);
    const previousProducts = products;
    await publishDraft();
    const [freshProducts, freshCategories, freshGroups] = await Promise.all([loadProducts(), loadCategories(), loadGroups()]);
    // Si algún producto pasó de sin stock a con stock al publicar, les
    // avisamos por mail a todos los que pidieron que les avisen (ver
    // RestockNotifyForm) — nunca bloquea la publicación si algo falla acá.
    freshProducts.forEach((p) => {
      const prev = previousProducts.find((pp) => pp.id === p.id);
      if (prev && (prev.stock ?? 0) <= 0 && (p.stock ?? 0) > 0) {
        notifyRestockSubscribers(p.id, p.name, settings).catch(() => {});
      }
    });
    setProducts(freshProducts);
    setCategories(freshCategories);
    setGroups(freshGroups);
    setHasDraftChanges(false);
    setPublishing(false);
  };

  // Sumar stock desde el apartado "Compras" es una operación chica y urgente
  // (llegó la mercadería, hay que reflejarlo ya) — por eso escribe directo
  // sobre el producto publicado, igual que salesCount/viewsCount, en vez de
  // pasar por el ciclo de borrador/"Publicar cambios". Si el producto también
  // tiene un borrador pendiente, le actualizamos el stock ahí también para
  // que no queden desincronizados. Si el stock pasa de 0 para arriba, avisa
  // por mail a quienes pidieron que les notifiquen (igual que al publicar).
  const handleQuickRestock = async (productId, addAmount) => {
    const p = products.find((pr) => pr.id === productId);
    if (!p) return;
    const wasOut = (p.stock ?? 0) <= 0;
    const updated = { ...p, stock: (p.stock ?? 0) + addAmount };
    await persistProduct(updated);
    setProducts((prev) => prev.map((pr) => (pr.id === productId ? updated : pr)));
    const draftMatch = draftProducts.find((pr) => pr.id === productId);
    if (draftMatch) {
      const updatedDraft = { ...draftMatch, stock: updated.stock };
      await persistDraftProduct(updatedDraft).catch(() => {});
      setDraftProducts((prev) => prev.map((pr) => (pr.id === productId ? updatedDraft : pr)));
    }
    if (wasOut && updated.stock > 0) {
      notifyRestockSubscribers(productId, p.name, settings).catch(() => {});
    }
  };

  const handleDiscardChanges = async () => {
    await discardDraft();
    const [dProds, dCats, dGroups] = await Promise.all([loadDraftProducts(), loadDraftCategories(), loadDraftGroups()]);
    setDraftProducts(dProds);
    setDraftCategories(dCats);
    setDraftGroups(dGroups);
    setHasDraftChanges(false);
  };

  const fileToBase64Promise = (file, maxDim, quality, format) =>
    new Promise((resolve) => fileToBase64(file, resolve, maxDim, quality, format));

  const handleAddToInbox = async (files) => {
    const list = Array.from(files);
    const items = await Promise.all(
      list.map(async (f) => {
        const isPng = f.type === "image/png";
        const b64 = await fileToBase64Promise(f, 1200, isPng ? 1 : 0.85, isPng ? "image/png" : "image/jpeg");
        return { id: genId("img"), image: b64 };
      })
    );
    setPhotoInbox((prev) => {
      const next = [...prev, ...items];
      persistPhotoInbox(next);
      return next;
    });
  };

  const handleRemoveFromInbox = (ids) => {
    setPhotoInbox((prev) => {
      const next = prev.filter((i) => !ids.includes(i.id));
      persistPhotoInbox(next);
      return next;
    });
  };

  const handleSaveColorToLibrary = (color) => {
    setSavedColors((prev) => {
      const exists = prev.some((c) => c.name.toLowerCase() === color.name.toLowerCase() && c.hex.toLowerCase() === color.hex.toLowerCase());
      if (exists) return prev;
      const next = [...prev, { name: color.name, hex: color.hex }];
      persistSavedColors(next);
      return next;
    });
  };

  // Genera un código de 6 dígitos, lo guarda en la cuenta (vence en 15 min) y
  // manda el mail. Se usa tanto al registrarse como para "reenviar código".
  const issueAndSendVerification = async (customerRecord) => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const updated = { ...customerRecord, emailVerified: false, verificationCode: code, verificationExpires: Date.now() + 15 * 60 * 1000 };
    await persistCustomer(updated);
    const emailResult = await sendEmail({
      to: updated.email,
      subject: `Confirmá tu cuenta en ${settings?.logoText || "Kulto"}`,
      html: buildVerificationEmailHtml(updated.name, code, settings),
    });
    return { record: updated, emailSent: emailResult.ok, emailError: emailResult.error };
  };

  const handleRegisterCustomer = async ({ name, email, password }) => {
    const norm = normalizeEmail(email);
    const existing = await loadCustomer(norm);
    if (existing) return { ok: false, error: "Ya existe una cuenta con ese email — probá iniciar sesión." };
    const passwordHash = await hashPassword(password);
    const record = { id: genId("cu"), name: name.trim(), email: norm, passwordHash, points: 0, firstDiscountUsed: false, createdAt: Date.now() };
    // La cuenta de administrador (ADMIN_EMAIL) entra directo, sin confirmar
    // mail — así el dueño de la tienda nunca queda afuera de su propio panel
    // por no tener todavía el envío de mails configurado.
    if (norm === normalizeEmail(ADMIN_EMAIL)) {
      const adminRecord = { ...record, emailVerified: true };
      await persistCustomer(adminRecord);
      await storageSet("kulto:customer-session", norm, false);
      setCustomer(adminRecord);
      return { ok: true };
    }
    const { emailSent, emailError } = await issueAndSendVerification(record);
    return {
      ok: true,
      needsVerification: true,
      email: norm,
      error: emailSent ? "" : `Creamos tu cuenta pero no pudimos mandarte el mail de confirmación (${emailError || "revisá la config del servidor"}). Probá "Reenviar código" en un rato.`,
    };
  };

  const handleVerifyEmail = async ({ email, code }) => {
    const norm = normalizeEmail(email);
    const existing = await loadCustomer(norm);
    if (!existing) return { ok: false, error: "No encontramos esa cuenta." };
    if (existing.emailVerified !== false) {
      await storageSet("kulto:customer-session", norm, false);
      setCustomer(existing);
      return { ok: true };
    }
    if (!existing.verificationCode || (existing.verificationExpires || 0) < Date.now()) {
      return { ok: false, error: "El código venció. Pedí uno nuevo con \"Reenviar código\"." };
    }
    if (existing.verificationCode !== code.trim()) {
      return { ok: false, error: "El código no es correcto." };
    }
    const updated = { ...existing, emailVerified: true, verificationCode: null, verificationExpires: null };
    await persistCustomer(updated);
    await storageSet("kulto:customer-session", norm, false);
    setCustomer(updated);
    return { ok: true };
  };

  const handleResendVerification = async ({ email }) => {
    const norm = normalizeEmail(email);
    const existing = await loadCustomer(norm);
    if (!existing) return { ok: false, error: "No encontramos esa cuenta." };
    const { emailSent, emailError } = await issueAndSendVerification(existing);
    return emailSent ? { ok: true } : { ok: false, error: emailError || "No se pudo enviar el mail." };
  };

  // "Olvidé mi contraseña": mismo mecanismo que la verificación de mail (un
  // código de 6 dígitos que vence a los 15 minutos), pero guardado aparte
  // (resetCode/resetExpires) para no pisar un código de verificación de mail
  // pendiente si el cliente todavía no confirmó la cuenta.
  const handleRequestPasswordReset = async ({ email }) => {
    const norm = normalizeEmail(email);
    const existing = await loadCustomer(norm);
    if (!existing) return { ok: false, error: "No encontramos una cuenta con ese email." };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const updated = { ...existing, resetCode: code, resetExpires: Date.now() + 15 * 60 * 1000 };
    await persistCustomer(updated);
    const emailResult = await sendEmail({
      to: updated.email,
      subject: `Recuperar tu contraseña en ${settings?.logoText || "Kulto"}`,
      html: buildPasswordResetEmailHtml(updated.name, code, settings, updated.email),
    });
    if (!emailResult.ok) return { ok: false, error: `No pudimos mandarte el mail (${emailResult.error || "revisá la config del servidor"}).` };
    return { ok: true };
  };

  const handleResetPassword = async ({ email, code, newPassword }) => {
    const norm = normalizeEmail(email);
    const existing = await loadCustomer(norm);
    if (!existing) return { ok: false, error: "No encontramos esa cuenta." };
    if (!existing.resetCode || (existing.resetExpires || 0) < Date.now()) {
      return { ok: false, error: "El código venció. Pedí uno nuevo con \"Reenviar código\"." };
    }
    if (existing.resetCode !== code.trim()) {
      return { ok: false, error: "El código no es correcto." };
    }
    const passwordHash = await hashPassword(newPassword);
    const updated = { ...existing, passwordHash, resetCode: null, resetExpires: null, emailVerified: true };
    await persistCustomer(updated);
    await storageSet("kulto:customer-session", norm, false);
    setCustomer(updated);
    return { ok: true };
  };

  const handleLoginCustomer = async ({ email, password }) => {
    const norm = normalizeEmail(email);
    const existing = await loadCustomer(norm);
    if (!existing) return { ok: false, error: "No encontramos una cuenta con ese email." };
    const passwordHash = await hashPassword(password);
    if (passwordHash !== existing.passwordHash) return { ok: false, error: "Contraseña incorrecta." };
    const isAdminAccount_ = norm === normalizeEmail(ADMIN_EMAIL);
    if (existing.emailVerified === false && !isAdminAccount_) {
      await issueAndSendVerification(existing);
      return { ok: false, needsVerification: true, email: norm, error: "Todavía no confirmaste tu mail — te mandamos un código nuevo." };
    }
    await storageSet("kulto:customer-session", norm, false);
    setCustomer(existing);
    return { ok: true };
  };

  const handleLogoutCustomer = async () => {
    await storageDelete("kulto:customer-session", false);
    setCustomer(null);
  };

  // "Me gusta" / favoritos — solo para clientes con cuenta, para que la lista
  // los siga sin importar desde qué dispositivo entren la próxima vez.
  const handleToggleFavorite = async (productId) => {
    if (!customer) { setPage("cuenta"); return; }
    const favs = customer.favorites || [];
    const next = favs.includes(productId) ? favs.filter((id) => id !== productId) : [...favs, productId];
    const updated = { ...customer, favorites: next };
    setCustomer(updated);
    await persistCustomer(updated);
  };

  const handleAdjustCustomerPoints = async (customerEmail_, newPoints) => {
    const target = customersList.find((c) => c.email === customerEmail_);
    if (!target) return;
    const updated = { ...target, points: Math.max(0, newPoints) };
    await persistCustomer(updated);
    setCustomersList((prev) => prev.map((c) => (c.email === customerEmail_ ? updated : c)));
    if (customer?.email === customerEmail_) setCustomer(updated);
  };

  // Le da (o le quita) a una cuenta de cliente acceso limitado al panel de
  // administrador — ver AdminCustomers → "Permisos". Solo el dueño llega acá
  // (la UI que llama a esto ni se muestra si no sos el dueño).
  const handleSetAdminPermissions = async (customerEmail_, permissions) => {
    const target = customersList.find((c) => c.email === customerEmail_);
    if (!target) return;
    const cleaned = (permissions || []).filter((k) => ADMIN_TAB_KEYS.includes(k));
    const updated = { ...target, adminPermissions: cleaned };
    await persistCustomer(updated);
    setCustomersList((prev) => prev.map((c) => (c.email === customerEmail_ ? updated : c)));
    if (customer?.email === customerEmail_) setCustomer(updated);
  };

  // Borra una cuenta de cliente. Nunca deja borrar la cuenta del dueño de la
  // tienda (ADMIN_EMAIL) para que no se pueda quedar afuera de su propio panel
  // por accidente.
  const handleDeleteCustomer = async (customerEmail_) => {
    if (normalizeEmail(customerEmail_) === normalizeEmail(ADMIN_EMAIL)) return;
    await removeCustomer(customerEmail_);
    setCustomersList((prev) => prev.filter((c) => c.email !== customerEmail_));
    if (customer?.email === customerEmail_) {
      setCustomer(null);
      try { await storageDelete("kulto:customer-session", false); } catch { /* nunca romper el borrado por esto */ }
    }
  };

  // Crea una cuenta a nombre de un cliente (ej: compró por WhatsApp y todavía
  // no tiene una) sin definirle contraseña — le llega el mismo mail de
  // "elegí tu contraseña" que usa la recuperación, así nunca la vemos.
  const handleAdminCreateCustomer = async ({ name, email }) => {
    const norm = normalizeEmail(email);
    const existing = await loadCustomer(norm);
    if (existing) return { ok: false, error: "Ya existe una cuenta con ese email." };
    const record = {
      id: genId("cu"), name: (name || "").trim(), email: norm,
      passwordHash: null, points: 0, firstDiscountUsed: false, createdAt: Date.now(),
      emailVerified: true, // la creó el admin a mano, no hace falta reconfirmar el mail
    };
    await persistCustomer(record);
    setCustomersList((prev) => [...prev, record]);
    const sendResult = await handleRequestPasswordReset({ email: norm });
    return sendResult.ok ? { ok: true } : { ok: true, error: `Se creó la cuenta pero no pudimos mandar el mail (${sendResult.error || "revisá la config del servidor"}). Podés reintentar con "Contraseña" en su fila.` };
  };

  // Deja que el admin corrija el nombre o el email de un cliente si algo
  // quedó mal cargado. El email es la clave de guardado de la cuenta, así que
  // si cambia hay que mudar el registro a la key nueva y borrar la vieja.
  const handleAdminUpdateCustomerInfo = async (oldEmail, { name, email }) => {
    const oldNorm = normalizeEmail(oldEmail);
    const newNorm = normalizeEmail(email);
    // La cuenta de ADMIN_EMAIL es la puerta de entrada al panel — cambiarle
    // el email por error dejaría al dueño afuera de su propia tienda.
    if (oldNorm === normalizeEmail(ADMIN_EMAIL) && newNorm !== oldNorm) {
      return { ok: false, error: "No podés cambiar el email de la cuenta principal de administrador." };
    }
    const existing = await loadCustomer(oldNorm);
    if (!existing) return { ok: false, error: "No encontramos esa cuenta." };
    if (newNorm !== oldNorm) {
      const clash = await loadCustomer(newNorm);
      if (clash) return { ok: false, error: "Ya hay otra cuenta con ese email." };
    }
    const updated = { ...existing, name: (name || "").trim(), email: newNorm };
    await persistCustomer(updated);
    if (newNorm !== oldNorm) await removeCustomer(oldNorm);
    setCustomersList((prev) => prev.map((c) => (c.email === oldNorm ? updated : c)));
    if (customer?.email === oldNorm) {
      setCustomer(updated);
      if (newNorm !== oldNorm) {
        try { await storageSet("kulto:customer-session", newNorm, false); } catch { /* no bloquea el guardado */ }
      }
    }
    return { ok: true };
  };

  const handleAddDesignToLibrary = async (design) => {
    const result = await persistDesignToLibrary(design);
    if (result.ok) setDesignLibrary((prev) => [...prev, design]);
    return result;
  };

  const handleRemoveDesignFromLibrary = async (id) => {
    await removeDesignFromLibrary(id);
    setDesignLibrary((prev) => prev.filter((d) => d.id !== id));
  };

  // Carpetas de la librería de diseños — agrupan diseños ya subidos para que
  // no quede todo en una sola grilla gigante. Cada diseño guarda a lo sumo
  // una carpeta (design.folderId); "portada" (coverDesignIds) es lo que se
  // ve desde afuera de la tarjeta sin entrar, elegido a mano por el admin.
  const handleAddDesignFolder = async (name, category = "") => {
    const folder = { id: genId("fld"), name: name.trim() || "Carpeta", coverDesignIds: [], category: category || "" };
    const next = [...designFolders, folder];
    setDesignFolders(next);
    await persistDesignFolders(next);
  };

  const handleRenameDesignFolder = async (id, name) => {
    const next = designFolders.map((f) => (f.id === id ? { ...f, name } : f));
    setDesignFolders(next);
    await persistDesignFolders(next);
  };

  // A qué categoría de producto quedan atados los diseños de esta carpeta
  // (ej: "Mates") — en "Personalizar" esa carpeta solo va a aparecer cuando
  // el cliente esté personalizando un producto de esa categoría. Dejarlo en
  // "" (Todas) hace que la carpeta se vea siempre, sin importar la prenda.
  const handleSetDesignFolderCategory = async (id, category) => {
    const next = designFolders.map((f) => (f.id === id ? { ...f, category: category || "" } : f));
    setDesignFolders(next);
    await persistDesignFolders(next);
  };

  // En qué prendas de "Personalizar" está disponible cada carpeta (varias a la
  // vez — ej: camisetas Beagle, Jamaica y sudaderas). Ver folderAppliesTo.
  const handleSetDesignFolderGarments = async (id, garments) => {
    const next = designFolders.map((f) => (f.id === id ? { ...f, garments: garments || [] } : f));
    setDesignFolders(next);
    await persistDesignFolders(next);
  };

  const handleRemoveDesignFolder = async (id) => {
    const next = designFolders.filter((f) => f.id !== id);
    setDesignFolders(next);
    await persistDesignFolders(next);
    // Los diseños que estaban adentro no se borran, quedan sueltos otra vez.
    const affected = designLibrary.filter((d) => d.folderId === id);
    if (affected.length) {
      const updated = affected.map((d) => ({ ...d, folderId: null }));
      setDesignLibrary((prev) => prev.map((d) => (d.folderId === id ? { ...d, folderId: null } : d)));
      await Promise.all(updated.map((d) => persistDesignToLibrary(d)));
    }
  };

  const handleToggleDesignFolderCover = async (folderId, designId) => {
    const folder = designFolders.find((f) => f.id === folderId);
    if (!folder) return;
    const has = (folder.coverDesignIds || []).includes(designId);
    let coverDesignIds;
    if (has) {
      coverDesignIds = folder.coverDesignIds.filter((id) => id !== designId);
    } else {
      if ((folder.coverDesignIds || []).length >= 4) return; // ya eligió las 4
      coverDesignIds = [...(folder.coverDesignIds || []), designId];
    }
    const next = designFolders.map((f) => (f.id === folderId ? { ...f, coverDesignIds } : f));
    setDesignFolders(next);
    await persistDesignFolders(next);
  };

  const handleAssignDesignToFolder = async (designId, folderId) => {
    const design = designLibrary.find((d) => d.id === designId);
    if (!design) return;
    const updated = { ...design, folderId: folderId || null };
    setDesignLibrary((prev) => prev.map((d) => (d.id === designId ? updated : d)));
    await persistDesignToLibrary(updated);
  };

  const handleAddCustomWork = async (item) => {
    const result = await persistCustomWorkPhoto(item);
    if (result.ok) {
      setCustomWorkGallery((prev) =>
        prev.some((it) => it.id === item.id) ? prev.map((it) => (it.id === item.id ? item : it)) : [...prev, item]
      );
    }
    return result;
  };

  const handleRemoveCustomWork = async (id) => {
    await removeCustomWorkPhoto(id);
    setCustomWorkGallery((prev) => prev.filter((it) => it.id !== id));
  };

  const handleRemoveColorFromLibrary = (color) => {
    setSavedColors((prev) => {
      const next = prev.filter((c) => !(c.name === color.name && c.hex === color.hex));
      persistSavedColors(next);
      return next;
    });
  };

  const handleCreateProductFromInbox = async ({ name, category, group, price }, images, ids) => {
    const product = {
      ...emptyDraft,
      id: genId("p"),
      name,
      category,
      group: group || "",
      price: Number(price),
      photoPool: images,
      createdAt: Date.now(),
      salesCount: 0,
    };
    await handleSaveProduct(product);
    handleRemoveFromInbox(ids);
  };

  const handleAddInboxToExisting = async (productId, images, ids) => {
    const target = draftProducts.find((p) => p.id === productId);
    if (!target) return;
    const updated = { ...target, photoPool: [...target.photoPool, ...images] };
    await handleSaveProduct(updated);
    handleRemoveFromInbox(ids);
  };

  const handleToggleOrderStatus = async (order) => {
    const updated = { ...order, status: order.status === "completado" ? "pendiente" : "completado" };
    await updateOrder(updated);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
  };

  // Entrega personal: el dueño confirma a mano cada etapa del pedido
  // (realizado → procesando → terminado → entregado). "Entregado" también lo
  // marca como completado; volver atrás lo deja pendiente otra vez.
  const handleSetLocalStatus = async (order, localStatus) => {
    const updated = {
      ...order,
      localStatus,
      status: localStatus === "entregado" ? "completado" : (order.status === "completado" ? "pendiente" : order.status),
    };
    await updateOrder(updated);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
  };

  // Cambia un pedido de envío entre "entrego yo en persona" (etapas) y
  // "envío normal" (link de seguimiento), cuando la zona automática no acierta.
  const handleSetLocalTracking = async (order, flag) => {
    const updated = { ...order, localTracking: flag };
    await updateOrder(updated);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
  };

  const handleUpdateTracking = async (order, trackingNumber) => {
    const updated = { ...order, trackingNumber };
    await updateOrder(updated);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
  };

  // Pedir reseña a mano desde el panel, una vez que el pedido ya está
  // completado/entregado — manda el mail con el link y guarda cuándo se pidió
  // para que se vea en el panel (no bloquea poder pedirla de nuevo).
  const handleRequestReview = async (order) => {
    if (!order.customerEmail) return { ok: false, error: "Este pedido no tiene mail cargado." };
    const result = await sendEmail({
      to: order.customerEmail,
      subject: `¿Cómo te quedó tu pedido ${order.id}?`,
      html: buildReviewRequestEmailHtml(order, settings),
    });
    if (result.ok) {
      const updated = { ...order, reviewRequestedAt: Date.now() };
      await updateOrder(updated);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    }
    return result;
  };

  // Descuento manual sobre un pedido ya hecho (ej: compensar un problema).
  // Se guarda aparte del descuento de bienvenida y el total se recalcula acá,
  // nunca en el componente, para que quede consistente pase lo que pase.
  const handleApplyDiscount = async (order, { mode, amount, percent, reason }) => {
    const manualDiscountAmount = Math.max(0, Number(amount) || 0);
    const newTotal = Math.max(0, order.subtotal - (order.discountAmount || 0) - (order.promoDiscount || 0) - manualDiscountAmount) + (order.shippingCost || 0);
    const updated = {
      ...order,
      manualDiscountMode: mode,
      manualDiscountAmount,
      manualDiscountPercent: percent,
      manualDiscountReason: reason,
      total: newTotal,
    };
    await updateOrder(updated);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
  };

  const handleBulkComplete = async (ids) => {
    const targets = orders.filter((o) => ids.includes(o.id));
    const updates = await Promise.all(targets.map(async (o) => {
      const updated = { ...o, status: "completado" };
      await updateOrder(updated);
      return updated;
    }));
    setOrders((prev) => prev.map((o) => updates.find((u) => u.id === o.id) || o));
  };

  const handleBulkArchive = async (ids, archived) => {
    const targets = orders.filter((o) => ids.includes(o.id));
    const updates = await Promise.all(targets.map(async (o) => {
      const updated = { ...o, archived };
      await updateOrder(updated);
      return updated;
    }));
    setOrders((prev) => prev.map((o) => updates.find((u) => u.id === o.id) || o));
  };

  const handleBulkDelete = async (ids) => {
    await Promise.all(ids.map((id) => removeOrder(id)));
    setOrders((prev) => prev.filter((o) => !ids.includes(o.id)));
  };

  const handleSaveReview = async (review) => {
    await persistReview(review);
    setReviews((prev) => {
      const exists = prev.some((r) => r.id === review.id);
      return exists ? prev.map((r) => (r.id === review.id ? review : r)) : [...prev, review];
    });
  };

  const handleDeleteReview = async (id) => {
    await removeReview(id);
    setReviews((prev) => prev.filter((r) => r.id !== id));
  };

  const handleReorderReview = async (id, direction) => {
    setReviews((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      const swapWith = idx + direction;
      if (idx < 0 || swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      persistReviewOrder(next.map((r) => r.id));
      return next;
    });
  };

  // Canjea puntos por un premio: descuenta los puntos y le da al cliente un
  // código personal de un solo uso (queda guardado en su cuenta).
  const handleRedeemReward = async (rewardId) => {
    if (!customer) return { ok: false, error: "Iniciá sesión para canjear." };
    const reward = (settings.loyaltyRewards || []).find((r) => r.id === rewardId && r.active !== false);
    if (!reward) return { ok: false, error: "Este premio ya no está disponible." };
    const cost = Number(reward.pointsCost) || 0;
    if (cost <= 0 || (customer.points || 0) < cost) return { ok: false, error: "Todavía no te alcanzan los puntos." };
    const code = genRewardCode();
    const entry = { code, rewardId: reward.id, name: reward.name, type: reward.type, value: reward.value, giftText: reward.giftText || "", color: reward.color || "", createdAt: new Date().toISOString(), usedAt: null, pointsSpent: cost };
    const updated = { ...customer, points: (customer.points || 0) - cost, rewardCodes: [...(customer.rewardCodes || []), entry] };
    try {
      await persistCustomer(updated);
      setCustomer(updated);
    } catch {
      return { ok: false, error: "No pudimos guardar el canje. Probá de nuevo." };
    }
    return { ok: true, code };
  };

  const handleSaveSettings = async (partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      persistSettings(next);
      return next;
    });
  };

  if (loadFailed) {
    return (
      <div className="kulto-root min-h-screen flex items-center justify-center px-4" data-mode={themeMode}>
        <GlobalStyle colors={settings.theme} />
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-3">
          <WifiOff size={36} color="var(--slate)" />
          <p className="text-lg font-semibold" style={{ color: "var(--bone)" }}>No pudimos cargar la tienda</p>
          <p className="text-sm" style={{ color: "var(--slate)" }}>
            Puede ser tu conexión, o que esté yendo muy lenta en este momento. Probá de nuevo.
          </p>
          <button
            onClick={() => setLoadAttempt((n) => n + 1)}
            className="kulto-btn text-sm font-semibold px-5 py-2.5 rounded-full mt-1"
            style={{ background: "var(--signal)", color: "var(--bone)" }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="kulto-root min-h-screen" data-mode={themeMode}>
        <GlobalStyle colors={settings.theme} />
        <div className="h-16" style={{ borderBottom: "1px solid var(--line)" }} />
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-14 md:py-24 grid md:grid-cols-2 gap-10">
          <div className="flex flex-col gap-4">
            <div className="kulto-skel rounded-xl h-12 w-3/4" />
            <div className="kulto-skel rounded-xl h-4 w-full" />
            <div className="kulto-skel rounded-xl h-4 w-2/3" />
            <div className="kulto-skel rounded-full h-12 w-40 mt-3" />
          </div>
          <div className="kulto-skel rounded-3xl h-64 md:h-96" />
        </div>
        <div className="max-w-6xl mx-auto px-4 md:px-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="kulto-skel rounded-2xl aspect-square" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="kulto-root min-h-screen flex flex-col" data-mode={themeMode}>
      <GlobalStyle colors={settings.theme} />
      <Header page={page} setPage={setPage} cartCount={cartCount} onOpenCart={() => setCartOpen(true)} logoImage={settings.logoImage} logoText={settings.logoText} customer={customer} themeMode={themeMode} onToggleThemeMode={toggleThemeMode} fontStep={fontStep} onDecreaseFont={decreaseFont} onIncreaseFont={increaseFont} socialLinks={{ instagram: settings.socialInstagram, facebook: settings.socialFacebook, tiktok: settings.socialTiktok }} showAdminMenu={hasAdminAccess} onGoAdminTab={jumpToAdminTab} onPreviewAsCustomer={() => { setPreviewAsCustomer(true); setPage("home"); }} productsMenuItems={settings.productsMenuItems || []} onGoCatalog={goToCatalog} products={sellableProducts} />
      {hasAdminAccess && previewAsCustomer && (
        <div className="sticky top-16 z-30 flex items-center justify-center gap-3 px-4 py-2 text-sm font-semibold" style={{ background: "var(--sun)", color: "var(--ink)" }}>
          <span>Estás viendo la web como la vería un cliente.</span>
          <button
            onClick={() => { setPreviewAsCustomer(false); setPage("cuenta"); }}
            className="kulto-btn rounded-full px-3 py-1 text-xs"
            style={{ background: "var(--ink)", color: "var(--bone)" }}
          >
            Volver al panel
          </button>
        </div>
      )}
      <InstallAppBanner />
      <MarqueeStrip />
      {showAbandonedBanner && (
        <AbandonedCartBanner
          hours={Math.floor(hoursSince(cartSavedAt))}
          count={cartCount}
          onView={() => { setCartOpen(true); setShowAbandonedBanner(false); }}
          onDismiss={() => setShowAbandonedBanner(false)}
        />
      )}

      <main className={`flex-1 ${cart.length > 0 ? "pb-20 md:pb-0" : ""}`}>
        {page === "home" && (
          <Home
            products={sellableProducts}
            settings={settings}
            reviews={reviews}
            customWorkGallery={customWorkGallery}
            onOpen={setSelectedProduct}
            onGoCatalog={goToCatalog}
            onGoWizard={() => setPage("wizard")}
            onSearch={(q) => {
              setCatalogInitialGroup("");
              setCatalogSearchQuery(q);
              setPage("catalog");
            }}
            favorites={customer?.favorites}
            onToggleFavorite={handleToggleFavorite}
            onAddToCart={handleAddToCart}
          />
        )}
        {page === "catalog" && <Catalog key={`${catalogInitialGroup}|${catalogInitialCategory}|${catalogInitialSubcategory}|${catalogInitialCollection}|${catalogSearchQuery}`} settings={settings} initialCollection={catalogInitialCollection} products={sellableProducts} categories={categories} groups={groups} onOpen={setSelectedProduct} initialQuery={catalogSearchQuery} initialGroup={catalogInitialGroup} initialCategory={catalogInitialCategory} initialSubcategory={catalogInitialSubcategory} favorites={customer?.favorites} onToggleFavorite={handleToggleFavorite} onGoHome={() => setPage("home")} onAddToCart={handleAddToCart} />}
        {page === "favoritos" && <Catalog products={sellableProducts} categories={categories} groups={groups} onOpen={setSelectedProduct} favorites={customer?.favorites} onToggleFavorite={handleToggleFavorite} onlyFavorites onGoHome={() => setPage("home")} onAddToCart={handleAddToCart} />}
        {page === "wizard" && (
          <Wizard
            products={products}
            categories={categories}
            settings={settings}
            designLibrary={designLibrary}
            designFolders={designFolders}
            onAddToCart={handleAddToCart}
            onOpenProduct={setSelectedProduct}
            favorites={customer?.favorites}
            onToggleFavorite={handleToggleFavorite}
            onGoHome={() => setPage("home")}
          />
        )}
        {page === "seguimiento" && <OrderLookupPage initialOrderId={reviewDeepLinkOrderId} settings={settings} />}
        {page === "cuenta" && (
          effectiveAdminView ? (
            <AdminPanel
              permissions={adminPermissionsForAccount}
              isOwner={isAdminAccount}
              onSetAdminPermissions={handleSetAdminPermissions}
              products={draftProducts}
              categories={draftCategories}
              groups={draftGroups}
              orders={orders}
              customers={customersList}
              onAdjustCustomerPoints={handleAdjustCustomerPoints}
              onDeleteCustomer={handleDeleteCustomer}
              onCreateCustomer={handleAdminCreateCustomer}
              onUpdateCustomerInfo={handleAdminUpdateCustomerInfo}
              onSendPasswordHelp={handleRequestPasswordReset}
              reviews={reviews}
              settings={settings}
              hasDraftChanges={hasDraftChanges}
              publishing={publishing}
              onPublishChanges={handlePublishChanges}
              onDiscardChanges={handleDiscardChanges}
              photoInbox={photoInbox}
              onAddToInbox={handleAddToInbox}
              onCreateProductFromInbox={handleCreateProductFromInbox}
              onAddInboxToExisting={handleAddInboxToExisting}
              onRemoveFromInbox={handleRemoveFromInbox}
              savedColors={savedColors}
              onSaveColorToLibrary={handleSaveColorToLibrary}
              onRemoveColorFromLibrary={handleRemoveColorFromLibrary}
              designLibrary={designLibrary}
              onAddDesignToLibrary={handleAddDesignToLibrary}
              onRemoveDesignFromLibrary={handleRemoveDesignFromLibrary}
              designFolders={designFolders}
              onAddDesignFolder={handleAddDesignFolder}
              onRenameDesignFolder={handleRenameDesignFolder}
              onRemoveDesignFolder={handleRemoveDesignFolder}
              onToggleDesignFolderCover={handleToggleDesignFolderCover}
              onAssignDesignToFolder={handleAssignDesignToFolder}
              onSetDesignFolderCategory={handleSetDesignFolderCategory}
              onSetDesignFolderGarments={handleSetDesignFolderGarments}
              customWorkGallery={customWorkGallery}
              onAddCustomWork={handleAddCustomWork}
              onRemoveCustomWork={handleRemoveCustomWork}
              onAddCategory={handleAddCategory}
              onRenameCategory={handleRenameCategory}
              onDeleteCategory={handleDeleteCategory}
              onAddGroup={handleAddGroup}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
              onSaveProduct={handleSaveProduct}
              onSaveProductVerbose={handleSaveProductVerbose}
              onSaveProductsBulk={handleSaveProductsBulk}
              onDeleteProduct={handleDeleteProduct}
              onQuickRestock={handleQuickRestock}
              jumpTo={adminTabRequest}
              onToggleOrderStatus={handleToggleOrderStatus}
              onUpdateTracking={handleUpdateTracking}
              onSetLocalStatus={handleSetLocalStatus}
              onSetLocalTracking={handleSetLocalTracking}
              onApplyDiscount={handleApplyDiscount}
              onRequestReview={handleRequestReview}
              onBulkComplete={handleBulkComplete}
              onBulkArchive={handleBulkArchive}
              onBulkDelete={handleBulkDelete}
              onSaveReview={handleSaveReview}
              onDeleteReview={handleDeleteReview}
              onReorderReview={handleReorderReview}
              onSaveSettings={handleSaveSettings}
              onLogout={handleLogoutCustomer}
            />
          ) : (
            <AccountPage
              customer={customer}
              onRegister={handleRegisterCustomer}
              onLogin={handleLoginCustomer}
              onLogout={handleLogoutCustomer}
              onVerifyEmail={handleVerifyEmail}
              onResendVerification={handleResendVerification}
              onRequestPasswordReset={handleRequestPasswordReset}
              onResetPassword={handleResetPassword}
              settings={settings}
              registerIntent={registerIntent}
              initialResetEmail={resetDeepLinkEmail}
              initialResetCode={resetDeepLinkCode}
            />
          )
        )}

        {page === "home" && <FaqSection settings={settings} />}
        {!(page === "cuenta" && effectiveAdminView) && <ContactSection settings={settings} />}
      </main>

      <Footer settings={settings} />
      <SignupPromoPopup settings={settings} customer={customer} page={page} onSignup={openSignup} />
      {!(page === "cuenta" && effectiveAdminView) && (
        <RewardsWidget
          settings={settings}
          customer={customer}
          onLogin={() => openSignup("", "login")}
          onRedeem={handleRedeemReward}
          liftForMobileBar={cart.length > 0 && !cartOpen}
          whatsappVisible={!!(settings.whatsappFloatEnabled && settings.whatsappNumber)}
        />
      )}
      <WhatsAppFloat liftForMobileBar={cart.length > 0 && !cartOpen} whatsappNumber={settings.whatsappNumber} enabled={settings.whatsappFloatEnabled} />
      {cart.length > 0 && !cartOpen && (
        <MobileCartBar count={cartCount} total={cart.reduce((s, it) => s + it.qty * it.unitPrice, 0)} onOpen={() => setCartOpen(true)} />
      )}

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          allProducts={sellableProducts}
          settings={settings}
          onClose={() => setSelectedProduct(null)}
          onSwitchProduct={setSelectedProduct}
          onAddToCart={handleAddToCart}
          favorites={customer?.favorites}
          onToggleFavorite={handleToggleFavorite}
          reviews={reviews}
          onGoHome={() => { setSelectedProduct(null); setPage("home"); }}
          onGoCatalog={() => { setSelectedProduct(null); setPage("catalog"); }}
          onView={handleTrackProductView}
        />
      )}

      {cartOpen && (
        <CartDrawer
          cart={cart}
          onClose={() => setCartOpen(false)}
          onUpdateQty={handleUpdateQty}
          onRemove={handleRemove}
          onCheckout={handleCheckout}
          customerName={customerName} setCustomerName={setCustomerName}
          customerPhone={customerPhone} setCustomerPhone={setCustomerPhone}
          customerEmail={customerEmail} setCustomerEmail={setCustomerEmail}
          comment={comment} setComment={setComment}
          deliveryMethod={deliveryMethod} setDeliveryMethod={setDeliveryMethod}
          address={address} setAddress={setAddress}
          settings={settings}
          sending={sending}
          customer={customer}
        />
      )}

      {confirmedOrderId && <OrderConfirm orderId={confirmedOrderId} isLocal={confirmedIsLocal} hasCustom={confirmedHasCustom} whatsappText={confirmedWhatsappText} whatsappNumber={settings.whatsappNumber} onClose={() => { setConfirmedOrderId(null); setConfirmedWhatsappText(null); }} />}
    </div>
  );
}
