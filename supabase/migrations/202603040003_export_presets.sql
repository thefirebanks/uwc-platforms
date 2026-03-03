create table if not exists public.export_presets (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  name text not null,
  selected_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.export_presets enable row level security;

drop policy if exists "export_presets_admin_only" on public.export_presets;
create policy "export_presets_admin_only" on public.export_presets
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create index if not exists idx_export_presets_cycle
  on public.export_presets (cycle_id, updated_at desc);
