import type { AppLanguage } from "@/lib/i18n/messages";
import type { Application, CycleStageField, StageSection } from "@/types/domain";
import { groupFieldsBySections } from "@/lib/stages/applicant-sections";
import { buildFallbackStageFields } from "@/lib/stages/stage-field-fallback";

// ─── Shared types ─────────────────────────────────────────────────────

export type ProgressState = "complete" | "in_progress" | "not_started";
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
export type StaticWizardSectionId =
  | "prep_intro"
  | "documents_uploads"
  | "recommenders_flow"
  | "review_submit";
export type WizardSectionId = StaticWizardSectionId | string;

// ─── Constants ────────────────────────────────────────────────────────

export const EMPTY_STAGE_FIELDS: CycleStageField[] = [];
export const PREP_SECTION_ID = "prep_intro" as const;
export const SIDEBAR_VISIBILITY_STORAGE_KEY = "uwc:applicant-sidebar-hidden";

export const SECTION_TITLES_ES: Record<StaticWizardSectionId, string> = {
  prep_intro: "Instrucciones",
  documents_uploads: "Documentos",
  recommenders_flow: "Recomendadores",
  review_submit: "Revisión y envío",
};

export const SECTION_TITLES_EN: Record<StaticWizardSectionId, string> = {
  prep_intro: "Instructions",
  documents_uploads: "Documents",
  recommenders_flow: "Recommenders",
  review_submit: "Review and submit",
};

export const FIELD_LABEL_PREFIX_BY_SECTION: Partial<Record<string, string[]>> = {
  eligibility: ["Cumplimiento de requisitos - "],
  identity: ["Información personal - "],
  family: ["Información familiar y apoderados - "],
  school: ["Información del colegio - "],
  motivation: ["Hoja de vida e interés en UWC - ", "Hoja de vida - "],
  documents: ["Documentos - ", "Pago - ", "Documento - "],
};

export const ENGLISH_FIELD_LABEL_BY_KEY: Record<string, string> = {
  eligibilityBirthYear: "Birth year",
  eligibilityCountryOfBirth: "Country of birth",
  eligibilityCountryOfResidence: "Country of residence",
  secondNationality: "Second nationality",
  secondaryYear2025: "School year attended in 2025",
  isUpperThird: "Are you in the top third?",
  hasMinimumAverage14: "Do you have at least 14 or a B average?",
  hasStudiedIb: "Have you studied IB?",
  ibInstructionYear: "IB instruction year",
  priorUwcPeruSelectionParticipation: "Previously participated in UWC Peru selection?",
  otherCountrySelection2025: "Participated in another country's selection in 2025?",
  uwcDiscoveryChannel: "How did you first hear about UWC?",
};

export const ENGLISH_FIELD_PLACEHOLDER_BY_KEY: Record<string, string> = {
  eligibilityBirthYear: "2008 / 2009 / 2010",
  eligibilityCountryOfBirth: "Peru",
  eligibilityCountryOfResidence: "Peru",
  secondNationality: "Optional",
  secondaryYear2025: "4th or 5th year of secondary school",
  isUpperThird: "Yes / No",
  hasMinimumAverage14: "Yes / No",
  hasStudiedIb: "Yes / No",
  ibInstructionYear: "Example: First year of IB",
  priorUwcPeruSelectionParticipation: "Yes / No",
  otherCountrySelection2025: "Yes / No",
  uwcDiscoveryChannel: "Main source",
};

export const SPANISH_FIELD_PLACEHOLDER_BY_KEY: Partial<Record<string, string>> = {
  documentNumber: "Número",
  guardian1Email: "correo@ejemplo.com",
  guardian2Email: "correo@ejemplo.com",
  guardian1MobilePhone: "+51 ...",
  guardian2MobilePhone: "+51 ...",
  schoolDirectorName: "Director/a",
  schoolAddressLine: "Dirección completa",
  officialGradesComments: "Si hay discrepancias entre tus notas o usas una escala diferente, explica aquí...",
  essay: "Cuenta con tus propias palabras qué te motiva...",
  whyShouldBeSelected: "Describe qué te hace único/a...",
  preferredUwcColleges: "Puedes nombrar hasta 3 colegios y por qué...",
  activityOne: "Describe brevemente...",
  recognition: "Logro, premio, o reconocimiento...",
  favoriteKnowledgeArea: "Tema o curso que más disfrutas...",
  freeTimeActivities: "¿Qué haces en tu tiempo libre?...",
  selfDescriptionThreeWords: "Tres palabras y un ejemplo...",
  paymentOperationNumber: "Solo si corresponde pago regular",
  mentorRecommenderName: "Nombre completo",
  friendRecommenderName: "Nombre completo",
};

export const HIDDEN_FIELD_HELP_TEXT_KEYS = new Set([
  "fullName",
  "dateOfBirth",
  "maternalLastName",
  "mobilePhone",
  "landlineOrAlternativePhone",
  "hasDisability",
  "guardian2FullName",
  "guardian2HasLegalCustody",
  "guardian2Email",
  "guardian2MobilePhone",
  "officialGradesComments",
  "paymentOperationNumber",
]);

