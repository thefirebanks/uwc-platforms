import type { CycleStageField } from "@/types/domain";
import {
  BUILTIN_SECTION_IDS,
  normalizeBuiltinSectionOrder,
  normalizePersistedCustomSections,
  sanitizeHiddenBuiltinSectionIds,
  sanitizeFieldSectionAssignments,
  type PersistedCustomSection,
} from "@/lib/stages/stage-admin-config";

export type ApplicantFormSectionId =
  | "eligibility"
  | "identity"
  | "family"
  | "school"
  | "motivation"
  | "recommenders"
  | "documents"
  | "other";

export type ApplicantFormSection = {
  id: ApplicantFormSectionId;
  title: string;
  description: string;
  fields: CycleStageField[];
};

export type GroupApplicantFormFieldsOptions = {
  includeInactive?: boolean;
  includeFileFields?: boolean;
};

export type ApplicantFormResolvedSectionId = ApplicantFormSectionId | `custom:${string}`;

export type ApplicantFormResolvedSection = {
  id: ApplicantFormResolvedSectionId;
  title: string;
  description: string;
  fields: CycleStageField[];
  kind: "builtin" | "custom";
  builtinSectionId: ApplicantFormSectionId | null;
  customSectionId: string | null;
};

export type GroupApplicantFormFieldsWithCustomSectionsOptions = GroupApplicantFormFieldsOptions & {
  customSections?: PersistedCustomSection[];
  fieldSectionAssignments?: Record<string, string>;
  builtinSectionOrder?: ApplicantFormSectionId[];
  hiddenBuiltinSectionIds?: ApplicantFormSectionId[];
  omitEligibility?: boolean;
};

const SECTION_ORDER: ApplicantFormSectionId[] = [
  "eligibility",
  "identity",
  "family",
  "school",
  "motivation",
  "recommenders",
  "documents",
  "other",
];

const SECTION_META: Record<
  ApplicantFormSectionId,
  { title: string; description: string }
> = {
  eligibility: {
    title: "Elegibilidad",
    description: "Validamos criterios base del proceso 2026.",
  },
  identity: {
    title: "Datos personales",
    description: "Información de identidad, contacto y contexto personal.",
  },
  family: {
    title: "Familia y apoderados",
    description: "Datos de madre/padre/apoderado y custodia legal.",
  },
  school: {
    title: "Colegio y rendimiento académico",
    description: "Datos del colegio y notas oficiales por año. Ingresa tus calificaciones en la escala 0–20.",
  },
  motivation: {
    title: "Motivación y perfil",
    description: "Comparte tu historia, intereses y por qué UWC es tu camino.",
  },
  recommenders: {
    title: "Contexto de recomendadores",
    description: "Datos de referencia para coordinar recomendaciones.",
  },
  documents: {
    title: "Documentos y pagos",
    description: "Información de pago y documentación requerida.",
  },
  other: {
    title: "Otros campos",
    description: "Campos activos personalizados fuera del esquema base.",
  },
};

const ELIGIBILITY_PREFIX = "eligibility";
const CUSTOM_IDENTITY_PREFIX = "identityCustom";
const CUSTOM_FAMILY_PREFIX = "guardianCustom";
const CUSTOM_SCHOOL_PREFIX = "schoolCustom";
const CUSTOM_MOTIVATION_PREFIX = "motivationCustom";
const CUSTOM_RECOMMENDER_PREFIX = "recommenderCustom";
const CUSTOM_DOCUMENTS_PREFIX = "docsCustom";
const ELIGIBILITY_KEYS = new Set([
  "secondNationality",
  "secondaryYear2025",
  "isUpperThird",
  "hasMinimumAverage14",
  "hasStudiedIb",
  "ibInstructionYear",
  "priorUwcPeruSelectionParticipation",
  "otherCountrySelection2025",
  "uwcDiscoveryChannel",
]);

const IDENTITY_KEYS = new Set([
  "fullName",
  "firstName",
  "paternalLastName",
  "maternalLastName",
  "documentType",
  "documentNumber",
  "dateOfBirth",
  "ageAtEndOf2025",
  "gender",
  "nationality",
  "countryOfBirth",
  "countryOfResidence",
  "homeAddressLine",
  "homeAddressNumber",
  "homeDistrict",
  "homeProvince",
  "homeRegion",
  "mobilePhone",
  "landlineOrAlternativePhone",
  "hasDisability",
  "hasLearningDisability",
]);

