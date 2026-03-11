import { describe, it, expect, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import {
  listCyclesForAdmin,
  listCyclesForApplicant,
  createCycle,
} from "@/lib/server/cycles-service";

/**
 * Creates a mock Supabase client where every query-builder method returns
 * `this` (enabling chaining) and also acts as a thenable so `await` works.
 *
 * To set return values for a specific chain, call
 * `supabase._resolveNext({ data: ..., error: null })` before invoking the
 * function under test.
 */
function mockSupabase() {
  let nextResult: { data: unknown; error: unknown } = { data: null, error: null };

  function resolveNext(result: { data: unknown; error: unknown }) {
    nextResult = result;
  }

  const resultQueue: Array<{ data: unknown; error: unknown }> = [];

  function enqueue(result: { data: unknown; error: unknown }) {
    resultQueue.push(result);
  }

  const builder: Record<string, unknown> = {};

  // Every query-builder method returns the builder itself (chaining)
  for (const method of [
    "select", "insert", "update", "delete",
    "eq", "neq", "order", "single", "limit", "range",
  ]) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Make the builder thenable so `await supabase.from(...).select(...)` works
  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    const result = resultQueue.length > 0 ? resultQueue.shift()! : nextResult;
    return Promise.resolve(result).then(resolve, reject);
  };

  const fromMock = vi.fn().mockReturnValue(builder);

  return {
    from: fromMock,
    _builder: builder,
    _resolveNext: resolveNext,
    _enqueue: enqueue,
  };
}

describe("listCyclesForAdmin", () => {
  it("returns cycles with application counts", async () => {
    const supabase = mockSupabase();

    // First await: cycles query
    supabase._enqueue({
      data: [
        { id: "c1", name: "2026", created_at: "2026-01-01" },
        { id: "c2", name: "2025", created_at: "2025-01-01" },
      ],
      error: null,
    });

    // Second await: applications query
    supabase._enqueue({
      data: [
        { cycle_id: "c1" },
        { cycle_id: "c1" },
        { cycle_id: "c1" },
      ],
      error: null,
    });

    const result = await listCyclesForAdmin(supabase as never);

    expect(result.cycles).toHaveLength(2);
    expect(result.cycles[0].applicationCount).toBe(3);
    expect(result.cycles[1].applicationCount).toBe(0);
  });

  it("throws AppError when cycles query fails", async () => {
    const supabase = mockSupabase();
    supabase._enqueue({ data: null, error: { message: "db error" } });

    await expect(listCyclesForAdmin(supabase as never)).rejects.toThrow(
      AppError,
    );
  });
});

describe("listCyclesForApplicant", () => {
  it("returns cycles and own applications", async () => {
    const supabase = mockSupabase();

    // cycles query
    supabase._enqueue({
      data: [{ id: "c1", name: "2026" }],
      error: null,
    });

    // applications query
    supabase._enqueue({
      data: [{ id: "a1", cycle_id: "c1", status: "draft", stage_code: "documents", updated_at: "2026-01-01" }],
      error: null,
    });

    const result = await listCyclesForApplicant(supabase as never, "user-1");

    expect(result.cycles).toHaveLength(1);
    expect(result.applications).toHaveLength(1);
    expect(result.applications[0].id).toBe("a1");
  });
});

describe("createCycle", () => {
  it("throws AppError when cycle insert fails", async () => {
    const supabase = mockSupabase();
    supabase._enqueue({ data: null, error: { message: "insert failed" } });

    await expect(
      createCycle(supabase as never, {
        name: "Test Cycle",
        year: 2026,
        isActive: false,
        maxApplicationsPerUser: 3,
      }),
    ).rejects.toThrow(AppError);
  });
});
