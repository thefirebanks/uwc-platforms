"use client";

import { type ChangeEvent, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
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
}: {
  existingApplication: Application | null;
}) {
  const [application, setApplication] = useState<Application | null>(existingApplication);
  const [error, setError] = useState<ApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [recommendationEmails, setRecommendationEmails] = useState("mentor@example.com, amigo@example.com");
  const [uploading, setUploading] = useState(false);

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

  async function save(values: ApplicationInput) {
    setError(null);
    setSuccessMessage(null);

    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setApplication(body.application);
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

    setSuccessMessage(
      `Se registraron ${body.count} recomendadores. Usa tu proveedor de correo para enviar los links tokenizados.`,
    );
  }

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccessMessage(null);

    const file = event.target.files?.[0];

    if (!file || !application?.id) {
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
            <StageBadge stage={application?.stage_code ?? "documents"} />
          </Stack>
          <Typography sx={{ mt: 1 }} color="text.secondary">
            Llena todos los campos y guarda borrador para evitar perder información.
          </Typography>
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
                      error={Boolean(errors.essay)}
                      helperText={errors.essay?.message}
                    />
                  )}
                />
              </Grid>
            </Grid>

            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                {isSubmitting ? <CircularProgress size={18} color="inherit" /> : "Guardar borrador"}
              </Button>
              <Button type="button" variant="outlined" onClick={submitApplication}>
                Enviar postulación
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Documentos</Typography>
          <Typography color="text.secondary" sx={{ mb: 1.5 }}>
            Sube documento de identificación para validación inicial.
          </Typography>
          <Button variant="outlined" component="label" disabled={!application?.id || uploading}>
            {uploading ? "Subiendo..." : "Subir identificación"}
            <input type="file" hidden onChange={uploadDocument} />
          </Button>
          {!application?.id ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Guarda primero un borrador para habilitar la subida.
            </Typography>
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
          />
          <Button sx={{ mt: 2 }} variant="outlined" onClick={createRecommendationRequests}>
            Registrar recomendadores
          </Button>
        </CardContent>
      </Card>
    </Stack>
  );
}
