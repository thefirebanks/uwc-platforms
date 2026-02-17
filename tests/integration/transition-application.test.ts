import { describe, expect, it } from "vitest";
import { transitionApplication } from "@/lib/server/application-service";
import { AppError } from "@/lib/errors/app-error";

function createSupabaseTransitionMock({
  currentStatus,
}: {
  currentStatus: "draft" | "eligible";
}) {
  let updatedStage = "documents";

  return {
    from(table: string) {
      if (table === "applications") {
        return {
          select() {
            return this;
          },
          eq() {
            return {
              single: async () => ({
                data: {
                  id: "app-1",
                  stage_code: "documents",
                  status: currentStatus,
                },
                error: null,
              }),
            };
          },
          update(values: { stage_code: "documents" | "exam_placeholder" }) {
            updatedStage = values.stage_code;
            return {
              eq() {
                return {
                  select() {
                    return {
                      single: async () => ({
                        data: {
                          id: "app-1",
                          stage_code: updatedStage,
                          status: currentStatus,
                        },
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "stage_transitions") {
        return {
          insert: async () => ({ error: null }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("transitionApplication", () => {
  it("moves eligible application to exam placeholder", async () => {
    const supabase = createSupabaseTransitionMock({ currentStatus: "eligible" });

    const result = await transitionApplication({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      applicationId: "app-1",
      toStage: "exam_placeholder",
      reason: "Validado",
      actorId: "admin-1",
    });

    expect(result.stage_code).toBe("exam_placeholder");
  });

  it("rejects transition when status is draft", async () => {
    const supabase = createSupabaseTransitionMock({ currentStatus: "draft" });

    await expect(
      transitionApplication({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        applicationId: "app-1",
        toStage: "exam_placeholder",
        reason: "Intento inválido",
        actorId: "admin-1",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
