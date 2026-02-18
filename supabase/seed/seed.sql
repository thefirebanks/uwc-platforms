-- Run after creating auth users from scripts/create-fake-users.ts

insert into public.cycles (name, is_active)
values ('Proceso 2026', true)
on conflict do nothing;

-- Example row for applicant after profile + auth users exist
-- insert into public.applications (applicant_id, cycle_id, payload)
-- values ('<applicant-user-uuid>', (select id from public.cycles where is_active = true limit 1), '{"fullName":"Applicant Demo"}'::jsonb);
