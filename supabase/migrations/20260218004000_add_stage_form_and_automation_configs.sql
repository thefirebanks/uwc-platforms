alter table public.communication_logs
  add column if not exists trigger_event text,
  add column if not exists subject text,
  add column if not exists body text,
  add column if not exists automation_template_id uuid;

create table if not exists public.cycle_stage_fields (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  stage_code text not null check (stage_code in ('documents', 'exam_placeholder')),
  field_key text not null,
  field_label text not null,
  field_type text not null check (field_type in ('short_text', 'long_text', 'number', 'date', 'email', 'file')),
  is_required boolean not null default false,
  placeholder text,
  help_text text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (cycle_id, stage_code, field_key)
);

create table if not exists public.stage_automation_templates (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  stage_code text not null check (stage_code in ('documents', 'exam_placeholder')),
  trigger_event text not null check (trigger_event in ('application_submitted', 'stage_result')),
  channel text not null default 'email' check (channel in ('email')),
  is_enabled boolean not null default true,
  template_subject text not null,
  template_body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (cycle_id, stage_code, trigger_event, channel)
);

alter table public.cycle_stage_fields enable row level security;
alter table public.stage_automation_templates enable row level security;

create policy "cycle_stage_fields_select_authenticated" on public.cycle_stage_fields
for select
using (auth.uid() is not null);

create policy "cycle_stage_fields_insert_admin_only" on public.cycle_stage_fields
for insert
with check (public.current_user_role() = 'admin');

create policy "cycle_stage_fields_update_admin_only" on public.cycle_stage_fields
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "cycle_stage_fields_delete_admin_only" on public.cycle_stage_fields
for delete
using (public.current_user_role() = 'admin');

create policy "stage_automations_select_authenticated" on public.stage_automation_templates
for select
using (auth.uid() is not null);

create policy "stage_automations_insert_admin_only" on public.stage_automation_templates
for insert
with check (public.current_user_role() = 'admin');

create policy "stage_automations_update_admin_only" on public.stage_automation_templates
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "stage_automations_delete_admin_only" on public.stage_automation_templates
for delete
using (public.current_user_role() = 'admin');

insert into public.cycle_stage_fields (
  cycle_id,
  stage_code,
  field_key,
  field_label,
  field_type,
  is_required,
  placeholder,
  help_text,
  sort_order
)
select
  c.id,
  'documents',
  config.field_key,
  config.field_label,
  config.field_type,
  config.is_required,
  config.placeholder,
  config.help_text,
  config.sort_order
from public.cycles c
cross join (
  values
    ('fullName', 'Nombre completo', 'short_text', true, 'Nombres y apellidos', 'Tal como figura en tu DNI o pasaporte', 1),
    ('dateOfBirth', 'Fecha de nacimiento', 'date', true, null, 'Formato: AAAA-MM-DD', 2),
    ('nationality', 'Nacionalidad', 'short_text', true, 'Peruana', null, 3),
    ('schoolName', 'Colegio', 'short_text', true, 'Nombre del colegio', null, 4),
    ('gradeAverage', 'Promedio (0-20)', 'number', true, 'Ejemplo: 16.5', null, 5),
    ('essay', 'Ensayo personal', 'long_text', true, 'Comparte tu motivación para UWC', 'Mínimo 50 caracteres', 6),
    ('identificationDocument', 'Documento de identificación', 'file', true, null, 'Sube DNI, pasaporte o carné', 7)
) as config(field_key, field_label, field_type, is_required, placeholder, help_text, sort_order)
on conflict (cycle_id, stage_code, field_key) do nothing;

insert into public.stage_automation_templates (
  cycle_id,
  stage_code,
  trigger_event,
  channel,
  is_enabled,
  template_subject,
  template_body
)
select
  c.id,
  'documents',
  'application_submitted',
  'email',
  true,
  'Confirmación de postulación - {{cycle_name}}',
  'Hola {{full_name}}, recibimos tu postulación para {{cycle_name}}. Código de postulación: {{application_id}}.'
from public.cycles c
on conflict (cycle_id, stage_code, trigger_event, channel) do nothing;

insert into public.stage_automation_templates (
  cycle_id,
  stage_code,
  trigger_event,
  channel,
  is_enabled,
  template_subject,
  template_body
)
select
  c.id,
  'documents',
  'stage_result',
  'email',
  false,
  'Actualización de tu postulación - {{cycle_name}}',
  'Hola {{full_name}}, tu estado actual es {{application_status}} en {{cycle_name}}.'
from public.cycles c
on conflict (cycle_id, stage_code, trigger_event, channel) do nothing;
