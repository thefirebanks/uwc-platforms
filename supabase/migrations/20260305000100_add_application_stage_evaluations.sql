-- Automated rubric outcomes per application stage.

CREATE TABLE IF NOT EXISTS public.application_stage_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
  stage_code text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('eligible', 'not_eligible', 'needs_review')),
  criteria_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  passed_count integer NOT NULL DEFAULT 0 CHECK (passed_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  needs_review_count integer NOT NULL DEFAULT 0 CHECK (needs_review_count >= 0),
  evaluated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  evaluated_by uuid REFERENCES public.profiles(id),
  trigger_event text NOT NULL DEFAULT 'manual' CHECK (trigger_event IN ('manual', 'deadline')),
  UNIQUE (application_id, stage_code)
);

CREATE INDEX IF NOT EXISTS idx_stage_eval_cycle_stage_outcome
  ON public.application_stage_evaluations (cycle_id, stage_code, outcome);

CREATE INDEX IF NOT EXISTS idx_stage_eval_application
  ON public.application_stage_evaluations (application_id);

ALTER TABLE public.application_stage_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "application_stage_evaluations_select_admin_or_assigned_reviewer"
  ON public.application_stage_evaluations
  FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR (
      public.current_user_role() = 'reviewer'
      AND EXISTS (
        SELECT 1
        FROM public.reviewer_assignments ra
        WHERE ra.application_id = application_stage_evaluations.application_id
          AND ra.reviewer_id = auth.uid()
      )
    )
  );

CREATE POLICY "application_stage_evaluations_insert_admin"
  ON public.application_stage_evaluations
  FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "application_stage_evaluations_update_admin"
  ON public.application_stage_evaluations
  FOR UPDATE
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "application_stage_evaluations_delete_admin"
  ON public.application_stage_evaluations
  FOR DELETE
  USING (public.current_user_role() = 'admin');