const FAMILY_PREFIX = "guardian";

const SCHOOL_KEYS = new Set([
  "schoolName",
  "gradeAverage",
  "schoolDirectorName",
  "schoolDirectorEmail",
  "schoolAddressLine",
  "schoolAddressNumber",
  "schoolDistrict",
  "schoolProvince",
  "schoolRegion",
  "schoolCountry",
  "yearsInCurrentSchool",
  "schoolPublicOrPrivate",
  "schoolTypeDetails",
  "receivedSchoolScholarship",
  "officialGradesComments",
]);

const DOCUMENT_KEYS = new Set([
  "paymentOperationNumber",
  "receivedFinancialAidForFee",
]);

const RECOMMENDER_KEYS = new Set([
  "recommenderRequestMessage",
  "mentorRecommenderName",
  "friendRecommenderName",
]);

const MOTIVATION_KEYS = new Set([
  "essay",
  "whyShouldBeSelected",
  "preferredUwcColleges",
  "activityOne",
  "recognition",
  "favoriteKnowledgeArea",
  "freeTimeActivities",
  "selfDescriptionThreeWords",
]);

function isOfficialGradesKey(key: string) {
  return key.startsWith("officialGrade_") || key.startsWith("officialGradeAverage_");
}

export function classifyApplicantFieldKey(fieldKey: string): ApplicantFormSectionId {
  if (fieldKey.startsWith(CUSTOM_IDENTITY_PREFIX)) {
    return "identity";
  }

  if (fieldKey.startsWith(CUSTOM_FAMILY_PREFIX)) {
    return "family";
  }

  if (fieldKey.startsWith(CUSTOM_SCHOOL_PREFIX)) {
    return "school";
  }

  if (fieldKey.startsWith(CUSTOM_MOTIVATION_PREFIX)) {
    return "motivation";
  }

  if (fieldKey.startsWith(CUSTOM_RECOMMENDER_PREFIX)) {
    return "recommenders";
  }

  if (fieldKey.startsWith(CUSTOM_DOCUMENTS_PREFIX)) {
    return "documents";
  }

  if (fieldKey.startsWith(ELIGIBILITY_PREFIX) || ELIGIBILITY_KEYS.has(fieldKey)) {
    return "eligibility";
  }

  if (fieldKey.startsWith(FAMILY_PREFIX)) {
    return "family";
  }

  if (isOfficialGradesKey(fieldKey) || SCHOOL_KEYS.has(fieldKey)) {
    return "school";
  }

  if (RECOMMENDER_KEYS.has(fieldKey)) {
    return "recommenders";
  }

  if (DOCUMENT_KEYS.has(fieldKey)) {
    return "documents";
  }

  if (MOTIVATION_KEYS.has(fieldKey)) {
    return "motivation";
  }

  if (IDENTITY_KEYS.has(fieldKey)) {
    return "identity";
  }

  return "other";
}

export function groupApplicantFormFields(
  fields: CycleStageField[],
  options: GroupApplicantFormFieldsOptions = {},
): ApplicantFormSection[] {
  const { includeInactive = false, includeFileFields = false } = options;
  const grouped = new Map<ApplicantFormSectionId, CycleStageField[]>();

  for (const sectionId of SECTION_ORDER) {
    grouped.set(sectionId, []);
  }

  for (const field of fields) {
    if (!includeInactive && !field.is_active) {
      continue;
    }

    if (!includeFileFields && field.field_type === "file") {
      continue;
    }

    const sectionId = classifyApplicantFieldKey(field.field_key);
    grouped.get(sectionId)?.push(field);
  }

  const sections: ApplicantFormSection[] = [];

  for (const sectionId of SECTION_ORDER) {
    const sectionFields = grouped.get(sectionId) ?? [];
    if (sectionFields.length === 0) {
      continue;
    }

    sections.push({
      id: sectionId,
      title: SECTION_META[sectionId].title,
      description: SECTION_META[sectionId].description,
      fields: sectionFields,
    });
  }

  return sections;
}

