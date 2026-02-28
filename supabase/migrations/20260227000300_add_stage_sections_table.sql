-- ============================================================
-- Migration: Add stage_sections table + section_id FK on fields
-- ============================================================
-- Moves form section definitions from hardcoded TypeScript
-- constants into a proper database table. Each stage can have
-- its own set of sections (default 8 seeded on creation).
-- ============================================================

-- 1. Create the stage_sections table
create table if not exists public.stage_sections (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  stage_code text not null,
  section_key text not null,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (cycle_id, stage_code, section_key)
);

-- 2. Add section_id column to cycle_stage_fields
alter table public.cycle_stage_fields
  add column if not exists section_id uuid references public.stage_sections(id) on delete set null;

-- 3. RLS policies (follow cycle_stage_fields pattern)
alter table public.stage_sections enable row level security;

create policy "stage_sections_select_authenticated" on public.stage_sections
for select
using (auth.uid() is not null);

create policy "stage_sections_insert_admin_only" on public.stage_sections
for insert
with check (public.current_user_role() = 'admin');

create policy "stage_sections_update_admin_only" on public.stage_sections
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "stage_sections_delete_admin_only" on public.stage_sections
for delete
using (public.current_user_role() = 'admin');

-- 4. Index for fast lookups
create index if not exists idx_stage_sections_cycle_stage
  on public.stage_sections (cycle_id, stage_code);

create index if not exists idx_cycle_stage_fields_section_id
  on public.cycle_stage_fields (section_id);