export const LONG_TEXT_ROWS_BY_KEY: Partial<Record<string, number>> = {
  officialGradesComments: 2,
  essay: 4,
  whyShouldBeSelected: 4,
  preferredUwcColleges: 2,
  activityOne: 2,
  recognition: 2,
  favoriteKnowledgeArea: 2,
  freeTimeActivities: 2,
  selfDescriptionThreeWords: 2,
};

export const ENGLISH_FIELD_HELP_BY_KEY: Record<string, string> = {
  secondNationality: "Only if applicable.",
  isUpperThird: "Enter the answer as text.",
  ibInstructionYear: "Only if you answered yes to studying/studied IB.",
};

export const SECTION_DESCRIPTIONS_EN: Record<string, string> = {
  eligibility: "Validate baseline eligibility criteria for the 2026 process.",
  identity: "Identity, contact, and personal context information.",
  family: "Parent/guardian and legal custody details.",
  school: "School details and official grades by year.",
  motivation: "Personal responses about interests and purpose.",
  recommenders: "Reference details to coordinate recommendations.",
  documents: "Payment and required document information.",
  other: "Active custom fields outside the base schema.",
};

// ─── Field localization helpers ───────────────────────────────────────

export function getDisplayFieldLabel({
  sectionId,
  fieldLabel,
}: {
  sectionId: string;
  fieldLabel: string;
}) {
  const prefixes = FIELD_LABEL_PREFIX_BY_SECTION[sectionId];
  if (!prefixes || prefixes.length === 0) {
    return fieldLabel;
  }

  for (const prefix of prefixes) {
    if (fieldLabel.startsWith(prefix)) {
      return fieldLabel.slice(prefix.length).trim();
    }
  }

  return fieldLabel;
}

export function toEnglishTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
    .replace(/\bIb\b/g, "IB")
    .replace(/\bUwc\b/g, "UWC")
    .replace(/\bId\b/g, "ID");
}

export function humanizeFieldKey(fieldKey: string) {
  if (fieldKey.startsWith("officialGradeAverage_")) {
    const grade = fieldKey.replace("officialGradeAverage_", "");
    return `Official Grade Average ${grade.toUpperCase()}`;
  }

  if (fieldKey.startsWith("officialGrade_")) {
    const [, grade, ...subjectParts] = fieldKey.split("_");
    const subjectRaw = subjectParts.join("_").replace(/([a-z])([A-Z])/g, "$1 $2");
    return `Official Grade ${grade.toUpperCase()} - ${toEnglishTitleCase(subjectRaw.replace(/_/g, " "))}`;
  }

  const normalized = fieldKey
    .replace(/^eligibility/, "")
    .replace(/^guardian/, "guardian")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();

  return normalized.length > 0 ? toEnglishTitleCase(normalized) : fieldKey;
}

export function getLocalizedDisplayFieldLabel({
  sectionId,
  field,
  language,
}: {
  sectionId: string;
  field: CycleStageField;
  language: AppLanguage;
}) {
  const displayLabel = getDisplayFieldLabel({
    sectionId,
    fieldLabel: field.field_label,
  });

  if (language === "es") {
    // Respect admin-edited labels in Spanish (live form config should be source of truth).
    return displayLabel;
  }

  return ENGLISH_FIELD_LABEL_BY_KEY[field.field_key] ?? humanizeFieldKey(field.field_key);
}

export function getLocalizedFieldPlaceholder(field: CycleStageField, language: AppLanguage) {
  if (language === "es") {
    // Respect admin-edited placeholders when present.
    return field.placeholder ?? SPANISH_FIELD_PLACEHOLDER_BY_KEY[field.field_key] ?? undefined;
  }

  return ENGLISH_FIELD_PLACEHOLDER_BY_KEY[field.field_key];
}

export function getLocalizedFieldHelpText(field: CycleStageField, language: AppLanguage) {
  if (language === "es") {
    if (HIDDEN_FIELD_HELP_TEXT_KEYS.has(field.field_key)) {
      return undefined;
    }
    return field.help_text ?? undefined;
  }

  return ENGLISH_FIELD_HELP_BY_KEY[field.field_key];
}

export function shouldUseWideFieldLayout({
  field,
  displayLabel,
}: {
  field: CycleStageField;
  displayLabel: string;
}) {
  if (field.field_type === "long_text") {
    return true;
  }

  if (displayLabel.length >= 34) {
    return true;
  }

  return Boolean(field.help_text && field.help_text.length > 90);
}

export function getFieldMaxWidth(fieldKey: string) {
  if (fieldKey === "ageAtEndOf2025") {
    return { xs: "100%", md: 160 };
  }

  if (fieldKey === "guardianCivilStatus") {
    return { xs: "100%", md: 340 };
  }

  return null;
}

