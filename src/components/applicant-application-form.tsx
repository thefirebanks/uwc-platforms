"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
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
import type { Application, CycleStageField, CycleStageTemplate } from "@/types/domain";
import { StageBadge, StatusBadge } from "@/components/stage-badge";
import { ErrorCallout } from "@/components/error-callout";
import { validateStagePayload } from "@/lib/stages/form-schema";
import { buildFallbackStageFields } from "@/lib/stages/stage-field-fallback";

interface ApiError {
  message: string;
  errorId?: string;
}

const EMPTY_STAGE_FIELDS: CycleStageField[] = [];
const EMPTY_STAGE_TEMPLATES: CycleStageTemplate[] = [];
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

export function ApplicantApplicationForm({
  existingApplication,
  cycleId,
  cycleName,
  cycleTemplates,
  stageFields,
}: {
  existingApplication: Application | null;
  cycleId: string;
  cycleName?: string;
  cycleTemplates?: CycleStageTemplate[];
  stageFields?: CycleStageField[];
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
  const [recommendationEmails, setRecommendationEmails] = useState("mentor@example.com, amigo@example.com");
  const [registeredRecommenders, setRegisteredRecommenders] = useState<string[]>([]);
  const [loadingRecommenders, setLoadingRecommenders] = useState(false);
  const [uploadingFieldKey, setUploadingFieldKey] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const isLocked = application ? LOCKED_STATUSES.has(application.status) : false;
  const isEditingEnabled = !isLocked || isEditMode;
  const providedStageFields = stageFields ?? EMPTY_STAGE_FIELDS;
  const providedCycleTemplates = cycleTemplates ?? EMPTY_STAGE_TEMPLATES;

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
    const files = (application?.files as Record<string, string> | undefined) ?? {};
    const completedCount = requiredFileFields.filter((field) =>
      isMeaningfulValue(files[field.field_key]),
    ).length;
    const hasAnyFile = fileStageFields.some((field) => isMeaningfulValue(files[field.field_key]));

    return getStepState({
      complete: requiredFileFields.length === 0 || completedCount === requiredFileFields.length,
      inProgress: hasAnyFile || Boolean(application?.id),
    });
  }, [application?.files, application?.id, fileStageFields]);

  const recommenderStatus = useMemo(
    () =>
      getStepState({
        complete: registeredRecommenders.length > 0,
        inProgress: Boolean(application?.id),
      }),
    [application?.id, registeredRecommenders.length],
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
    if (!application?.id) {
      setRegisteredRecommenders([]);
      return;
    }

    const applicationId = application.id;
    let isMounted = true;

    async function loadRecommenders() {
      setLoadingRecommenders(true);

      try {
        const response = await fetch(`/api/recommendations?applicationId=${applicationId}`);
        const body = (await response.json()) as {
          recommenders?: Array<{ email: string }>;
        };

        if (!isMounted || !response.ok) {
          return;
        }

        const emails = Array.from(
          new Set((body.recommenders ?? []).map((recommender) => recommender.email)),
        );
        setRegisteredRecommenders(emails);
      } catch {
        if (isMounted) {
          setRegisteredRecommenders([]);
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

  async function createRecommendationRequests() {
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

    const emails = recommendationEmails
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: application.id, emails }),
    });
    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    const normalizedResponseEmails =
      Array.isArray(body.emails) && body.emails.length > 0
        ? (body.emails as string[])
        : emails.map((email) => email.toLowerCase());

    setRegisteredRecommenders(Array.from(new Set(normalizedResponseEmails)));
    const noun = body.count === 1 ? "recomendador" : "recomendadores";
    setSuccessMessage(
      `Se registraron ${body.count} ${noun}. Revisa la lista de correos confirmados abajo.`,
    );
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
        }),
      });
      const associateBody = await associateResponse.json();

      if (!associateResponse.ok) {
        setError(associateBody);
        return;
      }

      setApplication(associateBody.application);
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
            </Box>
            <StageBadge stage={application?.stage_code ?? "documents"} />
          </Stack>
          {isLocked && !isEditMode ? (
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography color="text.secondary">
                Tu postulación ya fue enviada. Para cambiar datos, habilita edición manual.
              </Typography>
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

      {providedCycleTemplates.length > 0 ? (
        <Card>
          <CardContent>
            <Typography variant="h6">Ruta del proceso</Typography>
            <Typography color="text.secondary" sx={{ mb: 1.5 }}>
              Hitos y fechas referenciales de este proceso de selección.
            </Typography>
            <Stack spacing={1.2}>
              {providedCycleTemplates.map((template) => (
                <Box key={template.id} sx={{ border: "1px solid #E5E7EB", borderRadius: 2, p: 1.5 }}>
                  <Typography fontWeight={700}>{template.stage_label}</Typography>
                  <Typography color="text.secondary">{template.milestone_label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Fecha objetivo: {template.due_at ? new Date(template.due_at).toLocaleDateString() : "No configurada"}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

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
                  InputLabelProps={field.field_type === "date" ? { shrink: true } : undefined}
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
            <Stack spacing={2}>
              {fileStageFields.map((field) => {
                const filePath =
                  ((application?.files as Record<string, string> | undefined)?.[field.field_key] ?? null) as
                    | string
                    | null;
                const fileName = filePath
                  ? filePath.split("/").at(-1)?.replace(/^\d+-/, "") ?? filePath
                  : null;

                return (
                  <Box key={field.id} sx={{ border: "1px solid #E5E7EB", borderRadius: 2, p: 2 }}>
                    <Typography fontWeight={700}>{field.field_label}</Typography>
                    {field.help_text ? <Typography color="text.secondary">{field.help_text}</Typography> : null}
                    <Button
                      variant="outlined"
                      component="label"
                      sx={{ mt: 1.2 }}
                      disabled={!application?.id || uploadingFieldKey === field.field_key || !isEditingEnabled}
                    >
                      {uploadingFieldKey === field.field_key ? "Subiendo..." : `Subir ${field.field_label}`}
                      <input type="file" hidden onChange={(event) => uploadDocument(field.field_key, event)} />
                    </Button>
                    {!application?.id ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Guarda primero un borrador para habilitar la subida.
                      </Typography>
                    ) : null}
                    {fileName ? (
                      <Box sx={{ mt: 1.5 }}>
                        <Typography variant="body2" fontWeight={600}>
                          Documento actual: {fileName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                          Ruta: {filePath}
                        </Typography>
                      </Box>
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
            Ingresa correos separados por coma para generar links de recomendación.
          </Typography>
          <TextField
            value={recommendationEmails}
            onChange={(event) => setRecommendationEmails(event.target.value)}
            fullWidth
            label="Correos"
            placeholder="mentor@colegio.edu.pe, amigo@gmail.com"
            disabled={!isEditingEnabled}
          />
          <Button
            sx={{ mt: 2 }}
            variant="outlined"
            onClick={createRecommendationRequests}
            disabled={!isEditingEnabled}
          >
            Registrar recomendadores
          </Button>
          {registeredRecommenders.length > 0 ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
              {registeredRecommenders.map((email) => (
                <Chip key={email} label={email} />
              ))}
            </Stack>
          ) : null}
          {loadingRecommenders ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              Cargando recomendadores guardados...
            </Typography>
          ) : null}
          {!loadingRecommenders && application?.id && registeredRecommenders.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              Aún no hay recomendadores registrados para esta postulación.
            </Typography>
          ) : null}
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
              disabled={!application?.id || (isLocked && !isEditMode)}
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
