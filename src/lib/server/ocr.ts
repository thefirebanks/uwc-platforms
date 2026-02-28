import { AppError } from "@/lib/errors/app-error";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

const DEFAULT_OCR_PROMPT =
  "Analiza el documento y entrega una validación preliminar para comité. Resume hallazgos clave sobre legibilidad, coherencia y posibles señales de alteración.";

function clampConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function extractJsonCandidate(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // continue parsing
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return null;
}

export function parseOcrModelOutput(outputText: string) {
  const parsed = extractJsonCandidate(outputText);
  const parsedSummary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";
  const summaryFallback = outputText.trim();
  const summary =
    parsedSummary ||
    summaryFallback ||
    "OCR completado sin detalles estructurados.";

  return {
    summary,
    confidence:
      clampConfidence(parsed?.confidence) ??
      clampConfidence(parsed?.score) ??
      0.6,
    parsedJson: parsed,
  };
}

export async function runOcrCheck({
  fileUrl,
  promptTemplate,
}: {
  fileUrl: string;
  promptTemplate?: string | null;
}): Promise<{ summary: string; confidence: number; rawResponse: Record<string, unknown> }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new AppError({
      message: "Missing GEMINI_API_KEY",
      userMessage: "La validación OCR no está configurada todavía.",
      status: 400,
    });
  }

  const prompt = (promptTemplate?.trim() || DEFAULT_OCR_PROMPT).trim();

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Analiza este documento y evalúa si parece válido para etapa documental.",
                prompt,
                `URL temporal del archivo: ${fileUrl}`,
                "Responde SOLO JSON con este formato:",
                '{"summary":"resumen breve","confidence":0.0,"findings":["hallazgo 1","hallazgo 2"]}',
                "confidence debe ir entre 0 y 1.",
              ].join("\n"),
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

  const modelResponse = (await response.json()) as Record<string, unknown>;
  const outputText =
    (modelResponse?.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined)?.[0]
      ?.content?.parts?.map((part) => part.text ?? "")
      .join("\n")
      .trim() ?? "";

  const parsed = parseOcrModelOutput(outputText);

  return {
    summary: parsed.summary,
    confidence: parsed.confidence,
    rawResponse: {
      outputText,
      parsed: parsed.parsedJson,
      provider: "gemini-3-flash-preview",
      source: modelResponse,
    },
  };
}
