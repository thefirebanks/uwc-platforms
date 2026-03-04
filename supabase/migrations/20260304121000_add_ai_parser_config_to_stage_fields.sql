alter table public.cycle_stage_fields
  add column if not exists ai_parser_config jsonb;
