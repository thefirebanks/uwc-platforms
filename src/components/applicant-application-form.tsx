"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useAppLanguage } from "@/components/language-provider";
import { ApplicantSidebar, type SidebarStep } from "@/components/applicant-sidebar";
import { ApplicantMobileProgress } from "@/components/applicant-mobile-progress";
import { ApplicantActionBar } from "@/components/applicant-action-bar";
import { TogglePill } from "@/components/toggle-pill";
import { GradesTable, isGradeField } from "@/components/grades-table";
import { UploadZone } from "@/components/upload-zone";
import type { AppLanguage } from "@/lib/i18n/messages";
import type { Application, CycleStageField, RecommendationStatus, RecommenderRole } from "@/types/domain";
import { StatusBadge } from "@/components/stage-badge";
import { ErrorCallout } from "@/components/error-callout";
import { validateStagePayload } from "@/lib/stages/form-schema";
import { buildFallbackStageFields } from "@/lib/stages/stage-field-fallback";
import {
  groupApplicantFormFields,
  type ApplicantFormSection,
  type ApplicantFormSectionId,
} from "@/lib/stages/applicant-sections";
import { getSubGroupsForSection, isBooleanField, type SubGroupDef } from "@/lib/stages/field-sub-groups";

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
type WizardSectionId = ApplicantFormSectionId | "documents_uploads" | "recommenders_flow" | "review_submit";

const SECTION_TITLES_ES: Record<WizardSectionId, string> = {
  eligibility: "Elegibilidad",
  identity: "Datos personales",
  family: "Familia y apoderados",
  school: "Colegio y notas",
  motivation: "Motivación",
  recommenders: "Datos de recomendadores",
  documents: "Pago y soporte",
  other: "Campos adicionales",
  documents_uploads: "Documentos",
  recommenders_flow: "Recomendadores",
  review_submit: "Revisión y envío",
};

const SECTION_TITLES_EN: Record<WizardSectionId, string> = {
  eligibility: "Eligibility",
  identity: "Personal details",
  family: "Family and guardians",
  school: "School and grades",
  motivation: "Motivation",
  recommenders: "Recommender details",
  documents: "Payment and support",
  other: "Additional fields",
  documents_uploads: "Documents",
  recommenders_flow: "Recommenders",
  review_submit: "Review and submit",
};

const FIELD_LABEL_PREFIX_BY_SECTION: Partial<Record<ApplicantFormSectionId, string>> = {
  eligibility: "Cumplimiento de requisitos - ",
  identity: "Información personal - ",
  family: "Información familiar y apoderados - ",
  school: "Información del colegio - ",
  motivation: "Hoja de vida e interés en UWC - ",
  documents: "Documentos - ",
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

const ENGLISH_FIELD_HELP_BY_KEY: Record<string, string> = {
  secondNationality: "Only if applicable.",
  isUpperThird: "Enter the answer as text.",
  ibInstructionYear: "Only if you answered yes to studying/studied IB.",
};

const SECTION_DESCRIPTIONS_EN: Record<ApplicantFormSectionId, string> = {
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
  sectionId: ApplicantFormSectionId;
  fieldLabel: string;
}) {
  const prefix = FIELD_LABEL_PREFIX_BY_SECTION[sectionId];
  if (!prefix) {
    return fieldLabel;
  }

  return fieldLabel.startsWith(prefix) ? fieldLabel.slice(prefix.length).trim() : fieldLabel;
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
  sectionId: ApplicantFormSectionId;
  field: CycleStageField;
  language: AppLanguage;
}) {
  const displayLabel = getDisplayFieldLabel({
    sectionId,
    fieldLabel: field.field_label,
  });

  if (language === "es") {
    return displayLabel;
  }

  return ENGLISH_FIELD_LABEL_BY_KEY[field.field_key] ?? humanizeFieldKey(field.field_key);
}

function getLocalizedFieldPlaceholder(field: CycleStageField, language: AppLanguage) {
  if (language === "es") {
    return field.placeholder ?? undefined;
  }

  return ENGLISH_FIELD_PLACEHOLDER_BY_KEY[field.field_key];
}

function getLocalizedFieldHelpText(field: CycleStageField, language: AppLanguage) {
  if (language === "es") {
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
    complete: requiredFields.length === 0 || completedRequired === requiredFields.length,
    inProgress: hasAnyValue,
  });
}

