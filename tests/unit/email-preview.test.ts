import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { previewEmail, sendTestEmail } from "@/lib/server/communications-service";

type PreviewSupabase = Parameters<typeof previewEmail>[0]["supabase"];

/* ------------------------------------------------------------------ */
/*  Mock factory helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Returns a minimal Supabase stub whose `stage_automation_templates` table
 * resolves to the provided templateRow (or null to simulate not-found).
 */
function createPreviewSupabaseMock(templateRow: Record<string, unknown> | null) {
  return {
    from() {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        async maybeSingle() {
          return { data: templateRow, error: null };
        },
      };
      return builder;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                            */
/* ------------------------------------------------------------------ */

const TEMPLATE_ROW = {
  id: "tpl-1",
  stage_code: "documents",
  trigger_event: "stage_result",
  // renderTemplate uses {{double-brace}} syntax
  template_subject: "Hola {{full_name}} — {{cycle_name}}",
  template_body: "Tu solicitud para {{cycle_name}} está en la etapa {{stage_label}}.",
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
};

/* ------------------------------------------------------------------ */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ================================================================== */
describe("previewEmail", () => {
  it("renders subject and body with default sample values", async () => {
    const supabase = createPreviewSupabaseMock(TEMPLATE_ROW) as unknown as PreviewSupabase;

    const result = await previewEmail({
      supabase,
      input: { automationTemplateId: "tpl-1" },
    });

    // Template vars replaced with defaults
    expect(result.subject).toContain("Juan Pérez (ejemplo)");
    expect(result.subject).toContain("Proceso UWC 2026 (ejemplo)");
    expect(result.bodyText).toContain("Proceso UWC 2026 (ejemplo)");

    // HTML wrapper present
    expect(result.bodyHtml).toContain("<div");
    expect(result.bodyHtml).toContain("Proceso UWC 2026 (ejemplo)");
  });

  it("merges custom sampleValues over the default sample context", async () => {
    const supabase = createPreviewSupabaseMock(TEMPLATE_ROW) as unknown as PreviewSupabase;

    const result = await previewEmail({
      supabase,
      input: {
        automationTemplateId: "tpl-1",
        sampleValues: {
          full_name: "María García",
          cycle_name: "Proceso Custom 2025",
        },
      },
    });

    // Custom values override defaults
    expect(result.subject).toBe("Hola María García — Proceso Custom 2025");
    expect(result.bodyText).toContain("Proceso Custom 2025");
  });

  it("escapes HTML special characters in bodyHtml", async () => {
    const templateWithHtml = {
      ...TEMPLATE_ROW,
      template_body: "Hola <{{full_name}}> & bienvenido",
    };
    const supabase = createPreviewSupabaseMock(templateWithHtml) as unknown as PreviewSupabase;

    const result = await previewEmail({
      supabase,
      input: { automationTemplateId: "tpl-1" },
    });

    // Raw text should not be escaped
    expect(result.bodyText).toContain("<");
    // HTML output should have escaped angle brackets and ampersand
    expect(result.bodyHtml).toContain("&lt;");
    expect(result.bodyHtml).toContain("&amp;");
  });

  it("throws AppError(404) when the automation template is not found", async () => {
    const supabase = createPreviewSupabaseMock(null) as unknown as PreviewSupabase;

    await expect(
      previewEmail({ supabase, input: { automationTemplateId: "missing-id" } }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof AppError && (err as AppError).status === 404,
    );
  });
});

/* ================================================================== */
describe("sendTestEmail", () => {
  it("calls Resend API and returns providerMessageId on success", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@uwcperu.org");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re_test_abc" }), { status: 200 }),
    );

    const result = await sendTestEmail({
      recipientEmail: "admin@uwcperu.org",
      subject: "Resultado de evaluación",
      bodyText: "Has avanzado a la siguiente etapa.",
      bodyHtml: "<p>Has avanzado a la siguiente etapa.</p>",
    });

    expect(result.delivered).toBe(true);
    if (!result.delivered) throw new Error("Expected delivery to succeed");
    expect(result.providerMessageId).toBe("re_test_abc");

    // Verify the Resend API was called correctly
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");

    const body = JSON.parse((opts as RequestInit).body as string) as {
      subject: string;
      to: string[];
      from: string;
    };
    // Subject must have [TEST] prefix
    expect(body.subject).toMatch(/^\[TEST\]/);
    expect(body.subject).toContain("Resultado de evaluación");
    expect(body.to).toContain("admin@uwcperu.org");
    expect(body.from).toContain("noreply@uwcperu.org");
  });

  it("throws AppError when RESEND_API_KEY or RESEND_FROM_EMAIL are missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    await expect(
      sendTestEmail({
        recipientEmail: "admin@uwcperu.org",
        subject: "Test",
        bodyText: "Body",
        bodyHtml: "<p>Body</p>",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("returns delivered=false on non-OK HTTP response", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@uwcperu.org");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ name: "rate_limit_exceeded" }), { status: 429 }),
    );

    const result = await sendTestEmail({
      recipientEmail: "admin@uwcperu.org",
      subject: "Test",
      bodyText: "Body",
      bodyHtml: "<p>Body</p>",
    });

    expect(result.delivered).toBe(false);
    if (result.delivered) throw new Error("Expected delivery to fail");
    expect(result.errorMessage).toBeDefined();
  });

  it("returns delivered=false when Resend returns no message id", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@uwcperu.org");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      // 200 but no `id` field in payload
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const result = await sendTestEmail({
      recipientEmail: "admin@uwcperu.org",
      subject: "Test",
      bodyText: "Body",
      bodyHtml: "<p>Body</p>",
    });

    expect(result.delivered).toBe(false);
  });
});
