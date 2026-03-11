import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { AppError } from "@/lib/errors/app-error";
import {
  buildApplicationsXlsx,
  buildApplicationsCsv,
  buildMatrixCsvExport,
  buildMatrixExportWorkbook,
  buildMatrixExportXlsx,
  buildDynamicExportXlsx,
  getApplicationExportPackage,
  normalizeApplicationFiles,
  parseApplicationExportFilters,
  prepareMatrixExportGroups,
  resolveNestedExportValue,
  validateSelectedExportFields,
  buildRandomSampleGroups,
} from "@/lib/server/exports-service";

function readZipEntryText(files: Record<string, Uint8Array>, path: string) {
  const resolvedKey = Object.keys(files).find((key) => key === path || key.endsWith(path));
  const entry = resolvedKey ? files[resolvedKey] : undefined;
  if (!entry) {
    throw new Error(`Missing ${path} in xlsx archive. Keys: ${Object.keys(files).join(", ")}`);
  }
  return new TextDecoder().decode(entry);
}

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
        "cycleId=11111111-1111-4111-8111-111111111111&stageCode=documents&eligibility=pending&q=ana&applicationIds=11111111-1111-4111-8111-111111111111",
      ),
    );

    expect(filters.cycleId).toBe("11111111-1111-4111-8111-111111111111");
    expect(filters.stageCode).toBe("documents");
    expect(filters.eligibility).toBe("pending");
    expect(filters.query).toBe("ana");
    expect(filters.applicationIds).toEqual(["11111111-1111-4111-8111-111111111111"]);
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

