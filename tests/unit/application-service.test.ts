import { describe, expect, it, vi } from "vitest";
import {
  getApplicationName,
  assertApplicantCanEditCycle,
  getApplicationsForAdmin,
  getApplicantApplication,
  upsertApplicantApplication,
  submitApplication,
  validateApplication,
} from "@/lib/server/application-service";
import type { Application } from "@/types/domain";

vi.mock("@/lib/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/* -------------------------------------------------------------------------- */
/*  Supabase stub helpers                                                     */
/* -------------------------------------------------------------------------- */

/** Build a minimal chainable supabase mock for a single table. */
function singleResultStub(data: unknown, error: unknown = null) {
  return {
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

function chainEq(terminal: object) {
  const eq = vi.fn().mockReturnValue(terminal);
  return { eq, ...terminal };
}

/* -------------------------------------------------------------------------- */
/*  getApplicationName — pure function                                        */
/* -------------------------------------------------------------------------- */

describe("getApplicationName", () => {
  it("returns fullName when present", () => {
    const app = { payload: { fullName: " Ana Ramirez " } } as unknown as Application;
    expect(getApplicationName(app)).toBe("Ana Ramirez");
  });

  it("builds name from firstName + paternalLastName + maternalLastName", () => {
    const app = {
      payload: {
        firstName: "Carlos",
        paternalLastName: "Quispe",
        maternalLastName: "Suárez",
      },
    } as unknown as Application;
    expect(getApplicationName(app)).toBe("Carlos Quispe Suárez");
  });

  it("returns fallback when payload has no name fields", () => {
    const app = { payload: {} } as unknown as Application;
    expect(getApplicationName(app)).toBe("Postulante");
  });

  it("returns custom fallback when specified", () => {
    const app = { payload: {} } as unknown as Application;
    expect(getApplicationName(app, "Sin nombre")).toBe("Sin nombre");
  });

  it("prefers fullName over component names", () => {
    const app = {
      payload: { fullName: "Full Name", firstName: "Ignored" },
    } as unknown as Application;
    expect(getApplicationName(app)).toBe("Full Name");
  });

  it("handles missing payload values gracefully", () => {
    const app = { payload: { firstName: "Only" } } as unknown as Application;
    expect(getApplicationName(app)).toBe("Only");
  });
});

/* -------------------------------------------------------------------------- */
/*  assertApplicantCanEditCycle                                               */
/* -------------------------------------------------------------------------- */

describe("assertApplicantCanEditCycle", () => {
  it("does not throw when stage1 close date is in the future", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(
            singleResultStub({ id: "c-1", stage1_close_at: future }),
          ),
        }),
      }),
    };

    await expect(
      assertApplicantCanEditCycle({ supabase: supabase as never, cycleId: "c-1" }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when stage1_close_at is null (no deadline)", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(
            singleResultStub({ id: "c-1", stage1_close_at: null }),
          ),
        }),
      }),
    };

    await expect(
      assertApplicantCanEditCycle({ supabase: supabase as never, cycleId: "c-1" }),
    ).resolves.toBeUndefined();
  });

  it("throws 422 when stage1 close date is in the past", async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(
            singleResultStub({ id: "c-1", stage1_close_at: past }),
          ),
        }),
      }),
    };

    await expect(
      assertApplicantCanEditCycle({ supabase: supabase as never, cycleId: "c-1" }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("throws 404 when cycle is not found", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(singleResultStub(null)),
        }),
      }),
    };

    await expect(
      assertApplicantCanEditCycle({ supabase: supabase as never, cycleId: "missing" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

/* -------------------------------------------------------------------------- */
/*  getApplicationsForAdmin                                                   */
/* -------------------------------------------------------------------------- */

describe("getApplicationsForAdmin", () => {
  it("returns application rows ordered by updated_at", async () => {
    const rows = [
      { id: "a-1", applicant_id: "u-1", status: "submitted" },
      { id: "a-2", applicant_id: "u-2", status: "draft" },
    ];
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
    };

    const result = await getApplicationsForAdmin(supabase as never);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a-1");
  });

  it("filters by cycleId when provided", async () => {
    const eqMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const orderMock = vi.fn().mockReturnValue({ eq: eqMock });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ order: orderMock }),
      }),
    };

    await getApplicationsForAdmin(supabase as never, "cycle-123");
    expect(eqMock).toHaveBeenCalledWith("cycle_id", "cycle-123");
  });

  it("throws 500 on database error", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "db failure" },
          }),
        }),
      }),
    };

    await expect(getApplicationsForAdmin(supabase as never)).rejects.toMatchObject({
      status: 500,
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getApplicantApplication                                                   */
/* -------------------------------------------------------------------------- */

describe("getApplicantApplication", () => {
  it("returns the application when found", async () => {
    const app = { id: "a-1", applicant_id: "u-1", cycle_id: "c-1" };
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(singleResultStub(app)),
          }),
        }),
      }),
    };

    const result = await getApplicantApplication(supabase as never, "u-1", "c-1");
    expect(result).toMatchObject({ id: "a-1" });
  });

  it("returns null when application is not found", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(singleResultStub(null)),
          }),
        }),
      }),
    };

    const result = await getApplicantApplication(supabase as never, "u-1", "c-1");
    expect(result).toBeNull();
  });

  it("throws 500 on database error", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(
              singleResultStub(null, { message: "db error" }),
            ),
          }),
        }),
      }),
    };

    await expect(
      getApplicantApplication(supabase as never, "u-1", "c-1"),
    ).rejects.toMatchObject({ status: 500 });
  });
});

/* -------------------------------------------------------------------------- */
/*  submitApplication                                                         */
/* -------------------------------------------------------------------------- */

describe("submitApplication", () => {
  it("sets status to submitted and returns the updated row", async () => {
    const updated = { id: "a-1", status: "submitted" };
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue(
              singleResultStub(updated),
            ),
          }),
        }),
      }),
    };

    const result = await submitApplication({ supabase: supabase as never, applicationId: "a-1" });
    expect(result.status).toBe("submitted");
  });

  it("throws 500 on update failure", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue(
              singleResultStub(null, { message: "fail" }),
            ),
          }),
        }),
      }),
    };

    await expect(
      submitApplication({ supabase: supabase as never, applicationId: "a-1" }),
    ).rejects.toMatchObject({ status: 500 });
  });
});

/* -------------------------------------------------------------------------- */
/*  validateApplication                                                       */
/* -------------------------------------------------------------------------- */

describe("validateApplication", () => {
  it("sets status and validation_notes", async () => {
    const updated = { id: "a-1", status: "eligible", validation_notes: "Approved" };
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue(
              singleResultStub(updated),
            ),
          }),
        }),
      }),
    };

    const result = await validateApplication({
      supabase: supabase as never,
      applicationId: "a-1",
      status: "eligible",
      notes: "Approved",
    });
    expect(result.status).toBe("eligible");
  });

  it("throws 500 on update failure", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue(
              singleResultStub(null, { message: "fail" }),
            ),
          }),
        }),
      }),
    };

    await expect(
      validateApplication({
        supabase: supabase as never,
        applicationId: "a-1",
        status: "ineligible",
        notes: "Denied",
      }),
    ).rejects.toMatchObject({ status: 500 });
  });
});
