import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchApplications } from "@/lib/server/search-service";

vi.mock("@/lib/logging/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/* -------------------------------------------------------------------------- */
/*  Supabase stub factory                                                     */
/* -------------------------------------------------------------------------- */

type StubConfig = {
  profiles?: Array<{ id: string; email: string; full_name: string }>;
  profileSearchError?: unknown;
  applications?: Array<{
    id: string;
    applicant_id: string;
    cycle_id: string;
    stage_code: string;
    status: string;
    payload: Record<string, unknown>;
    updated_at: string;
  }>;
  appCount?: number;
  appError?: unknown;
  profileBatchData?: Array<{ id: string; email: string; full_name: string }>;
  profileBatchError?: unknown;
  cycles?: Array<{ id: string; name: string }>;
  cycleError?: unknown;
};

function buildSearchSupabaseStub(config: StubConfig = {}) {
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "profiles") {
      // Two usage patterns: textSearch (for search) and batch select (for profile data)
      const inFn = vi.fn().mockResolvedValue({
        data: config.profileBatchData ?? config.profiles ?? [],
        error: config.profileBatchError ?? null,
      });

      return {
        select: vi.fn().mockReturnValue({
          textSearch: vi.fn().mockResolvedValue({
            data: config.profiles ?? [],
            error: config.profileSearchError ?? null,
          }),
          in: inFn,
        }),
      };
    }

    if (table === "applications") {
      // Build chainable mock
      const range = vi.fn().mockResolvedValue({
        data: config.applications ?? [],
        error: config.appError ?? null,
        count: config.appCount ?? (config.applications?.length ?? 0),
      });
      const order = vi.fn().mockReturnValue({ range });
      const inFn = vi.fn().mockReturnValue({ order });
      const eqChain = vi.fn().mockReturnValue({ order, in: inFn, eq: vi.fn().mockReturnValue({ order, in: inFn, eq: vi.fn().mockReturnValue({ order, in: inFn }) }) });

      return {
        select: vi.fn().mockReturnValue({
          eq: eqChain,
          order,
          range,
          in: inFn,
        }),
      };
    }

    if (table === "cycles") {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: config.cycles ?? [],
            error: config.cycleError ?? null,
          }),
        }),
      };
    }

    return {};
  });

  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/types/supabase").Database>;
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("searchApplications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty results when no applications match", async () => {
    const supabase = buildSearchSupabaseStub({
      applications: [],
      appCount: 0,
    });

    const result = await searchApplications({
      supabase,
      input: {
        page: 1,
        pageSize: 50,
        sortBy: "updated_at",
        sortOrder: "desc",
      },
    });

    expect(result).toMatchObject({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
    });
  });

  it("returns paginated results with correct metadata", async () => {
    const apps = [
      {
        id: "app-1",
        applicant_id: "user-1",
        cycle_id: "cycle-1",
        stage_code: "documents",
        status: "submitted",
        payload: { firstName: "Juan", paternalLastName: "Perez" },
        updated_at: "2026-01-15T00:00:00Z",
      },
    ];

    const supabase = buildSearchSupabaseStub({
      applications: apps,
      appCount: 75,
      profileBatchData: [
        { id: "user-1", email: "juan@example.com", full_name: "Juan Perez" },
      ],
      cycles: [{ id: "cycle-1", name: "UWC 2026" }],
    });

    const result = await searchApplications({
      supabase,
      input: {
        page: 1,
        pageSize: 50,
        sortBy: "updated_at",
        sortOrder: "desc",
      },
    });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(75);
    expect(result.totalPages).toBe(2);
    expect(result.page).toBe(1);
    expect(result.rows[0]).toMatchObject({
      id: "app-1",
      candidateEmail: "juan@example.com",
      cycleName: "UWC 2026",
      stageCode: "documents",
    });
  });

  it("returns empty results when search query yields no profile matches", async () => {
    const supabase = buildSearchSupabaseStub({
      profiles: [], // No profiles match the search
    });

    const result = await searchApplications({
      supabase,
      input: {
        query: "nonexistent person",
        page: 1,
        pageSize: 50,
        sortBy: "updated_at",
        sortOrder: "desc",
      },
    });

    expect(result).toMatchObject({
      rows: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });
  });

  it("returns empty results when search query sanitizes to empty string", async () => {
    const supabase = buildSearchSupabaseStub();

    const result = await searchApplications({
      supabase,
      input: {
        query: "!@#$%^&*()", // all special chars → empty after sanitize
        page: 1,
        pageSize: 50,
        sortBy: "updated_at",
        sortOrder: "desc",
      },
    });

    expect(result).toMatchObject({
      rows: [],
      total: 0,
    });
  });

  it("clamps pageSize to max 200", async () => {
    const supabase = buildSearchSupabaseStub({
      applications: [],
      appCount: 0,
    });

    const result = await searchApplications({
      supabase,
      input: {
        page: 1,
        pageSize: 500,
        sortBy: "updated_at",
        sortOrder: "desc",
      },
    });

    expect(result.pageSize).toBe(200);
  });

  it("clamps page to minimum 1", async () => {
    const supabase = buildSearchSupabaseStub({
      applications: [],
      appCount: 0,
    });

    const result = await searchApplications({
      supabase,
      input: {
        page: -1,
        pageSize: 50,
        sortBy: "updated_at",
        sortOrder: "desc",
      },
    });

    expect(result.page).toBe(1);
  });

  it("throws when profile search fails", async () => {
    const supabase = buildSearchSupabaseStub({
      profileSearchError: { message: "DB error" },
    });

    await expect(
      searchApplications({
        supabase,
        input: {
          query: "Juan",
          page: 1,
          pageSize: 50,
          sortBy: "updated_at",
          sortOrder: "desc",
        },
      }),
    ).rejects.toMatchObject({
      status: 500,
    });
  });

  it("throws when applications query fails", async () => {
    const supabase = buildSearchSupabaseStub({
      appError: { message: "DB error" },
    });

    await expect(
      searchApplications({
        supabase,
        input: {
          page: 1,
          pageSize: 50,
          sortBy: "updated_at",
          sortOrder: "desc",
        },
      }),
    ).rejects.toMatchObject({
      status: 500,
    });
  });
});
