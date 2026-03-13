import { getApplicationStatusLabel } from "@/lib/utils/domain-labels";

// ─── Types ────────────────────────────────────────────────────────────

export type AdminCandidateRow = {
  id: string;
  cycleId: string;
  cycleName: string;
  applicantId: string;
  candidateName: string;
  candidateEmail: string;
  region: string;
  stageCode: string;
  status: "draft" | "submitted" | "eligible" | "ineligible" | "advanced";
  reviewOutcome: "eligible" | "not_eligible" | "needs_review" | null;
  reviewEvaluatedAt: string | null;
  updatedAt: string;
};

export type CycleOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export type CandidatesView = "list" | "export";

export type SearchResult = {
  rows: AdminCandidateRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type Stage1Blocker = {
  code: string;
  label: string;
  detail: string;
  count: number;
};

export type Stage1FunnelApplication = {
  applicationId: string;
  status: AdminCandidateRow["status"];
  blockers: Stage1Blocker[];
  blockerCodes: string[];
  isReadyForReview: boolean;
};

export type Stage1FunnelSummary = {
  totalApplications: number;
  readyForReview: number;
  blocked: number;
  notSubmitted: number;
  missingRequiredFields: number;
  missingRequiredFiles: number;
  recommendationsNotRequested: number;
  recommendationsPending: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────

export const getStatusLabel = getApplicationStatusLabel;

export function getStatusClass(status: AdminCandidateRow["status"]) {
  if (status === "ineligible") return "status-pill rejected";
  if (status === "draft") return "status-pill progress";
  return "status-pill complete";
}

export function getReviewOutcomeLabel(outcome: AdminCandidateRow["reviewOutcome"]) {
  if (outcome === "eligible") return "Elegible";
  if (outcome === "not_eligible") return "No elegible";
  if (outcome === "needs_review") return "Revisión manual";
  return "Sin dictamen";
}

export function getReviewOutcomeClass(outcome: AdminCandidateRow["reviewOutcome"]) {
  if (outcome === "eligible") return "status-pill complete";
  if (outcome === "not_eligible") return "status-pill rejected";
  if (outcome === "needs_review") return "status-pill progress";
  return "status-pill admin-chip-neutral";
}

export function getAvatarTone(index: number) {
  if (index % 3 === 0) return "tone-blue";
  if (index % 3 === 1) return "tone-maroon";
  return "tone-green";
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "A") + (parts[1]?.[0] ?? "");
}
