import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import {
  buildBroadcastIdempotencyKey,
  processCommunicationQueue,
  queueBroadcastCampaign,
  sendCommunicationEmail,
} from "@/lib/server/communications-service";

function createSupabaseQueueMock(rows: Array<Record<string, unknown>>) {
  const campaignUpdates: Array<Record<string, unknown>> = [];

  return {
    campaignUpdates,
    from(table: string) {
      if (table === "communication_logs") {
        const context: {
          mode: "select" | "update";
          filters: Record<string, unknown>;
          updatePayload: Record<string, unknown> | null;
          head: boolean;
        } = {
          mode: "select",
          filters: {},
          updatePayload: null,
          head: false,
        };

        const builder = {
          select(_columns?: string, options?: { count?: string; head?: boolean }) {
            context.head = Boolean(options?.head);
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
          in(column: string, values: unknown[]) {
            context.filters[column] = values;
            return builder;
          },
          order() {
            return builder;
          },
          limit(limit: number) {
            if (context.mode !== "select") {
              return Promise.resolve({ data: null, error: null });
            }

            let selected = rows;
            if (context.filters.status) {
              selected = selected.filter((row) => row.status === context.filters.status);
            }
            if (Array.isArray(context.filters.application_id)) {
              selected = selected.filter((row) =>
                (context.filters.application_id as unknown[]).includes(row.application_id),
              );
            }
            return Promise.resolve({ data: selected.slice(0, limit), error: null });
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
          then(resolve: (value: { data: unknown; count?: number; error: null }) => void) {
            if (context.mode === "update") {
              const row = rows.find((item) => item.id === context.filters.id);
              if (row) {
                Object.assign(row, context.updatePayload ?? {});
              }
              resolve({ data: null, error: null });
              return;
            }

            let selected = rows;
            if (context.filters.campaign_id) {
              selected = selected.filter((row) => row.campaign_id === context.filters.campaign_id);
            }
            resolve({
              data: context.head ? null : selected,
              count: selected.length,
              error: null,
            });
          },
        };

        return builder;
      }

      if (table === "communication_campaigns") {
        return {
          update(payload: Record<string, unknown>) {
            return {
              eq(_column: string, value: unknown) {
                campaignUpdates.push({
                  id: value,
                  ...payload,
                });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function createBroadcastSupabaseMock({
  applications,
  profiles,
  existingCampaign = null,
}: {
  applications: Array<Record<string, unknown>>;
  profiles: Array<Record<string, unknown>>;
  existingCampaign?: Record<string, unknown> | null;
}) {
  const insertedLogs: Array<Record<string, unknown>> = [];
  const insertedCampaigns: Array<Record<string, unknown>> = [];

  return {
    insertedLogs,
    insertedCampaigns,
    from(table: string) {
      if (table === "applications") {
        const filters: Record<string, unknown> = {};
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: unknown) {
            filters[column] = value;
            return builder;
          },
          then(resolve: (value: { data: unknown; error: null }) => void) {
            let rows = applications;
            if (filters.cycle_id) {
              rows = rows.filter((row) => row.cycle_id === filters.cycle_id);
            }
            if (filters.stage_code) {
              rows = rows.filter((row) => row.stage_code === filters.stage_code);
            }
            if (filters.status) {
              rows = rows.filter((row) => row.status === filters.status);
            }
            resolve({ data: rows, error: null });
          },
        };
        return builder;
      }

      if (table === "profiles") {
        return {
          select() {
            return {
              in(_column: string, values: unknown[]) {
                return Promise.resolve({
                  data: profiles.filter((profile) => values.includes(profile.id)),
                  error: null,
                });
              },
            };
          },
        };
      }

      if (table === "communication_campaigns") {
        const filters: Record<string, unknown> = {};
        return {
          select() {
            return {
              eq(column: string, value: unknown) {
                filters[column] = value;
                return {
                  maybeSingle() {
                    if (
                      filters.idempotency_key &&
                      existingCampaign &&
                      existingCampaign.idempotency_key === filters.idempotency_key
                    ) {
                      return Promise.resolve({ data: existingCampaign, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                  },
                };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            insertedCampaigns.push(payload);
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: {
                        id: "campaign-new",
                        created_at: "2026-01-02T00:00:00.000Z",
                        sent_at: null,
                        status: "queued",
                        ...payload,
                      },
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "communication_logs") {
        return {
          select() {
            return {
              eq(_column: string, value: unknown) {
                return Promise.resolve({
                  data: null,
                  count: existingCampaign?.id === value ? 2 : 0,
                  error: null,
                });
              },
            };
          },
          insert(payload: Array<Record<string, unknown>>) {
            insertedLogs.push(...payload);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "cycles") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: { name: "Proceso UWC 2026" },
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildBroadcastIdempotencyKey", () => {
  it("returns a compact stable hash for the same campaign payload", () => {
    const referenceTime = new Date("2026-03-03T08:30:00.000Z");
    const a = buildBroadcastIdempotencyKey({
      actorId: "admin-1",
      cycleId: "cycle-1",
      name: "Campaña",
      subject: "Asunto",
      bodyTemplate: "Hola {{full_name}}".repeat(100),
      stageCode: "documents",
      status: "submitted",
      search: "maria@example.com",
      recipientApplicationIds: ["app-1", "app-2"],
      referenceTime,
    });
    const b = buildBroadcastIdempotencyKey({
      actorId: "admin-1",
      cycleId: "cycle-1",
      name: "Campaña",
      subject: "Asunto",
      bodyTemplate: "Hola {{full_name}}".repeat(100),
      stageCode: "documents",
      status: "submitted",
      search: "maria@example.com",
      recipientApplicationIds: ["app-2", "app-1"],
      referenceTime,
    });

    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("changes when the recipient audience changes", () => {
    const referenceTime = new Date("2026-03-03T08:30:00.000Z");
    const submittedAudienceKey = buildBroadcastIdempotencyKey({
      actorId: "admin-1",
      cycleId: "cycle-1",
      name: "Campaña",
      subject: "Asunto",
      bodyTemplate: "Hola {{full_name}}",
      recipientApplicationIds: ["app-1"],
      referenceTime,
    });
    const expandedAudienceKey = buildBroadcastIdempotencyKey({
      actorId: "admin-1",
      cycleId: "cycle-1",
      name: "Campaña",
      subject: "Asunto",
      bodyTemplate: "Hola {{full_name}}",
      recipientApplicationIds: ["app-1", "app-2"],
      referenceTime,
    });

    expect(submittedAudienceKey).not.toBe(expandedAudienceKey);
  });
});

describe("sendCommunicationEmail", () => {
  it("throws AppError when email provider env is missing", async () => {
    vi.stubEnv("GOOGLE_GMAIL_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_GMAIL_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_GMAIL_REFRESH_TOKEN", "");
    vi.stubEnv("GOOGLE_GMAIL_SENDER_EMAIL", "");

    await expect(
      sendCommunicationEmail({
        id: "comm-1",
        application_id: "app-1",
        campaign_id: null,
        template_key: "documents.stage_result",
        trigger_event: "stage_result",
        subject: "Resultado",
        body: "Hola",
        automation_template_id: null,
        recipient_email: "applicant@uwcperu.org",
        status: "queued",
        error_message: null,
        idempotency_key: null,
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

  it("sends email via Gmail API and returns provider id", async () => {
    vi.stubEnv("GOOGLE_GMAIL_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_GMAIL_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_GMAIL_REFRESH_TOKEN", "refresh-token");
    vi.stubEnv("GOOGLE_GMAIL_SENDER_EMAIL", "informes@pe.uwc.org");

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "gmail_123" }), { status: 200 }),
      );

    const result = await sendCommunicationEmail({
      id: "comm-1",
      application_id: "app-1",
      campaign_id: null,
      template_key: "documents.stage_result",
      trigger_event: "stage_result",
      subject: "Resultado",
      body: "Hola",
      automation_template_id: null,
      recipient_email: "applicant@uwcperu.org",
      status: "queued",
      error_message: null,
      idempotency_key: null,
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
      providerMessageId: "gmail_123",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });
});

describe("queueBroadcastCampaign", () => {
  it("returns an existing campaign when the idempotency key already exists", async () => {
    const supabase = createBroadcastSupabaseMock({
      applications: [
        {
          id: "app-1",
          applicant_id: "profile-1",
          status: "submitted",
          stage_code: "documents",
          cycle_id: "cycle-1",
        },
      ],
      profiles: [
        {
          id: "profile-1",
          email: "maria@example.com",
          full_name: "Maria Demo",
        },
      ],
      existingCampaign: {
        id: "campaign-existing",
        idempotency_key: "same-key",
        name: "Campaña existente",
        subject: "Asunto",
        status: "queued",
        created_at: "2026-01-02T00:00:00.000Z",
        sent_at: null,
      },
    });

    const result = await queueBroadcastCampaign({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      input: {
        actorId: "admin-1",
        name: "Campaña existente",
        subject: "Asunto",
        bodyTemplate: "Hola {{full_name}}",
        recipientFilter: {
          cycleId: "cycle-1",
          stageCode: "documents",
        },
        idempotencyKey: "same-key",
      },
    });

    expect(result.deduplicated).toBe(true);
    expect(result.campaign?.id).toBe("campaign-existing");
    expect(result.recipientCount).toBe(1);
  });

  it("derives an idempotency key from the resolved audience when one is not provided", async () => {
    const supabase = createBroadcastSupabaseMock({
      applications: [
        {
          id: "app-1",
          applicant_id: "profile-1",
          status: "submitted",
          stage_code: "documents",
          cycle_id: "cycle-1",
        },
      ],
      profiles: [
        {
          id: "profile-1",
          email: "maria@example.com",
          full_name: "Maria Demo",
        },
      ],
    });

    const result = await queueBroadcastCampaign({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      input: {
        actorId: "admin-1",
        name: "Campaña nueva",
        subject: "Asunto",
        bodyTemplate: "Hola {{full_name}}",
        recipientFilter: {
          cycleId: "cycle-1",
          stageCode: "documents",
        },
      },
    });

    expect(result.deduplicated).toBe(false);
    expect(supabase.insertedCampaigns[0]?.idempotency_key).toHaveLength(64);
    expect(supabase.insertedLogs[0]?.idempotency_key).toBe(supabase.insertedCampaigns[0]?.idempotency_key);
  });

  it("throws when a non-dry-run campaign has zero recipients", async () => {
    const supabase = createBroadcastSupabaseMock({
      applications: [],
      profiles: [],
    });

    await expect(
      queueBroadcastCampaign({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        input: {
          actorId: "admin-1",
          name: "Campaña vacía",
          subject: "Asunto",
          bodyTemplate: "Hola {{full_name}}",
          recipientFilter: {
            cycleId: "cycle-1",
          },
          idempotencyKey: "empty-key",
        },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("processCommunicationQueue", () => {
  it("processes queued rows, updates delivery statuses, and rolls up campaign status", async () => {
    const rows = [
      {
        id: "comm-1",
        application_id: "app-1",
        campaign_id: "campaign-1",
        template_key: "documents.stage_result",
        trigger_event: "stage_result",
        subject: "A",
        body: "B",
        automation_template_id: null,
        recipient_email: "ok@uwcperu.org",
        status: "queued",
        error_message: null,
        idempotency_key: null,
        sent_by: "admin-1",
        attempt_count: 0,
        last_attempt_at: null,
        delivered_at: null,
        provider_message_id: null,
        is_applicant_visible: true,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "comm-2",
        application_id: "app-2",
        campaign_id: "campaign-1",
        template_key: "documents.stage_result",
        trigger_event: "stage_result",
        subject: "A",
        body: "B",
        automation_template_id: null,
        recipient_email: "bad@uwcperu.org",
        status: "queued",
        error_message: null,
        idempotency_key: null,
        sent_by: "admin-1",
        attempt_count: 1,
        last_attempt_at: null,
        delivered_at: null,
        provider_message_id: null,
        is_applicant_visible: true,
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
    expect(supabase.campaignUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "campaign-1",
          status: "partial_failure",
        }),
      ]),
    );
  });
});
