alter table public.cycle_stage_templates
add column if not exists admin_config jsonb not null default '{}'::jsonb;
