# Stage Management

## What this module does
Stage configuration, field templates, form schema generation, section
grouping, and application transition rules.

## Key files
| File | Purpose |
|------|---------|
| config.ts | Allowed stage codes (constants) |
| templates.ts | Default field/template/automation builders for new stages |
| form-schema.ts | Generate dynamic Zod validation from DB field config |
| applicant-sections.ts | Map fields to wizard steps for the applicant form |
| field-sub-groups.ts | Visual sub-groups within form sections |
| transition.ts | Stage transition rules and guards |
| stage-field-fallback.ts | Fallback values when field config is missing |
| stage-admin-config.ts | Admin-configurable stage settings |

## How stages work
1. Admin creates a cycle → `templates.ts` bootstraps default fields, sections, automations
2. Admin customizes via `stage-config-editor` component
3. Config persisted via `src/lib/server/stage-config-persistence.ts`
4. Applicant form renders fields based on DB config (`cycle_stage_fields` table)
5. Transitions guarded by `transition.ts` rules

## How to extend
- **New stage**: update `config.ts` ALLOWED_STAGES, add transition rules
  in `transition.ts`, add default fields in `templates.ts`
- **New field type**: update `form-schema.ts` validation + `templates.ts`
- **New section**: add to `stage_sections` DB table (DB-driven, not hardcoded)

## DB tables
- `cycle_stage_fields` — individual field definitions
- `stage_sections` — section definitions (single source of truth)
- `cycle_stage_templates` — stage-level config including rubric, automations
