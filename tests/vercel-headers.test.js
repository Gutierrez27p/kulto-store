import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Vercel serves essential security headers", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const headers = config.headers.find((item) => item.source === "/(.*)")?.headers || [];
  const lookup = new Map(headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(lookup.get("x-content-type-options"), "nosniff");
  assert.equal(lookup.get("x-frame-options"), "DENY");
  assert.equal(lookup.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(lookup.get("permissions-policy"), /camera=\(\)/);
});
