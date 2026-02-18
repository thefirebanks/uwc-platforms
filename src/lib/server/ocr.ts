import { AppError } from "@/lib/errors/app-error";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function runOcrCheck({
  fileUrl,
}: {
  fileUrl: string;
}): Promise<{ summary: string; confidence: number }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new AppError({
      message: "Missing GEMINI_API_KEY",
      userMessage: "La validación OCR no está configurada todavía.",
      status: 400,
    });
  }

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Analiza este documento: ${fileUrl}. Devuelve un breve resumen y confianza entre 0 y 1.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    throw new AppError({
      message: "Gemini OCR request failed",
      userMessage: "No se pudo ejecutar la validación OCR por ahora.",
      status: 502,
      details: await response.text(),
    });
  }

  const body = await response.json();
  const summary =
    body?.candidates?.[0]?.content?.parts?.[0]?.text ??
    "OCR completado sin detalles estructurados.";

  return {
    summary,
    confidence: 0.75,
  };
}
