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
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { applicationSchema, type ApplicationInput } from "@/lib/validation/application";
import type { Application } from "@/types/domain";
import { StageBadge } from "@/components/stage-badge";
import { ErrorCallout } from "@/components/error-callout";

interface ApiError {
  message: string;
  errorId?: string;
}

export function ApplicantApplicationForm({
  existingApplication,
  cycleId,
  cycleName,
}: {
  existingApplication: Application | null;
  cycleId: string;
  cycleName?: string;
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
  const [uploading, setUploading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const isLocked = application ? LOCKED_STATUSES.has(application.status) : false;
  const isEditingEnabled = !isLocked || isEditMode;
  const identificationPath =
    ((application?.files as Record<string, string> | undefined)?.identificationDocument ?? null) as
      | string
      | null;
  const identificationFileName = identificationPath
    ? identificationPath.split("/").at(-1)?.replace(/^\d+-/, "") ?? identificationPath
    : null;

  const defaultValues = useMemo<ApplicationInput>(() => {
    const payload = application?.payload ?? {};
    return {
      fullName: String(payload.fullName ?? ""),
      dateOfBirth: String(payload.dateOfBirth ?? ""),
      nationality: String(payload.nationality ?? "Peruana"),
      schoolName: String(payload.schoolName ?? ""),
      gradeAverage: Number(payload.gradeAverage ?? 0),
      essay: String(payload.essay ?? ""),
    };
  }, [application]);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationInput>({
    resolver: zodResolver(applicationSchema),
    defaultValues,
  });

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

  async function save(values: ApplicationInput) {
    setError(null);
    setSuccessMessage(null);

    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        cycleId,
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
  }

  async function submitApplication() {
    setError(null);
    setSuccessMessage(null);

    if (!application?.id) {
      setError({
        message: "Primero guarda tu borrador antes de enviar.",
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

  async function createRecommendationRequests() {
    setError(null);
    setSuccessMessage(null);

    if (!application?.id) {
      setError({
        message: "Guarda tu postulación antes de registrar recomendadores.",
      });
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

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
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

    setUploading(true);

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
        setError({
          message: "No se pudo subir el archivo al almacenamiento.",
        });
        return;
      }

      const associateResponse = await fetch(`/api/applications/${application.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "identificationDocument",
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
      setUploading(false);
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
              Llena todos los campos y guarda borrador para evitar perder información.
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

      {error ? (
        <ErrorCallout message={error.message} errorId={error.errorId} context="applicant_form" />
      ) : null}

      {successMessage ? (
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "#DCFCE7" }}>
          <Typography color="#166534">{successMessage}</Typography>
        </Box>
      ) : null}

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit(save)}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name="fullName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Nombre completo"
                      fullWidth
                      disabled={!isEditingEnabled}
                      error={Boolean(errors.fullName)}
                      helperText={errors.fullName?.message}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name="dateOfBirth"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Fecha de nacimiento"
                      type="date"
                      fullWidth
                      disabled={!isEditingEnabled}
                      InputLabelProps={{ shrink: true }}
                      error={Boolean(errors.dateOfBirth)}
                      helperText={errors.dateOfBirth?.message}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name="nationality"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Nacionalidad"
                      fullWidth
                      disabled={!isEditingEnabled}
                      error={Boolean(errors.nationality)}
                      helperText={errors.nationality?.message}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name="schoolName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Colegio"
                      fullWidth
                      disabled={!isEditingEnabled}
                      error={Boolean(errors.schoolName)}
                      helperText={errors.schoolName?.message}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name="gradeAverage"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      type="number"
                      label="Promedio (0-20)"
                      fullWidth
                      disabled={!isEditingEnabled}
                      inputProps={{ step: "0.1", min: 0, max: 20 }}
                      error={Boolean(errors.gradeAverage)}
                      helperText={errors.gradeAverage?.message}
                      onChange={(event) => field.onChange(Number(event.target.value))}
                    />
                  )}
                />
              </Grid>
              <Grid size={12}>
                <Controller
                  name="essay"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Ensayo personal"
                      multiline
                      minRows={6}
                      fullWidth
                      disabled={!isEditingEnabled}
                      error={Boolean(errors.essay)}
                      helperText={errors.essay?.message}
                    />
                  )}
                />
              </Grid>
            </Grid>

          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Documentos</Typography>
          <Typography color="text.secondary" sx={{ mb: 1.5 }}>
            Sube documento de identificación para validación inicial.
          </Typography>
          <Button
            variant="outlined"
            component="label"
            disabled={!application?.id || uploading || !isEditingEnabled}
          >
            {uploading ? "Subiendo..." : "Subir identificación"}
            <input type="file" hidden onChange={uploadDocument} />
          </Button>
          {!application?.id ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Guarda primero un borrador para habilitar la subida.
            </Typography>
          ) : null}
          {identificationPath ? (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="body2" fontWeight={600}>
                Documento actual: {identificationFileName}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                Ruta: {identificationPath}
              </Typography>
            </Box>
          ) : null}
        </CardContent>
      </Card>

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
            <Button variant="contained" onClick={handleSubmit(save)} disabled={isSubmitting || !isEditingEnabled}>
              {isSubmitting ? <CircularProgress size={18} color="inherit" /> : "Guardar borrador"}
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
