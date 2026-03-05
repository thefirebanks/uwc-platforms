import { z } from "zod";
import type {
  CycleStageField,
  EligibilityRubricConfig,
  RecommenderRole,
  RubricBlueprintV1,
  RubricMeta,
} from "@/types/domain";

type LightweightField = Pick<CycleStageField, "field_key" | "field_label" | "field_type">;

export type UwcStageOnePresetDraft = {
  idDocumentFileKeys: string[];
  gradesDocumentFileKeys: string[];
  topThirdProofFileKey: string | null;
  applicantNameFieldKey: string | null;
  averageGradeFieldKey: string | null;
  signedAuthorizationFileKey: string | null;
  applicantPhotoFileKey: string | null;
  ocrNamePath: string;
  ocrBirthYearPath: string;
  ocrDocumentTypePath: string;
  ocrDocumentIssuePath: string;
  allowedBirthYears: number[];
  minAverageGrade: number;
  recommendationCompleteness: "strict_form_valid" | "minimum_answers";
  recommendationRoles: RecommenderRole[];
  minRecommendationResponses: number;
  gradesCombinationRule: "single_or_review" | "single_or_not_eligible" | "allow_multiple";
  idExceptionRule: "review" | "not_eligible";
  limitGradesDocumentToSingleUpload: boolean;
};

const ocrPathsSchema = z.object({
  idName: z.string().trim().min(1).max(200),
  birthYear: z.string().trim().min(1).max(200),
  documentType: z.string().trim().min(1).max(200),
  documentIssue: z.string().trim().min(1).max(200),
});

export const rubricBlueprintV1Schema = z.object({
  version: z.literal(1),
  presetId: z.literal("uwc_stage1"),
  execution: z.object({
    mode: z.literal("manual"),
  }),
  mappings: z.object({
    idDocumentFileKeys: z.array(z.string().trim().min(1).max(120)).min(1).max(3),
    gradesDocumentFileKeys: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
    topThirdProofFileKey: z.string().trim().min(1).max(120).nullable(),
    applicantNameFieldKey: z.string().trim().min(1).max(120),
    averageGradeFieldKey: z.string().trim().min(1).max(120),
    signedAuthorizationFileKey: z.string().trim().min(1).max(120),
    applicantPhotoFileKey: z.string().trim().min(1).max(120),
    ocrPaths: ocrPathsSchema,
  }),
  policy: z.object({
    allowedBirthYears: z.array(z.number().int().min(1900).max(2100)).min(1).max(10),
    minAverageGrade: z.number().min(0).max(20),
    recommendationCompleteness: z.enum(["strict_form_valid", "minimum_answers"]).default("strict_form_valid"),
    recommendationMinAnswers: z.number().int().min(0).max(20).default(0),
    gradesCombinationRule: z
      .enum(["single_or_review", "single_or_not_eligible", "allow_multiple"])
      .default("single_or_review"),
    idExceptionRule: z.enum(["review", "not_eligible"]).default("review"),
  }),
});

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function containsAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function findFileKeys(fields: LightweightField[], keywords: string[]) {
  return uniqueStrings(
    fields
      .filter((field) => field.field_type === "file")
      .filter((field) => {
        const combined = normalizeText(`${field.field_key} ${field.field_label}`);
        return containsAny(combined, keywords);
      })
      .map((field) => field.field_key),
  );
}

function findFirstFieldKey(
  fields: LightweightField[],
  fieldType: CycleStageField["field_type"] | null,
  keywords: string[],
) {
  return (
    fields.find((field) => {
      if (fieldType && field.field_type !== fieldType) {
        return false;
      }
      const combined = normalizeText(`${field.field_key} ${field.field_label}`);
      return containsAny(combined, keywords);
    })?.field_key ?? null
  );
}

