import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSupabaseAdminClient } = vi.hoisted(() => ({
  mockGetSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: mockGetSupabaseAdminClient,
}));

import {
  listReviewers,
  promoteToReviewer,
  demoteReviewer,
  assignReviewer,
  unassignReviewer,
  getReviewerAssignments,
  getApplicationReviewers,
} from "@/lib/server/reviewer-service";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Build a minimal chainable Supabase mock. Override per-test as needed. */
function chainable(resolvedData: unknown = null, resolvedError: unknown = null) {
  const terminal: Record<string, unknown> = {
    single: vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError }),
    maybeSingle: vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError }),
  };
  // For methods that return { data, error } directly (e.g. delete().eq().eq())
  const asyncTerminal = async () => ({ data: resolvedData, error: resolvedError });

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === "then") return undefined; // prevent auto-awaiting the proxy
      if (prop in terminal) return terminal[prop];
      // For awaitable chain endings (delete, order, etc.)
      const next = new Proxy({}, handler);
      // Make it thenable so `await supabase.from().delete().eq()` resolves
      Object.defineProperty(next, "then", {
        value: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          asyncTerminal().then(resolve, reject),
        writable: false,
        enumerable: false,
        configurable: true,
      });
      return vi.fn().mockReturnValue(next);
    },
  };
  return new Proxy({}, handler);
}

function buildAdminStub(overrides: Record<string, unknown> = {}) {
  const defaultFrom = vi.fn().mockReturnValue(chainable());
  return { from: defaultFrom, ...overrides };
}

/* -------------------------------------------------------------------------- */
/*  listReviewers                                                              */
/* -------------------------------------------------------------------------- */

describe("listReviewers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns reviewer profiles ordered by full_name", async () => {
    const reviewers = [
      { id: "r1", email: "a@test.com", full_name: "Alice", role: "reviewer" },
      { id: "r2", email: "b@test.com", full_name: "Bob", role: "reviewer" },
    ];

    const order = vi.fn().mockResolvedValue({ data: reviewers, error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });

    const result = await listReviewers();

    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("id, email, full_name, role");
    expect(eq).toHaveBeenCalledWith("role", "reviewer");
    expect(result).toEqual(reviewers);
  });

  it("throws AppError on database error", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "DB down" } });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });

    await expect(listReviewers()).rejects.toMatchObject({
      status: 500,
      message: "Failed to list reviewers",
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  promoteToReviewer                                                          */
/* -------------------------------------------------------------------------- */

describe("promoteToReviewer", () => {
  beforeEach(() => vi.clearAllMocks());

  function buildPromoteStub(findResult: { data: unknown; error: unknown }, updateResult?: { data: unknown; error: unknown }) {
    const calls: Record<string, unknown[]> = {};
    const from = vi.fn().mockImplementation((table: string) => {
      calls[table] = calls[table] || [];
      if (!updateResult) {
        // Only lookup, no update expected
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(findResult),
            }),
          }),
        };
      }
      // First call = lookup, second call = update
      const callCount = calls[table].length;
      calls[table].push(true);
      if (callCount === 0) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(findResult),
            }),
          }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(updateResult),
            }),
          }),
        }),
      };
    });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });
    return { from, calls };
  }

  it("returns existing profile if already a reviewer", async () => {
    const existing = { id: "r1", email: "rev@test.com", full_name: "Rev", role: "reviewer" };
    buildPromoteStub({ data: existing, error: null });

    const result = await promoteToReviewer({ email: "rev@test.com", adminId: "admin-1" });
    expect(result).toEqual(existing);
  });

  it("throws 404 when no profile exists for the email", async () => {
    buildPromoteStub({ data: null, error: null });

    await expect(
      promoteToReviewer({ email: "nobody@test.com", adminId: "admin-1" }),
    ).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("No profile found"),
    });
  });

  it("throws 409 when trying to demote an admin to reviewer", async () => {
    const admin = { id: "a1", email: "admin@test.com", full_name: "Admin", role: "admin" };
    buildPromoteStub({ data: admin, error: null });

    await expect(
      promoteToReviewer({ email: "admin@test.com", adminId: "admin-1" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Cannot demote an admin to reviewer",
    });
  });

  it("promotes applicant to reviewer and returns updated profile", async () => {
    const applicant = { id: "u1", email: "user@test.com", full_name: "User", role: "applicant" };
    const updated = { ...applicant, role: "reviewer" };
    buildPromoteStub(
      { data: applicant, error: null },
      { data: updated, error: null },
    );

    const result = await promoteToReviewer({ email: "user@test.com", adminId: "admin-1" });
    expect(result.role).toBe("reviewer");
    expect(result.id).toBe("u1");
  });

  it("trims and lowercases email before lookup", async () => {
    const existing = { id: "r1", email: "rev@test.com", full_name: "Rev", role: "reviewer" };
    const { from } = buildPromoteStub({ data: existing, error: null });

    await promoteToReviewer({ email: "  REV@Test.com  ", adminId: "admin-1" });

    // Verify the eq call used the normalized email
    const selectChain = from.mock.results[0].value.select();
    expect(selectChain.eq).toHaveBeenCalledWith("email", "rev@test.com");
  });
});

/* -------------------------------------------------------------------------- */
/*  demoteReviewer                                                             */
/* -------------------------------------------------------------------------- */

