import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeEmailHtml, secureSixDigitCode } from "../src/email-safety.js";

test("email HTML escapes customer content and dangerous attributes", () => {
  const raw = `<img src=x onerror="alert('x')">&`;
  assert.equal(escapeEmailHtml(raw), "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;");
  assert.equal(escapeEmailHtml(null), "");
  assert.equal(escapeEmailHtml(5), "5");
});

test("legacy six-digit codes use cryptographically strong randomness", () => {
  for (let i = 0; i < 50; i++) {
    const code = secureSixDigitCode();
    assert.match(code, /^[1-9][0-9]{5}$/);
    assert.ok(+code >= 100_000 && +code <= 999_999);
  }
});

test("reserved administrator email cannot be registered directly by visitors", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const start = app.indexOf("const handleRegisterCustomer =");
  const end = app.indexOf("const handleVerifyEmail =", start);
  assert.ok(start >= 0 && end > start);
  const registration = app.slice(start, end);
  assert.match(registration, /if \(norm === normalizeEmail\(ADMIN_EMAIL\)\)/);
  assert.match(registration, /Esta dirección está reservada/);
  assert.doesNotMatch(registration, /const adminRecord/);
  assert.doesNotMatch(registration, /emailVerified:\s*true/);
});

test("legacy account confirmation and reset use secure codes", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const flows = app.slice(app.indexOf("const issueAndSendVerification ="), app.indexOf("const handleLoginCustomer ="));
  assert.equal(flows.split("secureSixDigitCode()").length - 1, 2);
  assert.doesNotMatch(flows, /Math\.random\(\)/);
});

test("email templates escape contact, customer, and product fields", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const emails = app.slice(app.indexOf("function emailShell("), app.indexOf("// Calls the serverless function in /api/analyze-product.js"));
  for (const expression of [
    "escapeEmailHtml(storeName)", "escapeEmailHtml(data.name)",
    "escapeEmailHtml(data.email)", "escapeEmailHtml(data.subject)",
    "escapeEmailHtml(data.message)", "escapeEmailHtml(replyText)",
    "escapeEmailHtml(it.name)", "escapeEmailHtml(order.comment)",
    "escapeEmailHtml(formatAddress(order.address))",
  ]) assert.ok(emails.includes(expression), expression);
});

test("bulk order deletion has explicit confirmation, not a hardcoded admin PIN", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /ADMIN_PASSWORD/);
  const start = app.indexOf("function AdminOrders(");
  const end = app.indexOf("\nfunction ", start + 1);
  assert.ok(start >= 0 && end > start);
  const section = app.slice(start, end);
  assert.match(section, /BORRAR \$\{selectedInView\.length\}/);
  assert.match(section, /confirmación irreversible/);
});
