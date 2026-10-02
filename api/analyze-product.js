// Vercel serverless function. Runs on the server, never in the browser, so
// the Anthropic API key stays secret. Set ANTHROPIC_API_KEY in Vercel's
// Environment Variables (Project -> Settings -> Environment Variables) —
// do NOT prefix it with VITE_, or it would be bundled into the public site.
//
// Get a key at https://console.anthropic.com (this is a paid API — each
// call costs a fraction of a cent, but it is not free).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Falta configurar ANTHROPIC_API_KEY en el servidor. Mirá el README para activarlo.",
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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
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

    const text = (data.content || []).map((c) => c.text || "").join("").trim();
    const clean = text.replace(/^```json/i, "").replace(/```$/, "").trim();

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
  } catch (err) {
    res.status(500).json({ error: "Error inesperado analizando la imagen." });
  }
}
