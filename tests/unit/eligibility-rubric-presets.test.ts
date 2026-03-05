import { describe, expect, it } from "vitest";
import {
  buildUwcStageOneRubricFromDraft,
  guessUwcStageOnePresetDraft,
} from "@/lib/rubric/default-rubric-presets";
import type { CycleStageField } from "@/types/domain";

function buildField(overrides: Partial<CycleStageField>): CycleStageField {
  return {
    id: crypto.randomUUID(),
    cycle_id: "cycle-1",
    stage_code: "documents",
    field_key: "field",
    field_label: "Field",
    field_type: "short_text",
    is_required: false,
    placeholder: null,
    help_text: null,
    group_name: null,
    sort_order: 1,
    is_active: true,
    section_id: null,
    ai_parser_config: null,
    created_at: "2026-03-05T00:00:00Z",
    ...overrides,
  };
}

describe("default rubric presets", () => {
  it("guesses likely keys from stage fields", () => {
    const fields: CycleStageField[] = [
      buildField({ field_key: "dniUpload", field_label: "DNI", field_type: "file" }),
      buildField({ field_key: "pasaporteUpload", field_label: "Pasaporte", field_type: "file" }),
      buildField({ field_key: "fullName", field_label: "Nombre completo", field_type: "short_text" }),
      buildField({ field_key: "gradeAverage", field_label: "Promedio", field_type: "number" }),
    ];

    const draft = guessUwcStageOnePresetDraft(fields);

    expect(draft.idDocumentFileKeys).toContain("dniUpload");
    expect(draft.idDocumentFileKeys).toContain("pasaporteUpload");
    expect(draft.applicantNameFieldKey).toBe("fullName");
    expect(draft.averageGradeFieldKey).toBe("gradeAverage");
  });

  it("builds a valid baseline rubric from preset draft", () => {
    const rubric = buildUwcStageOneRubricFromDraft({
      idDocumentFileKeys: ["dniUpload", "passportUpload"],
      gradesDocumentFileKeys: ["gradesOfficial"],
      topThirdProofFileKey: "topThirdProof",
      applicantNameFieldKey: "fullName",
      averageGradeFieldKey: "gradeAverage",
      signedAuthorizationFileKey: "signedAuthorization",
      applicantPhotoFileKey: "applicantPhoto",
      ocrNamePath: "fullName",
      ocrBirthYearPath: "birthYear",
      ocrDocumentTypePath: "documentType",
      ocrDocumentIssuePath: "documentIssue",
      allowedBirthYears: [2008, 2009, 2010],
      minAverageGrade: 14,
      recommendationRoles: ["mentor", "friend"],
      minRecommendationResponses: 2,
      limitGradesDocumentToSingleUpload: true,
    });

    expect(rubric.enabled).toBe(true);
    expect(rubric.criteria.length).toBeGreaterThanOrEqual(10);
    expect(rubric.criteria.some((criterion) => criterion.kind === "field_matches_ocr")).toBe(true);
    expect(rubric.criteria.some((criterion) => criterion.kind === "any_of")).toBe(true);
  });
});
