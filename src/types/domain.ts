export type AppRole = "admin" | "applicant" | "reviewer";

export type ReviewerPermission =
  | "applications:read"
  | "applications:write"
  | "applications:export"
  | "applications:transition"
  | "applications:validate"
  | "reviewers:manage"
  | "comms:send"
  | "config:write";

export type PermissionScope = "global" | "assigned";

export interface RolePermission {
  role: AppRole;
  permission: ReviewerPermission;
  scope: PermissionScope;
}

export interface ReviewerAssignment {
  id: string;
  reviewer_id: string;
  application_id: string;
  cycle_id: string;
  stage_code: string;
  assigned_by: string;
  assigned_at: string;
}

export type OcrModelId = string; // Registry-defined; known values: "gemini-flash" | "gemini-pro-vision"

export type BuiltinStageCode = "documents" | "exam_placeholder";
export type StageCode = BuiltinStageCode | (string & {});
export type StageFieldType = "short_text" | "long_text" | "number" | "date" | "email" | "file";
export type StageAutomationTrigger = "application_submitted" | "stage_result";
export type CommunicationStatus = "queued" | "processing" | "sent" | "failed";
export type RecommenderRole = "mentor" | "friend";
export type RecommendationStatus =
  | "invited"
  | "sent"
  | "opened"
  | "in_progress"
  | "submitted"
  | "invalidated"
  | "expired";

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "eligible"
  | "ineligible"
  | "advanced";

export type SupportTicketStatus = "open" | "replied" | "closed";

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
  files: Record<string, string | ApplicationFileEntry>;
  validation_notes: string | null;
  error_report_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApplicationFileEntry {
  path: string;
  title: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  category?: string | null;
  notes?: string | null;
  uploaded_by?: string | null;
}

export interface RecommendationRequest {
  id: string;
  application_id: string;
  requester_id: string;
  role: RecommenderRole;
  recommender_name: string | null;
  recommender_email: string;
  token: string;
  status: RecommendationStatus;
  invite_sent_at: string | null;
  opened_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  invalidated_at: string | null;
  invalidation_reason: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  otp_sent_at: string | null;
  otp_verified_at: string | null;
  access_expires_at: string;
  responses: Record<string, unknown>;
  admin_received_at: string | null;
  admin_received_by: string | null;
  admin_received_reason: string | null;
  admin_received_file: Record<string, unknown>;
  admin_notes: string | null;
  created_at: string;
}

export interface SelectionProcess {
  id: string;
  name: string;
  is_active: boolean;
  stage1_open_at: string | null;
  stage1_close_at: string | null;
  stage2_open_at: string | null;
  stage2_close_at: string | null;
  max_applications_per_user: number;
  created_at: string;
}

export interface CycleStageTemplate {
  id: string;
  cycle_id: string;
  stage_code: StageCode;
  stage_label: string;
  milestone_label: string;
  due_at: string | null;
  ocr_prompt_template?: string | null;
  admin_config?: Record<string, unknown> | null;
  model_id?: string | null;
  sort_order: number;
  created_at: string;
}

export interface StageFieldAiParserConfig {
  enabled: boolean;
  modelId?: string | null;
  promptTemplate?: string | null;
  systemPrompt?: string | null;
  extractionInstructions: string;
  expectedSchemaTemplate: string;
  strictSchema: boolean;
}

export interface CycleStageField {
  id: string;
  cycle_id: string;
  stage_code: StageCode;
  field_key: string;
  field_label: string;
  field_type: StageFieldType;
  is_required: boolean;
  placeholder: string | null;
  help_text: string | null;
  sort_order: number;
  is_active: boolean;
  section_id: string | null;
  ai_parser_config?: unknown | null;
  created_at: string;
}

export interface StageSection {
  id: string;
  cycle_id: string;
  stage_code: string;
  section_key: string;
  title: string;
  description: string;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
}

export interface StageAutomationTemplate {
  id: string;
  cycle_id: string;
  stage_code: StageCode;
  trigger_event: StageAutomationTrigger;
  channel: "email";
  is_enabled: boolean;
  template_subject: string;
  template_body: string;
  created_at: string;
  updated_at: string;
}

export interface CommunicationLog {
  id: string;
  application_id: string;
  campaign_id: string | null;
  template_key: string;
  trigger_event: string | null;
  subject: string | null;
  body: string | null;
  automation_template_id: string | null;
  recipient_email: string;
  status: CommunicationStatus;
  error_message: string | null;
  idempotency_key: string | null;
  sent_by: string;
  attempt_count: number;
  last_attempt_at: string | null;
  delivered_at: string | null;
  provider_message_id: string | null;
  is_applicant_visible: boolean;
  created_at: string;
}

export interface CommunicationCampaign {
  id: string;
  created_by: string;
  cycle_id: string;
  name: string;
  subject: string;
  body_template: string;
  recipient_filter: Record<string, unknown>;
  status: string;
  idempotency_key: string;
  sent_at: string | null;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  application_id: string;
  applicant_id: string;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  admin_reply: string | null;
  replied_by: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface ApplicationOcrCheck {
  id: string;
  application_id: string;
  actor_id: string | null;
  file_key: string;
  summary: string;
  confidence: number;
  raw_response: Record<string, unknown>;
  created_at: string;
}

export interface OcrTestRun {
  id: string;
  cycle_id: string | null;
  stage_code: string;
  actor_id: string;
  file_name: string;
  file_path: string;
  prompt_template: string;
  model_id: string;
  summary: string | null;
  confidence: number | null;
  raw_response: Record<string, unknown>;
  duration_ms: number | null;
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
