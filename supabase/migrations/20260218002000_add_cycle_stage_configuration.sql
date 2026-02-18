alter table public.cycles
  add column if not exists stage1_open_at timestamptz,
  add column if not exists stage1_close_at timestamptz,
  add column if not exists stage2_open_at timestamptz,
  add column if not exists stage2_close_at timestamptz,
  add column if not exists max_applications_per_user integer not null default 3;

update public.cycles
set
  stage1_open_at = coalesce(stage1_open_at, created_at),
  stage1_close_at = coalesce(stage1_close_at, created_at + interval '120 days'),
  stage2_open_at = coalesce(stage2_open_at, created_at + interval '121 days'),
  stage2_close_at = coalesce(stage2_close_at, created_at + interval '240 days')
where stage1_open_at is null
   or stage1_close_at is null
   or stage2_open_at is null
   or stage2_close_at is null;