export function guessUwcStageOnePresetDraft(
  fields: LightweightField[],
): UwcStageOnePresetDraft {
  const idDocumentFileKeys = findFileKeys(fields, [
    "dni",
    "pasaporte",
    "passport",
    "carnet",
    "id",
    "identidad",
  ]);

  const gradesDocumentFileKeys = findFileKeys(fields, [
    "nota",
    "grade",
    "calificacion",
    "certificado",
    "ugel",
    "logros",
    "estudio",
    "school",
  ]);

  const topThirdProofFileKey = findFirstFieldKey(fields, "file", [
    "tercio",
    "top",
    "superior",
    "ranking",
  ]);

  const applicantNameFieldKey = findFirstFieldKey(fields, null, [
    "nombre",
    "name",
    "full_name",
    "fullname",
  ]);

  const averageGradeFieldKey = findFirstFieldKey(fields, "number", [
    "promedio",
    "average",
    "grade_average",
    "nota_media",
  ]);

  const signedAuthorizationFileKey = findFirstFieldKey(fields, "file", [
    "autoriz",
    "consent",
    "parent",
    "firma",
    "signed",
  ]);

  const applicantPhotoFileKey = findFirstFieldKey(fields, "file", [
    "foto",
    "photo",
    "picture",
    "selfie",
  ]);

  return {
    idDocumentFileKeys:
      idDocumentFileKeys.length > 0 ? idDocumentFileKeys.slice(0, 3) : ["idDocument"],
    gradesDocumentFileKeys:
      gradesDocumentFileKeys.length > 0 ? gradesDocumentFileKeys : ["gradesOfficialDocument"],
    topThirdProofFileKey,
    applicantNameFieldKey,
    averageGradeFieldKey,
    signedAuthorizationFileKey,
    applicantPhotoFileKey,
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
  };
}

export function validateUwcBlueprintDraft(draft: UwcStageOnePresetDraft) {
  const candidate = {
    version: 1,
    presetId: "uwc_stage1",
    execution: { mode: "manual" },
    mappings: {
      idDocumentFileKeys: uniqueStrings(draft.idDocumentFileKeys).slice(0, 3),
      gradesDocumentFileKeys: uniqueStrings(draft.gradesDocumentFileKeys),
      topThirdProofFileKey: draft.topThirdProofFileKey?.trim() || null,
      applicantNameFieldKey: draft.applicantNameFieldKey?.trim() || "",
      averageGradeFieldKey: draft.averageGradeFieldKey?.trim() || "",
      signedAuthorizationFileKey: draft.signedAuthorizationFileKey?.trim() || "",
      applicantPhotoFileKey: draft.applicantPhotoFileKey?.trim() || "",
      ocrPaths: {
        idName: draft.ocrNamePath.trim(),
        birthYear: draft.ocrBirthYearPath.trim(),
        documentType: draft.ocrDocumentTypePath.trim(),
        documentIssue: draft.ocrDocumentIssuePath.trim(),
      },
    },
    policy: {
      allowedBirthYears: Array.from(new Set(draft.allowedBirthYears)).sort((a, b) => a - b),
      minAverageGrade: draft.minAverageGrade,
      recommendationCompleteness: draft.recommendationCompleteness,
      recommendationMinAnswers:
        draft.recommendationCompleteness === "minimum_answers"
          ? Math.max(0, Math.trunc(draft.minRecommendationResponses))
          : 0,
      gradesCombinationRule: draft.gradesCombinationRule,
      idExceptionRule: draft.idExceptionRule,
    },
  } satisfies RubricBlueprintV1;

  const parsed = rubricBlueprintV1Schema.safeParse(candidate);
  if (parsed.success) {
    return {
      success: true as const,
      data: parsed.data as RubricBlueprintV1,
      errors: [] as string[],
    };
  }

  const errors = parsed.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return {
    success: false as const,
    data: null,
    errors,
  };
}

export function parseRubricBlueprintV1(value: unknown): RubricBlueprintV1 | null {
  const parsed = rubricBlueprintV1Schema.safeParse(value);
  return parsed.success ? (parsed.data as RubricBlueprintV1) : null;
}

