create table if not exists public.communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  name text not null,
  subject text not null,
  body_template text not null,
  recipient_filter jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  idempotency_key text not null unique,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.communication_campaigns enable row level security;

drop policy if exists "communication_campaigns_admin_only" on public.communication_campaigns;
create policy "communication_campaigns_admin_only" on public.communication_campaigns
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

alter table public.communication_logs
  add column if not exists campaign_id uuid references public.communication_campaigns(id) on delete set null,
  add column if not exists idempotency_key text;

create index if not exists idx_communication_logs_campaign
  on public.communication_logs (campaign_id, created_at desc);

create index if not exists idx_communication_logs_idempotency
  on public.communication_logs (idempotency_key);
