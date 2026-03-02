import type {
  ApplicationStatus,
  AppRole,
  CommunicationStatus,
  PermissionScope,
  RecommendationStatus,
  RecommenderRole,
  ReviewerPermission,
  StageAutomationTrigger,
  StageCode,
  StageFieldType,
  SupportTicketStatus,
} from "@/types/domain";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableDef<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<
        {
          id: string;
          email: string;
          full_name: string;
          role: AppRole;
          search_vector: unknown;
          created_at: string;
        },
        {
          id: string;
          email: string;
          full_name: string;
          role: AppRole;
          created_at?: string;
        },
        {
          email?: string;
          full_name?: string;
          role?: AppRole;
        }
      >;
      cycles: TableDef<
        {
          id: string;
          name: string;
          is_active: boolean;
          stage1_open_at: string | null;
          stage1_close_at: string | null;
          stage2_open_at: string | null;
          stage2_close_at: string | null;
          max_applications_per_user: number;
          created_at: string;
        },
        {
          id?: string;
          name: string;
          is_active?: boolean;
          stage1_open_at?: string | null;
          stage1_close_at?: string | null;
          stage2_open_at?: string | null;
          stage2_close_at?: string | null;
          max_applications_per_user?: number;
          created_at?: string;
        },
        {
          name?: string;
          is_active?: boolean;
          stage1_open_at?: string | null;
          stage1_close_at?: string | null;
          stage2_open_at?: string | null;
          stage2_close_at?: string | null;
          max_applications_per_user?: number;
        }
      >;
      applications: TableDef<
        {
          id: string;
          applicant_id: string;
          cycle_id: string;
          stage_code: StageCode;
          status: ApplicationStatus;
          payload: Json;
          files: Json;
          validation_notes: string | null;
          error_report_count: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          applicant_id: string;
          cycle_id: string;
          stage_code?: StageCode;
          status?: ApplicationStatus;
          payload?: Json;
          files?: Json;
          validation_notes?: string | null;
          error_report_count?: number;
          created_at?: string;
          updated_at?: string;
        },
        {
          stage_code?: StageCode;
          status?: ApplicationStatus;
          payload?: Json;
          files?: Json;
          validation_notes?: string | null;
          error_report_count?: number;
          updated_at?: string;
        }
      >;
      cycle_stage_templates: TableDef<
        {
          id: string;
          cycle_id: string;
          stage_code: StageCode;
          stage_label: string;
          milestone_label: string;
          due_at: string | null;
          ocr_prompt_template: string | null;
          admin_config: Json;
          model_id: string;
          sort_order: number;
          created_at: string;
        },
        {
          id?: string;
          cycle_id: string;
          stage_code: StageCode;
          stage_label: string;
          milestone_label: string;
          due_at?: string | null;
          ocr_prompt_template?: string | null;
          admin_config?: Json;
          model_id?: string;
          sort_order?: number;
          created_at?: string;
        },
        {
          stage_label?: string;
          milestone_label?: string;
          due_at?: string | null;
          ocr_prompt_template?: string | null;
          admin_config?: Json;
          model_id?: string;
          sort_order?: number;
        }
      >;
      recommendation_requests: TableDef<
        {
          id: string;
          application_id: string;
          requester_id: string;
          role: RecommenderRole;
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
          otp_code_hash: string | null;
          otp_sent_at: string | null;
          otp_attempt_count: number;
          otp_verified_at: string | null;
          access_expires_at: string;
          session_token_hash: string | null;
          session_expires_at: string | null;
          responses: Json;
          created_at: string;
        },
        {
          id?: string;
          application_id: string;
          requester_id: string;
          role: RecommenderRole;
          recommender_email: string;
          token: string;
          status?: RecommendationStatus;
          invite_sent_at?: string | null;
          opened_at?: string | null;
          started_at?: string | null;
          submitted_at?: string | null;
          invalidated_at?: string | null;
          invalidation_reason?: string | null;
          reminder_count?: number;
          last_reminder_at?: string | null;
          otp_code_hash?: string | null;
          otp_sent_at?: string | null;
          otp_attempt_count?: number;
          otp_verified_at?: string | null;
          access_expires_at?: string;
          session_token_hash?: string | null;
          session_expires_at?: string | null;
          responses?: Json;
          created_at?: string;
        },
        {
          role?: RecommenderRole;
          status?: RecommendationStatus;
          invite_sent_at?: string | null;
          opened_at?: string | null;
          started_at?: string | null;
          submitted_at?: string | null;
          invalidated_at?: string | null;
          invalidation_reason?: string | null;
          reminder_count?: number;
          last_reminder_at?: string | null;
          otp_code_hash?: string | null;
          otp_sent_at?: string | null;
          otp_attempt_count?: number;
          otp_verified_at?: string | null;
          access_expires_at?: string;
          session_token_hash?: string | null;
          session_expires_at?: string | null;
          responses?: Json;
        }
      >;
      stage_transitions: TableDef<
        {
          id: string;
          application_id: string;
          from_stage: StageCode;
          to_stage: StageCode;
          reason: string;
          actor_id: string;
          created_at: string;
        },
        {
          id?: string;
          application_id: string;
          from_stage: StageCode;
          to_stage: StageCode;
          reason: string;
          actor_id: string;
          created_at?: string;
        },
        never
      >;
      exam_imports: TableDef<
        {
          id: string;
          application_id: string;
          applicant_email: string;
          score: number;
          passed: boolean;
          imported_by: string;
          created_at: string;
        },
        {
          id?: string;
          application_id: string;
          applicant_email: string;
          score: number;
          passed: boolean;
          imported_by: string;
          created_at?: string;
        },
        never
      >;
      communication_logs: TableDef<
        {
          id: string;
          application_id: string;
          template_key: string;
          trigger_event: string | null;
          subject: string | null;
          body: string | null;
          automation_template_id: string | null;
          recipient_email: string;
          status: CommunicationStatus;
          error_message: string | null;
          sent_by: string;
          attempt_count: number;
          last_attempt_at: string | null;
          delivered_at: string | null;
          provider_message_id: string | null;
          is_applicant_visible: boolean;
          created_at: string;
        },
        {
          id?: string;
          application_id: string;
          template_key: string;
          trigger_event?: string | null;
          subject?: string | null;
          body?: string | null;
          automation_template_id?: string | null;
          recipient_email: string;
          status: CommunicationStatus;
          error_message?: string | null;
          sent_by: string;
          attempt_count?: number;
          last_attempt_at?: string | null;
          delivered_at?: string | null;
          provider_message_id?: string | null;
          is_applicant_visible?: boolean;
          created_at?: string;
        },
        {
          status?: CommunicationStatus;
          error_message?: string | null;
          attempt_count?: number;
          last_attempt_at?: string | null;
          delivered_at?: string | null;
          provider_message_id?: string | null;
          is_applicant_visible?: boolean;
        }
      >;
      cycle_stage_fields: TableDef<
        {
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
          created_at: string;
        },
        {
          id?: string;
          cycle_id: string;
          stage_code: StageCode;
          field_key: string;
          field_label: string;
          field_type: StageFieldType;
          is_required?: boolean;
          placeholder?: string | null;
          help_text?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        },
        {
          field_key?: string;
          field_label?: string;
          field_type?: StageFieldType;
          is_required?: boolean;
          placeholder?: string | null;
          help_text?: string | null;
          sort_order?: number;
          is_active?: boolean;
        }
      >;
      stage_automation_templates: TableDef<
        {
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
        },
        {
          id?: string;
          cycle_id: string;
          stage_code: StageCode;
          trigger_event: StageAutomationTrigger;
          channel?: "email";
          is_enabled?: boolean;
          template_subject: string;
          template_body: string;
          created_at?: string;
          updated_at?: string;
        },
        {
          trigger_event?: StageAutomationTrigger;
          is_enabled?: boolean;
          template_subject?: string;
          template_body?: string;
          updated_at?: string;
        }
      >;
      application_ocr_checks: TableDef<
        {
          id: string;
          application_id: string;
          actor_id: string | null;
          file_key: string;
          summary: string;
          confidence: number;
          raw_response: Json;
          created_at: string;
        },
        {
          id?: string;
          application_id: string;
          actor_id?: string | null;
          file_key: string;
          summary: string;
          confidence: number;
          raw_response?: Json;
          created_at?: string;
        },
        never
      >;
      audit_events: TableDef<
        {
          id: string;
          actor_id: string | null;
          application_id: string | null;
          action: string;
          metadata: Json;
          request_id: string;
          created_at: string;
        },
        {
          id?: string;
          actor_id?: string | null;
          application_id?: string | null;
          action: string;
          metadata?: Json;
          request_id: string;
          created_at?: string;
        },
        never
      >;
      bug_reports: TableDef<
        {
          id: string;
          reporter_id: string | null;
          error_id: string;
          context: string;
          notes: string;
          created_at: string;
        },
        {
          id?: string;
          reporter_id?: string | null;
          error_id: string;
          context: string;
          notes: string;
          created_at?: string;
        },
        never
      >;
      support_tickets: TableDef<
        {
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
        },
        {
          id?: string;
          application_id: string;
          applicant_id: string;
          subject: string;
          body: string;
          status?: SupportTicketStatus;
          admin_reply?: string | null;
          replied_by?: string | null;
          replied_at?: string | null;
          created_at?: string;
        },
        {
          status?: SupportTicketStatus;
          admin_reply?: string | null;
          replied_by?: string | null;
          replied_at?: string | null;
        }
      >;
      admin_edit_log: TableDef<
        {
          id: string;
          application_id: string;
          actor_id: string;
          edit_type: string;
          field_key: string | null;
          old_value: Json | null;
          new_value: Json | null;
          reason: string;
          created_at: string;
        },
        {
          id?: string;
          application_id: string;
          actor_id: string;
          edit_type: string;
          field_key?: string | null;
          old_value?: Json | null;
          new_value?: Json | null;
          reason?: string;
          created_at?: string;
        },
        {
          edit_type?: string;
          field_key?: string | null;
          old_value?: Json | null;
          new_value?: Json | null;
          reason?: string;
        }
      >;
      ocr_test_runs: TableDef<
        {
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
          raw_response: Json;
          duration_ms: number | null;
          created_at: string;
        },
        {
          id?: string;
          cycle_id?: string | null;
          stage_code: string;
          actor_id: string;
          file_name: string;
          file_path: string;
          prompt_template: string;
          model_id?: string;
          summary?: string | null;
          confidence?: number | null;
          raw_response?: Json;
          duration_ms?: number | null;
          created_at?: string;
        },
        never
      >;
      role_permissions: TableDef<
        {
          role: AppRole;
          permission: ReviewerPermission;
          scope: PermissionScope;
        },
        {
          role: AppRole;
          permission: ReviewerPermission;
          scope?: PermissionScope;
        },
        {
          scope?: PermissionScope;
        }
      >;
      reviewer_assignments: TableDef<
        {
          id: string;
          reviewer_id: string;
          application_id: string;
          cycle_id: string;
          stage_code: string;
          assigned_by: string;
          assigned_at: string;
        },
        {
          id?: string;
          reviewer_id: string;
          application_id: string;
          cycle_id: string;
          stage_code: string;
          assigned_by: string;
          assigned_at?: string;
        },
        never
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
