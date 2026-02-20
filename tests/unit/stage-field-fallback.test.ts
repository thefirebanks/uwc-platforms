import { describe, expect, it } from "vitest";
import { buildFallbackStageFields, resolveDocumentStageFields } from "@/lib/stages/stage-field-fallback";
import type { CycleStageField } from "@/types/domain";

function makeField(fieldKey: string): CycleStageField {
  return {
    id: `id-${fieldKey}`,
    cycle_id: "cycle-1",
    stage_code: "documents",
    field_key: fieldKey,
    field_label: fieldKey,
    field_type: "short_text",
    is_required: false,
    placeholder: null,
    help_text: null,
    sort_order: 1,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("resolveDocumentStageFields", () => {
  it("uses expanded fallback when there are no fields", () => {
    const fields = resolveDocumentStageFields({
      cycleId: "cycle-1",
      fields: [],
    });

    expect(fields.length).toBeGreaterThan(100);
    expect(fields.some((field) => field.field_key === "officialGrade_primero_arte")).toBe(true);
  });

  it("keeps legacy-shaped stage fields untouched when already configured", () => {
    const legacy = [
      "fullName",
      "dateOfBirth",
      "nationality",
      "schoolName",
      "gradeAverage",
      "essay",
      "identificationDocument",
    ].map(makeField);

    const resolved = resolveDocumentStageFields({
      cycleId: "cycle-legacy",
      fields: legacy,
    });

    expect(resolved).toEqual(legacy);
  });

  it("keeps user-defined stage fields untouched", () => {
    const customFields = [makeField("customFieldA"), makeField("customFieldB")];
    const resolved = resolveDocumentStageFields({
      cycleId: "cycle-custom",
      fields: customFields,
    });

    expect(resolved).toEqual(customFields);
  });
});
