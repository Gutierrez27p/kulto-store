// Vercel serverless function. Runs on the server, never in the browser, so
// the API key stays secret. Set the key in Vercel's Environment Variables
// (Project -> Settings -> Environment Variables) — do NOT prefix it with VITE_.
//
// Opción GRATIS: GEMINI_API_KEY (clave gratuita en https://aistudio.google.com).
// Opción de pago: ANTHROPIC_API_KEY (https://console.anthropic.com).
// Si están las dos, se usa Gemini (gratis). Opcional: GEMINI_MODEL para
// cambiar el modelo si Google renombra el actual.

export default async function handler(req, res) {
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

    const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: "La imagen no tiene un formato válido." });
      return;
    }
    const mediaType = match[1];
    const base64Data = match[2];

    const categoryList = Array.isArray(categories) ? categories : [];
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
      res.status(200).json({
        name: typeof parsed.name === "string" ? parsed.name : "",
        category: typeof parsed.category === "string" ? parsed.category : "",
        description: typeof parsed.description === "string" ? parsed.description : "",
      });
    };

    if (geminiKey) {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mediaType, data: base64Data } }, { text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 600 },
        }),
      });
      const gData = await gRes.json().catch(() => ({}));
      if (!gRes.ok) {
        const msg = gData?.error?.message || "La IA no pudo procesar la imagen.";
        res.status(502).json({ error: gRes.status === 429 ? "Se alcanzó el límite gratuito por ahora. Probá en un minuto." : msg });
        return;
      }
      const gText = (gData.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      parseAndReply(gText);
      return;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
      res.status(502).json({ error: data?.error?.message || "La IA no pudo procesar la imagen." });
      return;
    }

    const text = (data.content || []).map((c) => c.text || "").join("");
    parseAndReply(text);
  } catch (err) {
    res.status(500).json({ error: "Error inesperado analizando la imagen." });
  }
}