describe("demoteReviewer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes assignments then updates role to applicant", async () => {
    const deleteCalls: string[] = [];
    const updateCalls: string[] = [];

    const from = vi.fn().mockImplementation((table: string) => {
      return {
        delete: vi.fn().mockImplementation(() => {
          deleteCalls.push(table);
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
        update: vi.fn().mockImplementation(() => {
          updateCalls.push(table);
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }),
      };
    });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });

    await demoteReviewer("r1");

    expect(deleteCalls).toContain("reviewer_assignments");
    expect(updateCalls).toContain("profiles");
  });
});

/* -------------------------------------------------------------------------- */
/*  assignReviewer                                                             */
/* -------------------------------------------------------------------------- */

describe("assignReviewer", () => {
  beforeEach(() => vi.clearAllMocks());

  const input = {
    reviewerId: "r1",
    applicationId: "app-1",
    cycleId: "cycle-1",
    stageCode: "stage1",
    assignedBy: "admin-1",
  };

  it("verifies reviewer role and creates assignment", async () => {
    const assignment = { id: "assign-1", ...input };
    const fromCalls: string[] = [];

    const from = vi.fn().mockImplementation((table: string) => {
      fromCalls.push(table);
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "r1", role: "reviewer" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "reviewer_assignments") {
        return {
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: assignment,
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });

    const result = await assignReviewer(input);
    expect(result).toEqual(assignment);
    expect(fromCalls).toContain("profiles");
    expect(fromCalls).toContain("reviewer_assignments");
  });

  it("throws 404 when reviewer profile is not found", async () => {
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });

    await expect(assignReviewer(input)).rejects.toMatchObject({
      status: 404,
      message: "Reviewer profile not found",
    });
  });

  it("throws 400 when profile is not a reviewer", async () => {
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "r1", role: "applicant" },
            error: null,
          }),
        }),
      }),
    });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });

    await expect(assignReviewer(input)).rejects.toMatchObject({
      status: 400,
      message: "Profile is not a reviewer",
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  unassignReviewer                                                           */
/* -------------------------------------------------------------------------- */

describe("unassignReviewer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the assignment by reviewer_id and application_id", async () => {
    const eqSecond = vi.fn().mockResolvedValue({ error: null });
    const eqFirst = vi.fn().mockReturnValue({ eq: eqSecond });
    const deleteFn = vi.fn().mockReturnValue({ eq: eqFirst });
    const from = vi.fn().mockReturnValue({ delete: deleteFn });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });

    await unassignReviewer("r1", "app-1");

    expect(from).toHaveBeenCalledWith("reviewer_assignments");
    expect(eqFirst).toHaveBeenCalledWith("reviewer_id", "r1");
    expect(eqSecond).toHaveBeenCalledWith("application_id", "app-1");
  });

  it("throws AppError on database error", async () => {
    const eqSecond = vi.fn().mockResolvedValue({ error: { message: "DB error" } });
    const eqFirst = vi.fn().mockReturnValue({ eq: eqSecond });
    const deleteFn = vi.fn().mockReturnValue({ eq: eqFirst });
    const from = vi.fn().mockReturnValue({ delete: deleteFn });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });

    await expect(unassignReviewer("r1", "app-1")).rejects.toMatchObject({
      status: 500,
      message: "Failed to unassign reviewer",
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getReviewerAssignments (uses injected supabase, not admin client)          */
/* -------------------------------------------------------------------------- */

describe("getReviewerAssignments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns assignments with application and reviewer joins", async () => {
    const assignments = [
      {
        id: "a1",
        reviewer_id: "r1",
        application_id: "app-1",
        cycle_id: "cycle-1",
        stage_code: "stage1",
        assigned_by: "admin-1",
        assigned_at: "2026-01-01",
        application: { id: "app-1", applicant_id: "u1", cycle_id: "cycle-1", stage_code: "stage1", status: "submitted" },
        reviewer: { id: "r1", email: "rev@test.com", full_name: "Rev", role: "reviewer" },
      },
    ];

    const order = vi.fn().mockResolvedValue({ data: assignments, error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as never;

    const result = await getReviewerAssignments(supabase);
    expect(result).toEqual(assignments);
    expect(from).toHaveBeenCalledWith("reviewer_assignments");
  });

  it("throws AppError on database error", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "RLS denied" } });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as never;

    await expect(getReviewerAssignments(supabase)).rejects.toMatchObject({
      status: 500,
      message: "Failed to fetch reviewer assignments",
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getApplicationReviewers                                                    */
/* -------------------------------------------------------------------------- */

describe("getApplicationReviewers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns reviewer profiles for the given application", async () => {
    const rows = [
      { reviewer: { id: "r1", email: "a@test.com", full_name: "Alice", role: "reviewer" } },
      { reviewer: { id: "r2", email: "b@test.com", full_name: "Bob", role: "reviewer" } },
    ];

    const eq = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });

    const result = await getApplicationReviewers("app-1");

    expect(from).toHaveBeenCalledWith("reviewer_assignments");
    expect(eq).toHaveBeenCalledWith("application_id", "app-1");
    expect(result).toEqual([
      { id: "r1", email: "a@test.com", full_name: "Alice", role: "reviewer" },
      { id: "r2", email: "b@test.com", full_name: "Bob", role: "reviewer" },
    ]);
  });

  it("filters out null reviewer entries", async () => {
    const rows = [
      { reviewer: { id: "r1", email: "a@test.com", full_name: "Alice", role: "reviewer" } },
      { reviewer: null },
    ];

    const eq = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });

    const result = await getApplicationReviewers("app-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r1");
  });

  it("throws AppError on database error", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    mockGetSupabaseAdminClient.mockResolvedValue({ from });

    await expect(getApplicationReviewers("app-1")).rejects.toMatchObject({
      status: 500,
      message: "Failed to fetch application reviewers",
    });
  });
});
