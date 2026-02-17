export type AppRole = "admin" | "applicant";

export type StageCode = "documents" | "exam_placeholder";

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "eligible"
  | "ineligible"
  | "advanced";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  created_at: string;
}

export interface Application {
  id: string;
  applicant_id: string;
  cycle_id: string;
  stage_code: StageCode;
  status: ApplicationStatus;
  payload: Record<string, string | number | boolean | null>;
  files: Record<string, string>;
  validation_notes: string | null;
  error_report_count: number;
  created_at: string;
  updated_at: string;
}

export interface RecommendationRequest {
  id: string;
  application_id: string;
  requester_id: string;
  recommender_email: string;
  token: string;
  submitted_at: string | null;
  created_at: string;
}

export interface StageTransition {
  id: string;
  application_id: string;
  from_stage: StageCode;
  to_stage: StageCode;
  reason: string;
  actor_id: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  actor_id: string | null;
  application_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  request_id: string;
  created_at: string;
}

export interface ExamImportRow {
  applicant_email: string;
  score: number;
  passed: boolean;
}
