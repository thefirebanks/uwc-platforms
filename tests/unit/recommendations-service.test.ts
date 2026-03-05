import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssertApplicantCanEditCycle,
  mockSendEmail,
  mockGetSupabaseAdminClient,
} = vi.hoisted(() => ({
  mockAssertApplicantCanEditCycle: vi.fn(),
  mockSendEmail: vi.fn(),
  mockGetSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/application-service", () => ({
  assertApplicantCanEditCycle: mockAssertApplicantCanEditCycle,
}));

vi.mock("@/lib/server/email-provider", () => ({
  sendEmail: mockSendEmail,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: mockGetSupabaseAdminClient,
}));

import {
  upsertApplicantRecommendations,
  validateRecommendationPayload,
} from "@/lib/server/recommendations-service";

function createApplicantSupabase() {
  return {
    from(table: string) {
      if (table === "applications") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      id: "app-1",
                      applicant_id: "user-1",
                      cycle_id: "cycle-1",
                      payload: {},
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "cycles") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      name: "Proceso 2026",
                      stage1_close_at: null,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected applicant supabase table: ${table}`);
    },
  };
}

describe("validateRecommendationPayload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertApplicantCanEditCycle.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue({ delivered: true, provider: "gmail", messageId: "msg-1" });
    mockGetSupabaseAdminClient.mockReturnValue({
      from() {
        throw new Error("Admin client should not be used in this test");
      },
    });
  });

  const basePayload = {
    recommenderName: "Mariela Quispe",
    relationshipTitle: "Tutora de literatura",
    knownDuration: "2 años",
    strengths:
      "Es una estudiante disciplinada, curiosa y constante. Participa activamente y ayuda al grupo.",
    growthAreas:
      "Puede mejorar su manejo del tiempo en semanas de alta carga académica, aunque responde bien a feedback.",
    endorsement:
      "La recomiendo para el proceso por su compromiso, madurez y potencial para aportar a una comunidad diversa.",
    confirmsNoFamily: false,
  };

  it("requires non-family confirmation for friend recommender role", () => {
    const result = validateRecommendationPayload({
      role: "friend",
      payload: basePayload,
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.confirmsNoFamily).toContain("no tienes relación familiar");
  });

  it("accepts mentor payload without non-family confirmation", () => {
    const result = validateRecommendationPayload({
      role: "mentor",
      payload: basePayload,
    });

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("rejects short narrative answers", () => {
    const result = validateRecommendationPayload({
      role: "mentor",
      payload: {
        ...basePayload,
        strengths: "Buena",
      },
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.strengths).toBeTruthy();
  });
});

describe("upsertApplicantRecommendations", () => {
  it("rejects applicants registering their own email as a recommender before touching admin storage", async () => {
    await expect(
      upsertApplicantRecommendations({
        supabase: createApplicantSupabase() as never,
        applicationId: "app-1",
        applicantId: "user-1",
        applicantEmail: "applicant@example.com",
        recommenders: [
          { role: "mentor", email: " applicant@example.com " },
          { role: "friend", email: "friend@example.com" },
        ],
        origin: "https://uwc.test",
      }),
    ).rejects.toMatchObject({
      status: 400,
      userMessage:
        "No puedes registrarte como tu propio recomendador. Usa dos correos distintos al de tu cuenta.",
    });

    expect(mockGetSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("uses the configured public app URL for recommendation links instead of the request origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://uwcperu.org/");

    const insertedRows = [
      {
        id: "rec-mentor",
        application_id: "app-1",
        requester_id: "user-1",
        role: "mentor",
        recommender_email: "mentor@example.com",
        token: "rec-token",
        status: "invited",
        access_expires_at: "2026-07-16T00:00:00.000Z",
        invite_sent_at: null,
        opened_at: null,
        started_at: null,
        submitted_at: null,
        invalidated_at: null,
        invalidation_reason: null,
        reminder_count: 0,
        last_reminder_at: null,
        otp_sent_at: null,
        otp_verified_at: null,
        otp_code_hash: null,
        otp_attempt_count: 0,
        session_token_hash: null,
        session_expires_at: null,
        responses: {},
        admin_received_at: null,
        admin_received_by: null,
        admin_received_reason: null,
        admin_received_file: null,
        admin_notes: null,
        recommender_name: null,
        created_at: "2026-03-04T00:00:00.000Z",
      },
    ];
    const finalRows = insertedRows.map((row) => ({
      ...row,
      status: "sent",
      invite_sent_at: "2026-03-04T00:00:00.000Z",
    }));

    const adminQueries: string[] = [];
    mockGetSupabaseAdminClient.mockReturnValue({
      from(table: string) {
        adminQueries.push(table);
        if (table !== "recommendation_requests") {
          throw new Error(`Unexpected admin table ${table}`);
        }

        return {
          select() {
            return {
              eq() {
                return {
                  is() {
                    return {
                      order: async () => ({ data: [], error: null }),
                    };
                  },
                  order: async () => ({ data: finalRows, error: null }),
                };
              },
            };
          },
          insert() {
            return {
              select: async () => ({ data: insertedRows, error: null }),
            };
          },
          update() {
            return {
              eq() {
                return { error: null };
              },
            };
          },
        };
      },
    });

    await upsertApplicantRecommendations({
      supabase: createApplicantSupabase() as never,
      applicationId: "app-1",
      applicantId: "user-1",
      applicantEmail: "applicant@example.com",
      recommenders: [{ role: "mentor", email: "mentor@example.com" }],
      origin: "https://uwc-platforms-pr-16.dafirebanks.workers.dev",
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "mentor@example.com",
        text: expect.stringContaining("https://uwcperu.org/recomendacion/rec-token"),
      }),
    );
    expect(adminQueries).toContain("recommendation_requests");
  });
});
