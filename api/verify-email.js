// Vercel serverless function. Confirma que el mail de quien compra es real:
// 1) "send": genera un código de 6 dígitos, se lo manda por mail y devuelve
//    una "firma" (token) que NO contiene el código — solo sirve para comprobarlo.
// 2) "check": recibe mail + código + token y responde si el código es el
//    correcto (y no venció). El código nunca viaja hacia el navegador, así que
//    no se puede leer desde la web: solo lo ve quien recibe el mail.
//
// No necesita configurar nada nuevo: usa RESEND_API_KEY (ya configurada para
// los demás mails) para firmar los códigos. Opcional: VERIFY_SECRET para usar
// una clave de firma propia.
import crypto from "crypto";

const TTL_MS = 10 * 60 * 1000; // el código vale 10 minutos

function secret() {
  return "kulto-verify:" + (process.env.VERIFY_SECRET || process.env.RESEND_API_KEY || "");
}
function sign(email, code, exp) {
  return crypto.createHmac("sha256", secret()).update(`${email}|${code}|${exp}`).digest("hex");
}
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Falta configurar RESEND_API_KEY en el servidor." });
    return;
  }

  try {
    const { action, name, storeName } = req.body || {};
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      res.status(400).json({ error: "El mail no es válido." });
      return;
    }

    if (action === "send") {
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      const exp = Date.now() + TTL_MS;
      const token = `${exp}.${sign(email, code, exp)}`;
      const store = esc(storeName || "Kulto");
      const html = `
        <div style="background:#15131a;color:#f3efe6;font-family:Arial,sans-serif;padding:24px;">
          <div style="max-width:480px;margin:0 auto;background:#1e1b25;border-radius:16px;padding:28px;">
            <h2 style="margin:0 0 16px;letter-spacing:2px;">${store.toUpperCase()}</h2>
            <p style="margin:0 0 12px;">Hola${name ? " " + esc(name) : ""},</p>
            <p style="margin:0 0 20px;">Use este código para confirmar su compra:</p>
            <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#15131a;border-radius:12px;padding:18px;margin:0 0 20px;">${code}</p>
            <p style="margin:0;color:#a9a2b0;font-size:13px;">Vale por 10 minutos. Si usted no hizo este pedido, puede ignorar este mail.</p>
          </div>
        </div>`;
      const from = process.env.RESEND_FROM_EMAIL || "Kulto <onboarding@resend.dev>";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: email, subject: `Código para confirmar su pedido en ${storeName || "Kulto"}`, html }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        res.status(response.status).json({ error: data?.message || "No se pudo enviar el mail." });
        return;
      }
      res.status(200).json({ ok: true, token });
      return;
    }

    if (action === "check") {
      const { code, token } = req.body || {};
      const [expStr, sig] = String(token || "").split(".");
      const exp = Number(expStr);
      if (!exp || !sig || !/^\d{6}$/.test(String(code || "").trim())) {
        res.status(400).json({ ok: false, error: "Código inválido." });
        return;
      }
      if (Date.now() > exp) {
        res.status(200).json({ ok: false, error: "El código venció. Pida uno nuevo." });
        return;
      }
      const expected = sign(email, String(code).trim(), exp);
      const a = Buffer.from(expected);
      const b = Buffer.from(sig);
      const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      res.status(200).json(ok ? { ok: true } : { ok: false, error: "El código no es correcto." });
      return;
    }

    res.status(400).json({ error: "Acción no válida." });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Error verificando el mail." });
  }
}
