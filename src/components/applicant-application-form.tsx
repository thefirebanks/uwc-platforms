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
import type { Application, CycleStageField, CycleStageTemplate } from "@/types/domain";
import { StageBadge } from "@/components/stage-badge";
import { ErrorCallout } from "@/components/error-callout";
import { validateStagePayload } from "@/lib/stages/form-schema";
import { buildFallbackStageFields } from "@/lib/stages/stage-field-fallback";

interface ApiError {
  message: string;
  errorId?: string;
}

const EMPTY_STAGE_FIELDS: CycleStageField[] = [];
const EMPTY_STAGE_TEMPLATES: CycleStageTemplate[] = [];

function getPayloadValue(payload: Application["payload"], key: string) {
  const raw = payload?.[key];
  if (raw === null || raw === undefined) {
    return "";
  }
  return String(raw);
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
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h5">Tu postulación UWC Perú</Typography>
            {cycleName ? (
              <Typography color="text.secondary" variant="body2">
                {cycleName}
              </Typography>
            ) : null}
            <StageBadge stage={application?.stage_code ?? "documents"} />
          </Stack>
          <Typography sx={{ mt: 1 }} color="text.secondary">
            Completa solo la información requerida para esta etapa.
          </Typography>
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
        </CardContent>
      </Card>

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
          <Typography variant="h6" sx={{ mb: 2 }}>
            Formulario de etapa
          </Typography>
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
            <Typography variant="h6">Documentos</Typography>
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
          <Typography variant="h6">Recomendadores</Typography>
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
          <Typography variant="h6">Acciones de postulación</Typography>
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
  );
}
