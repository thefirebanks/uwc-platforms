import { afterEach, describe, expect, it, vi } from "vitest";
import { listOcrTestRuns, runOcrTest } from "@/lib/server/ocr-testbed-service";

const runOcrCheckMock = vi.fn();

vi.mock("@/lib/server/ocr", () => ({
  DEFAULT_MODEL_ID: "gemini-flash",
  DEFAULT_OCR_MAX_TOKENS: 1600,
  runOcrCheck: (...args: unknown[]) => runOcrCheckMock(...args),
}));

afterEach(() => {
  vi.restoreAllMocks();
  runOcrCheckMock.mockReset();
});

describe("listOcrTestRuns", () => {
  it("returns an empty list when the OCR test table is unavailable", async () => {
    const builder = {
      select() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      eq() {
        return builder;
      },
      then(resolve: (value: { data: null; error: { code: string } }) => void) {
        resolve({
          data: null,
          error: { code: "PGRST205" },
        });
      },
    };

    const supabase = {
      from() {
        return builder;
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(listOcrTestRuns({ supabase: supabase as any, cycleId: "cycle-1" })).resolves.toEqual([]);
  });
});

describe("runOcrTest", () => {
  it("returns a synthetic run when persistence is unavailable after OCR succeeds", async () => {
    runOcrCheckMock.mockResolvedValue({
      summary: "Documento consistente",
      confidence: 0.88,
      rawResponse: {
        schemaValidation: { valid: true, errors: [] },
      },
    });

    const supabase = {
      storage: {
        from() {
          return {
            upload() {
              return Promise.resolve({ error: null });
            },
            createSignedUrl() {
              return Promise.resolve({
                data: { signedUrl: "https://example.com/file.pdf" },
                error: null,
              });
            },
          };
        },
      },
      from(table: string) {
        if (table !== "ocr_test_runs") {
          throw new Error(`Unexpected table ${table}`);
        }

        return {
          insert() {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: null,
                      error: { code: "PGRST205" },
                    });
                  },
                };
              },
            };
          },
        };
      },
    };

    const file = {
      name: "test.pdf",
      type: "application/pdf",
      async arrayBuffer() {
        return new TextEncoder().encode("doc").buffer;
      },
    } as File;

    const result = await runOcrTest({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      input: {
        cycleId: "cycle-1",
        stageCode: "documents",
        actorId: "admin-1",
        file,
        promptTemplate: "Prompt base",
        extractionInstructions: "Extraer hallazgos",
        strictSchema: true,
      },
    });

    expect(result.summary).toBe("Documento consistente");
    expect(result.raw_response).toEqual(
      expect.objectContaining({
        persistenceSkipped: true,
      }),
    );
    expect(result.file_name).toBe("test.pdf");
  });
});