export function buildUwcStageOneRubricFromBlueprint(
  blueprint: RubricBlueprintV1,
): EligibilityRubricConfig {
  const idDocKeys = uniqueStrings(blueprint.mappings.idDocumentFileKeys).slice(0, 3);
  const gradesDocKeys = uniqueStrings(blueprint.mappings.gradesDocumentFileKeys);
  const allowedYears = uniqueStrings(
    blueprint.policy.allowedBirthYears.map((year) => String(year)),
  );
  const recommendationMinAnswers =
    blueprint.policy.recommendationCompleteness === "minimum_answers"
      ? Math.max(0, Math.trunc(blueprint.policy.recommendationMinAnswers ?? 0))
      : 0;
  const idExceptionOnFail =
    blueprint.policy.idExceptionRule === "not_eligible" ? "not_eligible" : "needs_review";
  const idDocOcrInConditions = ({
    jsonPath,
    allowedValues,
  }: {
    jsonPath: string;
    allowedValues: string[];
  }) =>
    idDocKeys.map((fileKey) => ({
      kind: "ocr_field_in" as const,
      fileKey,
      jsonPath,
      allowedValues,
      caseSensitive: false,
    }));

  const idDocOcrNotInConditions = ({
    jsonPath,
    disallowedValues,
  }: {
    jsonPath: string;
    disallowedValues: string[];
  }) =>
    idDocKeys.map((fileKey) => ({
      kind: "ocr_field_not_in" as const,
      fileKey,
      jsonPath,
      disallowedValues,
      caseSensitive: false,
    }));

  const idDocFieldMatchConditions = ({
    fieldKey,
    jsonPath,
  }: {
    fieldKey: string;
    jsonPath: string;
  }) =>
    idDocKeys.map((fileKey) => ({
      kind: "field_matches_ocr" as const,
      fieldKey,
      fileKey,
      jsonPath,
      caseSensitive: false,
      normalizeWhitespace: true,
    }));

  const criteria: EligibilityRubricConfig["criteria"] = [
    {
      id: "id_document_uploaded",
      label: "Documento de identidad cargado (DNI/Pasaporte/Carnet)",
      kind: "any_of",
      conditions: idDocKeys.map((fileKey) => ({
        kind: "file_uploaded",
        fileKey,
      })),
      onFail: "not_eligible",
      onMissingData: "not_eligible",
    },
    {
      id: "id_document_type_allowed",
      label: "Tipo de documento de identidad permitido",
      kind: "any_of",
      conditions: idDocOcrInConditions({
        jsonPath: blueprint.mappings.ocrPaths.documentType,
        allowedValues: ["dni", "pasaporte", "carnet_extranjeria"],
      }),
      onFail: "needs_review",
      onMissingData: "needs_review",
    },
    {
      id: "id_document_issue_exceptions",
      label: "Documento de identidad sin excepciones observadas",
      kind: "any_of",
      conditions: idDocOcrNotInConditions({
        jsonPath: blueprint.mappings.ocrPaths.documentIssue,
        disallowedValues: [
          "expired",
          "reniec_certificate_instead_of_dni",
          "birth_certificate_instead_of_dni",
        ],
      }),
      onFail: idExceptionOnFail,
      onMissingData: "needs_review",
    },
    {
      id: "applicant_name_matches_id",
      label: "Nombre del formulario coincide con documento de identidad",
      kind: "any_of",
      conditions: idDocFieldMatchConditions({
        fieldKey: blueprint.mappings.applicantNameFieldKey,
        jsonPath: blueprint.mappings.ocrPaths.idName,
      }),
      onFail: "needs_review",
      onMissingData: "needs_review",
    },
    {
      id: "birth_year_allowed",
      label: "Año de nacimiento permitido",
      kind: "any_of",
      conditions: idDocOcrInConditions({
        jsonPath: blueprint.mappings.ocrPaths.birthYear,
        allowedValues: allowedYears.length > 0 ? allowedYears : ["2008", "2009", "2010"],
      }),
      onFail: "not_eligible",
      onMissingData: "needs_review",
    },
    {
      id: "grades_documents_uploaded",
      label: "Documento oficial de notas cargado",
      kind: "any_of",
      conditions: gradesDocKeys.map((fileKey) => ({
        kind: "file_uploaded",
        fileKey,
      })),
      onFail: "not_eligible",
      onMissingData: "not_eligible",
    },
    {
      id: "top_third_or_grade_average",
      label: "Prueba de tercio superior o promedio mínimo",
      kind: "any_of",
      conditions: [
        ...(blueprint.mappings.topThirdProofFileKey
          ? [
              {
                kind: "file_uploaded" as const,
                fileKey: blueprint.mappings.topThirdProofFileKey,
              },
            ]
          : []),
        {
          kind: "number_between" as const,
          fieldKey: blueprint.mappings.averageGradeFieldKey,
          min: blueprint.policy.minAverageGrade,
        },
      ],
      onFail: "not_eligible",
      onMissingData: "needs_review",
    },
    {
      id: "recommendations_completed",
      label: "Recomendaciones enviadas y completas",
      kind: "recommendations_complete",
      roles: ["mentor", "friend"],
      requireRequested: true,
      minFilledResponses: recommendationMinAnswers,
      completenessMode: blueprint.policy.recommendationCompleteness,
      onFail: "not_eligible",
      onMissingData: "needs_review",
    },
    {
      id: "signed_authorization_uploaded",
      label: "Autorización firmada cargada",
      kind: "file_uploaded",
      fileKey: blueprint.mappings.signedAuthorizationFileKey,
      onFail: "not_eligible",
      onMissingData: "not_eligible",
    },
    {
      id: "applicant_photo_uploaded",
      label: "Foto del postulante cargada",
      kind: "file_uploaded",
      fileKey: blueprint.mappings.applicantPhotoFileKey,
      onFail: "not_eligible",
      onMissingData: "not_eligible",
    },
  ];

  if (blueprint.policy.gradesCombinationRule !== "allow_multiple" && gradesDocKeys.length > 1) {
    criteria.splice(6, 0, {
      id: "grades_document_combination_review",
      label: "Combinación de documentos de notas requiere revisión",
      kind: "file_upload_count_between",
      fileKeys: gradesDocKeys,
      minCount: 1,
      maxCount: 1,
      onFail:
        blueprint.policy.gradesCombinationRule === "single_or_not_eligible"
          ? "not_eligible"
          : "needs_review",
      onMissingData: "not_eligible",
    });
  }

  return {
    enabled: true,
    criteria,
  };
}

