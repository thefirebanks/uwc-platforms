-- ============================================================
-- Migration: Seed default sections and assign fields
-- ============================================================
-- 1. Seeds the 8 default sections for every existing stage
-- 2. Migrates custom sections from admin_config JSON
-- 3. Applies builtinSectionOrder and hiddenBuiltinSectionIds
-- 4. Assigns section_id on every field using the same logic
--    as the TypeScript classifyApplicantFieldKey() function,
--    with admin_config.fieldSectionAssignments taking priority
-- ============================================================

-- ─── Helper: classify a field_key into a section_key ─────────
-- Replicates classifyApplicantFieldKey() from applicant-sections.ts
create or replace function pg_temp.classify_field_key(fk text)
returns text language plpgsql immutable as $$
begin
  -- Custom prefixes (checked first, same as TS)
  if fk like 'identityCustom%' then return 'identity'; end if;
  if fk like 'guardianCustom%' then return 'family'; end if;
  if fk like 'schoolCustom%'   then return 'school'; end if;
  if fk like 'motivationCustom%' then return 'motivation'; end if;
  if fk like 'recommenderCustom%' then return 'recommenders'; end if;
  if fk like 'docsCustom%'     then return 'documents'; end if;

  -- Eligibility prefix + exact keys
  if fk like 'eligibility%' then return 'eligibility'; end if;
  if fk in (
    'secondNationality', 'secondaryYear2025', 'isUpperThird',
    'hasMinimumAverage14', 'hasStudiedIb', 'ibInstructionYear',
    'priorUwcPeruSelectionParticipation', 'otherCountrySelection2025',
    'uwcDiscoveryChannel'
  ) then return 'eligibility'; end if;

  -- Family prefix
  if fk like 'guardian%' then return 'family'; end if;

  -- School: officialGrade_ prefix + exact keys
  if fk like 'officialGrade\_%' escape '\' or fk like 'officialGradeAverage\_%' escape '\' then
    return 'school';
  end if;
  if fk in (
    'schoolName', 'gradeAverage', 'schoolDirectorName', 'schoolDirectorEmail',
    'schoolAddressLine', 'schoolAddressNumber', 'schoolDistrict', 'schoolProvince',
    'schoolRegion', 'schoolCountry', 'yearsInCurrentSchool', 'schoolPublicOrPrivate',
    'schoolTypeDetails', 'receivedSchoolScholarship', 'officialGradesComments'
  ) then return 'school'; end if;

  -- Recommender exact keys
  if fk in (
    'recommenderRequestMessage', 'mentorRecommenderName', 'friendRecommenderName'
  ) then return 'recommenders'; end if;

  -- Document exact keys
  if fk in (
    'paymentOperationNumber', 'receivedFinancialAidForFee'
  ) then return 'documents'; end if;

  -- Motivation exact keys
  if fk in (
    'essay', 'whyShouldBeSelected', 'preferredUwcColleges', 'activityOne',
    'recognition', 'favoriteKnowledgeArea', 'freeTimeActivities',
    'selfDescriptionThreeWords'
  ) then return 'motivation'; end if;

  -- Identity exact keys (checked last, same as TS)
  if fk in (
    'fullName', 'firstName', 'paternalLastName', 'maternalLastName',
    'documentType', 'documentNumber', 'dateOfBirth', 'ageAtEndOf2025',
    'gender', 'nationality', 'countryOfBirth', 'countryOfResidence',
    'homeAddressLine', 'homeAddressNumber', 'homeDistrict', 'homeProvince',
    'homeRegion', 'mobilePhone', 'landlineOrAlternativePhone',
    'hasDisability', 'hasLearningDisability'
  ) then return 'identity'; end if;

  -- Fallback
  return 'other';
end;
$$;

-- ─── Step 1: Seed 8 default sections per existing stage ──────
insert into public.stage_sections (cycle_id, stage_code, section_key, title, description, sort_order, is_visible)
select
  t.cycle_id,
  t.stage_code,
  s.section_key,
  s.title,
  s.description,
  s.sort_order,
  true
from public.cycle_stage_templates t
cross join (values
  ('eligibility',   'Elegibilidad',                       'Validamos criterios base del proceso 2026.',                          1),
  ('identity',      'Datos personales',                   'Informacion de identidad, contacto y contexto personal.',             2),
  ('family',        'Familia y apoderados',               'Datos de madre/padre/apoderado y custodia legal.',                    3),
  ('school',        'Colegio y rendimiento academico',    'Datos del colegio y notas oficiales por ano.',                        4),
  ('motivation',    'Motivacion y perfil',                'Comparte tu historia, intereses y por que UWC es tu camino.',          5),
  ('recommenders',  'Contexto de recomendadores',         'Datos de referencia para coordinar recomendaciones.',                  6),
  ('documents',     'Documentos y pagos',                 'Informacion de pago y documentacion requerida.',                      7),
  ('other',         'Otros campos',                       'Campos activos personalizados fuera del esquema base.',               8)
) as s(section_key, title, description, sort_order)
on conflict (cycle_id, stage_code, section_key) do nothing;

