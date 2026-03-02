import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkTransitionApplications } from "@/lib/server/application-service";

vi.mock("@/lib/logging/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function buildBulkSupabaseStub({
  templates = [
    { stage_code: "documents", sort_order: 1 },
    { stage_code: "exam_placeholder", sort_order: 2 },
  ],
  templateError = null as unknown,
  applications = [] as Array<{ id: string; stage_code: string; status: string }>,
  fetchError = null as unknown,
  updateErrors = {} as Record<string, unknown>,
  transitionErrors = {} as Record<string, unknown>,
} = {}) {
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "cycle_stage_templates") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: templateError ? null : templates,
              error: templateError,
            }),
          }),
        }),
      };
    }

    if (table === "applications") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: fetchError ? null : applications,
                error: fetchError,
              }),
            }),
          })),
        }),
        update: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation((_col: string, id: string) => ({
            error: updateErrors[id] ?? null,
          })),
        })),
      };
    }

    if (table === "stage_transitions") {
      return {
        insert: vi.fn().mockImplementation((data: { application_id: string }) => ({
          error: transitionErrors[data.application_id] ?? null,
        })),
      };
    }

    return {};
  });

  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/types/supabase").Database>;
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("bulkTransitionApplications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zeros when no matching applications", async () => {
    const supabase = buildBulkSupabaseStub({ applications: [] });

    const result = await bulkTransitionApplications({
      supabase,
      input: {
        cycleId: "cycle-1",
        fromStage: "documents",
        toStage: "exam_placeholder",
        statusFilter: ["eligible"],
        reason: "Bulk advance",
      },
      actorId: "admin-1",
    });

    expect(result).toMatchObject({
      transitioned: 0,
      skipped: 0,
      errors: [],
    });
  });

  it("transitions all eligible applications", async () => {
    const apps = [
      { id: "app-1", stage_code: "documents", status: "eligible" },
      { id: "app-2", stage_code: "documents", status: "eligible" },
      { id: "app-3", stage_code: "documents", status: "eligible" },
    ];

    const supabase = buildBulkSupabaseStub({ applications: apps });

    const result = await bulkTransitionApplications({
      supabase,
      input: {
        cycleId: "cycle-1",
        fromStage: "documents",
        toStage: "exam_placeholder",
        statusFilter: ["eligible"],
        reason: "Bulk advance",
      },
      actorId: "admin-1",
    });

    expect(result.transitioned).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("skips applications that fail transition validation", async () => {
    const apps = [
      { id: "app-1", stage_code: "documents", status: "eligible" },
      { id: "app-2", stage_code: "documents", status: "draft" }, // should be skipped
    ];

    const supabase = buildBulkSupabaseStub({ applications: apps });

    const result = await bulkTransitionApplications({
      supabase,
      input: {
        cycleId: "cycle-1",
        fromStage: "documents",
        toStage: "exam_placeholder",
        statusFilter: ["eligible", "draft"],
        reason: "Bulk advance",
      },
      actorId: "admin-1",
    });

    expect(result.transitioned).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("records errors without blocking other transitions", async () => {
    const apps = [
      { id: "app-1", stage_code: "documents", status: "eligible" },
      { id: "app-2", stage_code: "documents", status: "eligible" },
    ];

    const supabase = buildBulkSupabaseStub({
      applications: apps,
      updateErrors: { "app-2": { message: "DB constraint violation" } },
    });

    const result = await bulkTransitionApplications({
      supabase,
      input: {
        cycleId: "cycle-1",
        fromStage: "documents",
        toStage: "exam_placeholder",
        statusFilter: ["eligible"],
        reason: "Bulk advance",
      },
      actorId: "admin-1",
    });

    // app-1 succeeds, app-2 errors
    expect(result.transitioned).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      applicationId: "app-2",
    });
  });

  it("throws when template loading fails", async () => {
    const supabase = buildBulkSupabaseStub({
      templateError: { message: "DB error" },
    });

    await expect(
      bulkTransitionApplications({
        supabase,
        input: {
          cycleId: "cycle-1",
          fromStage: "documents",
          toStage: "exam_placeholder",
          statusFilter: ["eligible"],
          reason: "Bulk advance",
        },
        actorId: "admin-1",
      }),
    ).rejects.toMatchObject({
      status: 500,
    });
  });

  it("throws when application fetching fails", async () => {
    const supabase = buildBulkSupabaseStub({
      fetchError: { message: "DB error" },
    });

    await expect(
      bulkTransitionApplications({
        supabase,
        input: {
          cycleId: "cycle-1",
          fromStage: "documents",
          toStage: "exam_placeholder",
          statusFilter: ["eligible"],
          reason: "Bulk advance",
        },
        actorId: "admin-1",
      }),
    ).rejects.toMatchObject({
      status: 500,
    });
  });
});
