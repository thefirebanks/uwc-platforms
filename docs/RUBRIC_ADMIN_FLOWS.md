# Rubric Admin Flows

This document defines the admin flows for configuring and operating automated rubric review.

## Flow 1: Start from guided mode with a baseline rubric template
- Goal: quickly enable first-pass automatic screening with common criteria.
- Admin actions:
  - Open stage settings (`Ajustes y Reglas`) in Stage 1.
  - Keep `Modo guiado` selected.
  - Click `Usar plantilla básica`.
  - (Optional) adjust criteria from dropdowns/inputs.
  - Validate, then save.
- Expected result:
  - Rubric is valid and persisted without writing JSON.
  - Includes baseline checks for required fields, required files, and recommendations.

## Flow 1B: Start from UWC assistant preset (recommended)
- Goal: configure Stage 1 rubric quickly using DB-backed field mappings.
- Admin actions:
  - Open `Ajustes y Reglas` and find `Asistente rápido: Rúbrica UWC Perú`.
  - Confirm mapped field keys (identity files, grades docs, name, average grade, authorization, photo).
  - Adjust OCR JSON paths and thresholds (birth years, average minimum, recommendation completeness) as needed.
  - Click `Aplicar rúbrica UWC Perú`, validate, and save.
- Expected result:
  - A default rubric is generated for UWC Stage 1 criteria with editable rules.
  - The generated config remains fully modifiable in guided mode or advanced JSON.

## Flow 2: Add OCR confidence gating for manual-review fallback
- Goal: route low-confidence OCR outcomes to humans while keeping deterministic pass/fail checks.
- Admin actions:
  - Click `Usar plantilla con OCR`.
  - Adjust `fileKey` and `minConfidence` if needed.
  - Save.
- Expected result:
  - OCR confidence criteria evaluate to `needs_review` when confidence is low/missing.

## Flow 3: Use advanced JSON only for edge cases
- Goal: keep full flexibility for complex business rules without blocking non-technical usage.
- Admin actions:
  - Switch to `JSON avanzado`.
  - Edit JSON directly in the rubric editor.
  - Click `Validar rúbrica` before save.
  - Save only once validation passes.
- Expected result:
  - Detailed validation feedback for malformed or semantically invalid config.
  - When JSON is valid, guided mode stays synchronized with that config.

## Supported advanced rule primitives
- `ocr_field_in`: validate OCR extracted values against an allowed list.
- `ocr_field_not_in`: flag OCR extracted exception values for review.
- `field_matches_ocr`: compare applicant payload value with OCR extraction.
- `file_upload_count_between`: enforce/range-check number of uploaded files across keys.
- `any_of`: pass criterion when at least one condition matches (supports OR scenarios).

## Flow 4: Prevent invalid rubric configurations
- Goal: stop invalid logic from reaching runtime.
- Guardrails enforced:
  - Enabled rubric must contain at least one criterion.
  - Criterion IDs must be unique.
  - `number_between` requires `min <= max` when both are set.
  - Duplicate keys/values inside criteria are rejected.
- Expected result:
  - Save is blocked with explicit error messages.

## Flow 5: Run rubric evaluation on demand from candidates dashboard
- Goal: execute automatic review when admin decides (or after deadline in future automation).
- Admin actions:
  - Open `/admin/candidates`.
  - Select cycle/stage.
  - Click `Ejecutar rúbrica automática`.
- Expected result:
  - API executes evaluation.
  - Feedback message shows evaluated counts by outcome.
  - `Dictamen automático` column updates (`Elegible`, `No elegible`, `Revisión manual`).

## Flow 6: Handle stage without rubric safely
- Goal: avoid silent failure.
- Admin actions:
  - Run rubric in stage with rubric disabled or empty.
- Expected result:
  - Clear user-facing message indicates rubric is disabled or unconfigured.

## Browser test coverage
- `tests/e2e/admin-rubric-flows.spec.ts`
  - Flow 1, 3, 4 plus guided criterion authoring via stage settings UI interactions.
- `tests/e2e/admin-rubric-automation.spec.ts`
  - Flow 5 and 6 via candidates dashboard execution path.
