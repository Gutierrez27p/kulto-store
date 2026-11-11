// Vercel serverless function. Runs on the server, never in the browser, so
// the API key stays secret. Set the key in Vercel's Environment Variables
// (Project -> Settings -> Environment Variables) — do NOT prefix it with VITE_.
//
// Opción GRATIS: GEMINI_API_KEY (clave gratuita en https://aistudio.google.com).
// Opción de pago: ANTHROPIC_API_KEY (https://console.anthropic.com).
// Si están las dos, se usa Gemini (gratis). Opcional: GEMINI_MODEL para
// cambiar el modelo si Google renombra el actual.

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!geminiKey && !apiKey) {
    res.status(500).json({
      error: "Falta configurar GEMINI_API_KEY (gratis) o ANTHROPIC_API_KEY en el servidor.",
    });
    return;
  }

  try {
    const { image, categories } = req.body || {};
    if (!image || typeof image !== "string") {
      res.status(400).json({ error: "Falta la imagen." });
      return;
    }

    const match = image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) {
      res.status(400).json({ error: "La imagen no tiene un formato válido." });
      return;
    }
    if (image.length > 12_000_000) {
      res.status(413).json({ error: "La imagen es demasiado grande." });
      return;
    }
    const mediaType = match[1];
    if (match[2].length % 4 !== 0) {
      res.status(400).json({ error: "La imagen base64 no es válida." });
      return;
    }
    const base64Data = match[2];

    const categoryList = Array.isArray(categories)
      ? categories.filter((c) => typeof c === "string").slice(0, 40).map((c) => c.slice(0, 80))
      : [];
    const prompt =
      "Estás ayudando a cargar un producto en Kulto, una tienda online de ropa y accesorios estampados/sublimados. " +
      "Mirá la foto y respondé ÚNICAMENTE un objeto JSON (sin texto adicional, sin backticks, sin markdown) con esta forma exacta:\n" +
      '{"name": "nombre corto y atractivo del producto en español, sin la marca", ' +
      '"category": "una categoría para este producto: usá una de estas si encaja bien (' +
      categoryList.join(", ") +
      "), o proponé una nueva breve en español si ninguna encaja\", " +
      '"description": "una descripción breve de 1 a 2 frases en español: tipo de prenda, estilo, posible material o corte"}\n' +
      "Si la imagen no muestra claramente un producto de ropa o accesorio, hacé tu mejor estimación igual.";

    const parseAndReply = (text) => {
      const clean = String(text || "").trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch {
        res.status(502).json({ error: "No se pudo interpretar la respuesta de la IA." });
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        res.status(502).json({ error: "No se pudo interpretar la respuesta de la IA." });
        return;
      }
      res.status(200).json({
        name: typeof parsed.name === "string" ? parsed.name.trim().slice(0, 120) : "",
        category: typeof parsed.category === "string" ? parsed.category.trim().slice(0, 80) : "",
        description: typeof parsed.description === "string" ? parsed.description.trim().slice(0, 600) : "",
      });
    };

    if (geminiKey) {
      const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
      const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        signal: AbortSignal.timeout(25_000),
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mediaType, data: base64Data } }, { text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 600 },
        }),
      });
      const gData = await gRes.json().catch(() => ({}));
      if (!gRes.ok) {
        console.error("Error de Gemini:", gRes.status);
        res.status(502).json({ error: gRes.status === 429 ? "Se alcanzó el límite gratuito por ahora. Probá en un minuto." : "La IA no pudo procesar la imagen." });
        return;
      }
      const gText = (gData.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      parseAndReply(gText);
      return;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(25_000),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5-5",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Error del proveedor de IA:", response.status);
      res.status(502).json({ error: "La IA no pudo procesar la imagen." });
      return;
    }

    const text = (data.content || []).map((c) => c.text || "").join("");
    parseAndReply(text);
  } catch (err) {
    res.status(500).json({ error: "Error inesperado analizando la imagen." });
  }
}