export function getApplicantSelectOptions(fieldKey: string, language: AppLanguage) {
  if (fieldKey === "documentType") {
    return language === "en"
      ? ["DNI", "Passport", "Foreigner ID card"]
      : ["DNI", "Pasaporte", "Carnet de Extranjería"];
  }

  if (fieldKey === "guardianCivilStatus") {
    return language === "en"
      ? ["Married", "Divorced", "Separated", "Partners", "Other"]
      : ["Casados", "Divorciados", "Separados", "Convivientes", "Otro"];
  }

  return null;
}

// ─── Form status helpers ──────────────────────────────────────────────

export function getPayloadValue(payload: Application["payload"], key: string) {
  const raw = payload?.[key];
  if (raw === null || raw === undefined) {
    return "";
  }
  return String(raw);
}

export function isMeaningfulValue(value: unknown) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "boolean") {
    return true;
  }

  return false;
}

export function getStepState({
  complete,
  inProgress,
}: {
  complete: boolean;
  inProgress: boolean;
}): ProgressState {
  if (complete) {
    return "complete";
  }

  if (inProgress) {
    return "in_progress";
  }

  return "not_started";
}

export function formatSaveStatusLabel(saveState: SaveState, lastSavedAt: string | null, language: AppLanguage) {
  const isEnglish = language === "en";
  if (saveState === "saving") {
    return isEnglish ? "Saving draft..." : "Guardando borrador...";
  }

  if (saveState === "dirty") {
    return isEnglish ? "Pending changes" : "Cambios pendientes";
  }

  if (saveState === "error") {
    return isEnglish ? "Error saving draft" : "Error al guardar borrador";
  }

  if (saveState === "saved" && lastSavedAt) {
    const timestamp = new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return isEnglish ? `Draft saved ${timestamp}` : `Borrador guardado ${timestamp}`;
  }

  return isEnglish ? "Draft ready" : "Borrador listo";
}

export function getSectionFieldStatus({
  fields,
  payload,
}: {
  fields: CycleStageField[];
  payload: Application["payload"];
}): ProgressState {
  const requiredFields = fields.filter((field) => field.is_required);
  const completedRequired = requiredFields.filter((field) =>
    isMeaningfulValue((payload as Record<string, unknown>)[field.field_key]),
  ).length;
  const hasAnyValue = fields.some((field) => isMeaningfulValue((payload as Record<string, unknown>)[field.field_key]));

  return getStepState({
    complete:
      requiredFields.length > 0
        ? completedRequired === requiredFields.length
        : hasAnyValue,
    inProgress: hasAnyValue,
  });
}

export function isDocumentsStageCode(stageCode?: string) {
  return !stageCode || stageCode === "documents";
}

export function getInitialActiveSectionId({
  cycleId,
  stageCode,
  stageFields,
  sections,
}: {
  cycleId: string;
  stageCode?: string;
  stageFields?: CycleStageField[];
  sections?: StageSection[];
}): WizardSectionId {
  if (isDocumentsStageCode(stageCode)) {
    return PREP_SECTION_ID;
  }

  const effectiveStageFields =
    stageFields && stageFields.length > 0 ? stageFields : buildFallbackStageFields(cycleId);
  const orderedStageFields = [...effectiveStageFields].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const formStageFields = orderedStageFields.filter(
    (field) => field.is_active && field.field_type !== "file",
  );
  const fileStageFields = orderedStageFields.filter(
    (field) => field.is_active && field.field_type === "file",
  );
  const groupedSections = groupFieldsBySections(formStageFields, sections ?? [], {
    includeInactive: false,
    includeFileFields: false,
  });

  const firstFormSection = groupedSections.find(
    (section) => section.sectionKey !== "documents" && section.sectionKey !== "recommenders",
  );
  if (firstFormSection) {
    return firstFormSection.sectionKey as WizardSectionId;
  }

  const hasDocumentStep =
    fileStageFields.length > 0 ||
    groupedSections.some((section) => section.sectionKey === "documents");
  if (hasDocumentStep) {
    return "documents_uploads";
  }

  return "review_submit";
}

export function isCurrentStageReadOnly({
  application,
  stageCode,
}: {
  application: Application | null;
  stageCode?: string;
}) {
  if (!application) {
    return false;
  }

  if (application.status === "submitted" || application.status === "ineligible") {
    return true;
  }

  return (
    isDocumentsStageCode(stageCode) &&
    (application.status === "eligible" || application.status === "advanced")
  );
}

export function isCurrentStageSubmissionComplete({
  application,
  stageCode,
}: {
  application: Application | null;
  stageCode?: string;
}) {
  if (!application) {
    return false;
  }

  if (application.status === "submitted" || application.status === "ineligible") {
    return true;
  }

  return (
    isDocumentsStageCode(stageCode) &&
    (application.status === "eligible" || application.status === "advanced")
  );
}
