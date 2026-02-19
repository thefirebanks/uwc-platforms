"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { RecommendationStatus, RecommenderRole } from "@/types/domain";

type PublicRecommendation = {
  id: string;
  role: RecommenderRole;
  maskedEmail: string;
  status: RecommendationStatus;
  submittedAt: string | null;
  accessExpiresAt: string;
};

type SessionRecommendation = {
  id: string;
  role: RecommenderRole;
  status: RecommendationStatus;
  submittedAt: string | null;
  responses: Record<string, unknown>;
};

type FormState = {
  recommenderName: string;
  relationshipTitle: string;
  knownDuration: string;
  strengths: string;
  growthAreas: string;
  endorsement: string;
  confirmsNoFamily: boolean;
};

const defaultFormState: FormState = {
  recommenderName: "",
  relationshipTitle: "",
  knownDuration: "",
  strengths: "",
  growthAreas: "",
  endorsement: "",
  confirmsNoFamily: false,
};

function getStorageKey(token: string) {
  return `uwc-recommender-session:${token}`;
}

function roleLabel(role: RecommenderRole) {
  return role === "mentor" ? "Tutor/Profesor/Mentor" : "Amigo (no familiar)";
}

function getStatusLabel(status: RecommendationStatus) {
  if (status === "submitted") return "Formulario enviado";
  if (status === "in_progress") return "En progreso";
  if (status === "opened") return "Acceso verificado";
  if (status === "sent") return "Invitación enviada";
  if (status === "expired") return "Enlace vencido";
  if (status === "invalidated") return "Enlace reemplazado";
  return "Pendiente";
}

function fromResponses(value: Record<string, unknown> | null | undefined): FormState {
  const raw = value ?? {};
  return {
    recommenderName: String(raw.recommenderName ?? ""),
    relationshipTitle: String(raw.relationshipTitle ?? ""),
    knownDuration: String(raw.knownDuration ?? ""),
    strengths: String(raw.strengths ?? ""),
    growthAreas: String(raw.growthAreas ?? ""),
    endorsement: String(raw.endorsement ?? ""),
    confirmsNoFamily: Boolean(raw.confirmsNoFamily),
  };
}

