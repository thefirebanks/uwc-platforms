import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSupabaseServerClient } = vi.hoisted(() => ({
  mockGetSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: mockGetSupabaseServerClient,
}));

import {
  getPermissionScope,
  hasPermission,
  requirePermission,
} from "@/lib/server/permissions-service";

function makeSupabaseStub(data: { scope: string } | null, error: unknown = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data, error }),
          }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPermissionScope", () => {
  it("returns 'global' when role has global permission", async () => {
    mockGetSupabaseServerClient.mockResolvedValue(makeSupabaseStub({ scope: "global" }));
    const scope = await getPermissionScope("admin", "applications:read");
    expect(scope).toBe("global");
  });

  it("returns 'assigned' when role has assigned scope", async () => {
    mockGetSupabaseServerClient.mockResolvedValue(makeSupabaseStub({ scope: "assigned" }));
    const scope = await getPermissionScope("reviewer", "applications:read");
    expect(scope).toBe("assigned");
  });

  it("returns null when permission is not found", async () => {
    mockGetSupabaseServerClient.mockResolvedValue(makeSupabaseStub(null));
    const scope = await getPermissionScope("applicant", "applications:read");
    expect(scope).toBeNull();
  });
});

describe("hasPermission", () => {
  it("returns true when permission exists", async () => {
    mockGetSupabaseServerClient.mockResolvedValue(makeSupabaseStub({ scope: "global" }));
    expect(await hasPermission("admin", "applications:read")).toBe(true);
  });

  it("returns false when permission is missing", async () => {
    mockGetSupabaseServerClient.mockResolvedValue(makeSupabaseStub(null));
    expect(await hasPermission("applicant", "applications:read")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("returns the scope when permitted", async () => {
    mockGetSupabaseServerClient.mockResolvedValue(makeSupabaseStub({ scope: "assigned" }));
    const scope = await requirePermission("reviewer", "applications:read");
    expect(scope).toBe("assigned");
  });

  it("throws 403 when not permitted", async () => {
    mockGetSupabaseServerClient.mockResolvedValue(makeSupabaseStub(null));
    await expect(
      requirePermission("applicant", "config:write"),
    ).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("applicant"),
    });
  });
});
