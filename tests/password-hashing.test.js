import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("customer password hashing never falls back to plaintext", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const start = app.indexOf("async function hashPassword(pw)");
  const end = app.indexOf("\nfunction normalizeEmail", start);
  assert.ok(start >= 0 && end > start);
  const fn = app.slice(start, end);
  assert.match(fn, /crypto\.subtle\.digest\("SHA-256"/);
  assert.doesNotMatch(fn, /return\s+pw\s*;/);
  assert.match(fn, /throw new Error/);
});
