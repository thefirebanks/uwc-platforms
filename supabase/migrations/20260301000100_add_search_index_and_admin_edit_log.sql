-- Migration: Add full-text search on profiles + admin edit audit log
-- Part of Phase 1: Admin Candidate Management

-- 1. Full-text search on profiles (Spanish dictionary for accent/stem handling)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish', coalesce(full_name, '') || ' ' || coalesce(email, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_profiles_search_vector
  ON public.profiles USING gin(search_vector);

-- 2. Composite indexes for efficient bulk filtering on applications
CREATE INDEX IF NOT EXISTS idx_applications_cycle_status
  ON public.applications(cycle_id, status);

CREATE INDEX IF NOT EXISTS idx_applications_cycle_stage_status
  ON public.applications(cycle_id, stage_code, status);

-- 3. Admin edit log: field-level audit trail for admin edits to applications
CREATE TABLE IF NOT EXISTS public.admin_edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  edit_type text NOT NULL CHECK (edit_type IN ('payload', 'files', 'status', 'validation_notes', 'recommendation')),
  field_key text,
  old_value jsonb,
  new_value jsonb,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.admin_edit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_edit_log_admin_only" ON public.admin_edit_log
  FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE INDEX IF NOT EXISTS idx_admin_edit_log_application
  ON public.admin_edit_log(application_id);

CREATE INDEX IF NOT EXISTS idx_admin_edit_log_actor
  ON public.admin_edit_log(actor_id);