export function ApplicantApplicationForm({
  existingApplication,
  cycleId,
  cycleName,
  stageFields,
  stageCloseAt,
  initialRecommenders = [],
}: {
  existingApplication: Application | null;
  cycleId: string;
  cycleName?: string;
  stageFields?: CycleStageField[];
  stageCloseAt?: string | null;
  initialRecommenders?: RecommenderSummary[];
}) {
  const { language } = useAppLanguage();
  const isEnglish = language === "en";
  const locale = isEnglish ? "en-US" : "es-PE";
  const copy = useCallback((spanish: string, english: string) => (isEnglish ? english : spanish), [isEnglish]);
  const sectionTitles = isEnglish ? SECTION_TITLES_EN : SECTION_TITLES_ES;

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
  const [activeSectionId, setActiveSectionId] = useState<WizardSectionId>("eligibility");
  const [isPrepExpanded, setIsPrepExpanded] = useState(!existingApplication?.id);

  const isStageClosed = Boolean(stageCloseAt && Date.parse(stageCloseAt) < Date.now());
  const isLocked = application ? LOCKED_STATUSES.has(application.status) : false;
  const isEditingEnabled = !isStageClosed && (!isLocked || isEditMode);
  const providedStageFields = stageFields ?? EMPTY_STAGE_FIELDS;
  const initialApplicationIdRef = useRef<string | null>(existingApplication?.id ?? null);
  const skippedInitialRecommenderFetchRef = useRef(false);

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
    () => groupApplicantFormFields(formStageFields),
    [formStageFields],
  );

  const documentFormSection = useMemo(
    () => groupedFormSections.find((section) => section.id === "documents") ?? null,
    [groupedFormSections],
  );

  const wizardSections = useMemo(() => {
    const sections: Array<{
      id: WizardSectionId;
      title: string;
      description: string;
      formSection: ApplicantFormSection | null;
      status: ProgressState;
    }> = [];

    for (const section of groupedFormSections) {
      if (section.id === "documents" || section.id === "recommenders") {
        continue;
      }

      sections.push({
        id: section.id,
        title: sectionTitles[section.id],
        description: isEnglish ? SECTION_DESCRIPTIONS_EN[section.id] : section.description,
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
      sections.push({
        id: "documents_uploads",
        title: sectionTitles.documents_uploads,
        description: copy(
          "Carga los archivos obligatorios y confirma metadatos.",
          "Upload the required files and confirm metadata.",
        ),
        formSection: documentFormSection,
        status: docMetadataStatus,
      });
    }

    sections.push({
      id: "recommenders_flow",
      title: sectionTitles.recommenders_flow,
      description: copy("Registra dos recomendadores y sigue su estado.", "Register two recommenders and track their status."),
      formSection: groupedFormSections.find((section) => section.id === "recommenders") ?? null,
      status: "not_started",
    });

    sections.push({
      id: "review_submit",
      title: sectionTitles.review_submit,
      description: copy("Revisa tu avance final y envía tu postulación.", "Review your final progress and submit your application."),
      formSection: null,
      status: "not_started",
    });

    return sections;
  }, [application?.payload, copy, documentFormSection, fileStageFields.length, groupedFormSections, isEnglish, sectionTitles]);

  const documentsStatus = useMemo(() => {
    const requiredFileFields = fileStageFields.filter((field) => field.is_required);
    const files = (application?.files as Record<string, ApplicationFileValue> | undefined) ?? {};
    const completedCount = requiredFileFields.filter((field) => {
      const entry = parseFileEntry(files[field.field_key]);
      return isMeaningfulValue(entry?.path);
    }).length;
    const hasAnyFile = fileStageFields.some((field) => isMeaningfulValue(parseFileEntry(files[field.field_key])?.path));

    return getStepState({
      complete: requiredFileFields.length === 0 || completedCount === requiredFileFields.length,
      inProgress: hasAnyFile || Boolean(application?.id),
    });
  }, [application?.files, application?.id, fileStageFields]);

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
        complete:
          activeRecommendersByRole.get("mentor")?.status === "submitted" &&
          activeRecommendersByRole.get("friend")?.status === "submitted",
        inProgress: activeRecommendersByRole.size > 0 || Boolean(application?.id),
      }),
    [activeRecommendersByRole, application?.id],
  );

  const submissionStatus = useMemo(
    () =>
      getStepState({
        complete: Boolean(
          application &&
            ["submitted", "eligible", "ineligible", "advanced"].includes(application.status),
        ),
        inProgress: Boolean(application?.id),
      }),
    [application],
  );

  const progressSteps = useMemo(
    () =>
      wizardSections.map((section) => {
        // Compute status
        let status: ProgressState;
        if (section.id === "documents_uploads") {
          status = getStepState({
            complete: section.status === "complete" && documentsStatus === "complete",
            inProgress: section.status !== "not_started" || documentsStatus !== "not_started",
          });
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
          const submittedCount =
            (activeRecommendersByRole.get("mentor")?.status === "submitted" ? 1 : 0) +
            (activeRecommendersByRole.get("friend")?.status === "submitted" ? 1 : 0);
          if (submittedCount > 0 || activeRecommendersByRole.size > 0) {
            statusLabel = `${submittedCount}/2`;
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
    [activeRecommendersByRole, application?.files, application?.payload, documentsStatus, fileStageFields, recommenderStatus, submissionStatus, wizardSections],
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
  const currentFormSectionId = currentSection?.formSection?.id ?? null;
  const currentSectionIndex = currentSection
    ? wizardSections.findIndex((section) => section.id === currentSection.id)
    : -1;
  const previousSectionId = currentSectionIndex > 0 ? wizardSections[currentSectionIndex - 1]?.id ?? null : null;
  const nextSectionId =
    currentSectionIndex >= 0 && currentSectionIndex < wizardSections.length - 1
      ? wizardSections[currentSectionIndex + 1]?.id ?? null
      : null;

  useEffect(() => {
    if (wizardSections.length === 0) {
      return;
    }

    if (!wizardSections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(wizardSections[0].id);
    }
  }, [activeSectionId, wizardSections]);

  useEffect(() => {
    const payload = application?.payload ?? {};
    const nextValues: Record<string, string> = {};

    for (const field of formStageFields) {
      nextValues[field.field_key] = getPayloadValue(payload, field.field_key);
    }

    setFormValues(nextValues);
    setHasPendingChanges(false);
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

  const saveDraft = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!isEditingEnabled) {
        return false;
      }

      if (!silent) {
        setError(null);
        setSuccessMessage(null);
      }

      const validation = validateStagePayload({
        fields: formStageFields,
        payload: formValues,
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

        setApplication(body.application);
        setIsEditMode(false);
        setHasPendingChanges(false);
        setLastSavedAt(new Date().toISOString());
        setSaveState("saved");
        if (!silent) {
          setSuccessMessage(copy("Borrador guardado correctamente.", "Draft saved successfully."));
        }
        return true;
      } finally {
        setIsSavingDraft(false);
      }
    },
    [copy, cycleId, formStageFields, formValues, isEditingEnabled],
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
    if (!hasPendingChanges) {
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

    if (isEditingEnabled && hasPendingChanges && !isSavingDraft) {
      void saveDraft({ silent: true });
    }
    setActiveSectionId(sectionId);
  }

  function renderSingleField(field: CycleStageField, sectionId: ApplicantFormSectionId) {
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
            onBlur={() => {
              if (hasPendingChanges && !isSavingDraft) {
                void saveDraft({ silent: true });
              }
            }}
            yesLabel={isEnglish ? "Yes" : "Si"}
            noLabel="No"
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

    // Standard text/number/date/email fields
    return (
      <TextField
        label={field.is_required ? `${displayLabel} *` : displayLabel}
        value={formValues[field.field_key] ?? ""}
        onChange={(event) => {
          const nextValue = event.target.value;
          setFormValues((current) => ({
            ...current,
            [field.field_key]: nextValue,
          }));
          markFieldDirty();
        }}
        onBlur={() => {
          if (hasPendingChanges && !isSavingDraft) {
            void saveDraft({ silent: true });
          }
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
        multiline={field.field_type === "long_text"}
        minRows={field.field_type === "long_text" ? 4 : undefined}
        fullWidth
        disabled={!isEditingEnabled}
        placeholder={getLocalizedFieldPlaceholder(field, language)}
        helperText={fieldErrors[field.field_key] ?? getLocalizedFieldHelpText(field, language)}
        error={Boolean(fieldErrors[field.field_key])}
        InputLabelProps={{ shrink: true }}
      />
    );
  }

  function renderFieldGrid(fields: CycleStageField[], sectionId: ApplicantFormSectionId) {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: "14px 18px",
        }}
      >
        {fields.map((field) => {
          const displayLabel = getLocalizedDisplayFieldLabel({
            sectionId,
            field,
            language,
          });
          const isWide = shouldUseWideFieldLayout({ field, displayLabel });

          return (
            <Box key={field.id} sx={isWide ? { gridColumn: "1 / -1" } : undefined}>
              {renderSingleField(field, sectionId)}
            </Box>
          );
        })}
      </Box>
    );
  }

  function renderSubGroupCard(subGroup: SubGroupDef, fields: CycleStageField[], sectionId: ApplicantFormSectionId) {
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
                  background: subGroup.iconBg,
                  color: subGroup.iconColor,
                }}
              >
                {/* No emoji — just a colored pill */}
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
    sectionId: ApplicantFormSectionId;
  }) {
    const subGroups = getSubGroupsForSection(sectionId);

    // Separate grade fields for the school section
    const gradeFields = sectionId === "school" ? fields.filter((f) => isGradeField(f.field_key)) : [];
    const nonGradeFields = sectionId === "school" ? fields.filter((f) => !isGradeField(f.field_key)) : fields;

    // If no sub-groups, render flat
    if (subGroups.length === 0) {
      return (
        <Box>
          {renderFieldGrid(nonGradeFields, sectionId)}
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
                {isEnglish ? "Official grades by year" : "Notas oficiales por ano"}
              </Typography>
              <GradesTable
                fields={gradeFields}
                formValues={formValues}
                onFieldChange={(key, value) => {
                  setFormValues((current) => ({ ...current, [key]: value }));
                  markFieldDirty();
                }}
                onFieldBlur={() => {
                  if (hasPendingChanges && !isSavingDraft) {
                    void saveDraft({ silent: true });
                  }
                }}
                disabled={!isEditingEnabled}
                language={language}
              />
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
    const ungroupedFields = nonGradeFields.filter((f) => !subGroupedKeys.has(f.field_key));

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
          const sgFields = nonGradeFields.filter((f) => sg.fieldKeys.has(f.field_key));
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
              {isEnglish ? "Official grades by year" : "Notas oficiales por ano"}
            </Typography>
            <GradesTable
              fields={gradeFields}
              formValues={formValues}
              onFieldChange={(key, value) => {
                setFormValues((current) => ({ ...current, [key]: value }));
                markFieldDirty();
              }}
              onFieldBlur={() => {
                if (hasPendingChanges && !isSavingDraft) {
                  void saveDraft({ silent: true });
                }
              }}
              disabled={!isEditingEnabled}
              language={language}
            />
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

      const createdCount = Number(body.createdCount ?? 0);
      const replacedCount = Number(body.replacedCount ?? 0);
      const failedEmailCount = Number(body.failedEmailCount ?? 0);

      const chunks = [];
      if (createdCount > 0) {
        chunks.push(
          copy(
            `${createdCount} invitación(es) enviada(s).`,
            `${createdCount} invitation(s) sent.`,
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
      setFileTitleEdits((current) => ({
        ...current,
        [fieldKey]: current[fieldKey]?.trim() || file.name,
      }));
      setSuccessMessage(copy("Documento subido correctamente.", "Document uploaded successfully."));
    } finally {
      setUploadingFieldKey(null);
    }
  }

  const sidebarSteps: SidebarStep[] = progressSteps;
  const sidebarDraftDot: "success" | "warning" | "error" | "info" =
    saveState === "error" ? "error" : saveState === "saving" ? "info" : saveState === "dirty" ? "warning" : "success";
  const sidebarProgressLabel = isEnglish
    ? `${completedSteps} of ${progressSteps.length} complete`
    : `${completedSteps} de ${progressSteps.length} completado`;
  const currentStepLabel = currentSection?.title ?? "";

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* Desktop Sidebar */}
      <ApplicantSidebar
        processLabel={cycleName ?? copy("Proceso 2026", "Process 2026")}
        title={copy("Tu postulación", "Your application")}
        deadline={
          stageCloseAt
            ? `${copy("Cierre", "Closes")}: ${new Date(stageCloseAt).toLocaleDateString(locale)}`
            : undefined
        }
        progressPercent={progressPercent}
        progressLabel={sidebarProgressLabel}
        draftStatusLabel={draftStatusLabel}
        draftStatusDot={sidebarDraftDot}
        steps={sidebarSteps}
        activeStepKey={activeSectionId}
        onStepClick={(key) => jumpToSection(key as WizardSectionId)}
      />

      {/* Main content area */}
      <Box
        component="main"
        sx={{
          flex: 1,
          ml: { xs: 0, md: "280px" },
          pb: { xs: "140px", md: "120px" },
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
              <Typography color="text.secondary" sx={{ mb: 1 }}>
                {copy(
                  "Tu postulación ya fue enviada. Para cambiar datos, habilita edición manual.",
                  "Your application was already submitted. Enable manual editing to make changes.",
                )}
              </Typography>
              {isStageClosed ? (
                <Typography variant="body2" color="error.main">
                  {copy(
                    "La etapa está cerrada. Solo el comité puede reabrir cambios.",
                    "The stage is closed. Only the committee can reopen changes.",
                  )}
                </Typography>
              ) : (
                <Button
                  variant="outlined"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(
                      copy(
                        "Edición habilitada. Guarda cambios y vuelve a enviar.",
                        "Editing enabled. Save changes and submit again.",
                      ),
                    );
                    setIsEditMode(true);
                  }}
                >
                  {copy("Editar respuesta", "Edit response")}
                </Button>
              )}
            </Box>
          ) : null}
          {isLocked && isEditMode ? (
            <Box sx={{ mb: 3 }}>
              <Button
                variant="text"
                onClick={() => {
                  setIsEditMode(false);
                  setSuccessMessage(copy("Edición cancelada.", "Editing cancelled."));
                }}
              >
                {copy("Cancelar edición", "Cancel editing")}
              </Button>
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

          {/* "Before you start" accordion */}
          <Accordion
            expanded={isPrepExpanded}
            onChange={(_event, expanded) => setIsPrepExpanded(expanded)}
            disableGutters
            elevation={0}
            sx={{
              border: "1px solid var(--sand)",
              borderRadius: "var(--radius)",
              bgcolor: "var(--cream)",
              "&::before": { display: "none" },
              mb: 3,
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="prep-content"
              id="prep-header"
              sx={{ px: 2.5, py: 0.4 }}
            >
              <Stack>
                <Typography variant="h6">{copy("Antes de empezar", "Before you start")}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {copy(
                    "Checklist rápida de preparación para enviar sin fricción.",
                    "Quick checklist to prepare and submit smoothly.",
                  )}
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2.5, pt: 0, pb: 2 }}>
              <Typography color="text.secondary" sx={{ mb: 1.2 }}>
                {copy(
                  "Reúne los documentos y datos necesarios. Puedes salir en cualquier momento: el borrador se guarda automáticamente.",
                  "Gather all required documents and data. You can leave anytime: the draft auto-saves.",
                )}
              </Typography>
              <Stack spacing={0.4}>
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
            </AccordionDetails>
          </Accordion>

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
                  ? `Step ${currentSectionIndex + 1} of ${wizardSections.length}`
                  : `Paso ${currentSectionIndex + 1} de ${wizardSections.length}`}
              </Typography>
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

              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: "0.78rem" }}>
                {copy(
                  "La validación OCR se ejecuta desde el panel admin al revisar postulaciones.",
                  "OCR validation is run from the admin panel during application review.",
                )}
              </Typography>
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

                      <TextField
                        value={recommenderInputs[role]}
                        onChange={(event) =>
                          setRecommenderInputs((prev) => ({
                            ...prev,
                            [role]: event.target.value,
                          }))
                        }
                        fullWidth
                        type="email"
                        label={`${copy("Correo", "Email")} (${roleLabel(role, language)})`}
                        placeholder={role === "mentor" ? "mentor@school.edu" : "friend@gmail.com"}
                        disabled={!isEditingEnabled || current?.status === "submitted"}
                      />
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
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Button
                  variant="contained"
                  onClick={() => void saveDraft({ silent: false })}
                  disabled={isSavingDraft || !isEditingEnabled}
                >
                  {isSavingDraft ? <CircularProgress size={18} color="inherit" /> : copy("Guardar borrador", "Save draft")}
                </Button>
                <Button
                  variant="outlined"
                  onClick={submitApplication}
                  disabled={!application?.id || (isLocked && !isEditMode) || isStageClosed}
                >
                  {isLocked && isEditMode ? copy("Reenviar postulación", "Resubmit application") : copy("Enviar postulación", "Submit application")}
                </Button>
              </Stack>
            </Box>
          ) : null}
          </Box>{/* end animated section wrapper */}
        </Box>
      </Box>

      {/* Fixed bottom action bar */}
      <ApplicantActionBar
        onPrevious={() => { if (previousSectionId) jumpToSection(previousSectionId); }}
        onSaveDraft={() => void saveDraft({ silent: false })}
        onNext={() => {
          if (nextSectionId) {
            jumpToSection(nextSectionId);
          } else if (activeSectionId === "review_submit") {
            submitApplication();
          }
        }}
        previousLabel={copy("\u2190 Anterior", "\u2190 Previous")}
        saveDraftLabel={isSavingDraft ? copy("Guardando...", "Saving...") : copy("Guardar borrador", "Save draft")}
        nextLabel={
          activeSectionId === "review_submit"
            ? copy("Enviar postulación", "Submit application")
            : nextSectionId
              ? `${copy("Siguiente", "Next")} \u2192`
              : copy("Finalizado", "Finished")
        }
        hasPrevious={Boolean(previousSectionId)}
        hasNext={Boolean(nextSectionId) || activeSectionId === "review_submit"}
        isSaving={isSavingDraft}
        isEditingEnabled={isEditingEnabled}
      />
    </Box>
  );
}
