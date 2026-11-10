import test from "node:test";
import assert from "node:assert/strict";
import emailHandler from "../api/send-email.js";
import verifyHandler from "../api/verify-email.js";
import analyzeHandler from "../api/analyze-product.js";

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("send-email rejects unsupported methods", async () => {
  const res = response();
  await emailHandler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
});

test("verify-email rejects unsupported methods", async () => {
  const res = response();
  await verifyHandler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
});

test("analyze-product rejects unsupported methods", async () => {
  const res = response();
  await analyzeHandler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
});

test("send-email rejects invalid addresses without sending", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-only";
  globalThis.fetch = () => { throw Error("Must not send"); };
  try {
    const res = response();
    await emailHandler({ method: "POST", body: { to: "invalid", subject: "Hola", html: "<p>Hola</p>" } }, res);
    assert.equal(res.statusCode, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});

test("verify-email rejects invalid address without sending", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-only";
  try {
    const res = response();
    await verifyHandler({ method: "POST", body: { action: "send", email: "invalid" } }, res);
    assert.equal(res.statusCode, 400);
  } finally {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});
