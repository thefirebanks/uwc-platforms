create extension if not exists "pgcrypto";

create table if not exists public.cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('admin', 'applicant')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  cycle_id uuid not null references public.cycles(id),
  stage_code text not null default 'documents' check (stage_code in ('documents', 'exam_placeholder')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'eligible', 'ineligible', 'advanced')),
  payload jsonb not null default '{}'::jsonb,
  files jsonb not null default '{}'::jsonb,
  validation_notes text,
  error_report_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.recommendation_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recommender_email text not null,
  token uuid not null unique,
  submitted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stage_transitions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  from_stage text not null check (from_stage in ('documents', 'exam_placeholder')),
  to_stage text not null check (to_stage in ('documents', 'exam_placeholder')),
  reason text not null,
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.exam_imports (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  applicant_email text not null,
  score numeric not null,
  passed boolean not null,
  imported_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  template_key text not null,
  recipient_email text not null,
  status text not null,
  error_message text,
  sent_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  application_id uuid references public.applications(id),
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  request_id uuid not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id),
  error_id text not null,
  context text not null,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_applications_applicant on public.applications(applicant_id);
create index if not exists idx_applications_stage_status on public.applications(stage_code, status);
create index if not exists idx_audit_events_request_id on public.audit_events(request_id);
create index if not exists idx_stage_transitions_app on public.stage_transitions(application_id);

insert into public.cycles (name, is_active)
select 'Proceso 2026', true
where not exists (select 1 from public.cycles where is_active = true);

insert into storage.buckets (id, name, public)
values ('application-documents', 'application-documents', false)
on conflict (id) do nothing;

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.recommendation_requests enable row level security;
alter table public.stage_transitions enable row level security;
alter table public.exam_imports enable row level security;
alter table public.communication_logs enable row level security;
alter table public.audit_events enable row level security;
alter table public.bug_reports enable row level security;

create policy "profiles_select_self_or_admin" on public.profiles
for select
using (auth.uid() = id or public.current_user_role() = 'admin');

create policy "profiles_insert_self" on public.profiles
for insert
with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles
for update
using (auth.uid() = id);

create policy "applications_select_self_or_admin" on public.applications
for select
using (applicant_id = auth.uid() or public.current_user_role() = 'admin');

create policy "applications_insert_self" on public.applications
for insert
with check (applicant_id = auth.uid());

create policy "applications_update_self_or_admin" on public.applications
for update
using (applicant_id = auth.uid() or public.current_user_role() = 'admin');

create policy "recommendations_select_self_or_admin" on public.recommendation_requests
for select
using (
  requester_id = auth.uid()
  or public.current_user_role() = 'admin'
);

create policy "recommendations_insert_self" on public.recommendation_requests
for insert
with check (requester_id = auth.uid());

create policy "stage_transitions_admin_only" on public.stage_transitions
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "exam_imports_admin_only" on public.exam_imports
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "communication_logs_admin_only" on public.communication_logs
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "audit_events_select_admin_only" on public.audit_events
for select
using (public.current_user_role() = 'admin');

create policy "audit_events_insert_authenticated" on public.audit_events
for insert
with check (auth.uid() is not null);

create policy "bug_reports_select_admin_only" on public.bug_reports
for select
using (public.current_user_role() = 'admin');

create policy "bug_reports_insert_authenticated" on public.bug_reports
for insert
with check (auth.uid() is not null);
