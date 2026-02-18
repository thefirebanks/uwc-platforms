import { describe, expect, it } from "vitest";
import { validateRequiredFiles, validateStagePayload } from "@/lib/stages/form-schema";
import type { CycleStageField } from "@/types/domain";

const fields: CycleStageField[] = [
  {
    id: "f1",
    cycle_id: "cycle-1",
    stage_code: "documents",
    field_key: "fullName",
    field_label: "Nombre completo",
    field_type: "short_text",
    is_required: true,
    placeholder: null,
    help_text: null,
    sort_order: 1,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "f2",
    cycle_id: "cycle-1",
    stage_code: "documents",
    field_key: "gradeAverage",
    field_label: "Promedio",
    field_type: "number",
    is_required: true,
    placeholder: null,
    help_text: null,
    sort_order: 2,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "f3",
    cycle_id: "cycle-1",
    stage_code: "documents",
    field_key: "identificationDocument",
    field_label: "Documento de identificación",
    field_type: "file",
    is_required: true,
    placeholder: null,
    help_text: null,
    sort_order: 3,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

describe("stage form schema validation", () => {
  it("normalizes valid payload values", () => {
    const result = validateStagePayload({
      fields,
      payload: {
        fullName: "  Ana Perez ",
        gradeAverage: "16.5",
      },
      skipFileValidation: true,
    });

    expect(result.isValid).toBe(true);
    expect(result.normalizedPayload).toEqual({
      fullName: "Ana Perez",
      gradeAverage: 16.5,
    });
  });

  it("reports missing required fields", () => {
    const result = validateStagePayload({
      fields,
      payload: { fullName: "" },
      skipFileValidation: true,
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.gradeAverage).toContain("Promedio");
  });

  it("requires configured file fields before submit", () => {
    const result = validateRequiredFiles({
      fields,
      files: {},
    });

    expect(result.isValid).toBe(false);
    expect(result.missingFields[0]?.field_key).toBe("identificationDocument");
  });
});
