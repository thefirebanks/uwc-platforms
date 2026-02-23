import type { CycleStageField } from "@/types/domain";

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

export function groupApplicantFormFields(fields: CycleStageField[]): ApplicantFormSection[] {
  const grouped = new Map<ApplicantFormSectionId, CycleStageField[]>();

  for (const sectionId of SECTION_ORDER) {
    grouped.set(sectionId, []);
  }

  for (const field of fields) {
    if (!field.is_active || field.field_type === "file") {
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
