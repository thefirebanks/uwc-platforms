create table if not exists public.cycle_stage_templates (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  stage_code text not null check (stage_code in ('documents', 'exam_placeholder')),
  stage_label text not null,
  milestone_label text not null,
  due_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (cycle_id, stage_code)
);

insert into public.cycle_stage_templates (
  cycle_id,
  stage_code,
  stage_label,
  milestone_label,
  due_at,
  sort_order
)
select
  c.id,
  'documents',
  'Stage 1: Documentos',
  'Recepción y validación documental',
  c.stage1_close_at,
  1
from public.cycles c
on conflict (cycle_id, stage_code) do nothing;

insert into public.cycle_stage_templates (
  cycle_id,
  stage_code,
  stage_label,
  milestone_label,
  due_at,
  sort_order
)
select
  c.id,
  'exam_placeholder',
  'Stage 2: Examen (placeholder)',
  'Evaluación externa y consolidación',
  c.stage2_close_at,
  2
from public.cycles c
on conflict (cycle_id, stage_code) do nothing;

alter table public.cycle_stage_templates enable row level security;

create policy "cycle_stage_templates_select_authenticated" on public.cycle_stage_templates
for select
using (auth.uid() is not null);

create policy "cycle_stage_templates_insert_admin_only" on public.cycle_stage_templates
for insert
with check (public.current_user_role() = 'admin');

create policy "cycle_stage_templates_update_admin_only" on public.cycle_stage_templates
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "cycle_stage_templates_delete_admin_only" on public.cycle_stage_templates
for delete
using (public.current_user_role() = 'admin');