-- ─── Step 2: Migrate custom sections from admin_config ───────
insert into public.stage_sections (cycle_id, stage_code, section_key, title, description, sort_order, is_visible)
select
  t.cycle_id,
  t.stage_code,
  cs->>'id',
  coalesce(nullif(trim(cs->>'title'), ''), 'Nueva seccion'),
  'Campos personalizados adicionales de esta etapa.',
  8 + coalesce((cs->>'order')::int, 1),
  true
from public.cycle_stage_templates t,
  jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(t.admin_config->'customSections', '[]'::jsonb)) = 'array'
      then t.admin_config->'customSections'
      else '[]'::jsonb
    end
  ) as cs
where (cs->>'id') is not null
  and trim(cs->>'id') <> ''
on conflict (cycle_id, stage_code, section_key) do nothing;

-- ─── Step 3: Apply builtinSectionOrder from admin_config ─────
-- For stages that have a custom order, update sort_order to match
do $$
declare
  tmpl record;
  order_arr jsonb;
  section_key_val text;
  idx int;
begin
  for tmpl in
    select cycle_id, stage_code, admin_config
    from public.cycle_stage_templates
    where admin_config->'builtinSectionOrder' is not null
      and jsonb_typeof(admin_config->'builtinSectionOrder') = 'array'
      and jsonb_array_length(admin_config->'builtinSectionOrder') > 0
  loop
    order_arr := tmpl.admin_config->'builtinSectionOrder';
    for idx in 0 .. jsonb_array_length(order_arr) - 1 loop
      section_key_val := order_arr->>idx;
      if section_key_val is not null then
        update public.stage_sections
        set sort_order = idx + 1
        where cycle_id = tmpl.cycle_id
          and stage_code = tmpl.stage_code
          and section_key = section_key_val;
      end if;
    end loop;
  end loop;
end;
$$;

-- ─── Step 4: Apply hiddenBuiltinSectionIds ───────────────────
do $$
declare
  tmpl record;
  hidden_arr jsonb;
  section_key_val text;
  idx int;
begin
  for tmpl in
    select cycle_id, stage_code, admin_config
    from public.cycle_stage_templates
    where admin_config->'hiddenBuiltinSectionIds' is not null
      and jsonb_typeof(admin_config->'hiddenBuiltinSectionIds') = 'array'
      and jsonb_array_length(admin_config->'hiddenBuiltinSectionIds') > 0
  loop
    hidden_arr := tmpl.admin_config->'hiddenBuiltinSectionIds';
    for idx in 0 .. jsonb_array_length(hidden_arr) - 1 loop
      section_key_val := hidden_arr->>idx;
      if section_key_val is not null and section_key_val <> 'other' then
        update public.stage_sections
        set is_visible = false
        where cycle_id = tmpl.cycle_id
          and stage_code = tmpl.stage_code
          and section_key = section_key_val;
      end if;
    end loop;
  end loop;
end;
$$;

-- ─── Step 5: Assign section_id on every field ────────────────
-- First: respect explicit fieldSectionAssignments from admin_config
do $$
declare
  tmpl record;
  assignments jsonb;
  field_key_val text;
  section_key_val text;
  section_uuid uuid;
begin
  for tmpl in
    select cycle_id, stage_code, admin_config
    from public.cycle_stage_templates
    where admin_config->'fieldSectionAssignments' is not null
      and jsonb_typeof(admin_config->'fieldSectionAssignments') = 'object'
  loop
    assignments := tmpl.admin_config->'fieldSectionAssignments';
    for field_key_val, section_key_val in
      select key, value#>>'{}'
      from jsonb_each(assignments)
    loop
      -- Find the section UUID
      select id into section_uuid
      from public.stage_sections
      where cycle_id = tmpl.cycle_id
        and stage_code = tmpl.stage_code
        and section_key = section_key_val
      limit 1;

      if section_uuid is not null then
        update public.cycle_stage_fields
        set section_id = section_uuid
        where cycle_id = tmpl.cycle_id
          and stage_code = tmpl.stage_code
          and field_key = field_key_val
          and section_id is null;
      end if;
    end loop;
  end loop;
end;
$$;

-- Second: auto-classify remaining fields (no explicit assignment)
update public.cycle_stage_fields f
set section_id = s.id
from public.stage_sections s
where f.section_id is null
  and f.cycle_id = s.cycle_id
  and f.stage_code = s.stage_code
  and s.section_key = pg_temp.classify_field_key(f.field_key);

-- ─── Step 6: Verification ────────────────────────────────────
-- Log count of fields still without section_id (should be 0)
do $$
declare
  unassigned_count int;
begin
  select count(*) into unassigned_count
  from public.cycle_stage_fields
  where section_id is null;

  if unassigned_count > 0 then
    raise notice 'WARNING: % fields still have no section_id after migration', unassigned_count;
    -- Assign remaining to "other" as fallback
    update public.cycle_stage_fields f
    set section_id = s.id
    from public.stage_sections s
    where f.section_id is null
      and f.cycle_id = s.cycle_id
      and f.stage_code = s.stage_code
      and s.section_key = 'other';
    raise notice 'Assigned remaining fields to "other" section';
  end if;
end;
$$;
