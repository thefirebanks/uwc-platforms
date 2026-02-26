alter table public.cycle_stage_templates
  drop constraint if exists cycle_stage_templates_stage_code_check;

alter table public.cycle_stage_templates
  add constraint cycle_stage_templates_stage_code_check
  check (
    stage_code in ('documents', 'exam_placeholder')
    or stage_code like 'custom_stage_%'
  );
