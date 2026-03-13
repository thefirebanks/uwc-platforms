import type { CSSProperties } from "react";
import type { ApplicationStatus, StageCode } from "@/types/domain";
import type { NormalizedApiError } from "@/lib/client/api-client";

// ─── Data types ───────────────────────────────────────────────────────

export type ApplicationExport = {
  application: {
    id: string;
    applicant_id: string;
    cycle_id: string;
    stage_code: StageCode;
    status: ApplicationStatus;
    payload: Record<string, unknown>;
    files: Record<string, unknown>;
    validation_notes: string | null;
    created_at: string;
    updated_at: string;
  };
  applicant: { email: string; full_name: string } | null;
  cycle: { id: string; name: string } | null;
  recommendations: Array<{
    id: string;
    role: string;
    recommender_name: string | null;
    recommender_email: string;
    status: string;
    invite_sent_at: string | null;
    submitted_at: string | null;
    last_reminder_at: string | null;
    reminder_count: number;
    admin_received_at: string | null;
    admin_received_reason: string | null;
    admin_received_file: Record<string, unknown> | null;
    admin_notes: string | null;
  }>;
};

export type AdminFileEntry = {
  key: string;
  path: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number | null;
  uploadedAt: string | null;
  category: string | null;
  notes: string | null;
  downloadUrl: string | null;
  aiParserEnabled?: boolean;
};

export type OcrRunResult = {
  summary: string;
  confidence: number;
  createdAt: string;
};

export type EditLogEntry = {
  id: string;
  actor_id: string;
  edit_type: string;
  field_key: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string;
  created_at: string;
};

export type Stage1Blocker = {
  code: string;
  label: string;
  detail: string;
  count: number;
};

export type Tab = "datos" | "archivos" | "recomendaciones" | "historial" | "dictamen";

export type RubricCriterionResult = {
  criterionId: string;
  label: string;
  kind: string;
  status: "pass" | "fail" | "missing_data";
  decision: "eligible" | "not_eligible" | "needs_review" | null;
  message: string;
};

export type EvaluationData = {
  id: string;
  stage_code: string;
  outcome: "eligible" | "not_eligible" | "needs_review";
  criteria_results: RubricCriterionResult[];
  passed_count: number;
  failed_count: number;
  needs_review_count: number;
  evaluated_at: string;
};

// ─── Style constants ──────────────────────────────────────────────────

export const PANEL_CARD_STYLE: CSSProperties = {
  padding: "0.75rem 1rem",
  background: "var(--surface)",
  border: "1px solid var(--border, var(--sand))",
  borderRadius: "8px",
  boxShadow: "var(--shadow-sm)",
};

export const PANEL_SUBTLE_BUTTON_STYLE: CSSProperties = {
  padding: "0.375rem 0.75rem",
  fontSize: "0.8125rem",
  background: "var(--cream)",
  color: "var(--ink)",
  border: "1px solid var(--border, var(--sand))",
  borderRadius: "8px",
  cursor: "pointer",
};

export const PANEL_ACCENT_BUTTON_STYLE: CSSProperties = {
  padding: "0.375rem 0.75rem",
  fontSize: "0.8125rem",
  background: "var(--uwc-maroon-soft)",
  color: "var(--uwc-maroon)",
  border: "1px solid var(--uwc-maroon)",
  borderRadius: "8px",
  cursor: "pointer",
};

export const PANEL_SUCCESS_BUTTON_STYLE: CSSProperties = {
  padding: "0.375rem 0.75rem",
  fontSize: "0.8125rem",
  background: "var(--surface)",
  color: "var(--success)",
  border: "1px solid var(--success)",
  borderRadius: "8px",
  cursor: "pointer",
};

// ─── Utility functions ────────────────────────────────────────────────

export function formatFileSize(sizeBytes: number | null): string {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "Tamano no disponible";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const sizeKb = sizeBytes / 1024;
  if (sizeKb < 1024) {
    return `${sizeKb.toFixed(sizeKb >= 100 ? 0 : 1)} KB`;
  }

  return `${(sizeKb / 1024).toFixed(1)} MB`;
}
