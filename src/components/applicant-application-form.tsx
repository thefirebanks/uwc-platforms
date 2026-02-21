"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { Application, CycleStageField, RecommendationStatus, RecommenderRole } from "@/types/domain";
import { StageBadge, StatusBadge } from "@/components/stage-badge";
import { ErrorCallout } from "@/components/error-callout";
import { validateStagePayload } from "@/lib/stages/form-schema";
import { buildFallbackStageFields } from "@/lib/stages/stage-field-fallback";
import {
  groupApplicantFormFields,
  type ApplicantFormSection,
  type ApplicantFormSectionId,
} from "@/lib/stages/applicant-sections";

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

const SECTION_TITLES: Record<WizardSectionId, string> = {
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

const FIELD_LABEL_PREFIX_BY_SECTION: Partial<Record<ApplicantFormSectionId, string>> = {
  eligibility: "Cumplimiento de requisitos - ",
  identity: "Información personal - ",
  family: "Información familiar y apoderados - ",
  school: "Información del colegio - ",
  motivation: "Hoja de vida e interés en UWC - ",
  documents: "Documentos - ",
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

function statusTone(status: RecommendationStatus) {
  if (status === "submitted") {
    return { label: "Enviado", color: "#166534", bg: "#DCFCE7" };
  }
  if (status === "in_progress") {
    return { label: "En progreso", color: "#92400E", bg: "#FEF3C7" };
  }
  if (status === "opened") {
    return { label: "Abierto", color: "#1D4ED8", bg: "#DBEAFE" };
  }
  if (status === "sent") {
    return { label: "Invitación enviada", color: "#0F766E", bg: "#CCFBF1" };
  }
  if (status === "expired") {
    return { label: "Vencido", color: "#991B1B", bg: "#FEE2E2" };
  }
  if (status === "invalidated") {
    return { label: "Reemplazado", color: "#6B7280", bg: "#F3F4F6" };
  }
  return { label: "Pendiente", color: "#6B7280", bg: "#F3F4F6" };
}

function roleLabel(role: RecommenderRole) {
  return role === "mentor" ? "Tutor/Profesor/Mentor" : "Amigo (no familiar)";
}

function formatSaveStatusLabel(saveState: SaveState, lastSavedAt: string | null) {
  if (saveState === "saving") {
    return "Guardando borrador...";
  }

  if (saveState === "dirty") {
    return "Cambios pendientes";
  }

  if (saveState === "error") {
    return "Error al guardar borrador";
  }

  if (saveState === "saved" && lastSavedAt) {
    return `Borrador guardado ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  return "Borrador listo";
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
  const [savingFileTitleKey, setSavingFileTitleKey] = useState<string | null>(null);
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
        title: section.title,
        description: section.description,
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
        title: "Documentos",
        description: "Carga los archivos obligatorios y confirma metadatos.",
        formSection: documentFormSection,
        status: docMetadataStatus,
      });
    }

    sections.push({
      id: "recommenders_flow",
      title: "Recomendadores",
      description: "Registra dos recomendadores y sigue su estado.",
      formSection: groupedFormSections.find((section) => section.id === "recommenders") ?? null,
      status: "not_started",
    });

    sections.push({
      id: "review_submit",
      title: "Revisión y envío",
      description: "Revisa tu avance final y envía tu postulación.",
      formSection: null,
      status: "not_started",
    });

    return sections;
  }, [application?.payload, documentFormSection, fileStageFields.length, groupedFormSections]);

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
      wizardSections.map((section) => ({
        key: section.id,
        label: section.title,
        status:
          section.id === "documents_uploads"
            ? getStepState({
                complete: section.status === "complete" && documentsStatus === "complete",
                inProgress: section.status !== "not_started" || documentsStatus !== "not_started",
              })
            : section.id === "recommenders_flow"
              ? recommenderStatus
              : section.id === "review_submit"
                ? submissionStatus
                : section.status,
      })),
    [documentsStatus, recommenderStatus, submissionStatus, wizardSections],
  );

  const completedSteps = progressSteps.filter((step) => step.status === "complete").length;
  const progressPercent = progressSteps.length > 0
    ? Math.round((completedSteps / progressSteps.length) * 100)
    : 0;
  const draftStatusLabel = formatSaveStatusLabel(saveState, lastSavedAt);
  const requiredDocumentLabels = useMemo(
    () => fileStageFields.filter((field) => field.is_required).map((field) => field.field_label),
    [fileStageFields],
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
  const saveStatusTone = saveState === "error"
    ? { bg: "#FEE2E2", color: "#991B1B" }
    : saveState === "saving"
      ? { bg: "#E0F2FE", color: "#0C4A6E" }
      : saveState === "dirty"
        ? { bg: "#FEF3C7", color: "#92400E" }
        : { bg: "var(--success-soft)", color: "var(--success)" };

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
          const firstError = Object.values(validation.errors)[0] ?? "Hay campos inválidos.";
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
          setSuccessMessage("Borrador guardado correctamente.");
        }
        return true;
      } finally {
        setIsSavingDraft(false);
      }
    },
    [cycleId, formStageFields, formValues, isEditingEnabled],
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

  function renderEditableFields({
    fields,
    sectionId,
  }: {
    fields: CycleStageField[];
    sectionId: ApplicantFormSectionId;
  }) {
    return (
      <Grid container spacing={2}>
        {fields.map((field) => {
          const displayLabel = getDisplayFieldLabel({
            sectionId,
            fieldLabel: field.field_label,
          });

          return (
            <Grid
              key={field.id}
              size={shouldUseWideFieldLayout({ field, displayLabel }) ? 12 : { xs: 12, md: 6 }}
            >
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
                minRows={field.field_type === "long_text" ? 6 : undefined}
                fullWidth
                disabled={!isEditingEnabled}
                placeholder={field.placeholder ?? undefined}
                helperText={fieldErrors[field.field_key] ?? field.help_text}
                error={Boolean(fieldErrors[field.field_key])}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          );
        })}
      </Grid>
    );
  }

  async function submitApplication() {
    setError(null);
    setSuccessMessage(null);

    if (!application?.id) {
      setError({ message: "Primero guarda tu borrador antes de enviar." });
      return;
    }

    if (isStageClosed) {
      setError({
        message:
          "La etapa ya cerró y no puedes enviar o editar esta postulación. Contacta al comité.",
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
    setSuccessMessage("Postulación enviada. El comité revisará tu información.");
  }

  async function saveRecommenders() {
    setError(null);
    setSuccessMessage(null);

    if (!application?.id) {
      setError({ message: "Guarda tu postulación antes de registrar recomendadores." });
      return;
    }

    if (isLocked && !isEditMode) {
      setError({
        message:
          "Tu postulación ya fue enviada. Haz clic en 'Editar respuesta' para habilitar cambios.",
      });
      return;
    }

    const mentorEmail = recommenderInputs.mentor.trim();
    const friendEmail = recommenderInputs.friend.trim();

    if (!mentorEmail || !friendEmail) {
      setError({
        message:
          "Debes registrar 2 recomendadores: uno tutor/profesor/mentor y uno amigo.",
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
        chunks.push(`${createdCount} invitación(es) enviada(s).`);
      }
      if (replacedCount > 0) {
        chunks.push(`${replacedCount} recomendador(es) reemplazado(s) con token nuevo.`);
      }
      if (failedEmailCount > 0) {
        chunks.push(`${failedEmailCount} correo(s) no se enviaron, usa "Enviar recordatorio".`);
      }

      setSuccessMessage(chunks.length > 0 ? chunks.join(" ") : "Recomendadores actualizados.");
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
      setSuccessMessage("Recordatorio enviado al recomendador.");
    } finally {
      setRemindingId(null);
    }
  }

  async function saveFileTitle(fieldKey: string) {
    setError(null);
    setSuccessMessage(null);

    if (!application?.id) {
      return;
    }

    const files = (application.files as Record<string, ApplicationFileValue> | undefined) ?? {};
    const entry = parseFileEntry(files[fieldKey]);
    const nextTitle = fileTitleEdits[fieldKey]?.trim();
    if (!entry || !nextTitle) {
      return;
    }

    setSavingFileTitleKey(fieldKey);
    try {
      const response = await fetch(`/api/applications/${application.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: fieldKey,
          path: entry.path,
          title: nextTitle,
          originalName: entry.original_name,
          mimeType: entry.mime_type,
          sizeBytes: entry.size_bytes,
          uploadedAt: entry.uploaded_at ?? new Date().toISOString(),
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setApplication(body.application);
      setSuccessMessage("Título del documento actualizado.");
    } finally {
      setSavingFileTitleKey(null);
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
        message:
          "Tu postulación ya fue enviada. Haz clic en 'Editar respuesta' para actualizar documentos.",
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
        setError({ message: "No se pudo subir el archivo al almacenamiento." });
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
      setSuccessMessage("Documento subido correctamente.");
    } finally {
      setUploadingFieldKey(null);
    }
  }

  return (
    <Box sx={{ maxWidth: 920, width: "100%", mx: "auto", px: { xs: 1, sm: 0 } }}>
      <Stack spacing={3}>
        <Box className="page-header" sx={{ mb: 0 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "flex-start" }}
            spacing={2}
          >
            <Box>
              {cycleName ? (
                <Typography className="eyebrow" sx={{ mb: 1 }}>
                  {cycleName}
                </Typography>
              ) : null}
              <Typography
                variant="h3"
                sx={{
                  fontSize: { xs: "2.35rem", sm: "3.15rem" },
                  lineHeight: { xs: 1.1, sm: 1.08 },
                }}
              >
                Tu postulación
              </Typography>
              <Typography sx={{ mt: 1 }} color="text.secondary">
                Completa solo la información requerida para esta etapa.
              </Typography>
              {stageCloseAt ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Cierre de etapa: {new Date(stageCloseAt).toLocaleDateString()}
                </Typography>
              ) : null}
              {isStageClosed ? (
                <Typography variant="body2" color="error.main" sx={{ mt: 0.5 }}>
                  Etapa cerrada: no se permiten nuevas ediciones del postulante.
                </Typography>
              ) : null}
            </Box>
            <StageBadge stage={application?.stage_code ?? "documents"} />
          </Stack>
          {isLocked && !isEditMode ? (
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography color="text.secondary">
                Tu postulación ya fue enviada. Para cambiar datos, habilita edición manual.
              </Typography>
              {isStageClosed ? (
                <Typography variant="body2" color="error.main">
                  La etapa está cerrada. Solo el comité puede reabrir cambios.
                </Typography>
              ) : (
                <Box>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      setError(null);
                      setSuccessMessage("Edición habilitada. Guarda cambios y vuelve a enviar.");
                      setIsEditMode(true);
                    }}
                  >
                    Editar respuesta
                  </Button>
                </Box>
              )}
            </Stack>
          ) : null}
          {isLocked && isEditMode ? (
            <Box sx={{ mt: 2 }}>
              <Button
                variant="text"
                onClick={() => {
                  setIsEditMode(false);
                  setSuccessMessage("Edición cancelada.");
                }}
              >
                Cancelar edición
              </Button>
            </Box>
          ) : null}
        </Box>

        <Box
          className="progress-section"
          sx={{
            position: "relative",
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              Progreso por secciones
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {completedSteps} de {progressSteps.length} completado
            </Typography>
          </Stack>
          <Chip
            size="small"
            label={draftStatusLabel}
            sx={{
              mb: 1.5,
              bgcolor: saveStatusTone.bg,
              color: saveStatusTone.color,
              fontWeight: 600,
              alignSelf: "flex-start",
            }}
          />
          <Box
            sx={{
              height: 4,
              bgcolor: "var(--sand)",
              mb: 2.5,
            }}
          >
            <Box
              sx={{
                height: 4,
                width: `${progressPercent}%`,
                transition: "width 240ms ease-out",
                background: "linear-gradient(90deg, var(--uwc-maroon) 0%, var(--uwc-blue) 100%)",
              }}
            />
          </Box>
          <Stack spacing={0}>
            {progressSteps.map((step, index) => (
              <Stack
                key={step.key}
                direction="row"
                spacing={1.5}
                alignItems="center"
                onClick={() => jumpToSection(step.key)}
                role="button"
                sx={{
                  py: 1.2,
                  px: 1,
                  borderRadius: 1.2,
                  borderBottom:
                    index < progressSteps.length - 1 ? "1px solid var(--sand)" : "none",
                  cursor: "pointer",
                  bgcolor: activeSectionId === step.key ? "rgba(160, 24, 67, 0.08)" : "transparent",
                }}
              >
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    bgcolor:
                      step.status === "complete"
                        ? "var(--success)"
                        : step.status === "in_progress"
                          ? "var(--uwc-maroon)"
                          : "var(--paper)",
                    color:
                      step.status === "not_started" ? "var(--muted)" : "#FFFFFF",
                    border:
                      step.status === "not_started"
                        ? "1.5px solid var(--sand)"
                        : "1.5px solid transparent",
                  }}
                >
                  {step.status === "complete" ? <CheckIcon sx={{ fontSize: 14 }} /> : index + 1}
                </Box>
                <Typography
                  sx={{
                    flex: 1,
                    fontWeight: activeSectionId === step.key || step.status !== "not_started" ? 600 : 400,
                    color: step.status === "not_started" ? "var(--muted)" : "var(--ink)",
                    fontSize: { xs: "1.08rem", sm: "1.16rem" },
                  }}
                >
                  {step.label}
                </Typography>
                <StatusBadge status={step.status} />
              </Stack>
            ))}
          </Stack>
        </Box>

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
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="prep-content"
            id="prep-header"
            sx={{ px: 2.5, py: 0.4 }}
          >
            <Stack>
              <Typography variant="h6">Antes de empezar</Typography>
              <Typography variant="body2" color="text.secondary">
                Checklist rápida de preparación para enviar sin fricción.
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 2.5, pt: 0, pb: 2 }}>
            <Typography color="text.secondary" sx={{ mb: 1.2 }}>
              Reúne los documentos y datos necesarios. Puedes salir en cualquier momento: el borrador se guarda automáticamente.
            </Typography>
            <Stack spacing={0.4}>
              <Typography variant="body2">
                1. Ten listos documentos en PDF/JPG/PNG (idealmente menos de 10MB).
              </Typography>
              <Typography variant="body2">
                2. Confirma los correos de tus dos recomendadores antes de registrarlos.
              </Typography>
              <Typography variant="body2">
                3. Completa primero los campos obligatorios (marcados con *), luego revisa.
              </Typography>
              {requiredDocumentLabels.length > 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8 }}>
                  Documentos obligatorios: {requiredDocumentLabels.join(", ")}.
                </Typography>
              ) : null}
            </Stack>
          </AccordionDetails>
        </Accordion>

        {error ? <ErrorCallout message={error.message} errorId={error.errorId} context="applicant_form" /> : null}

        {successMessage ? (
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#DCFCE7" }}>
            <Typography color="#166534">{successMessage}</Typography>
          </Box>
        ) : null}

        {currentSection && currentSection.formSection && currentSection.id !== "documents_uploads" && currentSection.id !== "recommenders_flow" ? (
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6">{currentSection.title}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {currentSection.description}
                  </Typography>
                </Box>
                <StatusBadge
                  status={
                    progressSteps.find((step) => step.key === currentSection.id)?.status ??
                    "not_started"
                  }
                />
              </Stack>
              {currentFormSectionId
                ? renderEditableFields({
                    fields: currentSection.formSection.fields,
                    sectionId: currentFormSectionId,
                  })
                : null}
            </CardContent>
          </Card>
        ) : null}

        {currentSection?.id === "documents_uploads" ? (
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="h6">{SECTION_TITLES.documents_uploads}</Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.4 }}>
                    Sube únicamente los archivos solicitados para esta etapa.
                  </Typography>
                </Box>
                <StatusBadge status={documentsStatus} />
              </Stack>

              {currentSection.formSection?.fields.length ? (
                <Box sx={{ mt: 0.5, mb: 2 }}>
                  {renderEditableFields({
                    fields: currentSection.formSection.fields,
                    sectionId: "documents",
                  })}
                </Box>
              ) : null}

              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                La validación OCR se ejecuta desde el panel admin al revisar postulaciones.
              </Typography>
              <Stack spacing={2}>
                {fileStageFields.map((field) => {
                  const rawValue =
                    ((application?.files as Record<string, ApplicationFileValue> | undefined)?.[field.field_key] ??
                      null) as ApplicationFileValue | null;
                  const fileEntry = parseFileEntry(rawValue);
                  const fileName = fileEntry?.original_name ?? null;
                  const currentTitle = fileTitleEdits[field.field_key] ?? fileEntry?.title ?? "";

                  return (
                    <Box key={field.id} sx={{ border: "1px solid #E5E7EB", borderRadius: 2, p: 2 }}>
                      <Typography fontWeight={700}>{field.field_label}</Typography>
                      {field.help_text ? <Typography color="text.secondary">{field.help_text}</Typography> : null}
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} sx={{ mt: 1.2 }}>
                        <Button
                          variant="outlined"
                          component="label"
                          disabled={!application?.id || uploadingFieldKey === field.field_key || !isEditingEnabled}
                        >
                          {uploadingFieldKey === field.field_key
                            ? "Subiendo..."
                            : fileEntry
                              ? "Reemplazar archivo"
                              : `Subir ${field.field_label}`}
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif"
                            hidden
                            onChange={(event) => uploadDocument(field.field_key, event)}
                          />
                        </Button>
                        {fileEntry ? (
                          <>
                            <TextField
                              label="Título visible"
                              value={currentTitle}
                              onChange={(event) =>
                                setFileTitleEdits((current) => ({
                                  ...current,
                                  [field.field_key]: event.target.value,
                                }))
                              }
                              disabled={!isEditingEnabled}
                              fullWidth
                            />
                            <Button
                              variant="text"
                              onClick={() => saveFileTitle(field.field_key)}
                              disabled={!isEditingEnabled || savingFileTitleKey === field.field_key}
                            >
                              {savingFileTitleKey === field.field_key ? "Guardando..." : "Guardar título"}
                            </Button>
                          </>
                        ) : null}
                      </Stack>
                      {!application?.id ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Guarda primero un borrador para habilitar la subida.
                        </Typography>
                      ) : null}
                      {fileEntry && fileName ? (
                        <Stack spacing={0.4} sx={{ mt: 1.5 }}>
                          <Typography variant="body2" fontWeight={600}>
                            Documento actual: {fileName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Título: {currentTitle}
                          </Typography>
                          {fileEntry.uploaded_at ? (
                            <Typography variant="caption" color="text.secondary">
                              Subido: {new Date(fileEntry.uploaded_at).toLocaleString()}
                            </Typography>
                          ) : null}
                          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                            Ruta: {fileEntry.path}
                          </Typography>
                        </Stack>
                      ) : null}
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        {currentSection?.id === "recommenders_flow" ? (
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="h6">{SECTION_TITLES.recommenders_flow}</Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.4 }}>
                    Registra un mentor y un amigo (no familiar). Solo mostramos estado, nunca enlaces.
                  </Typography>
                </Box>
                <StatusBadge status={recommenderStatus} />
              </Stack>

              {currentSection.formSection?.fields.length ? (
                <Box sx={{ mt: 0.5, mb: 2 }}>
                  {renderEditableFields({
                    fields: currentSection.formSection.fields,
                    sectionId: "recommenders",
                  })}
                </Box>
              ) : null}

              <Stack spacing={2}>
                {(["mentor", "friend"] as const).map((role) => {
                  const current = activeRecommendersByRole.get(role) ?? null;
                  const tone = current ? statusTone(current.status) : statusTone("invited");

                  return (
                    <Box key={role} sx={{ border: "1px solid #E5E7EB", borderRadius: 2, p: 2 }}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        justifyContent="space-between"
                        spacing={1}
                        sx={{ mb: 1.2 }}
                      >
                        <Typography fontWeight={700}>{roleLabel(role)}</Typography>
                        {current ? (
                          <Chip
                            label={tone.label}
                            sx={{ bgcolor: tone.bg, color: tone.color, fontWeight: 600 }}
                          />
                        ) : (
                          <Chip label="Sin registrar" />
                        )}
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
                        label={`Correo (${roleLabel(role)})`}
                        placeholder={role === "mentor" ? "mentor@colegio.edu.pe" : "amigo@gmail.com"}
                        disabled={!isEditingEnabled || current?.status === "submitted"}
                      />
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        sx={{ mt: 1.2 }}
                      >
                        {current?.inviteSentAt ? (
                          <Typography variant="body2" color="text.secondary">
                            Invitación: {new Date(current.inviteSentAt).toLocaleString()}
                          </Typography>
                        ) : null}
                        {current?.submittedAt ? (
                          <Typography variant="body2" color="success.main">
                            Formulario enviado: {new Date(current.submittedAt).toLocaleString()}
                          </Typography>
                        ) : null}
                        {current && current.status !== "submitted" ? (
                          <Button
                            variant="text"
                            onClick={() => sendReminder(current.id)}
                            disabled={remindingId === current.id || !isEditingEnabled}
                          >
                            {remindingId === current.id ? "Enviando..." : "Enviar recordatorio"}
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
                  {savingRecommenders ? "Guardando..." : "Guardar recomendadores"}
                </Button>
              </Stack>
              {loadingRecommenders ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  Cargando recomendadores guardados...
                </Typography>
              ) : null}
              {!loadingRecommenders && application?.id && recommenders.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  Aún no hay recomendadores registrados para esta postulación.
                </Typography>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {currentSection?.id === "review_submit" ? (
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">{SECTION_TITLES.review_submit}</Typography>
                <StatusBadge status={submissionStatus} />
              </Stack>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Revisa el progreso por sección y envía solo cuando estés listo.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Button
                  variant="contained"
                  onClick={() => void saveDraft({ silent: false })}
                  disabled={isSavingDraft || !isEditingEnabled}
                >
                  {isSavingDraft ? <CircularProgress size={18} color="inherit" /> : "Guardar borrador"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={submitApplication}
                  disabled={!application?.id || (isLocked && !isEditMode) || isStageClosed}
                >
                  {isLocked && isEditMode ? "Reenviar postulación" : "Enviar postulación"}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        <Card
          sx={{
            position: { xs: "relative", sm: "sticky" },
            bottom: { sm: 16 },
            zIndex: 5,
            border: "1px solid var(--sand)",
            boxShadow: "0 10px 28px rgba(44, 40, 37, 0.08)",
          }}
        >
          <CardContent>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  variant="text"
                  disabled={!previousSectionId}
                  onClick={() => {
                    if (previousSectionId) {
                      jumpToSection(previousSectionId);
                    }
                  }}
                >
                  Anterior
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => void saveDraft({ silent: false })}
                  disabled={isSavingDraft || !isEditingEnabled}
                >
                  {isSavingDraft ? "Guardando..." : "Guardar borrador"}
                </Button>
              </Stack>
              <Button
                variant="contained"
                disabled={!nextSectionId}
                onClick={() => {
                  if (nextSectionId) {
                    jumpToSection(nextSectionId);
                  }
                }}
              >
                {nextSectionId ? `Siguiente: ${SECTION_TITLES[nextSectionId]}` : "Finalizado"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