export function buildUwcStageOneRubricFromDraft(
  draft: UwcStageOnePresetDraft,
): EligibilityRubricConfig {
  const validated = validateUwcBlueprintDraft(draft);
  if (!validated.success) {
    // Fallback to ensure backward compatibility when caller still expects a rubric.
    const fallback = guessUwcStageOnePresetDraft([]);
    const fallbackValidated = validateUwcBlueprintDraft(fallback);
    if (!fallbackValidated.success) {
      return {
        enabled: false,
        criteria: [],
      };
    }
    return buildUwcStageOneRubricFromBlueprint(fallbackValidated.data);
  }

  return buildUwcStageOneRubricFromBlueprint(validated.data);
}

export function createRubricMeta({
  source,
  compiledBy,
}: {
  source: RubricMeta["source"];
  compiledBy?: string | null;
}): RubricMeta {
  return {
    presetId: "uwc_stage1",
    compiledAt: new Date().toISOString(),
    compiledBy: compiledBy ?? null,
    source,
    version: 1,
  };
}

export function tryHydrateBlueprintFromRubric(
  rubric: EligibilityRubricConfig,
): RubricBlueprintV1 | null {
  const extractOcrInSpecs = (criterion: EligibilityRubricConfig["criteria"][number]) => {
    if (criterion.kind === "ocr_field_in") {
      return [
        {
          fileKey: criterion.fileKey ?? "",
          jsonPath: criterion.jsonPath ?? "",
          allowedValues: criterion.allowedValues ?? [],
        },
      ];
    }
    if (criterion.kind === "any_of") {
      return (criterion.conditions ?? [])
        .filter((condition) => condition.kind === "ocr_field_in")
        .map((condition) => ({
          fileKey: condition.fileKey ?? "",
          jsonPath: condition.jsonPath ?? "",
          allowedValues: condition.allowedValues ?? [],
        }));
    }
    return [];
  };

  const extractOcrNotInSpecs = (criterion: EligibilityRubricConfig["criteria"][number]) => {
    if (criterion.kind === "ocr_field_not_in") {
      return [
        {
          fileKey: criterion.fileKey ?? "",
          jsonPath: criterion.jsonPath ?? "",
        },
      ];
    }
    if (criterion.kind === "any_of") {
      return (criterion.conditions ?? [])
        .filter((condition) => condition.kind === "ocr_field_not_in")
        .map((condition) => ({
          fileKey: condition.fileKey ?? "",
          jsonPath: condition.jsonPath ?? "",
        }));
    }
    return [];
  };

  const extractFieldMatchSpecs = (criterion: EligibilityRubricConfig["criteria"][number]) => {
    if (criterion.kind === "field_matches_ocr") {
      return [
        {
          fieldKey: criterion.fieldKey ?? "",
          fileKey: criterion.fileKey ?? "",
          jsonPath: criterion.jsonPath ?? "",
        },
      ];
    }
    if (criterion.kind === "any_of") {
      return (criterion.conditions ?? [])
        .filter((condition) => condition.kind === "field_matches_ocr")
        .map((condition) => ({
          fieldKey: condition.fieldKey ?? "",
          fileKey: condition.fileKey ?? "",
          jsonPath: condition.jsonPath ?? "",
        }));
    }
    return [];
  };

  const byId = new Map(rubric.criteria.map((criterion) => [criterion.id, criterion] as const));

  const idUpload = byId.get("id_document_uploaded");
  const gradesUpload = byId.get("grades_documents_uploaded");
  const topThirdOrAverage = byId.get("top_third_or_grade_average");
  const nameMatch = byId.get("applicant_name_matches_id");
  const birthYear = byId.get("birth_year_allowed");
  const docType = byId.get("id_document_type_allowed");
  const docIssue = byId.get("id_document_issue_exceptions");
  const authorization = byId.get("signed_authorization_uploaded");
  const photo = byId.get("applicant_photo_uploaded");
  const recommendations = byId.get("recommendations_completed");
  const gradesCombination = byId.get("grades_document_combination_review");

  if (
    !idUpload ||
    !gradesUpload ||
    !topThirdOrAverage ||
    !nameMatch ||
    !birthYear ||
    !docType ||
    !docIssue ||
    !authorization ||
    !photo ||
    !recommendations
  ) {
    return null;
  }

  if (
    idUpload.kind !== "any_of" ||
    gradesUpload.kind !== "any_of" ||
    topThirdOrAverage.kind !== "any_of" ||
    authorization.kind !== "file_uploaded" ||
    photo.kind !== "file_uploaded" ||
    recommendations.kind !== "recommendations_complete"
  ) {
    return null;
  }

  const idDocumentFileKeysFromUpload = (idUpload.conditions ?? [])
    .filter((condition) => condition.kind === "file_uploaded")
    .map((condition) => condition.fileKey ?? "")
    .filter(Boolean);

  const gradesDocumentFileKeys = (gradesUpload.conditions ?? [])
    .filter((condition) => condition.kind === "file_uploaded")
    .map((condition) => condition.fileKey ?? "")
    .filter(Boolean);

  const topThirdProofFileKey = (topThirdOrAverage.conditions ?? []).find(
    (condition) => condition.kind === "file_uploaded",
  )?.fileKey ?? null;

  const averageGradeFieldKey = (topThirdOrAverage.conditions ?? []).find(
    (condition) => condition.kind === "number_between",
  )?.fieldKey ?? null;

  const minAverageGrade = (topThirdOrAverage.conditions ?? []).find(
    (condition) => condition.kind === "number_between",
  )?.min;

  const nameMatchSpecs = extractFieldMatchSpecs(nameMatch);
  const birthYearSpecs = extractOcrInSpecs(birthYear);
  const docTypeSpecs = extractOcrInSpecs(docType);
  const docIssueSpecs = extractOcrNotInSpecs(docIssue);

  if (
    nameMatchSpecs.length === 0 ||
    birthYearSpecs.length === 0 ||
    docTypeSpecs.length === 0 ||
    docIssueSpecs.length === 0
  ) {
    return null;
  }

  const applicantNameFieldKeys = uniqueStrings(nameMatchSpecs.map((spec) => spec.fieldKey));
  const namePaths = uniqueStrings(nameMatchSpecs.map((spec) => spec.jsonPath));
  const birthYearPaths = uniqueStrings(birthYearSpecs.map((spec) => spec.jsonPath));
  const documentTypePaths = uniqueStrings(docTypeSpecs.map((spec) => spec.jsonPath));
  const documentIssuePaths = uniqueStrings(docIssueSpecs.map((spec) => spec.jsonPath));

  if (
    applicantNameFieldKeys.length !== 1 ||
    namePaths.length !== 1 ||
    birthYearPaths.length !== 1 ||
    documentTypePaths.length !== 1 ||
    documentIssuePaths.length !== 1
  ) {
    return null;
  }

  const idDocumentFileKeysFromOcrCriteria = uniqueStrings([
    ...nameMatchSpecs.map((spec) => spec.fileKey),
    ...birthYearSpecs.map((spec) => spec.fileKey),
    ...docTypeSpecs.map((spec) => spec.fileKey),
    ...docIssueSpecs.map((spec) => spec.fileKey),
  ]);

  if (idDocumentFileKeysFromOcrCriteria.length === 0) {
    return null;
  }

  if (
    idDocumentFileKeysFromUpload.length > 0 &&
    idDocumentFileKeysFromUpload.some((fileKey) => !idDocumentFileKeysFromOcrCriteria.includes(fileKey))
  ) {
    return null;
  }

  const idDocumentFileKeys =
    idDocumentFileKeysFromUpload.length > 0
      ? idDocumentFileKeysFromUpload
      : idDocumentFileKeysFromOcrCriteria;

  const parsedBirthYears = uniqueStrings(
    birthYearSpecs.flatMap((spec) => spec.allowedValues.map((value) => String(value))),
  )
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));

  const candidate: RubricBlueprintV1 = {
    version: 1,
    presetId: "uwc_stage1",
    execution: {
      mode: "manual",
    },
    mappings: {
      idDocumentFileKeys,
      gradesDocumentFileKeys,
      topThirdProofFileKey,
      applicantNameFieldKey: applicantNameFieldKeys[0] ?? "",
      averageGradeFieldKey: averageGradeFieldKey ?? "",
      signedAuthorizationFileKey: authorization.fileKey ?? "",
      applicantPhotoFileKey: photo.fileKey ?? "",
      ocrPaths: {
        idName: namePaths[0] ?? "",
        birthYear: birthYearPaths[0] ?? "",
        documentType: documentTypePaths[0] ?? "",
        documentIssue: documentIssuePaths[0] ?? "",
      },
    },
    policy: {
      allowedBirthYears: parsedBirthYears,
      minAverageGrade:
        typeof minAverageGrade === "number" ? minAverageGrade : 14,
      recommendationCompleteness:
        recommendations.completenessMode === "minimum_answers"
          ? "minimum_answers"
          : "strict_form_valid",
      recommendationMinAnswers:
        recommendations.completenessMode === "minimum_answers"
          ? Math.max(0, Math.trunc(recommendations.minFilledResponses ?? 0))
          : 0,
      gradesCombinationRule:
        gradesCombination?.kind === "file_upload_count_between"
          ? gradesCombination.onFail === "not_eligible"
            ? "single_or_not_eligible"
            : "single_or_review"
          : "allow_multiple",
      idExceptionRule: docIssue.onFail === "not_eligible" ? "not_eligible" : "review",
    },
  };

  const parsed = rubricBlueprintV1Schema.safeParse(candidate);
  return parsed.success ? (parsed.data as RubricBlueprintV1) : null;
}
