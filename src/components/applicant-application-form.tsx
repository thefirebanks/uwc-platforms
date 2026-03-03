"use client";

import { startTransition, type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useAppLanguage } from "@/components/language-provider";
import { ApplicantSidebar, type SidebarStep } from "@/components/applicant-sidebar";
import { ApplicantMobileProgress } from "@/components/applicant-mobile-progress";
import { ApplicantActionBar } from "@/components/applicant-action-bar";
import { ApplicantTopNav } from "@/components/applicant-top-nav";
import { TogglePill } from "@/components/toggle-pill";
import { GradesTable, isGradeField } from "@/components/grades-table";
import { UploadZone } from "@/components/upload-zone";
import type { AppLanguage } from "@/lib/i18n/messages";
import type { Application, CycleStageField, RecommendationStatus, RecommenderRole, StageSection } from "@/types/domain";
import { StatusBadge } from "@/components/stage-badge";
import { ErrorCallout } from "@/components/error-callout";
import { validateStagePayload } from "@/lib/stages/form-schema";
import { buildFallbackStageFields } from "@/lib/stages/stage-field-fallback";
import { renderSafeMarkdown } from "@/lib/markdown";
import {
  groupFieldsBySections,
  type ResolvedSection,
} from "@/lib/stages/applicant-sections";
import { getSubGroupsForSection, isBooleanField, getBooleanFieldLabels, type SubGroupDef } from "@/lib/stages/field-sub-groups";

interface ApiError {
  message: string;
  errorId?: string;
}

type RecommenderSummary = {
  id: string;
  role: RecommenderRole;
  email: string;
  status: RecommendationStatus;
  submittedAt: string | null;
  inviteSentAt: string | null;
  openedAt: string | null;
  startedAt: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  invalidatedAt: string | null;
  createdAt: string;
};

type ApplicationFileValue =
  | string
  | {
      path: string;
      title?: string;
      original_name?: string;
      mime_type?: string;
      size_bytes?: number;
      uploaded_at?: string;
    };

const EMPTY_STAGE_FIELDS: CycleStageField[] = [];
type ProgressState = "complete" | "in_progress" | "not_started";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type StaticWizardSectionId =
  | "prep_intro"
  | "documents_uploads"
  | "recommenders_flow"
  | "review_submit";
type WizardSectionId = StaticWizardSectionId | string;

const PREP_SECTION_ID = "prep_intro" as const;
const SIDEBAR_VISIBILITY_STORAGE_KEY = "uwc:applicant-sidebar-hidden";

const SECTION_TITLES_ES: Record<StaticWizardSectionId, string> = {
  prep_intro: "Instrucciones",
  documents_uploads: "Documentos",
  recommenders_flow: "Recomendadores",
  review_submit: "Revisión y envío",
};

const SECTION_TITLES_EN: Record<StaticWizardSectionId, string> = {
  prep_intro: "Instructions",
  documents_uploads: "Documents",
  recommenders_flow: "Recommenders",
  review_submit: "Review and submit",
};

const FIELD_LABEL_PREFIX_BY_SECTION: Partial<Record<string, string[]>> = {
  eligibility: ["Cumplimiento de requisitos - "],
  identity: ["Información personal - "],
  family: ["Información familiar y apoderados - "],
  school: ["Información del colegio - "],
  motivation: ["Hoja de vida e interés en UWC - ", "Hoja de vida - "],
  documents: ["Documentos - ", "Pago - ", "Documento - "],
};

