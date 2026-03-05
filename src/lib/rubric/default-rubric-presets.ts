import type {
  CycleStageField,
  EligibilityRubricConfig,
  RecommenderRole,
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
  recommendationRoles: RecommenderRole[];
  minRecommendationResponses: number;
  limitGradesDocumentToSingleUpload: boolean;
};

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function containsAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
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
    recommendationRoles: ["mentor", "friend"],
    minRecommendationResponses: 2,
    limitGradesDocumentToSingleUpload: true,
  };
}

export function buildUwcStageOneRubricFromDraft(
  draft: UwcStageOnePresetDraft,
): EligibilityRubricConfig {
  const idDocKeys = uniqueStrings(draft.idDocumentFileKeys).slice(0, 3);
  const gradesDocKeys = uniqueStrings(draft.gradesDocumentFileKeys);
  const allowedYears = uniqueStrings(draft.allowedBirthYears.map((year) => String(year)));
  const recommendationRoles = draft.recommendationRoles.length > 0
    ? draft.recommendationRoles
    : (["mentor", "friend"] satisfies RecommenderRole[]);

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
      kind: "ocr_field_in",
      fileKey: idDocKeys[0] ?? "idDocument",
      jsonPath: draft.ocrDocumentTypePath,
      allowedValues: ["dni", "pasaporte", "carnet_extranjeria"],
      caseSensitive: false,
      onFail: "needs_review",
      onMissingData: "needs_review",
    },
    {
      id: "id_document_issue_exceptions",
      label: "Documento de identidad sin excepciones observadas",
      kind: "ocr_field_not_in",
      fileKey: idDocKeys[0] ?? "idDocument",
      jsonPath: draft.ocrDocumentIssuePath,
      disallowedValues: [
        "expired",
        "reniec_certificate_instead_of_dni",
        "birth_certificate_instead_of_dni",
      ],
      caseSensitive: false,
      onFail: "needs_review",
      onMissingData: "needs_review",
    },
    {
      id: "applicant_name_matches_id",
      label: "Nombre del formulario coincide con documento de identidad",
      kind: "field_matches_ocr",
      fieldKey: draft.applicantNameFieldKey ?? "fullName",
      fileKey: idDocKeys[0] ?? "idDocument",
      jsonPath: draft.ocrNamePath,
      caseSensitive: false,
      normalizeWhitespace: true,
      onFail: "needs_review",
      onMissingData: "needs_review",
    },
    {
      id: "birth_year_allowed",
      label: "Año de nacimiento permitido",
      kind: "ocr_field_in",
      fileKey: idDocKeys[0] ?? "idDocument",
      jsonPath: draft.ocrBirthYearPath,
      allowedValues: allowedYears.length > 0 ? allowedYears : ["2008", "2009", "2010"],
      caseSensitive: false,
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
        ...(draft.topThirdProofFileKey
          ? [
              {
                kind: "file_uploaded" as const,
                fileKey: draft.topThirdProofFileKey,
              },
            ]
          : []),
        {
          kind: "number_between" as const,
          fieldKey: draft.averageGradeFieldKey ?? "gradeAverage",
          min: draft.minAverageGrade,
        },
      ],
      onFail: "not_eligible",
      onMissingData: "needs_review",
    },
    {
      id: "recommendations_completed",
      label: "Recomendaciones enviadas y completas",
      kind: "recommendations_complete",
      roles: recommendationRoles,
      requireRequested: true,
      minFilledResponses: Math.max(0, draft.minRecommendationResponses),
      onFail: "not_eligible",
      onMissingData: "needs_review",
    },
    {
      id: "signed_authorization_uploaded",
      label: "Autorización firmada cargada",
      kind: "file_uploaded",
      fileKey: draft.signedAuthorizationFileKey ?? "signedAuthorization",
      onFail: "not_eligible",
      onMissingData: "not_eligible",
    },
    {
      id: "applicant_photo_uploaded",
      label: "Foto del postulante cargada",
      kind: "file_uploaded",
      fileKey: draft.applicantPhotoFileKey ?? "applicantPhoto",
      onFail: "not_eligible",
      onMissingData: "not_eligible",
    },
  ];

  if (draft.limitGradesDocumentToSingleUpload && gradesDocKeys.length > 1) {
    criteria.splice(6, 0, {
      id: "grades_document_combination_review",
      label: "Combinación de documentos de notas requiere revisión",
      kind: "file_upload_count_between",
      fileKeys: gradesDocKeys,
      minCount: 1,
      maxCount: 1,
      onFail: "needs_review",
      onMissingData: "not_eligible",
    });
  }

  return {
    enabled: true,
    criteria,
  };
}
