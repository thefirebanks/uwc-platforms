# Rubric Admin Flows

This document defines the admin flows for configuring and operating automated rubric review.

## Flow 1: Wizard happy path (recommended)
- Goal: configure Stage 1 rubric in business language without touching JSON.
- Admin actions:
  - Open stage settings (`Ajustes y Reglas`) in Stage 1.
  - Keep `Modo guiado (recomendado)`.
  - Step 1: map evidence sources (identity files, grades files, name field, grade field, authorization, photo, OCR paths).
  - Step 2: define policy thresholds (allowed birth years, minimum average).
  - Step 3: review summary and click `Activar rúbrica de esta etapa`.
  - Save configuration.
- Expected result:
  - `admin_config.rubricBlueprintV1` and compiled `admin_config.eligibilityRubric` persist together.
  - Runtime rubric is generated deterministically from wizard inputs.

## Flow 2: Wizard blocking validation
- Goal: prevent partial/incomplete rubric setup from being activated.
- Admin actions:
  - Leave a required mapping empty (for example applicant name field).
  - Click `Continuar` in Step 1.
- Expected result:
  - Wizard shows `Bloqueos del wizard` with plain-language issues.
  - Save remains blocked when rubric activation is incomplete.

## Flow 3: Advanced mode for edge cases
- Goal: keep full flexibility for complex business rules without blocking non-technical usage.
- Admin actions:
  - Switch from wizard to `Advanced`.
  - Use criterion-level editor (`Modo guiado`) or `JSON avanzado`.
  - Validate rubric before save.
- Expected result:
  - Detailed validation feedback for malformed or semantically invalid config.
  - Advanced edits can diverge from wizard.

## Flow 4: Reset advanced divergence to wizard
- Goal: recover from complex custom edits and return to default rubric authoring.
- Admin actions:
  - Make a change in Advanced mode.
  - Click `Restablecer al wizard`.
- Expected result:
  - Wizard becomes active again.
  - Compiled runtime rubric is regenerated from blueprint draft.

## Supported advanced rule primitives
- `ocr_field_in`: validate OCR extracted values against an allowed list.
- `ocr_field_not_in`: flag OCR extracted exception values for review.
- `field_matches_ocr`: compare applicant payload value with OCR extraction.
- `file_upload_count_between`: enforce/range-check number of uploaded files across keys.
- `any_of`: pass criterion when at least one condition matches (supports OR scenarios).

## Flow 5: Prevent invalid rubric configurations
- Goal: stop invalid logic from reaching runtime.
- Guardrails enforced:
  - Enabled rubric must contain at least one criterion.
  - Criterion IDs must be unique.
  - `number_between` requires `min <= max` when both are set.
  - Duplicate keys/values inside criteria are rejected.
- Expected result:
  - Save is blocked with explicit error messages.

## Flow 6: Run rubric evaluation on demand from candidates dashboard
- Goal: execute automatic review when admin decides.
- Admin actions:
  - Open `/admin/candidates`.
  - Select cycle/stage.
  - Click `Ejecutar rúbrica automática`.
- Expected result:
  - API executes evaluation.
  - Feedback message shows evaluated counts by outcome.
  - `Dictamen automático` column updates (`Elegible`, `No elegible`, `Revisión manual`).

## Flow 7: Handle stage without rubric safely
- Goal: avoid silent failure.
- Admin actions:
  - Run rubric in stage with rubric disabled or empty.
- Expected result:
  - Clear user-facing message indicates rubric is disabled or unconfigured.

## Browser test coverage
- `tests/e2e/admin-rubric-flows.spec.ts`
  - Wizard happy path, blocking validation, advanced divergence/reset.
- `tests/e2e/admin-rubric-visual.spec.ts`
  - Wizard Step 1/2/3 visual states, blocking state, candidates execution feedback screenshot.