function shouldIncludeApplicantField(
  field: CycleStageField,
  options: GroupApplicantFormFieldsOptions,
) {
  const { includeInactive = false, includeFileFields = false } = options;

  if (!includeInactive && !field.is_active) {
    return false;
  }

  if (!includeFileFields && field.field_type === "file") {
    return false;
  }

  return true;
}

export function groupApplicantFormFieldsWithCustomSections(
  fields: CycleStageField[],
  options: GroupApplicantFormFieldsWithCustomSectionsOptions = {},
): ApplicantFormResolvedSection[] {
  const {
    customSections = [],
    fieldSectionAssignments = {},
    builtinSectionOrder,
    hiddenBuiltinSectionIds,
    omitEligibility = false,
    ...groupingOptions
  } = options;
  const normalizedCustomSections = normalizePersistedCustomSections(customSections);
  const normalizedBuiltinSectionOrder = normalizeBuiltinSectionOrder(
    builtinSectionOrder ?? (SECTION_ORDER as ApplicantFormSectionId[]),
  ) as ApplicantFormSectionId[];
  const hiddenBuiltinSectionIdSet = new Set<ApplicantFormSectionId>(
    sanitizeHiddenBuiltinSectionIds(
      hiddenBuiltinSectionIds ?? ([] as ApplicantFormSectionId[]),
    ) as ApplicantFormSectionId[],
  );
  const normalizedAssignments = sanitizeFieldSectionAssignments(
    fieldSectionAssignments,
    normalizedCustomSections,
  );
  const customSectionIds = new Set(normalizedCustomSections.map((section) => section.id));
  const builtinBuckets = new Map<ApplicantFormSectionId, CycleStageField[]>();
  const customBuckets = new Map<string, CycleStageField[]>();

  for (const sectionId of SECTION_ORDER) {
    builtinBuckets.set(sectionId, []);
  }
  for (const section of normalizedCustomSections) {
    customBuckets.set(section.id, []);
  }

  for (const field of fields) {
    if (!shouldIncludeApplicantField(field, groupingOptions)) {
      continue;
    }

    const assignedSectionId = normalizedAssignments[field.field_key];
    if (assignedSectionId) {
      if (customSectionIds.has(assignedSectionId)) {
        customBuckets.get(assignedSectionId)?.push(field);
        continue;
      }

      if ((BUILTIN_SECTION_IDS as readonly string[]).includes(assignedSectionId)) {
        builtinBuckets.get(assignedSectionId as ApplicantFormSectionId)?.push(field);
        continue;
      }
    }

    builtinBuckets.get(classifyApplicantFieldKey(field.field_key))?.push(field);
  }

  const builtInResolvedSections: ApplicantFormResolvedSection[] = [];
  const otherFields = builtinBuckets.get("other") ?? [];

  for (const sectionId of normalizedBuiltinSectionOrder) {
    if (omitEligibility && sectionId === "eligibility") {
      continue;
    }

    const sectionFields = builtinBuckets.get(sectionId) ?? [];

    if (hiddenBuiltinSectionIdSet.has(sectionId)) {
      if (sectionFields.length > 0) {
        otherFields.push(...sectionFields);
      }
      continue;
    }

    if (sectionFields.length === 0) {
      continue;
    }

    builtInResolvedSections.push({
      id: sectionId,
      title: SECTION_META[sectionId].title,
      description: SECTION_META[sectionId].description,
      fields: sectionFields,
      kind: "builtin",
      builtinSectionId: sectionId,
      customSectionId: null,
    });
  }

  const customSectionsWithFields: ApplicantFormResolvedSection[] = normalizedCustomSections
    .map((section) => ({
      id: `custom:${section.id}` as const,
      title: section.title,
      description: "Campos personalizados adicionales de esta etapa.",
      fields: customBuckets.get(section.id) ?? [],
      kind: "custom" as const,
      builtinSectionId: null,
      customSectionId: section.id,
    }))
    .filter((section) => section.fields.length > 0);

  const otherSection = builtInResolvedSections.find((section) => section.id === "other");
  const builtInWithoutOther = builtInResolvedSections.filter((section) => section.id !== "other");

  return otherSection
    ? [...builtInWithoutOther, ...customSectionsWithFields, otherSection]
    : [...builtInWithoutOther, ...customSectionsWithFields];
}
