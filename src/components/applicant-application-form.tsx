"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import type { Application, CycleStageField, RecommendationStatus, RecommenderRole } from "@/types/domain";
import { StageBadge, StatusBadge } from "@/components/stage-badge";
import { ErrorCallout } from "@/components/error-callout";
import { validateStagePayload } from "@/lib/stages/form-schema";
import { buildFallbackStageFields } from "@/lib/stages/stage-field-fallback";

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});

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

  const personalFieldsStatus = useMemo(() => {
    const requiredFormFields = formStageFields.filter((field) => field.is_required);
    const payload = application?.payload ?? {};
    const completedCount = requiredFormFields.filter((field) =>
      isMeaningfulValue((payload as Record<string, unknown>)[field.field_key]),
    ).length;
    const hasAnyFieldValue = formStageFields.some((field) =>
      isMeaningfulValue((payload as Record<string, unknown>)[field.field_key]),
    );

    return getStepState({
      complete: requiredFormFields.length === 0 || completedCount === requiredFormFields.length,
      inProgress: hasAnyFieldValue || Boolean(application?.id),
    });
  }, [application?.id, application?.payload, formStageFields]);

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
    () => [
      { key: "personal", label: "Información personal", status: personalFieldsStatus },
      { key: "documents", label: "Documentos", status: documentsStatus },
      { key: "recommenders", label: "Recomendadores", status: recommenderStatus },
      { key: "submit", label: "Enviar postulación", status: submissionStatus },
    ],
    [documentsStatus, personalFieldsStatus, recommenderStatus, submissionStatus],
  );

  const completedSteps = progressSteps.filter((step) => step.status === "complete").length;
  const progressPercent = Math.round((completedSteps / progressSteps.length) * 100);

  useEffect(() => {
    const payload = application?.payload ?? {};
    const nextValues: Record<string, string> = {};

    for (const field of formStageFields) {
      nextValues[field.field_key] = getPayloadValue(payload, field.field_key);
    }

    setFormValues(nextValues);
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

  async function saveDraft() {
    setError(null);
    setSuccessMessage(null);

    const validation = validateStagePayload({
      fields: formStageFields,
      payload: formValues,
      skipFileValidation: true,
    });

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      const firstError = Object.values(validation.errors)[0] ?? "Hay campos inválidos.";
      setError({ message: firstError });
      return;
    }

    setFieldErrors({});
    setIsSavingDraft(true);

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId,
          payload: validation.normalizedPayload,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setApplication(body.application);
      setIsEditMode(false);
      setSuccessMessage("Borrador guardado correctamente.");
    } finally {
      setIsSavingDraft(false);
    }
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
    <Box sx={{ maxWidth: 840, width: "100%", mx: "auto" }}>
      <Stack spacing={3}>
        <Box className="page-header" sx={{ mb: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Box>
              {cycleName ? (
                <Typography className="eyebrow" sx={{ mb: 1 }}>
                  {cycleName}
                </Typography>
              ) : null}
              <Typography variant="h3">Tu postulación</Typography>
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

      <Box className="progress-section">
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Progreso de postulación
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {completedSteps} de {progressSteps.length} completado
          </Typography>
        </Stack>
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
              sx={{
                py: 1.2,
                borderBottom:
                  index < progressSteps.length - 1 ? "1px solid var(--sand)" : "none",
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
                  fontWeight: step.status === "not_started" ? 400 : 500,
                  color: step.status === "not_started" ? "var(--muted)" : "var(--ink)",
                }}
              >
                {step.label}
              </Typography>
              <StatusBadge status={step.status} />
            </Stack>
          ))}
        </Stack>
      </Box>

      {error ? <ErrorCallout message={error.message} errorId={error.errorId} context="applicant_form" /> : null}

      {successMessage ? (
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#DCFCE7" }}>
          <Typography color="#166534">{successMessage}</Typography>
        </Box>
      ) : null}

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Formulario de etapa</Typography>
            <StatusBadge status={personalFieldsStatus} />
          </Stack>
          <Grid container spacing={2}>
            {formStageFields.map((field) => (
              <Grid key={field.id} size={field.field_type === "long_text" ? 12 : { xs: 12, md: 6 }}>
                <TextField
                  label={field.is_required ? `${field.field_label} *` : field.field_label}
                  value={formValues[field.field_key] ?? ""}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setFormValues((current) => ({
                      ...current,
                      [field.field_key]: nextValue,
                    }));
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
            ))}
          </Grid>
        </CardContent>
      </Card>

      {fileStageFields.length > 0 ? (
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">Documentos</Typography>
              <StatusBadge status={documentsStatus} />
            </Stack>
            <Typography color="text.secondary" sx={{ mb: 1.5 }}>
              Sube únicamente los archivos solicitados para esta etapa.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              La validación OCR se ejecuta desde el panel de admin, no automáticamente al subir.
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

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Recomendadores</Typography>
            <StatusBadge status={recommenderStatus} />
          </Stack>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Debes registrar 2 recomendadores: un mentor y un amigo (no familiar). El enlace se envía por correo automáticamente.
          </Typography>
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
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            El postulante no puede ver ni copiar los enlaces de recomendación. Solo se muestra estado de avance.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Acciones de postulación</Typography>
            <StatusBadge status={submissionStatus} />
          </Stack>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Guarda cambios y envía solo cuando estés listo.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button variant="contained" onClick={saveDraft} disabled={isSavingDraft || !isEditingEnabled}>
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
      </Stack>
    </Box>
  );
}
