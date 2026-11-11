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

test("analyze-product response disables caching", async () => {
  const res = response();
  await analyzeHandler({ method: "GET" }, res);
  assert.equal(res.headers["cache-control"], "no-store, max-age=0");
});

test("analyze-product hides provider errors and keeps rate limit messaging", async () => {
  const oldGemini = process.env.GEMINI_API_KEY;
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  const oldFetch = globalThis.fetch;
  const oldError = console.error;
  process.env.GEMINI_API_KEY = "test-only";
  delete process.env.ANTHROPIC_API_KEY;
  console.error = () => {};
  try {
    for (const status of [403, 429]) {
      globalThis.fetch = async () => ({
        ok: false, status,
        json: async () => ({ error: { message: "provider secret diagnostic" } }),
      });
      const res = response();
      await analyzeHandler({ method: "POST", body: {
        image: "data:image/png;base64,aGVsbG8=",
        categories: [],
      } }, res);
      assert.equal(res.statusCode, 502);
      assert.equal(JSON.stringify(res.body).includes("provider secret diagnostic"), false);
      if (status === 429) assert.match(res.body.error, /límite gratuito/);
    }
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldError;
    if (oldGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldGemini;
    if (oldAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = oldAnthropic;
  }
});

test("AI-generated product fields are trimmed and length-limited", async () => {
  const oldGemini = process.env.GEMINI_API_KEY;
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-only";
  delete process.env.ANTHROPIC_API_KEY;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      name: " " + "N".repeat(250),
      category: " " + "C".repeat(150),
      description: " " + "D".repeat(1200),
    }) }] } }] }),
  });
  try {
    const res = response();
    await analyzeHandler({ method: "POST", body: {
      image: "data:image/png;base64,aGVsbG8=", categories: [],
    } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.name.length, 120);
    assert.equal(res.body.category.length, 80);
    assert.equal(res.body.description.length, 600);
    assert.equal(res.body.name.startsWith(" "), false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldGemini;
    if (oldAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = oldAnthropic;
  }
});

test("AI analyzer rejects JSON null and array results gracefully", async () => {
  const oldGemini = process.env.GEMINI_API_KEY;
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-only";
  delete process.env.ANTHROPIC_API_KEY;
  try {
    for (const payload of ["null", "[]", '"hello"']) {
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: payload }] } }] }),
      });
      const res = response();
      await analyzeHandler({ method: "POST", body: {
        image: "data:image/png;base64,aGVsbG8=", categories: [],
      } }, res);
      assert.equal(res.statusCode, 502);
      assert.match(res.body.error, /interpretar/);
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldGemini;
    if (oldAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = oldAnthropic;
  }
});

test("outbound provider requests have a finite timeout", async () => {
  const oldResend = process.env.RESEND_API_KEY;
  const oldGemini = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-only";
  process.env.GEMINI_API_KEY = "test-only";
  const observed = [];
  globalThis.fetch = async (_url, options) => {
    observed.push(options.signal);
    return { ok: true, json: async () => ({
      id: "test",
      candidates: [{ content: { parts: [{ text: '{"name":"Camiseta","category":"Ropa","description":"Descripción"}' }] } }],
    }) };
  };
  try {
    const emailRes = response();
    await emailHandler({ method: "POST", body: {
      to: "client@example.com", subject: "Pedido", html: "<p>Pedido</p>",
    } }, emailRes);
    assert.equal(emailRes.statusCode, 200);
    const verifyRes = response();
    await verifyHandler({ method: "POST", body: {
      action: "send", email: "client@example.com",
    } }, verifyRes);
    assert.equal(verifyRes.statusCode, 200);
    const aiRes = response();
    await analyzeHandler({ method: "POST", body: {
      image: "data:image/png;base64,aGVsbG8=", categories: [],
    } }, aiRes);
    assert.equal(aiRes.statusCode, 200);
    assert.equal(observed.length, 3);
    for (const signal of observed) {
      assert.ok(signal instanceof AbortSignal);
      assert.equal(signal.aborted, false);
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldResend;
    if (oldGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldGemini;
  }
});
