import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import {
  processCommunicationQueue,
  sendCommunicationEmail,
} from "@/lib/server/communications-service";

function createSupabaseQueueMock(rows: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      if (table !== "communication_logs") {
        throw new Error(`Unexpected table: ${table}`);
      }

      const context: {
        mode: "select" | "update";
        filters: Record<string, unknown>;
        updatePayload: Record<string, unknown> | null;
      } = {
        mode: "select",
        filters: {},
        updatePayload: null,
      };

      const builder = {
        select() {
          return builder;
        },
        update(payload: Record<string, unknown>) {
          context.mode = "update";
          context.updatePayload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          context.filters[column] = value;
          return builder;
        },
        order() {
          return builder;
        },
        async limit(limit: number) {
          if (context.mode !== "select") {
            return { data: null, error: null };
          }

          const selected = rows
            .filter((row) => row.status === context.filters.status)
            .slice(0, limit);
          return { data: selected, error: null };
        },
        async maybeSingle() {
          const row = rows.find((item) => item.id === context.filters.id);
          if (!row) {
            return { data: null, error: null };
          }

          if (context.filters.status && row.status !== context.filters.status) {
            return { data: null, error: null };
          }

          Object.assign(row, context.updatePayload ?? {});
          return { data: { id: row.id }, error: null };
        },
        then(resolve: (value: { error: null }) => void) {
          if (context.mode === "update") {
            const row = rows.find((item) => item.id === context.filters.id);
            if (row) {
              Object.assign(row, context.updatePayload ?? {});
            }
          }
          resolve({ error: null });
        },
      };

      return builder;
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendCommunicationEmail", () => {
  it("throws AppError when email provider env is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    await expect(
      sendCommunicationEmail({
        id: "comm-1",
        application_id: "app-1",
        template_key: "documents.stage_result",
        trigger_event: "stage_result",
        subject: "Resultado",
        body: "Hola",
        automation_template_id: null,
        recipient_email: "applicant@uwcperu.org",
        status: "queued",
        error_message: null,
        sent_by: "admin-1",
        attempt_count: 0,
        last_attempt_at: null,
        delivered_at: null,
        provider_message_id: null,
        is_applicant_visible: false,
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("sends email via Resend and returns provider id", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@uwcperu.org");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re_123" }), { status: 200 }),
    );

    const result = await sendCommunicationEmail({
      id: "comm-1",
      application_id: "app-1",
      template_key: "documents.stage_result",
      trigger_event: "stage_result",
      subject: "Resultado",
      body: "Hola",
      automation_template_id: null,
      recipient_email: "applicant@uwcperu.org",
      status: "queued",
      error_message: null,
      sent_by: "admin-1",
      attempt_count: 0,
      last_attempt_at: null,
      delivered_at: null,
      provider_message_id: null,
      is_applicant_visible: false,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toEqual({
      delivered: true,
      providerMessageId: "re_123",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("processCommunicationQueue", () => {
  it("processes queued rows and updates delivery statuses", async () => {
    const rows = [
      {
        id: "comm-1",
        application_id: "app-1",
        template_key: "documents.stage_result",
        trigger_event: "stage_result",
        subject: "A",
        body: "B",
        automation_template_id: null,
        recipient_email: "ok@uwcperu.org",
        status: "queued",
        error_message: null,
        sent_by: "admin-1",
        attempt_count: 0,
        last_attempt_at: null,
        delivered_at: null,
        provider_message_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "comm-2",
        application_id: "app-2",
        template_key: "documents.stage_result",
        trigger_event: "stage_result",
        subject: "A",
        body: "B",
        automation_template_id: null,
        recipient_email: "bad@uwcperu.org",
        status: "queued",
        error_message: null,
        sent_by: "admin-1",
        attempt_count: 1,
        last_attempt_at: null,
        delivered_at: null,
        provider_message_id: null,
        created_at: "2026-01-01T00:00:01.000Z",
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createSupabaseQueueMock(rows) as any;
    const result = await processCommunicationQueue({
      supabase,
      input: {
        targetStatus: "queued",
        limit: 30,
      },
      deliverEmail: async (communication) => {
        if (communication.recipient_email === "bad@uwcperu.org") {
          return {
            delivered: false,
            errorMessage: "Mailbox no disponible",
          };
        }

        return {
          delivered: true,
          providerMessageId: "re_mock_123",
        };
      },
    });

    expect(result.processed).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(rows[0]?.status).toBe("sent");
    expect(rows[1]?.status).toBe("failed");
    expect(rows[0]?.attempt_count).toBe(1);
    expect(rows[1]?.attempt_count).toBe(2);
  });
});
