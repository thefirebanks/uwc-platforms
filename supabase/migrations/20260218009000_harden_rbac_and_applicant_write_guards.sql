create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_user_email() from public;
grant execute on function public.current_user_email() to authenticated, anon, service_role;

alter table public.cycles enable row level security;

drop policy if exists "cycles_select_authenticated" on public.cycles;
drop policy if exists "cycles_insert_admin_only" on public.cycles;
drop policy if exists "cycles_update_admin_only" on public.cycles;
drop policy if exists "cycles_delete_admin_only" on public.cycles;

create policy "cycles_select_authenticated" on public.cycles
for select
using (auth.uid() is not null);

create policy "cycles_insert_admin_only" on public.cycles
for insert
with check (public.current_user_role() = 'admin');

create policy "cycles_update_admin_only" on public.cycles
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "cycles_delete_admin_only" on public.cycles
for delete
using (public.current_user_role() = 'admin');

drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_update_admin_only" on public.profiles;

create policy "profiles_update_self" on public.profiles
for update
using (auth.uid() = id)
with check (
  auth.uid() = id
  and role = public.current_user_role()
  and email = public.current_user_email()
);

create policy "profiles_update_admin_only" on public.profiles
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "recommendations_insert_self" on public.recommendation_requests;

create policy "recommendations_insert_self" on public.recommendation_requests
for insert
with check (
  requester_id = auth.uid()
  and exists (
    select 1
    from public.applications a
    where a.id = recommendation_requests.application_id
      and a.applicant_id = auth.uid()
  )
);

drop policy if exists "audit_events_insert_authenticated" on public.audit_events;

create policy "audit_events_insert_authenticated" on public.audit_events
for insert
with check (auth.uid() is not null and actor_id = auth.uid());

drop policy if exists "bug_reports_insert_authenticated" on public.bug_reports;

create policy "bug_reports_insert_authenticated" on public.bug_reports
for insert
with check (auth.uid() is not null and reporter_id = auth.uid());

create or replace function public.guard_application_mutations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  actor_role text := public.current_user_role();
begin
  if jwt_role = 'service_role' or actor_role = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.applicant_id <> auth.uid() then
      raise exception 'Applicants can only create their own application rows.';
    end if;

    if new.stage_code <> 'documents' then
      raise exception 'Applicants cannot set stage_code directly.';
    end if;

    if new.status <> 'draft' then
      raise exception 'Applicants cannot set status directly.';
    end if;

    if new.validation_notes is not null then
      raise exception 'Applicants cannot set validation notes.';
    end if;

    if coalesce(new.error_report_count, 0) <> 0 then
      raise exception 'Applicants cannot set error_report_count.';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.applicant_id <> old.applicant_id or new.cycle_id <> old.cycle_id then
      raise exception 'Applicants cannot change ownership of an application.';
    end if;

    if new.stage_code <> old.stage_code then
      raise exception 'Applicants cannot change stage_code.';
    end if;

    if coalesce(new.validation_notes, '') <> coalesce(old.validation_notes, '') then
      raise exception 'Applicants cannot edit validation notes.';
    end if;

    if coalesce(new.error_report_count, 0) <> coalesce(old.error_report_count, 0) then
      raise exception 'Applicants cannot edit error counters.';
    end if;

    if new.status <> old.status
       and not (old.status = 'draft' and new.status = 'submitted') then
      raise exception 'Applicants cannot set this status transition.';
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_application_mutations on public.applications;

create trigger trg_guard_application_mutations
before insert or update on public.applications
for each row
execute function public.guard_application_mutations();