const ENGLISH_FIELD_LABEL_BY_KEY: Record<string, string> = {
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

const ENGLISH_FIELD_PLACEHOLDER_BY_KEY: Record<string, string> = {
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

const SPANISH_FIELD_PLACEHOLDER_BY_KEY: Partial<Record<string, string>> = {
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

const HIDDEN_FIELD_HELP_TEXT_KEYS = new Set([
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

const LONG_TEXT_ROWS_BY_KEY: Partial<Record<string, number>> = {
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

const ENGLISH_FIELD_HELP_BY_KEY: Record<string, string> = {
  secondNationality: "Only if applicable.",
  isUpperThird: "Enter the answer as text.",
  ibInstructionYear: "Only if you answered yes to studying/studied IB.",
};

const SECTION_DESCRIPTIONS_EN: Record<string, string> = {
  eligibility: "Validate baseline eligibility criteria for the 2026 process.",
  identity: "Identity, contact, and personal context information.",
  family: "Parent/guardian and legal custody details.",
  school: "School details and official grades by year.",
  motivation: "Personal responses about interests and purpose.",
  recommenders: "Reference details to coordinate recommendations.",
  documents: "Payment and required document information.",
  other: "Active custom fields outside the base schema.",
};

function getDisplayFieldLabel({
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

function toEnglishTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
    .replace(/\bIb\b/g, "IB")
    .replace(/\bUwc\b/g, "UWC")
    .replace(/\bId\b/g, "ID");
}

function humanizeFieldKey(fieldKey: string) {
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

function getLocalizedDisplayFieldLabel({
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

function getLocalizedFieldPlaceholder(field: CycleStageField, language: AppLanguage) {
  if (language === "es") {
    // Respect admin-edited placeholders when present.
    return field.placeholder ?? SPANISH_FIELD_PLACEHOLDER_BY_KEY[field.field_key] ?? undefined;
  }

  return ENGLISH_FIELD_PLACEHOLDER_BY_KEY[field.field_key];
}

function getLocalizedFieldHelpText(field: CycleStageField, language: AppLanguage) {
  if (language === "es") {
    if (HIDDEN_FIELD_HELP_TEXT_KEYS.has(field.field_key)) {
      return undefined;
    }
    return field.help_text ?? undefined;
  }

  return ENGLISH_FIELD_HELP_BY_KEY[field.field_key];
}

function shouldUseWideFieldLayout({
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

function getFieldMaxWidth(fieldKey: string) {
  if (fieldKey === "ageAtEndOf2025") {
    return { xs: "100%", md: 160 };
  }

  if (fieldKey === "guardianCivilStatus") {
    return { xs: "100%", md: 340 };
  }

  return null;
}

function getApplicantSelectOptions(fieldKey: string, language: AppLanguage) {
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

const APPLICANT_TEXT_FIELD_SX = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "var(--surface, #fff)",
    borderRadius: "var(--radius)",
    fontSize: "0.85rem",
    color: "var(--ink)",
    minHeight: 40,
    "& fieldset": {
      borderColor: "var(--sand)",
      borderWidth: "1.5px",
      transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    },
    "&:hover fieldset": {
      borderColor: "var(--muted)",
    },
    "&.Mui-focused fieldset": {
      borderColor: "var(--uwc-maroon)",
      boxShadow: "0 0 0 3px rgba(154, 37, 69, 0.08)",
    },
    "&.Mui-disabled": {
      backgroundColor: "var(--surface, #fff)",
    },
    "&.Mui-disabled fieldset": {
      borderColor: "var(--sand)",
      borderWidth: "1.5px",
    },
    "&.MuiInputBase-multiline": {
      alignItems: "flex-start",
      padding: 0,
    },
  },
  "& .MuiOutlinedInput-input": {
    padding: "9px 12px",
    lineHeight: 1.35,
    fontSize: "0.85rem",
    fontFamily: "var(--font-body), 'DM Sans', sans-serif",
  },
  "& .MuiOutlinedInput-input::placeholder": {
    color: "var(--muted)",
    opacity: 1,
    fontWeight: 300,
  },
  "& .MuiOutlinedInput-input.Mui-disabled": {
    WebkitTextFillColor: "var(--muted)",
  },
  "& .MuiOutlinedInput-input[type='number']": {
    MozAppearance: "textfield",
  },
  "& .MuiOutlinedInput-input::-webkit-outer-spin-button, & .MuiOutlinedInput-input::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
  "& .MuiOutlinedInput-inputMultiline, & .MuiInputBase-inputMultiline": {
    padding: "9px 12px",
    lineHeight: 1.5,
    minHeight: "84px !important",
    fontFamily: "var(--font-body), 'DM Sans', sans-serif",
  },
} as const;

function getPayloadValue(payload: Application["payload"], key: string) {
  const raw = payload?.[key];
  if (raw === null || raw === undefined) {
    return "";
  }
  return String(raw);
}

function isMeaningfulValue(value: unknown) {
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

function getStepState({
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

function parseFileEntry(value: ApplicationFileValue | undefined | null) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const inferredName = value.split("/").at(-1)?.replace(/^\d+-/, "") ?? value;
    return {
      path: value,
      title: inferredName,
      original_name: inferredName,
      mime_type: "application/octet-stream",
      size_bytes: 0,
      uploaded_at: null as string | null,
    };
  }

  return {
    path: value.path,
    title: value.title ?? value.original_name ?? value.path,
    original_name: value.original_name ?? value.path.split("/").at(-1) ?? value.path,
    mime_type: value.mime_type ?? "application/octet-stream",
    size_bytes: value.size_bytes ?? 0,
    uploaded_at: value.uploaded_at ?? null,
  };
}

function statusTone(status: RecommendationStatus, language: AppLanguage) {
  const isEnglish = language === "en";
  if (status === "submitted") {
    return { label: isEnglish ? "Submitted" : "Enviado", color: "#166534", bg: "#DCFCE7" };
  }
  if (status === "in_progress") {
    return { label: isEnglish ? "In progress" : "En progreso", color: "#92400E", bg: "#FEF3C7" };
  }
  if (status === "opened") {
    return { label: isEnglish ? "Opened" : "Abierto", color: "#1D4ED8", bg: "#DBEAFE" };
  }
  if (status === "sent") {
    return { label: isEnglish ? "Invite sent" : "Invitación enviada", color: "#0F766E", bg: "#CCFBF1" };
  }
  if (status === "expired") {
    return { label: isEnglish ? "Expired" : "Vencido", color: "#991B1B", bg: "#FEE2E2" };
  }
  if (status === "invalidated") {
    return { label: isEnglish ? "Replaced" : "Reemplazado", color: "#6B7280", bg: "#F3F4F6" };
  }
  return { label: isEnglish ? "Pending" : "Pendiente", color: "#6B7280", bg: "#F3F4F6" };
}

function roleLabel(role: RecommenderRole, language: AppLanguage) {
  if (role === "mentor") {
    return language === "en" ? "Tutor/Teacher/Mentor" : "Tutor/Profesor/Mentor";
  }

  return language === "en" ? "Friend (non-family)" : "Amigo (no familiar)";
}

function formatSaveStatusLabel(saveState: SaveState, lastSavedAt: string | null, language: AppLanguage) {
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

function getSectionFieldStatus({
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

export function ApplicantApplicationForm({
  existingApplication,
  cycleId,
  cycleName,
  stageCode,
  stageLabel,
  stageInstructions,
  stageFields,
  stageCloseAt,
  initialRecommenders = [],
  sections = [],
}: {
  existingApplication: Application | null;
  cycleId: string;
  cycleName?: string;
  stageCode?: string;
  stageLabel?: string;
  stageInstructions?: string;
  stageFields?: CycleStageField[];
  stageCloseAt?: string | null;
  initialRecommenders?: RecommenderSummary[];
  sections?: StageSection[];
}) {
  const { language } = useAppLanguage();
  const isEnglish = language === "en";
  const locale = isEnglish ? "en-US" : "es-PE";
  const copy = useCallback((spanish: string, english: string) => (isEnglish ? english : spanish), [isEnglish]);
  const staticSectionTitles: Record<string, string> = isEnglish ? SECTION_TITLES_EN : SECTION_TITLES_ES;

  const LOCKED_STATUSES = new Set<Application["status"]>([
    "submitted",
    "eligible",
    "ineligible",
    "advanced",
  ]);

  const [application, setApplication] = useState<Application | null>(existingApplication);
  const [error, setError] = useState<ApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [recommenders, setRecommenders] = useState<RecommenderSummary[]>(initialRecommenders);
  const [recommenderInputs, setRecommenderInputs] = useState<{ mentor: string; friend: string }>({
    mentor:
      initialRecommenders.find((row) => row.role === "mentor" && !row.invalidatedAt)?.email ?? "",
    friend:
      initialRecommenders.find((row) => row.role === "friend" && !row.invalidatedAt)?.email ?? "",
  });
  const [loadingRecommenders, setLoadingRecommenders] = useState(false);
  const [savingRecommenders, setSavingRecommenders] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [uploadingFieldKey, setUploadingFieldKey] = useState<string | null>(null);
  const [fileTitleEdits, setFileTitleEdits] = useState<Record<string, string>>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(existingApplication?.updated_at ?? null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const isDocumentsStageInit = !stageCode || stageCode === "documents";
  const [activeSectionId, setActiveSectionId] = useState<WizardSectionId>(
    isDocumentsStageInit
      ? PREP_SECTION_ID
      : "review_submit",
  );
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);

  const isStageClosed = Boolean(stageCloseAt && Date.parse(stageCloseAt) < Date.now());
  const isLocked = application ? LOCKED_STATUSES.has(application.status) : false;
  const isEditingEnabled = !isStageClosed && (!isLocked || isEditMode);
  const providedStageFields = stageFields ?? EMPTY_STAGE_FIELDS;
  const initialApplicationIdRef = useRef<string | null>(existingApplication?.id ?? null);
  const skippedInitialRecommenderFetchRef = useRef(false);
  const formValuesRef = useRef<Record<string, string>>({});
  const hasPendingChangesRef = useRef(false);
  const isSavingDraftRef = useRef(false);
  const isEditingEnabledRef = useRef(isEditingEnabled);
  const isLockedRef = useRef(isLocked);
  const saveQueuedRef = useRef(false);
  const localEditRevisionRef = useRef(0);
  const forceHydrateFormValuesRef = useRef(true);
  const previousHydratedApplicationIdRef = useRef<string | null>(existingApplication?.id ?? null);

  const refreshApplicationSnapshot = useCallback(
    async ({ includeRecommenders = true }: { includeRecommenders?: boolean } = {}) => {
      const [applicationResponse, recommenderResponse] = await Promise.all([
        fetch(`/api/applications?cycleId=${cycleId}`),
        includeRecommenders && application?.id
          ? fetch(`/api/recommendations?applicationId=${application.id}`)
          : Promise.resolve(null),
      ]);

      if (applicationResponse.ok) {
        const body = (await applicationResponse.json()) as { application?: Application | null };
        if (body.application) {
          startTransition(() => {
            setApplication(body.application ?? null);
            setLastSavedAt(body.application?.updated_at ?? null);
          });
        }
      }

      if (recommenderResponse?.ok) {
        const body = (await recommenderResponse.json()) as {
          recommenders?: RecommenderSummary[];
        };
        const rows = body.recommenders ?? [];
        startTransition(() => {
          setRecommenders(rows);
          setRecommenderInputs({
            mentor: rows.find((row) => row.role === "mentor" && !row.invalidatedAt)?.email ?? "",
            friend: rows.find((row) => row.role === "friend" && !row.invalidatedAt)?.email ?? "",
          });
        });
      }
    },
    [application?.id, cycleId],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const saved = window.localStorage.getItem(SIDEBAR_VISIBILITY_STORAGE_KEY);
    if (saved === "1") {
      setIsSidebarHidden(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_VISIBILITY_STORAGE_KEY, isSidebarHidden ? "1" : "0");
  }, [isSidebarHidden]);

  useEffect(() => {
    formValuesRef.current = formValues;
  }, [formValues]);

  useEffect(() => {
    hasPendingChangesRef.current = hasPendingChanges;
  }, [hasPendingChanges]);

  useEffect(() => {
    isSavingDraftRef.current = isSavingDraft;
  }, [isSavingDraft]);

  useEffect(() => {
    isEditingEnabledRef.current = isEditingEnabled;
    isLockedRef.current = isLocked;
  }, [isEditingEnabled, isLocked]);

  const effectiveStageFields = useMemo(() => {
    if (providedStageFields.length > 0) {
      return providedStageFields;
    }

    return buildFallbackStageFields(cycleId);
  }, [cycleId, providedStageFields]);

  const orderedStageFields = useMemo(
    () => [...effectiveStageFields].sort((a, b) => a.sort_order - b.sort_order),
    [effectiveStageFields],
  );

  const formStageFields = useMemo(
    () => orderedStageFields.filter((field) => field.is_active && field.field_type !== "file"),
    [orderedStageFields],
  );

  const fileStageFields = useMemo(
    () => orderedStageFields.filter((field) => field.is_active && field.field_type === "file"),
    [orderedStageFields],
  );

  const groupedFormSections = useMemo(
    () =>
      groupFieldsBySections(formStageFields, sections, {
        includeInactive: false,
        includeFileFields: false,
      }),
    [formStageFields, sections],
  );

  const documentFormSection = useMemo(
    () =>
      groupedFormSections.find(
        (section) => section.sectionKey === "documents",
      ) ?? null,
    [groupedFormSections],
  );

  const wizardSections = useMemo(() => {
    const wizardSteps: Array<{
      id: WizardSectionId;
      title: string;
      description: string;
      formSection: ResolvedSection | null;
      status: ProgressState;
    }> = [];

    const isDocumentsStage = !stageCode || stageCode === "documents";

    if (isDocumentsStage) {
      wizardSteps.push({
        id: PREP_SECTION_ID,
        title: staticSectionTitles.prep_intro,
        description: copy(
          "Checklist rápida de preparación para enviar sin fricción.",
          "Quick checklist to prepare and submit smoothly.",
        ),
        formSection: null,
        status: "complete",
      });
    }

    for (const section of groupedFormSections) {
      // "documents" and "recommenders" are rendered as special wizard steps below
      // The old "eligibility" block is hidden for the main documents stage.
      if (
        section.sectionKey === "documents" ||
        section.sectionKey === "recommenders" ||
        (isDocumentsStage && section.sectionKey === "eligibility")
      ) {
        continue;
      }

      wizardSteps.push({
        id: section.sectionKey as WizardSectionId,
        title: section.title,
        description:
          isEnglish && SECTION_DESCRIPTIONS_EN[section.sectionKey]
            ? SECTION_DESCRIPTIONS_EN[section.sectionKey]
            : section.description,
        formSection: section,
        status: getSectionFieldStatus({
          fields: section.fields,
          payload: application?.payload ?? {},
        }),
      });
    }

    if (documentFormSection || fileStageFields.length > 0) {
      const docFields = documentFormSection?.fields ?? [];
      const docMetadataStatus = getSectionFieldStatus({
        fields: docFields,
        payload: application?.payload ?? {},
      });
      wizardSteps.push({
        id: "documents_uploads",
        title: staticSectionTitles.documents_uploads,
        description: copy(
          "Sube los archivos solicitados para esta etapa. Formatos aceptados: PDF, PNG, JPG.",
          "Upload the files requested for this stage. Accepted formats: PDF, PNG, JPG.",
        ),
        formSection: documentFormSection,
        status: docMetadataStatus,
      });
    }

    if (isDocumentsStage) {
      wizardSteps.push({
        id: "recommenders_flow",
        title: staticSectionTitles.recommenders_flow,
        description: copy(
          "Registra un mentor y un amigo (no familiar). Les enviaremos una invitación por correo.",
          "Register a mentor and a friend (non-family). We will email them an invitation.",
        ),
        formSection:
          groupedFormSections.find(
            (section) => section.sectionKey === "recommenders",
          ) ?? null,
        status: "not_started",
      });
    }

    wizardSteps.push({
      id: "review_submit",
      title: staticSectionTitles.review_submit,
      description: copy(
        "Revisa que toda la información esté correcta antes de enviar tu postulación.",
        "Review that all information is correct before submitting your application.",
      ),
      formSection: null,
      status: "not_started",
    });

    return wizardSteps;
  }, [application?.payload, copy, documentFormSection, fileStageFields.length, groupedFormSections, isEnglish, stageCode, staticSectionTitles]);

  const documentsStatus = useMemo(() => {
    const requiredFileFields = fileStageFields.filter((field) => field.is_required);
    const files = (application?.files as Record<string, ApplicationFileValue> | undefined) ?? {};
    const completedCount = requiredFileFields.filter((field) => {
      const entry = parseFileEntry(files[field.field_key]);
      return isMeaningfulValue(entry?.path);
    }).length;
    const hasAnyFile = fileStageFields.some((field) => isMeaningfulValue(parseFileEntry(files[field.field_key])?.path));

    if (requiredFileFields.length === 0) {
      return getStepState({
        complete: false,
        inProgress: false,
      });
    }

    return getStepState({
      complete: completedCount === requiredFileFields.length,
      inProgress: hasAnyFile,
    });
  }, [application?.files, fileStageFields]);

  const activeRecommendersByRole = useMemo(() => {
    const map = new Map<RecommenderRole, RecommenderSummary>();
    for (const row of recommenders) {
      if (row.invalidatedAt) {
        continue;
      }
      if (!map.has(row.role)) {
        map.set(row.role, row);
      }
    }
    return map;
  }, [recommenders]);

  const recommenderStatus = useMemo(
    () =>
      getStepState({
        complete: activeRecommendersByRole.size === 2,
        inProgress: activeRecommendersByRole.size > 0,
      }),
    [activeRecommendersByRole],
  );

  const submissionStatus = useMemo(
    () =>
      getStepState({
        complete: Boolean(
          application &&
            ["submitted", "eligible", "ineligible", "advanced"].includes(application.status),
        ),
        inProgress: false,
      }),
    [application],
  );

  const progressWizardSections = useMemo(
    () => wizardSections.filter((section) => section.id !== PREP_SECTION_ID),
    [wizardSections],
  );

  const progressSteps = useMemo(
    () =>
      progressWizardSections.map((section) => {
        // Compute status
        let status: ProgressState;
        if (section.id === "documents_uploads") {
          status = documentsStatus;
        } else if (section.id === "recommenders_flow") {
          status = recommenderStatus;
        } else if (section.id === "review_submit") {
          status = submissionStatus;
        } else {
          status = section.status;
        }

        // Compute statusLabel (percentage or fraction)
        let statusLabel: string | undefined;
        if (status === "complete") {
          // No label for complete — the check icon is sufficient
          statusLabel = undefined;
        } else if (section.id === "recommenders_flow") {
          const registeredCount = activeRecommendersByRole.size;
          if (registeredCount > 0) {
            statusLabel = `${registeredCount}/2`;
          }
        } else if (section.id === "documents_uploads") {
          const requiredFileFields = fileStageFields.filter((f) => f.is_required);
          const files = (application?.files as Record<string, ApplicationFileValue> | undefined) ?? {};
          const uploadedCount = requiredFileFields.filter((f) => isMeaningfulValue(parseFileEntry(files[f.field_key])?.path)).length;
          if (requiredFileFields.length > 0 && (status === "in_progress" || uploadedCount > 0)) {
            const pct = Math.round((uploadedCount / requiredFileFields.length) * 100);
            statusLabel = `${pct}%`;
          }
        } else if (section.id !== "review_submit" && section.formSection && status === "in_progress") {
          const reqFields = section.formSection.fields.filter((f) => f.is_required);
          const payload = application?.payload ?? {};
          const filledCount = reqFields.filter((f) => isMeaningfulValue((payload as Record<string, unknown>)[f.field_key])).length;
          if (reqFields.length > 0) {
            const pct = Math.round((filledCount / reqFields.length) * 100);
            statusLabel = `${pct}%`;
          }
        }

        return { key: section.id, label: section.title, status, statusLabel };
      }),
    [
      activeRecommendersByRole,
      application?.files,
      application?.payload,
      documentsStatus,
      fileStageFields,
      progressWizardSections,
      recommenderStatus,
      submissionStatus,
    ],
  );

  const completedSteps = progressSteps.filter((step) => step.status === "complete").length;
  const progressPercent = progressSteps.length > 0
    ? Math.round((completedSteps / progressSteps.length) * 100)
    : 0;
  const draftStatusLabel = formatSaveStatusLabel(saveState, lastSavedAt, language);
  const requiredDocumentLabels = useMemo(
    () =>
      fileStageFields
        .filter((field) => field.is_required)
        .map((field) => getLocalizedDisplayFieldLabel({ sectionId: "documents", field, language })),
    [fileStageFields, language],
  );
  const currentSection = wizardSections.find((section) => section.id === activeSectionId) ?? wizardSections[0] ?? null;
  const currentFormSectionId = currentSection?.formSection
    ? currentSection.formSection.sectionKey
    : null;
  const currentSectionIndex = currentSection
    ? wizardSections.findIndex((section) => section.id === currentSection.id)
    : -1;
  const previousSectionId = currentSectionIndex > 0 ? wizardSections[currentSectionIndex - 1]?.id ?? null : null;
  const nextSectionId =
    currentSectionIndex >= 0 && currentSectionIndex < wizardSections.length - 1
      ? wizardSections[currentSectionIndex + 1]?.id ?? null
      : null;
  const currentProgressSectionIndex =
    currentSection && currentSection.id !== PREP_SECTION_ID
      ? progressWizardSections.findIndex((section) => section.id === currentSection.id)
      : -1;
  const showNumberedStepHeader = Boolean(currentSection && currentSection.id !== PREP_SECTION_ID);
  const modeStatusLabel = isStageClosed
    ? copy("Modo: solo lectura (etapa cerrada)", "Mode: read-only (stage closed)")
    : isLocked && isEditMode
      ? copy("Modo: edición manual habilitada", "Mode: manual editing enabled")
      : isLocked
        ? copy("Modo: solo lectura", "Mode: read-only")
        : undefined;
  const modeStatusDot: "success" | "warning" | "error" | "info" | undefined = isStageClosed
    ? "error"
    : isLocked && isEditMode
      ? "success"
      : isLocked
        ? "warning"
        : undefined;
  const editToggleLabel =
    isLocked && isEditMode
      ? hasPendingChanges
        ? copy("Descartar cambios y salir", "Discard changes & exit")
        : copy("Salir de edición", "Exit editing")
      : copy("Editar respuesta", "Edit response");

  useEffect(() => {
    if (wizardSections.length === 0) {
      return;
    }

    if (!wizardSections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(wizardSections[0].id);
    }
  }, [activeSectionId, wizardSections]);

  useEffect(() => {
    const applicationId = application?.id ?? null;
    const applicationChanged = previousHydratedApplicationIdRef.current !== applicationId;
    previousHydratedApplicationIdRef.current = applicationId;
    const shouldHydrate =
      applicationChanged || forceHydrateFormValuesRef.current || !hasPendingChangesRef.current;

    if (!shouldHydrate) {
      return;
    }

    forceHydrateFormValuesRef.current = false;

    const payload = application?.payload ?? {};
    const nextValues: Record<string, string> = {};

    for (const field of formStageFields) {
      nextValues[field.field_key] = getPayloadValue(payload, field.field_key);
    }

    formValuesRef.current = nextValues;
    setFormValues(nextValues);
    if (applicationChanged || !hasPendingChangesRef.current) {
      hasPendingChangesRef.current = false;
      setHasPendingChanges(false);
    }
  }, [application?.id, application?.payload, formStageFields]);

  useEffect(() => {
    const nextTitles: Record<string, string> = {};
    const files = (application?.files as Record<string, ApplicationFileValue> | undefined) ?? {};
    for (const field of fileStageFields) {
      const entry = parseFileEntry(files[field.field_key]);
      if (entry) {
        nextTitles[field.field_key] = entry.title;
      }
    }
    setFileTitleEdits(nextTitles);
  }, [application?.files, fileStageFields]);

  useEffect(() => {
    if (!application?.id) {
      setRecommenders([]);
      setRecommenderInputs({ mentor: "", friend: "" });
      skippedInitialRecommenderFetchRef.current = false;
      return;
    }

    const applicationId = application.id;
    if (
      !skippedInitialRecommenderFetchRef.current &&
      initialApplicationIdRef.current === applicationId
    ) {
      skippedInitialRecommenderFetchRef.current = true;
      return;
    }

    let isMounted = true;

    async function loadRecommenders() {
      setLoadingRecommenders(true);

      try {
        const response = await fetch(`/api/recommendations?applicationId=${applicationId}`);
        const body = (await response.json()) as {
          recommenders?: RecommenderSummary[];
        };

        if (!isMounted || !response.ok) {
          return;
        }

        const rows = body.recommenders ?? [];
        setRecommenders(rows);
        const mentor = rows.find((row) => row.role === "mentor" && !row.invalidatedAt)?.email ?? "";
        const friend = rows.find((row) => row.role === "friend" && !row.invalidatedAt)?.email ?? "";
        setRecommenderInputs({ mentor, friend });
      } catch {
        if (isMounted) {
          setRecommenders([]);
        }
      } finally {
        if (isMounted) {
          setLoadingRecommenders(false);
        }
      }
    }

    void loadRecommenders();

    return () => {
      isMounted = false;
    };
  }, [application?.id]);

  useEffect(() => {
    if (!application?.id || hasPendingChanges || isSavingDraft) {
      return;
    }

    const refresh = () => {
      void refreshApplicationSnapshot({
        includeRecommenders: true,
      });
    };

    const interval = window.setInterval(refresh, 20_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [application?.id, hasPendingChanges, isSavingDraft, refreshApplicationSnapshot]);

  const saveDraft = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!isEditingEnabledRef.current) {
        return false;
      }

      if (isSavingDraftRef.current) {
        saveQueuedRef.current = true;
        return false;
      }

      if (!silent) {
        setError(null);
        setSuccessMessage(null);
      }

      const currentValues = formValuesRef.current;
      const requestedRevision = localEditRevisionRef.current;

      const validation = validateStagePayload({
        fields: formStageFields,
        payload: currentValues,
        skipFileValidation: true,
        enforceRequired: false,
      });

      if (!validation.isValid) {
        setFieldErrors(validation.errors);
        setSaveState("error");
        if (!silent) {
          const firstError = Object.values(validation.errors)[0] ?? copy("Hay campos inválidos.", "There are invalid fields.");
          setError({ message: firstError });
        }
        return false;
      }

      setFieldErrors({});
      isSavingDraftRef.current = true;
      setIsSavingDraft(true);
      setSaveState("saving");

      try {
        const response = await fetch("/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cycleId,
            payload: validation.normalizedPayload,
            allowPartial: true,
          }),
        });

        const body = await response.json();

        if (!response.ok) {
          setSaveState("error");
          if (!silent) {
            setError(body);
          }
          return false;
        }

        const completedAt = new Date().toISOString();
        const hasNewerLocalEdits = localEditRevisionRef.current !== requestedRevision;
        if (!hasNewerLocalEdits) {
          forceHydrateFormValuesRef.current = true;
        }
        setApplication(body.application);
        if (!isLockedRef.current) {
          setIsEditMode(false);
        }
        setLastSavedAt(completedAt);

        if (hasNewerLocalEdits) {
          hasPendingChangesRef.current = true;
          setHasPendingChanges(true);
          setSaveState("dirty");
          saveQueuedRef.current = true;
        } else {
          hasPendingChangesRef.current = false;
          setHasPendingChanges(false);
          setSaveState("saved");
        }
        return true;
      } finally {
        isSavingDraftRef.current = false;
        setIsSavingDraft(false);

        if (saveQueuedRef.current) {
          saveQueuedRef.current = false;
          if (isEditingEnabledRef.current && hasPendingChangesRef.current) {
            window.setTimeout(() => {
              void saveDraft({ silent: true });
            }, 0);
          }
        }
      }
    },
    [copy, cycleId, formStageFields],
  );

  useEffect(() => {
    if (!isEditingEnabled || !hasPendingChanges || isSavingDraft) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveDraft({ silent: true });
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [hasPendingChanges, isEditingEnabled, isSavingDraft, saveDraft]);

  function markFieldDirty() {
    localEditRevisionRef.current += 1;
    if (!hasPendingChangesRef.current) {
      hasPendingChangesRef.current = true;
      setHasPendingChanges(true);
    }
    if (saveState !== "saving") {
      setSaveState("dirty");
    }
  }

  function jumpToSection(sectionId: WizardSectionId) {
    if (sectionId === activeSectionId) {
      return;
    }

    if (isEditingEnabled && hasPendingChanges) {
      void saveDraft({ silent: true });
    }
    setActiveSectionId(sectionId);
  }

  function renderSingleField(field: CycleStageField, sectionId: string) {
    const displayLabel = getLocalizedDisplayFieldLabel({
      sectionId,
      field,
      language,
    });

    // Boolean fields → toggle pill
    if (isBooleanField(field.field_key)) {
      return (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <Typography
            sx={{
              fontSize: "0.78rem",
              fontWeight: 500,
              color: "var(--ink)",
              mb: "5px",
              lineHeight: 1.35,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {displayLabel}
            {field.is_required ? (
              <Typography component="span" sx={{ color: "var(--uwc-maroon)", fontWeight: 400, fontSize: "inherit" }}>*</Typography>
            ) : null}
          </Typography>
          <TogglePill
            value={formValues[field.field_key] ?? ""}
            onChange={(next) => {
              setFormValues((current) => ({ ...current, [field.field_key]: next }));
              markFieldDirty();
            }}
            yesLabel={getBooleanFieldLabels(field.field_key, language)?.yes ?? (isEnglish ? "Yes" : "S\u00ed")}
            noLabel={getBooleanFieldLabels(field.field_key, language)?.no ?? "No"}
            disabled={!isEditingEnabled}
          />
          {fieldErrors[field.field_key] ? (
            <Typography sx={{ fontSize: "0.7rem", color: "error.main", mt: "3px" }}>
              {fieldErrors[field.field_key]}
            </Typography>
          ) : null}
          {!fieldErrors[field.field_key] && getLocalizedFieldHelpText(field, language) ? (
            <Typography sx={{ fontSize: "0.7rem", color: "var(--muted)", mt: "3px" }}>
              {getLocalizedFieldHelpText(field, language)}
            </Typography>
          ) : null}
        </Box>
      );
    }

    // Standard text/number/date/email fields — label above input (mockup style)
    const errorMsg = fieldErrors[field.field_key];
    const helpMsg = getLocalizedFieldHelpText(field, language);
    const isCompactSchoolComments = field.field_key === "officialGradesComments";
    const selectOptions = getApplicantSelectOptions(field.field_key, language);
    const hasStudiedIbValue = (formValues.hasStudiedIb ?? "").trim().toLowerCase();
    const isIbYearFieldTemporarilyDisabled =
      field.field_key === "ibInstructionYear" &&
      !["si", "sí", "yes"].includes(hasStudiedIbValue);
    const fieldIsDisabled = !isEditingEnabled || isIbYearFieldTemporarilyDisabled;
    const applyDimmedDependentFieldStyle = isIbYearFieldTemporarilyDisabled && isEditingEnabled;

    const longTextRows = field.field_type === "long_text"
      ? LONG_TEXT_ROWS_BY_KEY[field.field_key] ?? 3
      : undefined;
    const isLongTextField = field.field_type === "long_text";

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          ...(applyDimmedDependentFieldStyle ? { opacity: 0.45 } : null),
        }}
      >
        <Typography
          component="label"
          sx={{
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--ink)",
            mb: "5px",
            lineHeight: 1.35,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {displayLabel}
          {field.is_required ? (
            <Typography component="span" sx={{ color: "var(--uwc-maroon)", fontWeight: 400, fontSize: "inherit" }}>*</Typography>
          ) : null}
        </Typography>
        {isLongTextField ? (
          <Box
            component="textarea"
            value={formValues[field.field_key] ?? ""}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              const nextValue = event.target.value;
              setFormValues((current) => ({
                ...current,
                [field.field_key]: nextValue,
              }));
              markFieldDirty();
            }}
            rows={isCompactSchoolComments ? 2 : longTextRows}
            disabled={fieldIsDisabled}
            aria-label={displayLabel}
            placeholder={getLocalizedFieldPlaceholder(field, language)}
            sx={{
              width: "100%",
              padding: "9px 12px",
              fontFamily: "var(--font-body), 'DM Sans', sans-serif",
              fontSize: "0.85rem",
              lineHeight: 1.5,
              color: "var(--ink)",
              background: "var(--surface, #fff)",
              border: "1.5px solid var(--sand)",
              borderColor: errorMsg ? "#DC2626" : "var(--sand)",
              borderRadius: "var(--radius)",
              outline: "none",
              resize: "vertical",
              minHeight: isCompactSchoolComments ? 72 : undefined,
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              "&::placeholder": {
                color: "var(--muted)",
                opacity: 1,
                fontWeight: 300,
              },
              "&:hover": {
                borderColor: errorMsg ? "#DC2626" : "var(--muted)",
              },
              "&:focus": {
                borderColor: errorMsg ? "#DC2626" : "var(--uwc-maroon)",
                boxShadow: errorMsg
                  ? "0 0 0 3px rgba(220, 38, 38, 0.08)"
                  : "0 0 0 3px rgba(154, 37, 69, 0.08)",
              },
              "&:disabled": {
                color: "var(--muted)",
                background: "var(--surface, #fff)",
                WebkitTextFillColor: "var(--muted)",
                cursor: "not-allowed",
              },
            }}
          />
        ) : (
          <TextField
            hiddenLabel
            value={formValues[field.field_key] ?? ""}
            onChange={(event) => {
              const nextValue = event.target.value;
              setFormValues((current) => ({
                ...current,
                [field.field_key]: nextValue,
              }));
              markFieldDirty();
            }}
            type={
              field.field_type === "date"
                ? "date"
                : field.field_type === "number"
                  ? "number"
                  : field.field_type === "email"
                    ? "email"
                    : "text"
            }
            fullWidth
            disabled={fieldIsDisabled}
            select={Boolean(selectOptions)}
            placeholder={getLocalizedFieldPlaceholder(field, language)}
            error={Boolean(errorMsg)}
            sx={APPLICANT_TEXT_FIELD_SX}
            slotProps={{
              htmlInput: {
                "aria-label": displayLabel,
                step:
                  field.field_key === "gradeAverage"
                    ? "0.1"
                    : field.field_type === "number"
                      ? "1"
                      : undefined,
              },
            }}
          >
            {selectOptions?.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
        )}
        {errorMsg ? (
          <Typography sx={{ fontSize: "0.7rem", color: "error.main", mt: "3px" }}>
            {errorMsg}
          </Typography>
        ) : helpMsg ? (
          <Typography sx={{ fontSize: "0.7rem", color: "var(--muted)", mt: "3px" }}>
            {helpMsg}
          </Typography>
        ) : null}
      </Box>
    );
  }

  function renderFieldGrid(fields: CycleStageField[], sectionId: string) {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "14px 18px",
          "@media (max-width: 768px)": {
            gridTemplateColumns: "1fr",
          },
        }}
      >
        {fields.map((field) => {
          const displayLabel = getLocalizedDisplayFieldLabel({
            sectionId,
            field,
            language,
          });
          const isWide = shouldUseWideFieldLayout({ field, displayLabel });
          const maxWidth = getFieldMaxWidth(field.field_key);

          return (
            <Box
              key={field.id}
              sx={{
                ...(isWide ? { gridColumn: "1 / -1" } : null),
                ...(maxWidth ? { maxWidth } : null),
              }}
            >
              {renderSingleField(field, sectionId)}
            </Box>
          );
        })}
      </Box>
    );
  }

  function renderSubGroupCard(subGroup: SubGroupDef, fields: CycleStageField[], sectionId: string) {
    const sgLabel = isEnglish ? subGroup.labelEn : subGroup.label;

    if (subGroup.variant === "guardian") {
      return (
        <Box
          key={subGroup.key}
          sx={{
            background: "var(--surface, #fff)",
            border: "1px solid var(--sand-light, #F3EFEB)",
            borderRadius: "var(--radius-lg, 12px)",
            p: "20px",
            mb: 2,
          }}
        >
          {/* Guardian header */}
          <Box sx={{ display: "flex", alignItems: "center", gap: "10px", mb: 2 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                background: subGroup.iconBg,
                color: subGroup.iconColor,
              }}
            >
              {subGroup.guardianNumber}
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 500, fontSize: "0.9rem", color: "var(--ink)" }}>
                {sgLabel}
              </Typography>
              {(isEnglish ? subGroup.subtitleEn : subGroup.subtitle) ? (
                <Typography sx={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {isEnglish ? subGroup.subtitleEn : subGroup.subtitle}
                </Typography>
              ) : null}
            </Box>
          </Box>
          {renderFieldGrid(fields, sectionId)}
        </Box>
      );
    }

    if (subGroup.variant === "card") {
      return (
        <Box
          key={subGroup.key}
          sx={{
            background: "var(--surface, #fff)",
            border: "1px solid var(--sand-light, #F3EFEB)",
            borderRadius: "var(--radius-lg, 12px)",
            p: "20px",
            mb: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: "14px" }}>
            {subGroup.iconBg ? (
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.85rem",
                  lineHeight: 1,
                  background: subGroup.iconBg,
                  color: subGroup.iconColor,
                }}
                aria-hidden="true"
              >
                {subGroup.icon ?? null}
              </Box>
            ) : null}
            <Typography
              sx={{
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                fontWeight: 500,
                color: "var(--ink)",
              }}
            >
              {sgLabel}
            </Typography>
          </Box>
          {renderFieldGrid(fields, sectionId)}
        </Box>
      );
    }

    // Default: form-group with label divider
    return (
      <Box key={subGroup.key} sx={{ mb: "28px" }}>
        <Typography
          sx={{
            fontSize: "0.68rem",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--muted)",
            mb: "14px",
            pb: 1,
            borderBottom: "1px solid var(--sand-light, #F3EFEB)",
          }}
        >
          {sgLabel}
        </Typography>
        {renderFieldGrid(fields, sectionId)}
      </Box>
    );
  }

  function renderEditableFields({
    fields,
    sectionId,
  }: {
    fields: CycleStageField[];
    sectionId: string;
  }) {
    const subGroups = getSubGroupsForSection(sectionId);

    // Separate grade fields for the school section
    const gradeFields = sectionId === "school" ? fields.filter((f) => isGradeField(f.field_key)) : [];
    const allNonGradeFields = sectionId === "school" ? fields.filter((f) => !isGradeField(f.field_key)) : fields;

    // Hide school address sub-fields and school type details that are not in the mockup design
    const HIDDEN_FIELDS_BY_SECTION: Partial<Record<string, Set<string>>> = {
      identity: new Set([
        "fullName",
        "countryOfBirth",
        "countryOfResidence",
      ]),
      school: new Set([
        "schoolAddressNumber",
        "schoolDistrict",
        "schoolProvince",
        "schoolRegion",
        "schoolCountry",
        "schoolTypeDetails",
      ]),
      recommenders: new Set([
        "recommenderRequestMessage",
      ]),
    };
    const hiddenFieldKeys = HIDDEN_FIELDS_BY_SECTION[sectionId] ?? null;
    const nonGradeFields = hiddenFieldKeys
      ? allNonGradeFields.filter((f) => !hiddenFieldKeys.has(f.field_key))
      : allNonGradeFields;

    // Keep the school comments textarea after the primary school fields and grades table
    // to preserve the mockup flow (school info first, comments later).
    const DEFERRED_SCHOOL_FIELDS = new Set(["officialGradesComments"]);
    const deferredSchoolFields =
      sectionId === "school"
        ? nonGradeFields.filter((f) => DEFERRED_SCHOOL_FIELDS.has(f.field_key))
        : [];
    const topNonGradeFields =
      sectionId === "school"
        ? nonGradeFields.filter((f) => !DEFERRED_SCHOOL_FIELDS.has(f.field_key))
        : nonGradeFields;

    // If no sub-groups, render flat
    if (subGroups.length === 0) {
      return (
        <Box>
          {renderFieldGrid(topNonGradeFields, sectionId)}
          {gradeFields.length > 0 ? (
            <Box sx={{ mt: 3 }}>
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  mb: "14px",
                  pb: 1,
                  borderBottom: "1px solid var(--sand-light, #F3EFEB)",
                }}
              >
                {isEnglish ? "Official grades by year" : "Notas oficiales por a\u00f1o"}
              </Typography>
              <GradesTable
                fields={gradeFields}
                formValues={formValues}
                onFieldChange={(key, value) => {
                  setFormValues((current) => ({ ...current, [key]: value }));
                  markFieldDirty();
                }}
                onFieldBlur={() => {}}
                disabled={!isEditingEnabled}
                language={language}
              />
            </Box>
          ) : null}
          {deferredSchoolFields.length > 0 ? (
            <Box sx={{ mt: gradeFields.length > 0 ? 3 : 0 }}>
              {renderFieldGrid(deferredSchoolFields, sectionId)}
            </Box>
          ) : null}
        </Box>
      );
    }

    // Collect all sub-grouped field keys
    const subGroupedKeys = new Set<string>();
    for (const sg of subGroups) {
      for (const k of sg.fieldKeys) subGroupedKeys.add(k);
    }

    // Fields not in any sub-group (rendered first, ungrouped)
    const ungroupedFields = topNonGradeFields.filter((f) => !subGroupedKeys.has(f.field_key));

    return (
      <Box>
        {/* Ungrouped fields first */}
        {ungroupedFields.length > 0 ? (
          <Box sx={{ mb: "28px", animation: "fadeUp 0.35s ease", animationFillMode: "backwards" }}>
            {renderFieldGrid(ungroupedFields, sectionId)}
          </Box>
        ) : null}

        {/* Sub-groups */}
        {subGroups.map((sg, idx) => {
          const subGroupOrder = new Map(Array.from(sg.fieldKeys).map((key, orderIdx) => [key, orderIdx]));
          const sgFields = topNonGradeFields
            .filter((f) => sg.fieldKeys.has(f.field_key))
            .sort((a, b) => (subGroupOrder.get(a.field_key) ?? 999) - (subGroupOrder.get(b.field_key) ?? 999));
          if (sgFields.length === 0) return null;
          return (
            <Box
              key={sg.key}
              sx={{
                animation: "fadeUp 0.35s ease",
                animationFillMode: "backwards",
                animationDelay: `${(idx + 1) * 0.05}s`,
              }}
            >
              {renderSubGroupCard(sg, sgFields, sectionId)}
            </Box>
          );
        })}

        {/* Grades table for school section */}
        {gradeFields.length > 0 ? (
          <Box sx={{ mt: 1 }}>
            <Typography
              sx={{
                fontSize: "0.68rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--muted)",
                mb: "14px",
                pb: 1,
                borderBottom: "1px solid var(--sand-light, #F3EFEB)",
              }}
            >
              {isEnglish ? "Official grades by year" : "Notas oficiales por a\u00f1o"}
            </Typography>
            <GradesTable
              fields={gradeFields}
              formValues={formValues}
              onFieldChange={(key, value) => {
                setFormValues((current) => ({ ...current, [key]: value }));
                markFieldDirty();
              }}
              onFieldBlur={() => {}}
              disabled={!isEditingEnabled}
              language={language}
            />
          </Box>
        ) : null}

        {deferredSchoolFields.length > 0 ? (
          <Box sx={{ mt: 3 }}>
            {renderFieldGrid(deferredSchoolFields, sectionId)}
          </Box>
        ) : null}
      </Box>
    );
  }

  async function submitApplication() {
    setError(null);
    setSuccessMessage(null);

    if (!application?.id) {
      setError({ message: copy("Primero guarda tu borrador antes de enviar.", "Save your draft before submitting.") });
      return;
    }

    if (isStageClosed) {
      setError({
        message: copy(
          "La etapa ya cerró y no puedes enviar o editar esta postulación. Contacta al comité.",
          "This stage is closed and you cannot submit or edit this application. Contact the committee.",
        ),
      });
      return;
    }

    const response = await fetch(`/api/applications/${application.id}/submit`, {
      method: "POST",
    });
    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setApplication(body.application);
    void refreshApplicationSnapshot({
      includeRecommenders: true,
    });
    setSuccessMessage(copy("Postulación enviada. El comité revisará tu información.", "Application submitted. The committee will review your information."));
  }

  async function saveRecommenders() {
    setError(null);
    setSuccessMessage(null);

    if (!application?.id) {
      setError({ message: copy("Guarda tu postulación antes de registrar recomendadores.", "Save your application before registering recommenders.") });
      return;
    }

    if (isLocked && !isEditMode) {
      setError({
        message: copy(
          "Tu postulación ya fue enviada. Haz clic en 'Editar respuesta' para habilitar cambios.",
          "Your application was already submitted. Click 'Edit response' to enable changes.",
        ),
      });
      return;
    }

    const mentorEmail = recommenderInputs.mentor.trim();
    const friendEmail = recommenderInputs.friend.trim();

    if (!mentorEmail || !friendEmail) {
      setError({
        message: copy(
          "Debes registrar 2 recomendadores: uno tutor/profesor/mentor y uno amigo.",
          "You must register 2 recommenders: one tutor/teacher/mentor and one friend.",
        ),
      });
      return;
    }

    setSavingRecommenders(true);
    try {
      const response = await fetch("/api/recommendations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: application.id,
          recommenders: [
            { role: "mentor", email: mentorEmail },
            { role: "friend", email: friendEmail },
          ],
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      const rows = (body.recommenders as RecommenderSummary[] | undefined) ?? [];
      setRecommenders(rows);
      void refreshApplicationSnapshot({
        includeRecommenders: true,
      });

      const createdCount = Number(body.createdCount ?? 0);
      const replacedCount = Number(body.replacedCount ?? 0);
      const failedEmailCount = Number(body.failedEmailCount ?? 0);
      const sentEmailCount = Math.max(createdCount - failedEmailCount, 0);

      const chunks = [];
      if (sentEmailCount > 0) {
        chunks.push(
          copy(
            `${sentEmailCount} invitación(es) enviada(s).`,
            `${sentEmailCount} invitation(s) sent.`,
          ),
        );
      }
      if (createdCount > 0 && failedEmailCount >= createdCount) {
        chunks.push(
          copy(
            `${createdCount} recomendador(es) registrado(s).`,
            `${createdCount} recommender(s) registered.`,
          ),
        );
      }
      if (replacedCount > 0) {
        chunks.push(
          copy(
            `${replacedCount} recomendador(es) reemplazado(s) con token nuevo.`,
            `${replacedCount} recommender(s) replaced with a new token.`,
          ),
        );
      }
      if (failedEmailCount > 0) {
        chunks.push(
          copy(
            `${failedEmailCount} correo(s) no se enviaron, usa "Enviar recordatorio".`,
            `${failedEmailCount} email(s) were not sent, use "Send reminder".`,
          ),
        );
      }

      setSuccessMessage(chunks.length > 0 ? chunks.join(" ") : copy("Recomendadores actualizados.", "Recommenders updated."));
    } finally {
      setSavingRecommenders(false);
    }
  }

  async function sendReminder(recommendationId: string) {
    setError(null);
    setSuccessMessage(null);
    setRemindingId(recommendationId);

    try {
      const response = await fetch(`/api/recommendations/${recommendationId}/remind`, {
        method: "POST",
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      const updated = body.recommender as RecommenderSummary;
      setRecommenders((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      void refreshApplicationSnapshot({
        includeRecommenders: true,
      });
      setSuccessMessage(copy("Recordatorio enviado al recomendador.", "Reminder sent to recommender."));
    } finally {
      setRemindingId(null);
    }
  }

  async function uploadDocument(fieldKey: string, event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccessMessage(null);

    const file = event.target.files?.[0];
    if (!file || !application?.id) {
      return;
    }

    if (isLocked && !isEditMode) {
      setError({
        message: copy(
          "Tu postulación ya fue enviada. Haz clic en 'Editar respuesta' para actualizar documentos.",
          "Your application was already submitted. Click 'Edit response' to update documents.",
        ),
      });
      return;
    }

    setUploadingFieldKey(fieldKey);
    const isReplacingExistingFile = Boolean(application.files?.[fieldKey]);

    try {
      const signedUrlResponse = await fetch(`/api/applications/${application.id}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        }),
      });
      const signedUrlBody = await signedUrlResponse.json();

      if (!signedUrlResponse.ok) {
        setError(signedUrlBody);
        return;
      }

      const uploadResponse = await fetch(signedUrlBody.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        setError({ message: copy("No se pudo subir el archivo al almacenamiento.", "Could not upload the file to storage.") });
        return;
      }

      const associateResponse = await fetch(`/api/applications/${application.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: fieldKey,
          path: signedUrlBody.path,
          title: fileTitleEdits[fieldKey]?.trim() || file.name,
          originalName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          uploadedAt: new Date().toISOString(),
        }),
      });
      const associateBody = await associateResponse.json();

      if (!associateResponse.ok) {
        setError(associateBody);
        return;
      }

      setApplication(associateBody.application);
      void refreshApplicationSnapshot({
        includeRecommenders: false,
      });
      setFileTitleEdits((current) => ({
        ...current,
        [fieldKey]: current[fieldKey]?.trim() || file.name,
      }));
      setSuccessMessage(
        copy(
          isReplacingExistingFile
            ? "Documento actualizado correctamente."
            : "Documento subido correctamente.",
          isReplacingExistingFile
            ? "Document updated successfully."
            : "Document uploaded successfully.",
        ),
      );
    } finally {
      setUploadingFieldKey(null);
    }
  }

  const sidebarSteps: SidebarStep[] = useMemo(() => {
    const progressByKey = new Map(progressSteps.map((step) => [step.key, step]));
    return wizardSections.map((section) => {
      const progressStep = progressByKey.get(section.id);
      if (progressStep) {
        return progressStep;
      }
      return {
        key: section.id,
        label: section.title,
        status: "not_started" as const,
      };
    });
  }, [progressSteps, wizardSections]);
  const sidebarDraftDot: "success" | "warning" | "error" | "info" =
    saveState === "error" ? "error" : saveState === "saving" ? "info" : saveState === "dirty" ? "warning" : "success";
  const sidebarProgressLabel = isEnglish
    ? `${completedSteps} of ${progressSteps.length} complete`
    : `${completedSteps} de ${progressSteps.length} completado`;
  const currentStepLabel = currentSection?.title ?? "";

  return (
    <Box>
      {/* Fixed top navigation */}
      <ApplicantTopNav
        draftStatusLabel={draftStatusLabel}
        draftStatusDot={sidebarDraftDot}
        modeStatusLabel={modeStatusLabel}
        modeStatusDot={modeStatusDot}
      />

      <Box
        sx={{
          display: "flex",
          pt: "var(--topbar-height)",
          minHeight: "calc(100vh - var(--topbar-height))",
        }}
      >
      {/* Desktop Sidebar */}
      <ApplicantSidebar
        processLabel={cycleName ?? copy("Proceso 2026", "Process 2026")}
        title={stageLabel ?? copy("Tu postulación", "Your application")}
        deadline={
          stageCloseAt
            ? `${copy("Cierre", "Closes")}: ${new Date(stageCloseAt).toLocaleDateString(locale)}`
            : undefined
        }
        progressPercent={progressPercent}
        progressLabel={sidebarProgressLabel}
        steps={sidebarSteps}
        activeStepKey={activeSectionId}
        onStepClick={(key) => jumpToSection(key as WizardSectionId)}
        onHide={() => setIsSidebarHidden(true)}
        hideLabel={copy("Ocultar barra lateral", "Hide sidebar")}
        hiddenDesktop={isSidebarHidden}
      />

      {isSidebarHidden ? (
        <Box
          sx={{
            display: "none",
            "@media (min-width: 769px)": {
              display: "block",
              position: "fixed",
              top: "calc(var(--topbar-height) + 14px)",
              left: 10,
              zIndex: 55,
            },
          }}
        >
          <IconButton
            onClick={() => setIsSidebarHidden(false)}
            aria-label={copy("Mostrar barra lateral", "Show sidebar")}
            size="small"
            sx={{
              width: 34,
              height: 34,
              border: "1px solid var(--sand)",
              borderRadius: "10px",
              color: "var(--muted)",
              bgcolor: "var(--surface)",
              boxShadow: "var(--shadow-sm)",
              "&:hover": {
                bgcolor: "var(--cream)",
                borderColor: "var(--muted)",
                color: "var(--ink)",
              },
            }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      ) : null}

      {/* Main content area */}
      <Box
        component="main"
        sx={{
          flex: 1,
          ml: 0,
          pb: "120px",
          transition: "margin-left 220ms ease",
          "@media (max-width: 768px)": {
            pb: "140px",
          },
          "@media (min-width: 769px)": {
            ml: isSidebarHidden ? 0 : "var(--sidebar-width, 280px)",
          },
        }}
      >
        <Box sx={{ maxWidth: 760, mx: "auto", px: { xs: 2, sm: 4 }, pt: { xs: 3, sm: 5 } }}>
          {/* Mobile progress panel */}
          <ApplicantMobileProgress
            currentStepLabel={currentStepLabel}
            progressPercent={progressPercent}
            draftStatusLabel={draftStatusLabel}
            draftStatusDot={sidebarDraftDot}
            steps={sidebarSteps}
            activeStepKey={activeSectionId}
            onStepClick={(key) => jumpToSection(key as WizardSectionId)}
          />

          {/* Locked status banner */}
          {isLocked && !isEditMode ? (
            <Box sx={{ mb: 3, p: 2, bgcolor: "var(--cream)", border: "1px solid var(--sand)", borderRadius: "var(--radius)" }}>
              <Typography color="text.secondary">
                {copy(
                  "Tu postulación ya fue enviada. Para cambiar datos, usa “Editar respuesta” en la barra inferior.",
                  "Your application was already submitted. Use “Edit response” in the bottom bar to make changes.",
                )}
              </Typography>
              {isStageClosed ? (
                <Typography variant="body2" color="error.main">
                  {copy(
                    "La etapa está cerrada. Solo el comité puede reabrir cambios.",
                    "The stage is closed. Only the committee can reopen changes.",
                  )}
                </Typography>
              ) : null}
            </Box>
          ) : null}

          {isStageClosed ? (
            <Typography variant="body2" color="error.main" sx={{ mb: 2 }}>
              {copy(
                "Etapa cerrada: no se permiten nuevas ediciones del postulante.",
                "Stage closed: no further applicant edits are allowed.",
              )}
            </Typography>
          ) : null}

          {error ? <Box sx={{ mb: 3 }}><ErrorCallout message={error.message} errorId={error.errorId} context="applicant_form" /></Box> : null}

          {successMessage ? (
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#DCFCE7", mb: 3 }}>
              <Typography color="#166534">{successMessage}</Typography>
            </Box>
          ) : null}

          {/* Animated section wrapper — re-mounts on section change */}
          <Box
            key={activeSectionId}
            sx={{
              animation: "fadeUp 0.35s ease both",
            }}
          >
          {/* Section eyebrow header */}
          {currentSection ? (
            <Box sx={{ mb: 4 }}>
              {showNumberedStepHeader ? (
                <Typography
                  sx={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--uwc-maroon)",
                    mb: 0.75,
                  }}
                >
                  {isEnglish
                    ? `Step ${currentProgressSectionIndex + 1} of ${progressWizardSections.length}`
                    : `Paso ${currentProgressSectionIndex + 1} de ${progressWizardSections.length}`}
                </Typography>
              ) : null}
              <Typography
                sx={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: { xs: "1.45rem", sm: "1.8rem" },
                  fontWeight: 400,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.25,
                  color: "var(--ink)",
                  mb: 1,
                }}
              >
                {currentSection.title}
              </Typography>
              <Typography sx={{ fontSize: "0.85rem", color: "var(--muted)", maxWidth: 520 }}>
                {currentSection.description}
              </Typography>
            </Box>
          ) : null}

          {/* Form section content */}
          {currentSection?.id === PREP_SECTION_ID ? (
            <Box
              sx={{
                border: "1px solid var(--sand)",
                borderRadius: "var(--radius)",
                bgcolor: "var(--cream)",
                p: { xs: 2, sm: 2.5 },
              }}
            >
              {!stageInstructions?.trim().length ? (
                <Typography color="text.secondary" sx={{ mb: 1.2, fontSize: "0.85rem" }}>
                  {copy(
                    "Reúne los documentos y datos necesarios. Puedes salir en cualquier momento: el borrador se guarda automáticamente.",
                    "Gather all required documents and data. You can leave anytime: the draft auto-saves.",
                  )}
                </Typography>
              ) : null}
              {stageInstructions?.trim().length ? (
                <Box
                  sx={{
                    color: "var(--ink)",
                    fontSize: "0.92rem",
                    lineHeight: 1.7,
                    "& h1, & h2, & h3": {
                      fontFamily: "var(--font-display), Georgia, serif",
                      fontWeight: 500,
                      letterSpacing: "-0.02em",
                      margin: "0 0 0.75rem",
                    },
                    "& p": {
                      margin: "0 0 0.85rem",
                    },
                    "& ul": {
                      margin: "0 0 0.85rem 1.2rem",
                      padding: 0,
                    },
                    "& li": {
                      marginBottom: "0.4rem",
                    },
                    "& a": {
                      color: "var(--uwc-maroon)",
                    },
                    "& code": {
                      fontFamily: "ui-monospace, SFMono-Regular, monospace",
                      fontSize: "0.85em",
                      background: "rgba(0,0,0,0.04)",
                      padding: "0.05rem 0.25rem",
                      borderRadius: "4px",
                    },
                  }}
                  dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(stageInstructions) }}
                />
              ) : (
                <Stack spacing={0.55}>
                  <Typography variant="body2">
                    {copy(
                      "1. Ten listos documentos en PDF/JPG/PNG (idealmente menos de 10MB).",
                      "1. Prepare documents in PDF/JPG/PNG format (ideally under 10MB).",
                    )}
                  </Typography>
                  <Typography variant="body2">
                    {copy(
                      "2. Confirma los correos de tus dos recomendadores antes de registrarlos.",
                      "2. Confirm your two recommenders' emails before registering them.",
                    )}
                  </Typography>
                  <Typography variant="body2">
                    {copy(
                      "3. Completa primero los campos obligatorios (marcados con *), luego revisa.",
                      "3. Complete required fields first (marked with *), then review.",
                    )}
                  </Typography>
                  {requiredDocumentLabels.length > 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8 }}>
                      {copy("Documentos obligatorios", "Required documents")}: {requiredDocumentLabels.join(", ")}.
                    </Typography>
                  ) : null}
                </Stack>
              )}
            </Box>
          ) : null}

          {currentSection && currentSection.formSection && currentSection.id !== "documents_uploads" && currentSection.id !== "recommenders_flow" && currentSection.id !== "review_submit" ? (
            <Box>
              {currentFormSectionId
                ? renderEditableFields({
                    fields: currentSection.formSection.fields,
                    sectionId: currentFormSectionId,
                  })
                : null}
            </Box>
          ) : null}

          {currentSection?.id === "documents_uploads" ? (
            <Box>
              {currentSection.formSection?.fields.length ? (
                <Box sx={{ mb: 2 }}>
                  {renderEditableFields({
                    fields: currentSection.formSection.fields,
                    sectionId: "documents",
                  })}
                </Box>
              ) : null}

              <Stack spacing={3}>
                {fileStageFields.map((field) => {
                  const rawValue =
                    ((application?.files as Record<string, ApplicationFileValue> | undefined)?.[field.field_key] ??
                      null) as ApplicationFileValue | null;
                  const fileEntry = parseFileEntry(rawValue);
                  const fileName = fileEntry?.original_name ?? null;

                  return (
                    <UploadZone
                      key={field.id}
                      label={getLocalizedDisplayFieldLabel({ sectionId: "documents", field, language })}
                      hint={getLocalizedFieldHelpText(field, language) ?? undefined}
                      fileEntry={fileEntry ? {
                        path: fileEntry.path,
                        title: fileEntry.title ?? undefined,
                        original_name: fileEntry.original_name ?? undefined,
                        mime_type: fileEntry.mime_type ?? undefined,
                        size_bytes: fileEntry.size_bytes ?? undefined,
                        uploaded_at: fileEntry.uploaded_at ?? undefined,
                      } : null}
                      fileName={fileName}
                      isUploading={uploadingFieldKey === field.field_key}
                      disabled={!application?.id || !isEditingEnabled}
                      onUpload={(event) => uploadDocument(field.field_key, event)}
                      language={language}
                    />
                  );
                })}
              </Stack>
              {!application?.id ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontSize: "0.78rem" }}>
                  {copy("Guarda primero un borrador para habilitar la subida.", "Save a draft first to enable uploads.")}
                </Typography>
              ) : null}
            </Box>
          ) : null}

          {currentSection?.id === "recommenders_flow" ? (
            <Box>
              {currentSection.formSection?.fields.length ? (
                <Box sx={{ mb: 2 }}>
                  {renderEditableFields({
                    fields: currentSection.formSection.fields,
                    sectionId: "recommenders",
                  })}
                </Box>
              ) : null}

              <Stack spacing={2}>
                {(["mentor", "friend"] as const).map((role, idx) => {
                  const current = activeRecommendersByRole.get(role) ?? null;
                  const tone = current ? statusTone(current.status, language) : statusTone("invited", language);

                  return (
                    <Box key={role} sx={{ border: "1px solid var(--sand)", borderRadius: "var(--radius-lg, 12px)", p: 2.5 }}>
                      {/* Guardian-card header */}
                      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: "var(--sand-light, #F3EFEB)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            color: "var(--ink-light, #5A5450)",
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600, fontSize: "0.88rem" }}>{roleLabel(role, language)}</Typography>
                          <Typography sx={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                            {current
                              ? current.email
                              : copy("Sin registrar", "Not registered")}
                          </Typography>
                        </Box>
                        {current ? (
                          <Chip
                            label={tone.label}
                            size="small"
                            sx={{ bgcolor: tone.bg, color: tone.color, fontWeight: 600, fontSize: "0.7rem" }}
                          />
                        ) : null}
                      </Stack>

                      <Box sx={{ display: "flex", flexDirection: "column" }}>
                        <Typography
                          component="div"
                          sx={{
                            fontSize: "0.78rem",
                            fontWeight: 500,
                            color: "var(--ink)",
                            mb: "5px",
                            lineHeight: 1.35,
                          }}
                        >
                          {`${copy("Correo", "Email")} (${roleLabel(role, language)})`}
                        </Typography>
                        <TextField
                          hiddenLabel
                          value={recommenderInputs[role]}
                          onChange={(event) =>
                            setRecommenderInputs((prev) => ({
                              ...prev,
                              [role]: event.target.value,
                            }))
                          }
                          fullWidth
                          type="email"
                          placeholder={role === "mentor" ? "mentor@school.edu" : "friend@gmail.com"}
                          disabled={!isEditingEnabled || current?.status === "submitted"}
                          sx={APPLICANT_TEXT_FIELD_SX}
                          slotProps={{
                            htmlInput: {
                              "aria-label": `${copy("Correo", "Email")} (${roleLabel(role, language)})`,
                            },
                          }}
                        />
                      </Box>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        sx={{ mt: 1.2 }}
                      >
                        {current?.inviteSentAt ? (
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
                            {copy("Invitación", "Invite")}: {new Date(current.inviteSentAt).toLocaleString(locale)}
                          </Typography>
                        ) : null}
                        {current?.submittedAt ? (
                          <Typography variant="body2" color="success.main" sx={{ fontSize: "0.75rem" }}>
                            {copy("Formulario enviado", "Form submitted")}: {new Date(current.submittedAt).toLocaleString(locale)}
                          </Typography>
                        ) : null}
                        {current && current.status !== "submitted" ? (
                          <Button
                            variant="text"
                            onClick={() => sendReminder(current.id)}
                            disabled={remindingId === current.id || !isEditingEnabled}
                          >
                            {remindingId === current.id ? copy("Enviando...", "Sending...") : copy("Enviar recordatorio", "Send reminder")}
                          </Button>
                        ) : null}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={saveRecommenders}
                  disabled={!isEditingEnabled || savingRecommenders}
                >
                  {savingRecommenders ? copy("Guardando...", "Saving...") : copy("Guardar recomendadores", "Save recommenders")}
                </Button>
              </Stack>
              {loadingRecommenders ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, fontSize: "0.78rem" }}>
                  {copy("Cargando recomendadores guardados...", "Loading saved recommenders...")}
                </Typography>
              ) : null}
              {!loadingRecommenders && application?.id && recommenders.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, fontSize: "0.78rem" }}>
                  {copy("Aún no hay recomendadores registrados para esta postulación.", "There are no recommenders registered for this application yet.")}
                </Typography>
              ) : null}
            </Box>
          ) : null}

          {currentSection?.id === "review_submit" ? (
            <Box>
              <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", mb: 1 }}>
                {copy("Progreso por secciones", "Section progress")}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>
                {sidebarProgressLabel}
              </Typography>
              <Stack spacing={0.8} sx={{ mb: 3 }}>
                {progressSteps.map((step) => (
                  <Stack key={step.key} direction="row" alignItems="center" spacing={1}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor:
                          step.status === "complete"
                            ? "var(--success)"
                            : step.status === "in_progress"
                              ? "var(--uwc-maroon)"
                              : "var(--sand)",
                      }}
                    />
                    <Typography variant="body2" sx={{ flex: 1 }}>{step.label}</Typography>
                    <StatusBadge status={step.status} />
                  </Stack>
                ))}
              </Stack>
              <Typography color="text.secondary" sx={{ mb: 2, fontSize: "0.82rem" }}>
                {copy("Revisa el progreso por sección y envía solo cuando estés listo.", "Review progress by section and submit only when you are ready.")}
              </Typography>
            </Box>
          ) : null}
          </Box>{/* end animated section wrapper */}
        </Box>
      </Box>

      {/* Fixed bottom action bar */}
      <ApplicantActionBar
        onPrevious={() => { if (previousSectionId) jumpToSection(previousSectionId); }}
        onSaveDraft={() => void saveDraft({ silent: false })}
        onToggleEdit={() => {
          setError(null);
          setSuccessMessage(null);
          if (isEditMode) {
            if (hasPendingChanges) {
              let confirmed = true;
              if (typeof window !== "undefined") {
                try {
                  confirmed = window.confirm(
                    copy(
                      "Se descartarán los cambios no guardados y saldrás del modo edición. ¿Continuar?",
                      "Unsaved changes will be discarded and editing mode will be closed. Continue?",
                    ),
                  );
                } catch {
                  confirmed = true;
                }
              }
              if (!confirmed) {
                return;
              }
            }
            setIsEditMode(false);
            setFieldErrors({});
            setFormValues(() => {
              const payload = application?.payload ?? {};
              const nextValues: Record<string, string> = {};
              for (const field of formStageFields) {
                nextValues[field.field_key] = getPayloadValue(payload, field.field_key);
              }
              formValuesRef.current = nextValues;
              return nextValues;
            });
            hasPendingChangesRef.current = false;
            setHasPendingChanges(false);
            setSaveState(lastSavedAt ? "saved" : "idle");
            return;
          }
          setIsEditMode(true);
        }}
        onNext={() => {
          if (nextSectionId) {
            jumpToSection(nextSectionId);
          } else if (activeSectionId === "review_submit") {
            submitApplication();
          }
        }}
        previousLabel={copy("\u2190 Anterior", "\u2190 Previous")}
        editLabel={editToggleLabel}
        saveDraftLabel={isSavingDraft ? copy("Guardando...", "Saving...") : copy("Guardar borrador", "Save draft")}
        nextLabel={
          activeSectionId === "review_submit"
            ? copy("Enviar postulación", "Submit application")
            : nextSectionId
              ? `${copy("Siguiente", "Next")} \u2192`
              : copy("Finalizado", "Finished")
        }
        hasPrevious={Boolean(previousSectionId)}
        hasNext={
          Boolean(nextSectionId) ||
          (
            activeSectionId === "review_submit" &&
            Boolean(application?.id) &&
            !(isLocked && !isEditMode) &&
            !isStageClosed
          )
        }
        isSaving={isSavingDraft}
        isEditingEnabled={isEditingEnabled}
        hasPendingChanges={hasPendingChanges}
        showEditToggle={isLocked && !isStageClosed}
        isEditToggleDisabled={isStageClosed || isSavingDraft}
        sidebarVisibleDesktop={!isSidebarHidden}
      />
      </Box>{/* end layout flex container */}
    </Box>
  );
}
