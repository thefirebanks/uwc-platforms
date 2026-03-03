-- Phase 3: OCR Testbed + Model Registry
-- 3a. Add model_id to cycle_stage_templates (per-cycle model selection)
ALTER TABLE public.cycle_stage_templates
  ADD COLUMN IF NOT EXISTS model_id text NOT NULL DEFAULT 'gemini-flash';

-- 3b. ocr_test_runs table — isolated from real application OCR checks
--     No application_id: these are admin sandbox runs only
CREATE TABLE IF NOT EXISTS public.ocr_test_runs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id     uuid        REFERENCES public.cycles(id) ON DELETE SET NULL,
  stage_code   text        NOT NULL,
  actor_id     uuid        NOT NULL REFERENCES public.profiles(id),
  file_name    text        NOT NULL,
  file_path    text        NOT NULL,
  prompt_template text     NOT NULL,
  model_id     text        NOT NULL DEFAULT 'gemini-flash',
  summary      text,
  confidence   numeric(4,3),
  raw_response jsonb       NOT NULL DEFAULT '{}',
  duration_ms  integer,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.ocr_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ocr_test_runs_admin_all"
  ON public.ocr_test_runs
  FOR ALL
  USING  (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE INDEX IF NOT EXISTS idx_ocr_test_runs_actor
  ON public.ocr_test_runs(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ocr_test_runs_cycle_stage
  ON public.ocr_test_runs(cycle_id, stage_code, created_at DESC);
