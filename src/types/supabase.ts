import type { ApplicationStatus, AppRole, StageCode } from "@/types/domain";

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
          created_at: string;
        },
        {
          id?: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
        },
        {
          name?: string;
          is_active?: boolean;
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
      recommendation_requests: TableDef<
        {
          id: string;
          application_id: string;
          requester_id: string;
          recommender_email: string;
          token: string;
          submitted_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          application_id: string;
          requester_id: string;
          recommender_email: string;
          token: string;
          submitted_at?: string | null;
          created_at?: string;
        },
        {
          submitted_at?: string | null;
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
          recipient_email: string;
          status: string;
          error_message: string | null;
          sent_by: string;
          created_at: string;
        },
        {
          id?: string;
          application_id: string;
          template_key: string;
          recipient_email: string;
          status: string;
          error_message?: string | null;
          sent_by: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
