# Rubric Admin Flows

This document defines the admin flows for configuring and operating automated rubric review.

## Flow 1: Start from a baseline rubric template
- Goal: quickly enable first-pass automatic screening with common criteria.
- Admin actions:
  - Open stage settings (`Ajustes y Reglas`) in Stage 1.
  - Click `Usar plantilla básica`.
  - Validate, then save.
- Expected result:
  - Rubric JSON is valid and persisted.
  - Includes baseline checks for required fields, required files, and recommendations.

## Flow 2: Add OCR confidence gating for manual-review fallback
- Goal: route low-confidence OCR outcomes to humans while keeping deterministic pass/fail checks.
- Admin actions:
  - Click `Usar plantilla con OCR`.
  - Adjust `fileKey` and `minConfidence` if needed.
  - Save.
- Expected result:
  - OCR confidence criteria evaluate to `needs_review` when confidence is low/missing.

## Flow 3: Author a custom rubric manually in JSON
- Goal: allow full flexibility for complex business rules.
- Admin actions:
  - Edit JSON directly in the rubric editor.
  - Click `Validar rúbrica` before save.
  - Save only once validation passes.
- Expected result:
  - Detailed validation feedback for malformed or semantically invalid config.

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
  - Flow 1, 3, 4 via stage settings UI interactions.
- `tests/e2e/admin-rubric-automation.spec.ts`
  - Flow 5 and 6 via candidates dashboard execution path.
