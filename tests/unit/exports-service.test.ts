import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import {
  buildApplicationsCsv,
  getApplicationExportPackage,
  normalizeApplicationFiles,
  parseApplicationExportFilters,
} from "@/lib/server/exports-service";

describe("parseApplicationExportFilters", () => {
  it("applies defaults", () => {
    const filters = parseApplicationExportFilters(new URLSearchParams());

    expect(filters.cycleId).toBeUndefined();
    expect(filters.stageCode).toBeUndefined();
    expect(filters.status).toBeUndefined();
    expect(filters.eligibility).toBe("all");
  });

  it("parses valid filters", () => {
    const filters = parseApplicationExportFilters(
      new URLSearchParams(
        "cycleId=11111111-1111-4111-8111-111111111111&stageCode=documents&eligibility=pending",
      ),
    );

    expect(filters.cycleId).toBe("11111111-1111-4111-8111-111111111111");
    expect(filters.stageCode).toBe("documents");
    expect(filters.eligibility).toBe("pending");
  });

  it("rejects conflicting status and eligibility filters", () => {
    expect(() =>
      parseApplicationExportFilters(
        new URLSearchParams(
          "status=eligible&eligibility=ineligible",
        ),
      ),
    ).toThrowError(AppError);
  });
});

describe("buildApplicationsCsv", () => {
  it("escapes values and serializes recommendation flags", () => {
    const csv = buildApplicationsCsv([
      {
        applicationId: "app-1",
        cycleId: "cycle-1",
        cycleName: 'Proceso "2026"',
        applicantId: "applicant-1",
        applicantEmail: "test@uwc.org",
        applicantName: "Comite, Peru",
        stageCode: "documents",
        status: "submitted",
        validationNotes: "Línea 1\nLínea 2",
        mentorRecommendationSubmitted: true,
        friendRecommendationSubmitted: false,
        recommendationCompletion: "incomplete",
        fileCount: 2,
        createdAt: "2026-02-20T10:00:00.000Z",
        updatedAt: "2026-02-20T11:00:00.000Z",
      },
    ]);

    expect(csv).toContain('"Proceso ""2026"""');
    expect(csv).toContain('"Comite, Peru"');
    expect(csv).toContain('"Línea 1');
    expect(csv).toContain('"true"');
    expect(csv).toContain('"false"');
  });
});

describe("normalizeApplicationFiles", () => {
  it("supports legacy string and structured objects", () => {
    const files = normalizeApplicationFiles({
      identificationDocument: "app/path/id.pdf",
      transcript: {
        path: "app/path/transcript.pdf",
        title: "Notas 2025",
        original_name: "transcript.pdf",
        mime_type: "application/pdf",
        size_bytes: 1234,
        uploaded_at: "2026-02-20T00:00:00.000Z",
      },
    });

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      key: "identificationDocument",
      path: "app/path/id.pdf",
    });
    expect(files[1]).toMatchObject({
      key: "transcript",
      title: "Notas 2025",
      mimeType: "application/pdf",
      sizeBytes: 1234,
    });
  });
});

describe("getApplicationExportPackage", () => {
  it("returns core package even when recommendations/ocr queries fail", async () => {
    const supabase = {
      from(table: string) {
        if (table === "applications") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => ({
              data: {
                id: "11111111-1111-4111-8111-111111111111",
                applicant_id: "applicant-1",
                cycle_id: "cycle-1",
                stage_code: "documents",
                status: "submitted",
                payload: {},
                files: {},
                validation_notes: null,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
              },
              error: null,
            }),
          };
        }

        if (table === "profiles") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => ({
              data: { id: "applicant-1", email: "applicant@demo.com", full_name: "Demo Applicant" },
              error: null,
            }),
          };
        }

        if (table === "cycles") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => ({
              data: { id: "cycle-1", name: "Proceso 2026" },
              error: null,
            }),
          };
        }

        if (table === "recommendation_requests") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order: async () => ({
              data: null,
              error: { message: "permission denied" },
            }),
          };
        }

        if (table === "application_ocr_checks") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return this;
            },
            limit: async () => ({
              data: null,
              error: { message: "relation does not exist" },
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    await expect(
      getApplicationExportPackage({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        applicationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toMatchObject({
      application: { id: "11111111-1111-4111-8111-111111111111" },
      recommendations: [],
      ocrChecks: [],
    });
  });
});
