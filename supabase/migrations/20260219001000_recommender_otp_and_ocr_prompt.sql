alter table public.recommendation_requests
  add column if not exists role text,
  add column if not exists status text not null default 'invited',
  add column if not exists invite_sent_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidation_reason text,
  add column if not exists reminder_count integer not null default 0,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists otp_code_hash text,
  add column if not exists otp_sent_at timestamptz,
  add column if not exists otp_attempt_count integer not null default 0,
  add column if not exists otp_verified_at timestamptz,
  add column if not exists access_expires_at timestamptz,
  add column if not exists session_token_hash text,
  add column if not exists session_expires_at timestamptz,
  add column if not exists responses jsonb not null default '{}'::jsonb;

update public.recommendation_requests
set role = 'friend'
where role is null;

update public.recommendation_requests
set status = case
  when submitted_at is not null then 'submitted'
  else 'sent'
end
where status is null;

update public.recommendation_requests
set access_expires_at = timezone('utc', now()) + interval '45 day'
where access_expires_at is null;

alter table public.recommendation_requests
  alter column role set not null,
  alter column role set default 'friend',
  alter column status set default 'invited',
  alter column access_expires_at set default (timezone('utc', now()) + interval '45 day');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recommendation_requests_role_check'
  ) then
    alter table public.recommendation_requests
      add constraint recommendation_requests_role_check
      check (role in ('mentor', 'friend'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'recommendation_requests_status_check'
  ) then
    alter table public.recommendation_requests
      add constraint recommendation_requests_status_check
      check (status in ('invited', 'sent', 'opened', 'in_progress', 'submitted', 'invalidated', 'expired'));
  end if;
end $$;

create index if not exists idx_recommendation_requests_application_role
  on public.recommendation_requests(application_id, role, created_at desc);

create index if not exists idx_recommendation_requests_status
  on public.recommendation_requests(status, created_at desc);

drop policy if exists "recommendations_select_self_or_admin" on public.recommendation_requests;
drop policy if exists "recommendations_insert_self" on public.recommendation_requests;
drop policy if exists "recommendations_update_self_or_admin" on public.recommendation_requests;

create policy "recommendations_select_admin_only" on public.recommendation_requests
for select
using (public.current_user_role() = 'admin');

create policy "recommendations_insert_admin_only" on public.recommendation_requests
for insert
with check (public.current_user_role() = 'admin');

create policy "recommendations_update_admin_only" on public.recommendation_requests
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

alter table public.cycle_stage_templates
  add column if not exists ocr_prompt_template text;

update public.cycle_stage_templates
set ocr_prompt_template = coalesce(
  ocr_prompt_template,
  'Analiza el documento y genera una validación preliminar para comité. Resume hallazgos clave (legibilidad, coincidencia de datos visibles y señales de alteración).'
)
where stage_code = 'documents';
