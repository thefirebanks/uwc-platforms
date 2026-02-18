import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { parseOcrModelOutput, runOcrCheck } from "@/lib/server/ocr";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parseOcrModelOutput", () => {
  it("parses plain JSON payload", () => {
    const parsed = parseOcrModelOutput('{"summary":"Documento legible","confidence":0.82}');

    expect(parsed.summary).toBe("Documento legible");
    expect(parsed.confidence).toBe(0.82);
  });

  it("falls back to text summary when JSON is invalid", () => {
    const parsed = parseOcrModelOutput("No JSON output");

    expect(parsed.summary).toBe("No JSON output");
    expect(parsed.confidence).toBe(0.6);
  });
});

describe("runOcrCheck", () => {
  it("throws AppError when GEMINI_API_KEY is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    await expect(runOcrCheck({ fileUrl: "https://example.com/file.pdf" })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("returns structured response from model output", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"summary":"DNI válido","confidence":0.91}' }],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await runOcrCheck({ fileUrl: "https://example.com/file.pdf" });

    expect(result.summary).toBe("DNI válido");
    expect(result.confidence).toBe(0.91);
    expect(result.rawResponse.provider).toBe("gemini-3-flash-preview");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("gemini-3-flash-preview:generateContent"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "test-key",
        }),
      }),
    );

  });
});
