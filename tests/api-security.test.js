import test from "node:test";
import assert from "node:assert/strict";
import emailHandler from "../api/send-email.js";
import verifyHandler from "../api/verify-email.js";
import analyzeHandler from "../api/analyze-product.js";

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; return this; },
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

test("analyze-product rejects malformed image before contacting AI provider", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-only";
  globalThis.fetch = () => { throw Error("Must not call AI"); };
  try {
    const res = response();
    await analyzeHandler({ method: "POST", body: { image: "data:text/html;base64,SGVsbG8=", categories: [] } }, res);
    assert.equal(res.statusCode, 400);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("analyze-product rejects malformed base64 without contacting AI provider", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-only";
  globalThis.fetch = () => { throw Error("Must not call AI"); };
  try {
    const res = response();
    await analyzeHandler({ method: "POST", body: { image: "data:image/png;base64,AAAAA", categories: [] } }, res);
    assert.equal(res.statusCode, 400);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("verify-email rejects malformed signature without contacting provider", async () => {
  const oldKey = process.env.RESEND_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-only";
  globalThis.fetch = () => { throw Error("Must not send"); };
  try {
    const res = response();
    await verifyHandler({ method: "POST", body: {
      action: "check", email: "client@example.com", code: "123456",
      token: String(Date.now() + 60_000) + ".bad-signature",
    } }, res);
    assert.equal(res.statusCode, 400);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
  }
});

test("verify-email strips control characters from the store name in outgoing subject", async () => {
  const oldKey = process.env.RESEND_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-only";
  let outgoing;
  globalThis.fetch = async (_url, opts) => {
    outgoing = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ id: "test" }) };
  };
  try {
    const res = response();
    await verifyHandler({ method: "POST", body: {
      action: "send", email: "client@example.com", storeName: "Kulto" + String.fromCharCode(13, 10) + "Bcc: attacker@example.com",
    } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(outgoing);
    assert.equal(outgoing.subject.includes(String.fromCharCode(13)), false);
    assert.equal(outgoing.subject.includes(String.fromCharCode(10)), false);
    assert.match(outgoing.html, /Bcc: attacker@example.com/i);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
  }
});

test("email endpoints explicitly prevent caching sensitive responses", async () => {
  for (const handler of [emailHandler, verifyHandler]) {
    const res = response();
    await handler({ method: "GET" }, res);
    assert.equal(res.headers["cache-control"], "no-store, max-age=0");
  }
});

test("send-email rejects CRLF injection in subject without contacting provider", async () => {
  const oldKey = process.env.RESEND_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-only";
  globalThis.fetch = () => { throw Error("Must not send"); };
  try {
    const res = response();
    await emailHandler({ method: "POST", body: {
      to: "client@example.com",
      subject: "Compra" + String.fromCharCode(13, 10) + "Bcc: attacker@example.com",
      html: "<p>Pedido</p>",
    } }, res);
    assert.equal(res.statusCode, 400);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
  }
});

test("email APIs never expose provider error details to clients", async () => {
  const oldKey = process.env.RESEND_API_KEY;
  const oldFetch = globalThis.fetch;
  const oldError = console.error;
  process.env.RESEND_API_KEY = "test-only";
  globalThis.fetch = async () => ({
    ok: false, status: 403,
    json: async () => ({ message: "sensitive provider detail" }),
  });
  console.error = () => {};
  try {
    for (const [handler, body] of [
      [emailHandler, { to: "client@example.com", subject: "Pedido", html: "<p>Pedido</p>" }],
      [verifyHandler, { action: "send", email: "client@example.com" }],
    ]) {
      const res = response();
      await handler({ method: "POST", body }, res);
      assert.equal(res.statusCode, 502);
      assert.equal(JSON.stringify(res.body).includes("sensitive provider detail"), false);
    }
  } finally {
    console.error = oldError;
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
  }
});
