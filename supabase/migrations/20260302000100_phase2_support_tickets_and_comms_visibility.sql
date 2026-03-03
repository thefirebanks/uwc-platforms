-- Phase 2: Support tickets, communication visibility, stage transition applicant access
-- ======================================================================================

-- 1a. Add is_applicant_visible flag to communication_logs
ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS is_applicant_visible boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_communication_logs_applicant_visible
  ON public.communication_logs (application_id, is_applicant_visible)
  WHERE is_applicant_visible = true;

-- 1b. Applicant SELECT policy on communication_logs
-- Postgres ORs policies of same operation type, so this coexists with admin FOR ALL policy
CREATE POLICY "communication_logs_select_applicant_visible"
  ON public.communication_logs
  FOR SELECT
  USING (
    is_applicant_visible = true
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = communication_logs.application_id
        AND a.applicant_id = auth.uid()
    )
  );

-- 1c. Support tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 5 AND 200),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied', 'closed')),
  admin_reply text,
  replied_by uuid REFERENCES public.profiles(id),
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Applicant sees own tickets, admin sees all
CREATE POLICY "support_tickets_select_own_or_admin"
  ON public.support_tickets
  FOR SELECT
  USING (applicant_id = auth.uid() OR public.current_user_role() = 'admin');

-- Applicant can create own tickets
CREATE POLICY "support_tickets_insert_own"
  ON public.support_tickets
  FOR INSERT
  WITH CHECK (applicant_id = auth.uid());

-- Only admin can update (reply/close)
CREATE POLICY "support_tickets_update_admin"
  ON public.support_tickets
  FOR UPDATE
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE INDEX IF NOT EXISTS idx_support_tickets_applicant
  ON public.support_tickets (applicant_id, status);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON public.support_tickets (status, created_at DESC);

-- 1d. Applicant SELECT on stage_transitions (to detect advancement for congrats banner)
CREATE POLICY "stage_transitions_select_own_application"
  ON public.stage_transitions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = stage_transitions.application_id
        AND a.applicant_id = auth.uid()
    )
  );
