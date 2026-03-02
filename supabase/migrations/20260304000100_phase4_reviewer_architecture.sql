-- Phase 4: Reviewer Architecture Prep
-- =====================================
-- Adds the permission matrix, reviewer assignments, expands profiles.role,
-- and adds a reviewer RLS branch on applications.

-- 1. Expand profiles.role to allow 'reviewer'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'applicant', 'reviewer'));

-- 2. role_permissions: flat permission matrix
--    scope: 'global' = sees everything, 'assigned' = sees only assigned resources
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role        text NOT NULL,
  permission  text NOT NULL,
  scope       text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'assigned')),
  PRIMARY KEY (role, permission)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read permissions (needed for server-side checks)
CREATE POLICY "role_permissions_select_authenticated"
  ON public.role_permissions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only service_role can mutate (permissions are seeded, not user-editable)
CREATE POLICY "role_permissions_all_service_role"
  ON public.role_permissions
  FOR ALL
  USING (current_setting('request.jwt.claim.role', true) = 'service_role')
  WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');

-- Seed defaults
INSERT INTO public.role_permissions (role, permission, scope) VALUES
  -- Admin: global access to all capabilities
  ('admin', 'applications:read',   'global'),
  ('admin', 'applications:write',  'global'),
  ('admin', 'applications:export', 'global'),
  ('admin', 'applications:transition', 'global'),
  ('admin', 'reviewers:manage',    'global'),
  ('admin', 'comms:send',          'global'),
  ('admin', 'config:write',        'global'),
  -- Reviewer: assigned scope — only sees assigned applications
  ('reviewer', 'applications:read',  'assigned'),
  ('reviewer', 'applications:validate', 'assigned'),
  -- Applicant: only their own application (enforced by RLS, not this table)
  ('applicant', 'applications:read',  'assigned'),
  ('applicant', 'applications:write', 'assigned')
ON CONFLICT (role, permission) DO NOTHING;

-- 3. reviewer_assignments: links reviewers to specific applications
CREATE TABLE IF NOT EXISTS public.reviewer_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  cycle_id      uuid NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
  stage_code    text NOT NULL,
  assigned_by   uuid NOT NULL REFERENCES public.profiles(id),
  assigned_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (reviewer_id, application_id)
);

ALTER TABLE public.reviewer_assignments ENABLE ROW LEVEL SECURITY;

-- Reviewer sees own assignments; admin sees all
CREATE POLICY "reviewer_assignments_select"
  ON public.reviewer_assignments
  FOR SELECT
  USING (
    reviewer_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- Only admin can insert/update/delete assignments
CREATE POLICY "reviewer_assignments_insert_admin"
  ON public.reviewer_assignments
  FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "reviewer_assignments_delete_admin"
  ON public.reviewer_assignments
  FOR DELETE
  USING (public.current_user_role() = 'admin');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reviewer_assignments_reviewer
  ON public.reviewer_assignments (reviewer_id, cycle_id, stage_code);

CREATE INDEX IF NOT EXISTS idx_reviewer_assignments_application
  ON public.reviewer_assignments (application_id);

-- 4. Add reviewer SELECT branch on applications RLS
--    Reviewers can read applications they are explicitly assigned to.
CREATE POLICY "applications_select_reviewer_assigned"
  ON public.applications
  FOR SELECT
  USING (
    public.current_user_role() = 'reviewer'
    AND EXISTS (
      SELECT 1 FROM public.reviewer_assignments ra
      WHERE ra.application_id = applications.id
        AND ra.reviewer_id = auth.uid()
    )
  );
