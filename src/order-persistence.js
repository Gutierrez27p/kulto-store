// Legacy Supabase KV checkout storage. This helper prevents a failed read
// from overwriting the existing order index and allows retrying the same
// order without duplicating its index entry.
// Not an atomic transaction: production migration must move this server-side.
export async function saveOrderWithIndex(order, { writeValue, readIndex }) {
  if (!order || typeof order.id !== "string" || !/^KULTO-[A-Z0-9-]{6,50}$/.test(order.id)) {
    throw new Error("Identificador de pedido inválido.");
  }
  if (typeof writeValue !== "function" || typeof readIndex !== "function") {
    throw new TypeError("Se necesitan funciones de lectura y escritura.");
  }

  const saved = await writeValue(`kulto:order:${order.id}`, JSON.stringify(order));
  if (!saved) throw new Error("No se pudo guardar el pedido.");

  const index = await readIndex();
  if (!index || index.ok !== true) {
    throw new Error("No se pudo consultar el índice de pedidos.");
  }

  let ids = [];
  if (index.value != null) {
    try {
      ids = JSON.parse(index.value);
    } catch {
      throw new Error("El índice de pedidos no se pudo interpretar.");
    }
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      throw new Error("El índice de pedidos no tiene un formato válido.");
    }
  }

  if (!ids.includes(order.id)) ids.unshift(order.id);
  const indexed = await writeValue("kulto:order-index", JSON.stringify(ids));
  if (!indexed) throw new Error("No se pudo actualizar el índice de pedidos.");
  return true;
}

// Generate harder-to-guess references for new orders. Old references
// continue to work because lookup treats IDs as opaque strings.
export function generateOrderId(now = new Date()) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Este navegador no permite crear referencias de pedido seguras.");
  }
  const day = now.toISOString().slice(2, 10).replace(/-/g, "");
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `KULTO-${day}-${suffix}`;
}
