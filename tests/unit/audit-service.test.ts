import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { buildAuditCsv, parseAuditFilters } from "@/lib/server/audit-service";

describe("parseAuditFilters", () => {
  it("applies defaults", () => {
    const filters = parseAuditFilters(new URLSearchParams());

    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(25);
    expect(filters.action).toBeUndefined();
  });

  it("clamps page size to max", () => {
    const filters = parseAuditFilters(new URLSearchParams("pageSize=1000"));
    expect(filters.pageSize).toBe(100);
  });

  it("throws on invalid page", () => {
    expect(() => parseAuditFilters(new URLSearchParams("page=0"))).toThrowError(AppError);
  });

  it("throws on invalid date range", () => {
    expect(() =>
      parseAuditFilters(
        new URLSearchParams("from=2026-03-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z"),
      ),
    ).toThrowError(AppError);
  });
});

describe("buildAuditCsv", () => {
  it("escapes fields and serializes metadata", () => {
    const csv = buildAuditCsv([
      {
        id: "evt-1",
        action: "application.validated",
        requestId: "req-1",
        applicationId: "app-1",
        actorId: "actor-1",
        actorEmail: 'comite"test@uwc.org',
        actorName: "Comite, Peru",
        metadata: { notes: "Linea\nnueva" },
        createdAt: "2026-02-18T20:00:00.000Z",
      },
    ]);

    expect(csv).toContain('"application.validated"');
    expect(csv).toContain('"comite""test@uwc.org"');
    expect(csv).toContain('"Comite, Peru"');
    expect(csv).toContain('"{""notes"":""Linea\\nnueva""}"');
  });
});