export function RecommenderForm({ token }: { token: string }) {
  const [publicInfo, setPublicInfo] = useState<PublicRecommendation | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionRecommendation | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [loading, setLoading] = useState(true);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isSubmitted = sessionInfo?.status === "submitted" || publicInfo?.status === "submitted";
  const role = sessionInfo?.role ?? publicInfo?.role ?? "mentor";

  useEffect(() => {
    let ignore = false;

    async function boot() {
      setLoading(true);
      setError(null);

      try {
        const infoResponse = await fetch(`/api/recommendations/public/${token}`);
        const infoBody = await infoResponse.json();
        if (!infoResponse.ok) {
          throw new Error(infoBody?.message ?? "No se pudo cargar el enlace.");
        }

        if (!ignore) {
          setPublicInfo(infoBody.recommendation as PublicRecommendation);
        }

        const storedSession =
          typeof window === "undefined"
            ? null
            : window.localStorage.getItem(getStorageKey(token));
        if (!storedSession) {
          return;
        }

        const sessionResponse = await fetch(`/api/recommendations/public/${token}/session`, {
          headers: {
            "x-recommender-session": storedSession,
          },
        });

        if (!sessionResponse.ok) {
          window.localStorage.removeItem(getStorageKey(token));
          return;
        }

        const sessionBody = await sessionResponse.json();
        if (!ignore) {
          setSessionToken(storedSession);
          setSessionInfo(sessionBody.recommendation as SessionRecommendation);
          setFormState(fromResponses((sessionBody.recommendation as SessionRecommendation).responses));
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "Error cargando recomendación.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void boot();
    return () => {
      ignore = true;
    };
  }, [token]);

  const isSessionReady = Boolean(sessionToken && sessionInfo);

  const expiresLabel = useMemo(() => {
    if (!publicInfo?.accessExpiresAt) {
      return null;
    }
    return new Date(publicInfo.accessExpiresAt).toLocaleString();
  }, [publicInfo?.accessExpiresAt]);

  async function requestOtp() {
    setError(null);
    setSuccess(null);
    setRequestingOtp(true);
    try {
      const response = await fetch(`/api/recommendations/public/${token}/otp`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.message ?? "No se pudo enviar OTP.");
        return;
      }
      setSuccess(`Código OTP enviado a ${body.maskedEmail}.`);
    } finally {
      setRequestingOtp(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    setSuccess(null);
    setVerifyingOtp(true);
    try {
      const response = await fetch(`/api/recommendations/public/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpCode }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.message ?? "No se pudo validar OTP.");
        return;
      }

      const nextSession = String(body.sessionToken);
      const recommendation = body.recommendation as SessionRecommendation;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(getStorageKey(token), nextSession);
      }

      setSessionToken(nextSession);
      setSessionInfo(recommendation);
      setFormState(fromResponses(recommendation.responses));
      setSuccess("OTP validado correctamente.");
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function saveDraft() {
    if (!sessionToken) {
      return;
    }
    setError(null);
    setSuccess(null);
    setSavingDraft(true);
    try {
      const response = await fetch(`/api/recommendations/public/${token}/draft`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-recommender-session": sessionToken,
        },
        body: JSON.stringify(formState),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.message ?? "No se pudo guardar borrador.");
        return;
      }

      setSessionInfo(body.recommendation as SessionRecommendation);
      setSuccess("Borrador guardado.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function submitForm() {
    if (!sessionToken) {
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/recommendations/public/${token}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-recommender-session": sessionToken,
        },
        body: JSON.stringify(formState),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.message ?? "No se pudo enviar recomendación.");
        return;
      }
      setSessionInfo(body.recommendation as SessionRecommendation);
      setSuccess("Recomendación enviada correctamente.");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(getStorageKey(token));
      }
      setSessionToken(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Stack spacing={2} alignItems="center" sx={{ py: 10 }}>
        <CircularProgress />
        <Typography>Cargando recomendación...</Typography>
      </Stack>
    );
  }

  return (
    <Box sx={{ maxWidth: 840, mx: "auto", py: 5, px: 2 }}>
      <Stack spacing={2.5}>
        <Card>
          <CardContent>
            <Stack spacing={1}>
              <Typography variant="h4">Formulario de recomendación</Typography>
              <Typography color="text.secondary">
                Rol: {roleLabel(role)} · Estado: {getStatusLabel(sessionInfo?.status ?? publicInfo?.status ?? "invited")}
              </Typography>
              {publicInfo?.maskedEmail ? (
                <Typography color="text.secondary">Correo verificado: {publicInfo.maskedEmail}</Typography>
              ) : null}
              {expiresLabel ? (
                <Typography color="text.secondary">Vence: {expiresLabel}</Typography>
              ) : null}
            </Stack>
          </CardContent>
        </Card>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {success ? <Alert severity="success">{success}</Alert> : null}

        {!isSessionReady && !isSubmitted ? (
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="h6">Verificación OTP</Typography>
                <Typography color="text.secondary">
                  Por seguridad, valida tu acceso con un código enviado a tu correo.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button variant="outlined" onClick={requestOtp} disabled={requestingOtp}>
                    {requestingOtp ? "Enviando..." : "Enviar OTP"}
                  </Button>
                  <TextField
                    label="Código OTP"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                  />
                  <Button variant="contained" onClick={verifyOtp} disabled={verifyingOtp || otpCode.length !== 6}>
                    {verifyingOtp ? "Validando..." : "Validar OTP"}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        {isSessionReady ? (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">Completa la recomendación</Typography>
                <TextField
                  label="Nombre completo"
                  value={formState.recommenderName}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, recommenderName: event.target.value }))
                  }
                  fullWidth
                />
                <TextField
                  label="Rol o vínculo con el postulante"
                  value={formState.relationshipTitle}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, relationshipTitle: event.target.value }))
                  }
                  fullWidth
                />
                <TextField
                  label="¿Hace cuánto lo/la conoces?"
                  value={formState.knownDuration}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, knownDuration: event.target.value }))
                  }
                  fullWidth
                />
                <TextField
                  label="Fortalezas principales"
                  value={formState.strengths}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, strengths: event.target.value }))
                  }
                  multiline
                  minRows={4}
                  fullWidth
                />
                <TextField
                  label="Áreas de mejora"
                  value={formState.growthAreas}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, growthAreas: event.target.value }))
                  }
                  multiline
                  minRows={4}
                  fullWidth
                />
                <TextField
                  label="Recomendación final"
                  value={formState.endorsement}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, endorsement: event.target.value }))
                  }
                  multiline
                  minRows={4}
                  fullWidth
                />

                {role === "friend" ? (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formState.confirmsNoFamily}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            confirmsNoFamily: event.target.checked,
                          }))
                        }
                      />
                    }
                    label="Confirmo que no tengo vínculo familiar con el postulante."
                  />
                ) : null}

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Button variant="outlined" onClick={saveDraft} disabled={savingDraft}>
                    {savingDraft ? "Guardando..." : "Guardar borrador"}
                  </Button>
                  <Button variant="contained" onClick={submitForm} disabled={submitting}>
                    {submitting ? "Enviando..." : "Enviar recomendación"}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ) : null}
      </Stack>
    </Box>
  );
}

