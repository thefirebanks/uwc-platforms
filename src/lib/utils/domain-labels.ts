/**
 * Centralized display-label helpers for domain concepts.
 *
 * Previously duplicated across recommendations-service, recommender-form,
 * applicant-application-form, and admin-candidates-dashboard.
 */

import type { AppLanguage } from "@/lib/i18n/messages";

// ---------------------------------------------------------------------------
// Recommender Role
// ---------------------------------------------------------------------------

type RecommenderRole = "mentor" | "friend";

/** Full bilingual label for recommender roles. */
export function roleLabel(role: RecommenderRole, language?: AppLanguage): string {
  const lang = language ?? "es";
  if (role === "mentor") {
    return lang === "en" ? "Tutor/Teacher/Mentor" : "Tutor/Profesor/Mentor";
  }
  return lang === "en" ? "Friend (non-family)" : "Amigo (no familiar)";
}

/** Short Spanish-only label for emails and compact contexts. */
export function roleLabelShort(role: RecommenderRole): string {
  return role === "mentor" ? "Tutor/Profesor/Mentor" : "Amigo";
}

// ---------------------------------------------------------------------------
// Application Status
// ---------------------------------------------------------------------------

export function getApplicationStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "En progreso";
    case "submitted":
      return "Submitted";
    case "eligible":
      return "Completado";
    case "ineligible":
      return "No elegible";
    case "advanced":
      return "Completado";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Recommendation Status
// ---------------------------------------------------------------------------

export function getRecommendationStatusLabel(status: string): string {
  if (status === "submitted") return "Formulario enviado";
  if (status === "in_progress") return "En progreso";
  if (status === "opened") return "Acceso verificado";
  if (status === "sent") return "Invitación enviada";
  if (status === "expired") return "Enlace vencido";
  if (status === "invalidated") return "Enlace reemplazado";
  return "Pendiente";
}

// ---------------------------------------------------------------------------
// Stage Code
// ---------------------------------------------------------------------------

export function getStageLabel(stageCode: string): string {
  if (stageCode === "documents") return "1. Formulario Principal";
  if (stageCode === "exam_placeholder") return "2. Examen Academico";
  return "Etapa personalizada";
}
