export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_edit_log: {
        Row: {
          actor_id: string
          application_id: string
          created_at: string
          edit_type: string
          field_key: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string
        }
        Insert: {
          actor_id: string
          application_id: string
          created_at?: string
          edit_type: string
          field_key?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string
        }
        Update: {
          actor_id?: string
          application_id?: string
          created_at?: string
          edit_type?: string
          field_key?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_edit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_edit_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_ocr_checks: {
        Row: {
          actor_id: string | null
          application_id: string
          confidence: number
          created_at: string
          file_key: string
          id: string
          raw_response: Json
          summary: string
        }
        Insert: {
          actor_id?: string | null
          application_id: string
          confidence: number
          created_at?: string
          file_key: string
          id?: string
          raw_response?: Json
          summary: string
        }
        Update: {
          actor_id?: string | null
          application_id?: string
          confidence?: number
          created_at?: string
          file_key?: string
          id?: string
          raw_response?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_ocr_checks_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_ocr_checks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applicant_id: string
          created_at: string
          cycle_id: string
          error_report_count: number
          files: Json
          id: string
          payload: Json
          stage_code: string
          status: string
          updated_at: string
          validation_notes: string | null
        }
        Insert: {
          applicant_id: string
          created_at?: string
          cycle_id: string
          error_report_count?: number
          files?: Json
          id?: string
          payload?: Json
          stage_code?: string
          status?: string
          updated_at?: string
          validation_notes?: string | null
        }
        Update: {
          applicant_id?: string
          created_at?: string
          cycle_id?: string
          error_report_count?: number
          files?: Json
          id?: string
          payload?: Json
          stage_code?: string
          status?: string
          updated_at?: string
          validation_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          application_id: string | null
          created_at: string
          id: string
          metadata: Json
          request_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          application_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          request_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          application_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          context: string
          created_at: string
          error_id: string
          id: string
          notes: string
          reporter_id: string | null
        }
        Insert: {
          context: string
          created_at?: string
          error_id: string
          id?: string
          notes?: string
          reporter_id?: string | null
        }
        Update: {
          context?: string
          created_at?: string
          error_id?: string
          id?: string
          notes?: string
          reporter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_logs: {
        Row: {
          application_id: string
          attempt_count: number
          automation_template_id: string | null
          body: string | null
          campaign_id: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          is_applicant_visible: boolean
          last_attempt_at: string | null
          provider_message_id: string | null
          recipient_email: string
          sent_by: string
          status: string
          subject: string | null
          template_key: string
          trigger_event: string | null
        }
        Insert: {
          application_id: string
          attempt_count?: number
          automation_template_id?: string | null
          body?: string | null
          campaign_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          is_applicant_visible?: boolean
          last_attempt_at?: string | null
          provider_message_id?: string | null
          recipient_email: string
          sent_by: string
          status?: string
          subject?: string | null
          template_key: string
          trigger_event?: string | null
        }
        Update: {
          application_id?: string
          attempt_count?: number
          automation_template_id?: string | null
          body?: string | null
          campaign_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          is_applicant_visible?: boolean
          last_attempt_at?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          sent_by?: string
          status?: string
          subject?: string | null
          template_key?: string
          trigger_event?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_logs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "communication_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_logs_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_campaigns: {
        Row: {
          body_template: string
          created_at: string
          created_by: string
          cycle_id: string
          id: string
          idempotency_key: string
          name: string
          recipient_filter: Json
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          body_template: string
          created_at?: string
          created_by: string
          cycle_id: string
          id?: string
          idempotency_key: string
          name: string
          recipient_filter?: Json
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          body_template?: string
          created_at?: string
          created_by?: string
          cycle_id?: string
          id?: string
          idempotency_key?: string
          name?: string
          recipient_filter?: Json
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_campaigns_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_stage_fields: {
        Row: {
          created_at: string
          cycle_id: string
          field_key: string
          field_label: string
          field_type: string
          help_text: string | null
          group_name: string | null
          id: string
          is_active: boolean
          is_required: boolean
          placeholder: string | null
          section_id: string | null
          sort_order: number
          stage_code: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          field_key: string
          field_label: string
          field_type: string
          help_text?: string | null
          group_name?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          placeholder?: string | null
          section_id?: string | null
          sort_order?: number
          stage_code: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          field_key?: string
          field_label?: string
          field_type?: string
          help_text?: string | null
          group_name?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          placeholder?: string | null
          section_id?: string | null
          sort_order?: number
          stage_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_stage_fields_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_stage_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "stage_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_stage_templates: {
        Row: {
          admin_config: Json
          created_at: string
          cycle_id: string
          due_at: string | null
          id: string
          milestone_label: string
          ocr_prompt_template: string | null
          sort_order: number
          stage_code: string
          stage_label: string
        }
        Insert: {
          admin_config?: Json
          created_at?: string
          cycle_id: string
          due_at?: string | null
          id?: string
          milestone_label: string
          ocr_prompt_template?: string | null
          sort_order?: number
          stage_code: string
          stage_label: string
        }
        Update: {
          admin_config?: Json
          created_at?: string
          cycle_id?: string
          due_at?: string | null
          id?: string
          milestone_label?: string
          ocr_prompt_template?: string | null
          sort_order?: number
          stage_code?: string
          stage_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_stage_templates_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      export_presets: {
        Row: {
          created_at: string
          created_by: string
          cycle_id: string
          id: string
          name: string
          selected_fields: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          cycle_id: string
          id?: string
          name: string
          selected_fields?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          cycle_id?: string
          id?: string
          name?: string
          selected_fields?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_presets_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      cycles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          max_applications_per_user: number
          name: string
          stage1_close_at: string | null
          stage1_open_at: string | null
          stage2_close_at: string | null
          stage2_open_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_applications_per_user?: number
          name: string
          stage1_close_at?: string | null
          stage1_open_at?: string | null
          stage2_close_at?: string | null
          stage2_open_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_applications_per_user?: number
          name?: string
          stage1_close_at?: string | null
          stage1_open_at?: string | null
          stage2_close_at?: string | null
          stage2_open_at?: string | null
        }
        Relationships: []
      }
      exam_imports: {
        Row: {
          applicant_email: string
          application_id: string
          created_at: string
          id: string
          imported_by: string
          passed: boolean
          score: number
        }
        Insert: {
          applicant_email: string
          application_id: string
          created_at?: string
          id?: string
          imported_by: string
          passed: boolean
          score: number
        }
        Update: {
          applicant_email?: string
          application_id?: string
          created_at?: string
          id?: string
          imported_by?: string
          passed?: boolean
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_imports_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          role: string
          search_vector: unknown
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          role: string
          search_vector?: unknown
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: string
          search_vector?: unknown
        }
        Relationships: []
      }
      recommendation_requests: {
        Row: {
          access_expires_at: string | null
          admin_notes: string | null
          admin_received_at: string | null
          admin_received_by: string | null
          admin_received_file: Json
          admin_received_reason: string | null
          application_id: string
          created_at: string
          id: string
          invalidated_at: string | null
          invalidation_reason: string | null
          invite_sent_at: string | null
          last_reminder_at: string | null
          opened_at: string | null
          otp_attempt_count: number
          otp_code_hash: string | null
          otp_sent_at: string | null
          otp_verified_at: string | null
          recommender_name: string | null
          recommender_email: string
          reminder_count: number
          requester_id: string
          responses: Json
          role: string
          session_expires_at: string | null
          session_token_hash: string | null
          started_at: string | null
          status: string
          submitted_at: string | null
          token: string
        }
        Insert: {
          access_expires_at?: string | null
          admin_notes?: string | null
          admin_received_at?: string | null
          admin_received_by?: string | null
          admin_received_file?: Json
          admin_received_reason?: string | null
          application_id: string
          created_at?: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          invite_sent_at?: string | null
          last_reminder_at?: string | null
          opened_at?: string | null
          otp_attempt_count?: number
          otp_code_hash?: string | null
          otp_sent_at?: string | null
          otp_verified_at?: string | null
          recommender_name?: string | null
          recommender_email: string
          reminder_count?: number
          requester_id: string
          responses?: Json
          role?: string
          session_expires_at?: string | null
          session_token_hash?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          token: string
        }
        Update: {
          access_expires_at?: string | null
          admin_notes?: string | null
          admin_received_at?: string | null
          admin_received_by?: string | null
          admin_received_file?: Json
          admin_received_reason?: string | null
          application_id?: string
          created_at?: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          invite_sent_at?: string | null
          last_reminder_at?: string | null
          opened_at?: string | null
          otp_attempt_count?: number
          otp_code_hash?: string | null
          otp_sent_at?: string | null
          otp_verified_at?: string | null
          recommender_name?: string | null
          recommender_email?: string
          reminder_count?: number
          requester_id?: string
          responses?: Json
          role?: string
          session_expires_at?: string | null
          session_token_hash?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_requests_admin_received_by_fkey"
            columns: ["admin_received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_automation_templates: {
        Row: {
          channel: string
          created_at: string
          cycle_id: string
          id: string
          is_enabled: boolean
          stage_code: string
          template_body: string
          template_subject: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          cycle_id: string
          id?: string
          is_enabled?: boolean
          stage_code: string
          template_body: string
          template_subject: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          cycle_id?: string
          id?: string
          is_enabled?: boolean
          stage_code?: string
          template_body?: string
          template_subject?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_automation_templates_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_sections: {
        Row: {
          created_at: string
          cycle_id: string
          description: string
          id: string
          is_visible: boolean
          section_key: string
          sort_order: number
          stage_code: string
          title: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          description?: string
          id?: string
          is_visible?: boolean
          section_key: string
          sort_order?: number
          stage_code: string
          title: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          description?: string
          id?: string
          is_visible?: boolean
          section_key?: string
          sort_order?: number
          stage_code?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_sections_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_transitions: {
        Row: {
          actor_id: string
          application_id: string
          created_at: string
          from_stage: string
          id: string
          reason: string
          to_stage: string
        }
        Insert: {
          actor_id: string
          application_id: string
          created_at?: string
          from_stage: string
          id?: string
          reason: string
          to_stage: string
        }
        Update: {
          actor_id?: string
          application_id?: string
          created_at?: string
          from_stage?: string
          id?: string
          reason?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_transitions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transitions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_reply: string | null
          applicant_id: string
          application_id: string
          body: string
          created_at: string
          id: string
          replied_at: string | null
          replied_by: string | null
          status: string
          subject: string
        }
        Insert: {
          admin_reply?: string | null
          applicant_id: string
          application_id: string
          body: string
          created_at?: string
          id?: string
          replied_at?: string | null
          replied_by?: string | null
          status?: string
          subject: string
        }
        Update: {
          admin_reply?: string | null
          applicant_id?: string
          application_id?: string
          body?: string
          created_at?: string
          id?: string
          replied_at?: string | null
          replied_by?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_replied_by_fkey"
            columns: ["replied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_email: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
