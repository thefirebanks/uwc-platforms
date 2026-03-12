"use client";

import { useEffect, useMemo, useState } from "react";
import type { RecommendationStatus, RecommenderRole } from "@/types/domain";
import { roleLabel, getRecommendationStatusLabel } from "@/lib/utils/domain-labels";
import {
  fetchApi,
  toNormalizedApiError,
} from "@/lib/client/api-client";

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

// Use centralized version
const getStatusLabel = getRecommendationStatusLabel;

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

function AlertBanner({
  tone,
  message,
}: {
  tone: "error" | "success" | "info";
  message: string;
}) {
  return (
    <div className={`recommender-alert recommender-alert-${tone}`} role="status">
      <span className="recommender-alert-icon" aria-hidden="true">
        {tone === "error" ? "!" : tone === "success" ? "✓" : "i"}
      </span>
      <p>{message}</p>
    </div>
  );
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
        const infoBody = await fetchApi<{
          recommendation: PublicRecommendation;
        }>(`/api/recommendations/public/${token}`);

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

        try {
          const sessionBody = await fetchApi<{
            recommendation: SessionRecommendation;
          }>(`/api/recommendations/public/${token}/session`, {
            headers: {
              "x-recommender-session": storedSession,
            },
          });
          if (!ignore) {
            setSessionToken(storedSession);
            setSessionInfo(sessionBody.recommendation as SessionRecommendation);
            setFormState(
              fromResponses(
                (sessionBody.recommendation as SessionRecommendation).responses,
              ),
            );
          }
        } catch {
          window.localStorage.removeItem(getStorageKey(token));
          return;
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            toNormalizedApiError(
              loadError,
              "Error cargando recomendación.",
            ).message,
          );
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
  const canRequestOtp = Boolean(publicInfo) && !isSessionReady && !isSubmitted;

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
      const body = await fetchApi<{ maskedEmail: string }>(
        `/api/recommendations/public/${token}/otp`,
        {
        method: "POST",
        },
      );
      setSuccess(`Código OTP enviado a ${body.maskedEmail}.`);
    } catch (requestError) {
      setError(
        toNormalizedApiError(requestError, "No se pudo enviar OTP.").message,
      );
    } finally {
      setRequestingOtp(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    setSuccess(null);
    setVerifyingOtp(true);
    try {
      const body = await fetchApi<{
        sessionToken: string;
        recommendation: SessionRecommendation;
      }>(`/api/recommendations/public/${token}/verify`, {
        method: "POST",
        body: JSON.stringify({ otpCode }),
      });

      const nextSession = String(body.sessionToken);
      const recommendation = body.recommendation as SessionRecommendation;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(getStorageKey(token), nextSession);
      }

      setSessionToken(nextSession);
      setSessionInfo(recommendation);
      setFormState(fromResponses(recommendation.responses));
      setSuccess("OTP validado correctamente.");
    } catch (requestError) {
      setError(
        toNormalizedApiError(requestError, "No se pudo validar OTP.").message,
      );
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
      const body = await fetchApi<{ recommendation: SessionRecommendation }>(
        `/api/recommendations/public/${token}/draft`,
        {
        method: "PATCH",
        headers: {
          "x-recommender-session": sessionToken,
        },
        body: JSON.stringify(formState),
        },
      );

      setSessionInfo(body.recommendation as SessionRecommendation);
      setSuccess("Borrador guardado.");
    } catch (requestError) {
      setError(
        toNormalizedApiError(
          requestError,
          "No se pudo guardar borrador.",
        ).message,
      );
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
      const body = await fetchApi<{ recommendation: SessionRecommendation }>(
        `/api/recommendations/public/${token}/submit`,
        {
        method: "POST",
        headers: {
          "x-recommender-session": sessionToken,
        },
        body: JSON.stringify(formState),
        },
      );
      setSessionInfo(body.recommendation as SessionRecommendation);
      setSuccess("Recomendación enviada correctamente.");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(getStorageKey(token));
      }
      setSessionToken(null);
    } catch (requestError) {
      setError(
        toNormalizedApiError(
          requestError,
          "No se pudo enviar recomendación.",
        ).message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="recommender-shell">
        <div className="recommender-loading" role="status" aria-live="polite">
          <div className="recommender-loading-spinner" aria-hidden="true" />
          <p>Cargando recomendación...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="recommender-shell">
      <div className="recommender-stack">
        <article className="settings-card recommender-hero">
          <header className="settings-card-header">
            <h3>Formulario de recomendación</h3>
            <p>Comparte una referencia honesta y concreta sobre el postulante.</p>
          </header>
          <div className="recommender-meta" data-testid="recommender-meta">
            <span className="status-pill">{roleLabel(role)}</span>
            <span className="status-pill">{getStatusLabel(sessionInfo?.status ?? publicInfo?.status ?? "invited")}</span>
            {publicInfo?.maskedEmail ? <span className="status-pill">{publicInfo.maskedEmail}</span> : null}
          </div>
          {expiresLabel ? <p className="recommender-expiry">Vence: {expiresLabel}</p> : null}
        </article>

        {error ? <AlertBanner tone="error" message={error} /> : null}
        {success ? <AlertBanner tone="success" message={success} /> : null}

        {isSubmitted ? (
          <article className="settings-card recommender-state-card">
            <header className="settings-card-header">
              <h3>Recomendación enviada</h3>
              <p>Este formulario ya quedó registrado y no necesita más acciones.</p>
            </header>
          </article>
        ) : null}

        {canRequestOtp ? (
          <article className="settings-card">
            <header className="settings-card-header">
              <h3>Verificación OTP</h3>
              <p>Por seguridad, valida tu acceso con un código enviado a tu correo.</p>
            </header>
            <div className="recommender-otp-row">
              <button
                type="button"
                className="btn btn-outline"
                onClick={requestOtp}
                disabled={requestingOtp}
              >
                {requestingOtp ? "Enviando..." : "Enviar OTP"}
              </button>

              <div className="form-field recommender-otp-field">
                <label htmlFor="recommender-otp">Código OTP</label>
                <input
                  id="recommender-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={verifyOtp}
                disabled={verifyingOtp || otpCode.length !== 6}
              >
                {verifyingOtp ? "Validando..." : "Validar OTP"}
              </button>
            </div>
          </article>
        ) : null}

        {isSessionReady ? (
          <article className="settings-card">
            <header className="settings-card-header">
              <h3>Completa la recomendación</h3>
              <p>Responde con ejemplos concretos. Puedes guardar borrador antes de enviar.</p>
            </header>

            <div className="recommender-form-grid">
              <div className="form-field">
                <label htmlFor="recommender-name">Nombre completo</label>
                <input
                  id="recommender-name"
                  type="text"
                  value={formState.recommenderName}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, recommenderName: event.target.value }))
                  }
                />
              </div>

              <div className="form-field">
                <label htmlFor="relationship-title">Rol o vínculo con el postulante</label>
                <input
                  id="relationship-title"
                  type="text"
                  value={formState.relationshipTitle}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, relationshipTitle: event.target.value }))
                  }
                />
              </div>

              <div className="form-field recommender-form-full">
                <label htmlFor="known-duration">¿Hace cuánto lo/la conoces?</label>
                <input
                  id="known-duration"
                  type="text"
                  value={formState.knownDuration}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, knownDuration: event.target.value }))
                  }
                />
              </div>

              <div className="form-field recommender-form-full">
                <label htmlFor="strengths">Fortalezas principales</label>
                <textarea
                  id="strengths"
                  rows={5}
                  value={formState.strengths}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, strengths: event.target.value }))
                  }
                />
              </div>

              <div className="form-field recommender-form-full">
                <label htmlFor="growth-areas">Áreas de mejora</label>
                <textarea
                  id="growth-areas"
                  rows={5}
                  value={formState.growthAreas}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, growthAreas: event.target.value }))
                  }
                />
              </div>

              <div className="form-field recommender-form-full">
                <label htmlFor="endorsement">Recomendación final</label>
                <textarea
                  id="endorsement"
                  rows={5}
                  value={formState.endorsement}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, endorsement: event.target.value }))
                  }
                />
              </div>

              {role === "friend" ? (
                <label className="recommender-checkbox recommender-form-full">
                  <input
                    type="checkbox"
                    checked={formState.confirmsNoFamily}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        confirmsNoFamily: event.target.checked,
                      }))
                    }
                  />
                  <span>Confirmo que no tengo vínculo familiar con el postulante.</span>
                </label>
              ) : null}
            </div>

            <div className="recommender-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={saveDraft}
                disabled={savingDraft}
              >
                {savingDraft ? "Guardando..." : "Guardar borrador"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitForm}
                disabled={submitting}
              >
                {submitting ? "Enviando..." : "Enviar recomendación"}
              </button>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
