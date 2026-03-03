alter table public.recommendation_requests
  add column if not exists recommender_name text,
  add column if not exists admin_received_at timestamptz,
  add column if not exists admin_received_by uuid references public.profiles(id),
  add column if not exists admin_received_reason text,
  add column if not exists admin_received_file jsonb not null default '{}'::jsonb,
  add column if not exists admin_notes text;

create index if not exists idx_recommendation_requests_admin_received
  on public.recommendation_requests (application_id, admin_received_at desc);
