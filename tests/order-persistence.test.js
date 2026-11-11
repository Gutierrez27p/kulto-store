import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { saveOrderWithIndex, generateOrderId } from "../src/order-persistence.js";

const order = { id: "KULTO-261111-ABCD", total: 32.5, items: [{ sku: "ABC", qty: 1 }] };

function memoryStore(initial = {}) {
  const kv = new Map(Object.entries(initial));
  return {
    kv,
    writeValue: async (key, value) => { kv.set(key, value); return true; },
    readIndex: async () => ({ ok: true, value: kv.get("kulto:order-index") ?? null }),
  };
}

test("order is persisted and indexed with no duplicate entries on retry", async () => {
  const mem = memoryStore({ "kulto:order-index": JSON.stringify(["KULTO-250101-OLD"]) });
  await saveOrderWithIndex(order, mem);
  await saveOrderWithIndex(order, mem);
  assert.deepEqual(JSON.parse(mem.kv.get("kulto:order-index")), [
    order.id, "KULTO-250101-OLD",
  ]);
  assert.deepEqual(JSON.parse(mem.kv.get(`kulto:order:${order.id}`)), order);
});

test("first order initializes missing index without affecting other keys", async () => {
  const mem = memoryStore({ "kulto:customer-index": "[\"customer@example.com\"]" });
  assert.equal(await saveOrderWithIndex(order, mem), true);
  assert.deepEqual(JSON.parse(mem.kv.get("kulto:order-index")), [order.id]);
  assert.ok(mem.kv.has("kulto:customer-index"));
});

test("failed order writes are not treated as saved", async () => {
  let readCalled = false;
  await assert.rejects(
    saveOrderWithIndex(order, {
      writeValue: async () => false,
      readIndex: async () => { readCalled = true; return { ok: true, value: null }; },
    }),
    /guardar el pedido/
  );
  assert.equal(readCalled, false);
});

test("failed index reads never overwrite historical order IDs", async () => {
  const mem = memoryStore({ "kulto:order-index": JSON.stringify(["KULTO-250101-OLD"]) });
  mem.readIndex = async () => ({ ok: false, value: null });
  await assert.rejects(saveOrderWithIndex(order, mem), /consultar el índice/);
  assert.deepEqual(JSON.parse(mem.kv.get("kulto:order-index")), ["KULTO-250101-OLD"]);
});

test("invalid order index cannot be overwritten", async () => {
  const mem = memoryStore({ "kulto:order-index": "{broken" });
  await assert.rejects(saveOrderWithIndex(order, mem), /interpretar/);
  assert.equal(mem.kv.get("kulto:order-index"), "{broken");
});

test("a failed index write is surfaced to checkout for retry", async () => {
  const mem = memoryStore();
  const originalWrite = mem.writeValue;
  mem.writeValue = async (key, value) => key === "kulto:order-index" ? false : originalWrite(key, value);
  await assert.rejects(saveOrderWithIndex(order, mem), /actualizar el índice/);
});

test("checkout cannot silently succeed if both database and backup notification fail", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const begin = app.indexOf("const handleCheckout = async");
  const end = app.indexOf("const handleSaveProduct =", begin);
  assert.ok(begin > 0 && end > begin);
  const checkout = app.slice(begin, end);
  assert.match(checkout, /let orderSaved = false/);
  assert.match(checkout, /if \(!backup\.ok\)/);
  assert.match(checkout, /Tu carrito sigue intacto/);
  assert.ok(checkout.indexOf("if (!backup.ok)") < checkout.indexOf("setCart([])"));
});

test("new order IDs use unpredictable 48-bit hexadecimal suffixes", () => {
  const when = new Date("2026-11-11T12:00:00Z");
  const ids = new Set(Array.from({ length: 50 }, () => generateOrderId(when)));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^KULTO-261111-[A-F0-9]{12}$/);
});

test("checkout does not use Math.random to create order references", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const begin = app.indexOf("const handleCheckout = async");
  const end = app.indexOf("const handleSaveProduct =", begin);
  const checkout = app.slice(begin, end);
  assert.match(checkout, /generateOrderId\(\)/);
  assert.doesNotMatch(checkout, /Math\.random/);
});
