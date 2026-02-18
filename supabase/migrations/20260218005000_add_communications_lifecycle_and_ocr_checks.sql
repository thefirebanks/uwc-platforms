alter table public.communication_logs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists provider_message_id text;

alter table public.communication_logs
  alter column status set default 'queued';

do $$
begin
  alter table public.communication_logs
    add constraint communication_logs_status_check
    check (status in ('queued', 'processing', 'sent', 'failed'));
exception
  when duplicate_object then null;
end
$$;

create index if not exists idx_communication_logs_status_created
  on public.communication_logs(status, created_at desc);

create index if not exists idx_communication_logs_application_status
  on public.communication_logs(application_id, status);

create table if not exists public.application_ocr_checks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  file_key text not null,
  summary text not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_application_ocr_checks_application_created
  on public.application_ocr_checks(application_id, created_at desc);

alter table public.application_ocr_checks enable row level security;

create policy "application_ocr_checks_select_admin_only" on public.application_ocr_checks
for select
using (public.current_user_role() = 'admin');

create policy "application_ocr_checks_insert_admin_only" on public.application_ocr_checks
for insert
with check (public.current_user_role() = 'admin');
