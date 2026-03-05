import { describe, expect, it } from "vitest";
import {
  buildUwcStageOneRubricFromBlueprint,
  buildUwcStageOneRubricFromDraft,
  guessUwcStageOnePresetDraft,
  parseRubricBlueprintV1,
  tryHydrateBlueprintFromRubric,
  validateUwcBlueprintDraft,
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
      recommendationCompleteness: "strict_form_valid",
      recommendationRoles: ["mentor", "friend"],
      minRecommendationResponses: 2,
      gradesCombinationRule: "single_or_review",
      idExceptionRule: "review",
      limitGradesDocumentToSingleUpload: true,
    });

    expect(rubric.enabled).toBe(true);
    expect(rubric.criteria.length).toBeGreaterThanOrEqual(10);
    const nameCriterion = rubric.criteria.find((criterion) => criterion.id === "applicant_name_matches_id");
    expect(nameCriterion?.kind).toBe("any_of");
    if (nameCriterion?.kind === "any_of") {
      expect(nameCriterion.conditions?.some((condition) => condition.kind === "field_matches_ocr")).toBe(true);
    }
  });

  it("rejects invalid wizard drafts when critical mappings are missing", () => {
    const validation = validateUwcBlueprintDraft({
      idDocumentFileKeys: [],
      gradesDocumentFileKeys: ["gradesOfficial"],
      topThirdProofFileKey: null,
      applicantNameFieldKey: null,
      averageGradeFieldKey: null,
      signedAuthorizationFileKey: null,
      applicantPhotoFileKey: null,
      ocrNamePath: "",
      ocrBirthYearPath: "",
      ocrDocumentTypePath: "",
      ocrDocumentIssuePath: "",
      allowedBirthYears: [],
      minAverageGrade: 14,
      recommendationCompleteness: "strict_form_valid",
      recommendationRoles: ["mentor", "friend"],
      minRecommendationResponses: 0,
      gradesCombinationRule: "single_or_review",
      idExceptionRule: "review",
      limitGradesDocumentToSingleUpload: true,
    });

    expect(validation.success).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it("compiles strict recommendation rule and grades-combination review from blueprint", () => {
    const blueprint = parseRubricBlueprintV1({
      version: 1,
      presetId: "uwc_stage1",
      execution: { mode: "manual" },
      mappings: {
        idDocumentFileKeys: ["dniFile", "passportFile"],
        gradesDocumentFileKeys: ["gradesA", "gradesB"],
        topThirdProofFileKey: "topThirdProof",
        applicantNameFieldKey: "fullName",
        averageGradeFieldKey: "gradeAverage",
        signedAuthorizationFileKey: "signedAuthorization",
        applicantPhotoFileKey: "applicantPhoto",
        ocrPaths: {
          idName: "fullName",
          birthYear: "birthYear",
          documentType: "documentType",
          documentIssue: "documentIssue",
        },
      },
      policy: {
        allowedBirthYears: [2008, 2009, 2010],
        minAverageGrade: 14,
        recommendationCompleteness: "strict_form_valid",
        recommendationMinAnswers: 0,
        gradesCombinationRule: "single_or_review",
        idExceptionRule: "review",
      },
    });

    expect(blueprint).not.toBeNull();
    if (!blueprint) {
      return;
    }

    const rubric = buildUwcStageOneRubricFromBlueprint(blueprint);
    const recCriterion = rubric.criteria.find((criterion) => criterion.id === "recommendations_completed");
    const gradesComboCriterion = rubric.criteria.find(
      (criterion) => criterion.id === "grades_document_combination_review",
    );
    const docTypeCriterion = rubric.criteria.find((criterion) => criterion.id === "id_document_type_allowed");

    expect(recCriterion?.kind).toBe("recommendations_complete");
    if (recCriterion?.kind === "recommendations_complete") {
      expect(recCriterion.completenessMode).toBe("strict_form_valid");
    }
    expect(gradesComboCriterion?.kind).toBe("file_upload_count_between");
    expect(docTypeCriterion?.kind).toBe("any_of");
    if (docTypeCriterion?.kind === "any_of") {
      expect(docTypeCriterion.conditions?.length).toBe(2);
      expect(docTypeCriterion.conditions?.every((condition) => condition.kind === "ocr_field_in")).toBe(true);
    }
  });

  it("hydrates blueprint back from compiled rubric", () => {
    const rubric = buildUwcStageOneRubricFromDraft({
      idDocumentFileKeys: ["dniUpload"],
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
      recommendationCompleteness: "strict_form_valid",
      recommendationRoles: ["mentor", "friend"],
      minRecommendationResponses: 0,
      gradesCombinationRule: "single_or_review",
      idExceptionRule: "review",
      limitGradesDocumentToSingleUpload: true,
    });

    const hydrated = tryHydrateBlueprintFromRubric(rubric);
    expect(hydrated).not.toBeNull();
    expect(hydrated?.policy.recommendationCompleteness).toBe("strict_form_valid");
    expect(hydrated?.execution.mode).toBe("manual");
  });

  it("applies configurable policy outcomes for ID exceptions and grades combinations", () => {
    const blueprint = parseRubricBlueprintV1({
      version: 1,
      presetId: "uwc_stage1",
      execution: { mode: "manual" },
      mappings: {
        idDocumentFileKeys: ["dniFile", "passportFile"],
        gradesDocumentFileKeys: ["gradesA", "gradesB"],
        topThirdProofFileKey: null,
        applicantNameFieldKey: "fullName",
        averageGradeFieldKey: "gradeAverage",
        signedAuthorizationFileKey: "signedAuthorization",
        applicantPhotoFileKey: "applicantPhoto",
        ocrPaths: {
          idName: "fullName",
          birthYear: "birthYear",
          documentType: "documentType",
          documentIssue: "documentIssue",
        },
      },
      policy: {
        allowedBirthYears: [2008, 2009, 2010],
        minAverageGrade: 14,
        recommendationCompleteness: "minimum_answers",
        recommendationMinAnswers: 3,
        gradesCombinationRule: "single_or_not_eligible",
        idExceptionRule: "not_eligible",
      },
    });

    expect(blueprint).not.toBeNull();
    if (!blueprint) {
      return;
    }

    const rubric = buildUwcStageOneRubricFromBlueprint(blueprint);
    const idExceptionCriterion = rubric.criteria.find(
      (criterion) => criterion.id === "id_document_issue_exceptions",
    );
    const gradesCombinationCriterion = rubric.criteria.find(
      (criterion) => criterion.id === "grades_document_combination_review",
    );
    const recommendationsCriterion = rubric.criteria.find(
      (criterion) => criterion.id === "recommendations_completed",
    );

    expect(idExceptionCriterion?.onFail).toBe("not_eligible");
    expect(gradesCombinationCriterion?.onFail).toBe("not_eligible");
    if (recommendationsCriterion?.kind === "recommendations_complete") {
      expect(recommendationsCriterion.completenessMode).toBe("minimum_answers");
      expect(recommendationsCriterion.minFilledResponses).toBe(3);
    }
  });
});