describe("xlsx export styling", () => {
  it("applies matrix sheet styles, spacer width and freeze panes", async () => {
    const workbook = {
      grouped: true,
      sheets: [
        {
          name: "Postulaciones",
          applicantHeaders: ["Ana Perez (ana@example.com)", "Luis Torres (luis@example.com)"],
          rows: [
            { label: "Grupo", values: ["Grupo 1", "Grupo 2"] },
            { label: "Region", values: ["Cusco", "Lima"] },
          ],
        },
      ],
    };

    const buffer = await buildMatrixExportXlsx(workbook);
    const files = unzipSync(new Uint8Array(buffer));
    const sheetXml = readZipEntryText(files, "xl/worksheets/sheet1.xml");
    const stylesXml = readZipEntryText(files, "xl/styles.xml");

    expect(sheetXml).toMatch(/<pane[^>]*xSplit="1"[^>]*ySplit="1"[^>]*topLeftCell="B2"[^>]*state="frozen"\/>/);
    expect(sheetXml).toMatch(/<col min="3" max="3" width="3\.[0-9]+" customWidth="1"\/>/);
    expect(stylesXml).toContain("FFE7E1D8");
    expect(stylesXml).toContain("FFF1EEEA");
    expect(stylesXml).toContain("FFEAF0F8");
  });

  it("freezes the header row in application exports", async () => {
    const buffer = await buildApplicationsXlsx(
      [
        {
          applicationId: "app-1",
          cycleId: "cycle-1",
          cycleName: "Proceso 2026",
          applicantId: "applicant-1",
          applicantEmail: "ana@example.com",
          applicantName: "Ana Perez",
          stageCode: "documents",
          status: "submitted",
          validationNotes: "",
          mentorRecommendationSubmitted: true,
          friendRecommendationSubmitted: false,
          recommendationCompletion: "incomplete",
          fileCount: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      ["applicationId", "applicantName", "status"],
    );

    const files = unzipSync(new Uint8Array(buffer));
    const sheetXml = readZipEntryText(files, "xl/worksheets/sheet1.xml");

    expect(sheetXml).toMatch(/<pane[^>]*ySplit="1"[^>]*topLeftCell="A2"[^>]*state="frozen"\/>/);
    expect(sheetXml).toMatch(/<autoFilter ref="A1:C[0-9]+"\/>/);
  });

  it("freezes first row and column in dynamic exports", async () => {
    const buffer = await buildDynamicExportXlsx({
      headers: ["Campo", "Valor"],
      rows: [["Estado", "submitted"]],
    });

    const files = unzipSync(new Uint8Array(buffer));
    const sheetXml = readZipEntryText(files, "xl/worksheets/sheet1.xml");

    expect(sheetXml).toMatch(/<pane[^>]*xSplit="1"[^>]*ySplit="1"[^>]*topLeftCell="B2"[^>]*state="frozen"\/>/);
    expect(sheetXml).toMatch(/<autoFilter ref="A1:B[0-9]+"\/>/);
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

describe("resolveNestedExportValue", () => {
  it("reads nested payload paths and stringifies arrays", () => {
    expect(
      resolveNestedExportValue(
        {
          academics: {
            classRank: 3,
            interests: ["math", "music"],
          },
        },
        "academics.interests",
      ),
    ).toBe("math | music");
  });
});

describe("validateSelectedExportFields", () => {
  it("rejects fields outside the provided catalog", () => {
    expect(() =>
      validateSelectedExportFields({
        selectedFields: ["payload.secretField"],
        catalog: {
          fields: [
            {
              key: "applicationId",
              label: "ID",
              helperText: null,
              kind: "core",
              groupKey: "core",
              groupLabel: "Información base",
              defaultSelected: true,
            },
          ],
          presets: [],
        },
      }),
    ).toThrowError(AppError);
  });
});

describe("buildRandomSampleGroups", () => {
  it("creates deterministic groups when a random function is provided", () => {
    const calls = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7];
    let index = 0;

    const groups = buildRandomSampleGroups({
      items: ["a", "b", "c", "d", "e", "f"],
      groupCount: 2,
      applicantsPerGroup: 2,
      random: () => calls[index++] ?? 0.5,
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[1]).toHaveLength(2);
    expect(groups.flat()).toHaveLength(4);
  });
});

describe("matrix export builders", () => {
  const catalog = {
    fields: [
      {
        key: "applicantName",
        label: "Nombre",
        helperText: null,
        kind: "core" as const,
        groupKey: "core",
        groupLabel: "Base",
        defaultSelected: true,
      },
      {
        key: "payload.region",
        label: "Region",
        helperText: null,
        kind: "payload" as const,
        groupKey: "payload",
        groupLabel: "Formulario",
        defaultSelected: false,
      },
    ],
    presets: [],
  };

  const records = [
    {
      application: {
        id: "11111111-1111-4111-8111-111111111111",
        applicant_id: "applicant-1",
        cycle_id: "cycle-1",
        stage_code: "documents",
        status: "submitted" as const,
        payload: { fullName: "Ana Perez", region: "Cusco" },
        files: {},
        validation_notes: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      applicant: { email: "ana@example.com", full_name: "Ana Perez" },
      cycle: { name: "Proceso 2026" },
      recommendations: [],
    },
    {
      application: {
        id: "22222222-2222-4222-8222-222222222222",
        applicant_id: "applicant-2",
        cycle_id: "cycle-1",
        stage_code: "documents",
        status: "submitted" as const,
        payload: { fullName: "Luis Torres", region: "Lima" },
        files: {},
        validation_notes: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      applicant: { email: "luis@example.com", full_name: "Luis Torres" },
      cycle: { name: "Proceso 2026" },
      recommendations: [],
    },
  ];

  it("includes a group row when manual assignments are provided", () => {
    const prepared = prepareMatrixExportGroups({
      records,
      targetMode: "manual",
      selectedApplicationIds: records.map((record) => record.application.id),
      groupAssignments: [
        {
          applicationId: records[0].application.id,
          groupKey: "group-1",
          groupLabel: "Grupo 1",
        },
        {
          applicationId: records[1].application.id,
          groupKey: "group-2",
          groupLabel: "Grupo 2",
        },
      ],
    });

    const workbook = buildMatrixExportWorkbook({
      groups: prepared.groups,
      selectedFields: ["applicantName", "payload.region"],
      catalog,
      groupedExportMode: "single-sheet",
      includeGroupRow: prepared.includeGroupRow,
    });

    expect(workbook.sheets).toHaveLength(1);
    expect(workbook.sheets[0].rows[0]).toMatchObject({
      label: "Grupo",
      values: ["Grupo 1", "Grupo 2"],
    });

    const csv = buildMatrixCsvExport(workbook.sheets[0]);
    expect(csv).toContain('"Campo","Ana Perez (ana@example.com)"');
    expect(csv).toContain('"Grupo","Grupo 1","Grupo 2"');
    expect(csv).toContain('"Region","Cusco","Lima"');
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
