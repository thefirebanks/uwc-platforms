"use client";

import type { ReactNode } from "react";
import {
  Box,
  Button,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { AppLanguage } from "@/lib/i18n/messages";
import type { RecommendationStatus, RecommenderRole } from "@/types/domain";
import { roleLabel } from "@/lib/utils/domain-labels";

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

function normalizeEmailAddress(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
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
} as const;

interface ApplicantRecommendersSectionProps {
  /** Optional metadata fields rendered above the recommender cards */
  metadataContent?: ReactNode;
  activeRecommendersByRole: Map<RecommenderRole, RecommenderSummary>;
  recommenderInputs: { mentor: string; friend: string };
  onRecommenderInputChange: (role: RecommenderRole, value: string) => void;
  onSaveRecommender: (role: RecommenderRole) => void;
  onSendReminder: (recommendationId: string) => void;
  savingRecommenderRole: RecommenderRole | null;
  remindingId: string | null;
  loadingRecommenders: boolean;
  recommenders: RecommenderSummary[];
  applicationId: string | null | undefined;
  isEditingEnabled: boolean;
  language: AppLanguage;
  locale: string;
  copy: (spanish: string, english: string) => string;
}

/**
 * Recommender cards for mentor and friend roles.
 * Shows email input, invite status, and save/remind action buttons.
 */
export function ApplicantRecommendersSection({
  metadataContent,
  activeRecommendersByRole,
  recommenderInputs,
  onRecommenderInputChange,
  onSaveRecommender,
  onSendReminder,
  savingRecommenderRole,
  remindingId,
  loadingRecommenders,
  recommenders,
  applicationId,
  isEditingEnabled,
  language,
  locale,
  copy,
}: ApplicantRecommendersSectionProps) {
  return (
    <Box>
      {metadataContent ? (
        <Box sx={{ mb: 2 }}>
          {metadataContent}
        </Box>
      ) : null}

      <Stack spacing={2}>
        {(["mentor", "friend"] as const).map((role, idx) => {
          const current = activeRecommendersByRole.get(role) ?? null;
          const tone = current ? statusTone(current.status, language) : null;

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
                {current && tone ? (
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
                  onChange={(event) => onRecommenderInputChange(role, event.target.value)}
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
                {(() => {
                  const normalizedCurrentEmail = normalizeEmailAddress(current?.email);
                  const normalizedInputEmail = normalizeEmailAddress(recommenderInputs[role]);
                  const shouldShowSaveInvite =
                    isEditingEnabled &&
                    current?.status !== "submitted" &&
                    (!current || normalizedInputEmail !== normalizedCurrentEmail);
                  const canSaveInvite = shouldShowSaveInvite && Boolean(normalizedInputEmail);
                  const saveLabel = current
                    ? copy("Guardar y reenviar", "Save and resend")
                    : copy("Guardar y enviar", "Save and send");
                  const reminderLabel = current?.inviteSentAt
                    ? copy("Enviar recordatorio", "Send reminder")
                    : copy("Reintentar envío", "Retry send");

                  return (
                    <>
                      {shouldShowSaveInvite ? (
                        <Button
                          variant="outlined"
                          onClick={() => onSaveRecommender(role)}
                          disabled={!canSaveInvite || savingRecommenderRole === role}
                        >
                          {savingRecommenderRole === role
                            ? copy("Enviando...", "Sending...")
                            : saveLabel}
                        </Button>
                      ) : null}
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
                          onClick={() => onSendReminder(current.id)}
                          disabled={remindingId === current.id || !isEditingEnabled}
                        >
                          {remindingId === current.id ? copy("Enviando...", "Sending...") : reminderLabel}
                        </Button>
                      ) : null}
                    </>
                  );
                })()}
              </Stack>
            </Box>
          );
        })}
      </Stack>
      {loadingRecommenders ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, fontSize: "0.78rem" }}>
          {copy("Cargando recomendadores guardados...", "Loading saved recommenders...")}
        </Typography>
      ) : null}
      {!loadingRecommenders && applicationId && recommenders.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, fontSize: "0.78rem" }}>
          {copy("Aún no hay recomendadores registrados para esta postulación.", "There are no recommenders registered for this application yet.")}
        </Typography>
      ) : null}
    </Box>
  );
}

export type { RecommenderSummary };
