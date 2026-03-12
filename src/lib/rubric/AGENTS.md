# Rubric System

## What this module does
Defines eligibility rubric schemas, evaluation logic, and preset templates
for automatic applicant screening.

## Key files
| File | Purpose |
|------|---------|
| eligibility-rubric.ts | Zod schemas for RubricConfig, criterion types, evaluate functions |
| default-rubric-presets.ts | UWC baseline + OCR template builders |
| wizard-review.ts | Wizard step validation for admin rubric authoring |

## Criterion types
- `field_present` — field must have a value
- `any_of` — composite: pass if any sub-condition matches
- `number_between` — numeric value in [min, max] range
- `file_uploaded` — file must exist for given field key
- `file_upload_count_between` — file count in range
- `ocr_field_in` — OCR-extracted field value in allowed list
- `ocr_field_not_in` — OCR-extracted field NOT in disallowed list
- `field_matches_ocr` — application field matches OCR extraction
- `recommendations_complete` — recommendation requirements met (mentor/friend roles)

## Evaluation outcomes
- `eligible` → application status set to "eligible"
- `not_eligible` → application status set to "ineligible"
- `needs_review` → status stays "submitted" (requires manual review)

## How to extend
1. Add new criterion type to the union in `eligibility-rubric.ts`
2. Add evaluator logic in the evaluation switch block
3. Update `default-rubric-presets.ts` if it belongs in baseline templates
4. Add test cases in `tests/unit/eligibility-rubric-*.test.ts`

## Related
- Server-side orchestration: `src/lib/server/eligibility-rubric-service.ts`
- Admin config stored in: `cycle_stage_templates.admin_config.eligibilityRubric`
- Criteria spec: `docs/RUBRIC_STAGE1_CRITERIA_SPEC.md`
