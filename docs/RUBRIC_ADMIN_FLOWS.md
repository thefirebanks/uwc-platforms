# Rubric Admin Flows

This is the full flow inventory for rubric authoring and execution in Stage 1, plus where each flow is tested.

## Authoring flows (wizard-first)

1. `F01` Start wizard and configure all required mappings in Step 1.
2. `F02` Move from Step 1 to Step 2 only when required mappings are complete.
3. `F03` Configure Step 2 policy thresholds (allowed years + minimum average).
4. `F04` Move from Step 2 to Step 3 only when thresholds are valid.
5. `F05` Activate compiled rubric from Step 3.
6. `F06` Save stage config with wizard-derived blueprint + compiled rubric + rubric meta.
7. `F07` Reload page and confirm wizard remains the default authoring mode.
8. `F08` Use “Recargar sugerencias desde campos” to repopulate missing wizard values.

## Validation and blocking flows

1. `F09` Missing required mapping in Step 1 shows blocking errors.
2. `F10` Invalid Step 2 thresholds show blocking errors and prevent progression.
3. `F11` Saving with incomplete wizard setup is blocked with plain-language error.
4. `F12` Invalid Advanced JSON shows rubric validation errors.
5. `F13` Attempting to switch Advanced JSON -> Guided while JSON is invalid is blocked.

## Advanced customization flows

1. `F14` Open Advanced tab and inspect compiled rubric in JSON mode.
2. `F15` Edit Advanced rubric JSON and mark divergence from wizard.
3. `F16` Reset advanced divergence back to wizard preset safely.
4. `F17` Validate advanced rubric before save.

## Rubric execution flows (candidates dashboard)

1. `F18` Run rubric manually with selected cycle and stage.
2. `F19` Running rubric without selecting a cycle is blocked in UI.
3. `F20` Running rubric against stage with missing/disabled rubric returns explicit error feedback.

## Compatibility and resilience flows

1. `F21` Hydrate wizard blueprint from compiled rubric when possible.
2. `F22` Preserve existing advanced custom rubric without data loss.
3. `F23` Evaluate identity OCR criteria across all mapped identity file keys.
4. `F24` Strict recommendation completeness routes manual-only submissions to `needs_review`.

## Current test mapping

1. `F01/F02/F03/F05/F06/F14` covered by `Flow 1: wizard happy path compiles rubric and allows save` in [admin-rubric-flows.spec.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/e2e/admin-rubric-flows.spec.ts).
2. `F09/F11` covered by `Flow 2: wizard blocks progress and save when required mapping is missing` in [admin-rubric-flows.spec.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/e2e/admin-rubric-flows.spec.ts).
3. `F15/F16` covered by `Flow 3: advanced edits mark divergence and can reset back to wizard` in [admin-rubric-flows.spec.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/e2e/admin-rubric-flows.spec.ts).
4. `F04/F10` covered by `Flow 4: wizard step 2 blocks invalid thresholds` in [admin-rubric-flows.spec.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/e2e/admin-rubric-flows.spec.ts).
5. `F08` covered by `Flow 5: recargar sugerencias repopulates wizard mappings` in [admin-rubric-flows.spec.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/e2e/admin-rubric-flows.spec.ts).
6. `F12/F17` covered by `Flow 6: advanced JSON invalid shows errors and save is blocked` in [admin-rubric-flows.spec.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/e2e/admin-rubric-flows.spec.ts).
7. `F13` covered by `Flow 7: advanced JSON errors prevent switching back to guided mode` in [admin-rubric-flows.spec.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/e2e/admin-rubric-flows.spec.ts).
8. `F07` covered by `Flow 8: wizard save survives reload and remains active` in [admin-rubric-flows.spec.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/e2e/admin-rubric-flows.spec.ts).
9. `F19` covered by `Flow 9: candidates dashboard requires cycle selection before running rubric` in [admin-rubric-flows.spec.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/e2e/admin-rubric-flows.spec.ts).
10. `F18/F20` covered by `captures rubric execution feedback in candidates dashboard` in [admin-rubric-visual.spec.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/e2e/admin-rubric-visual.spec.ts).
11. `F21/F23` covered by [eligibility-rubric-presets.test.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/unit/eligibility-rubric-presets.test.ts) and [eligibility-rubric-service.test.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/unit/eligibility-rubric-service.test.ts).
12. `F24` covered by [eligibility-rubric-service.test.ts](/Users/dafirebanks/Projects/uwc-platforms/tests/unit/eligibility-rubric-service.test.ts).

## Remaining known risk areas to watch

1. Stage-specific candidate fixtures are sparse, so some dashboard execution tests validate error/surface behavior more than deep per-candidate outcome deltas.
2. Wizard hydration falls back to Advanced when a rubric is heavily customized outside the blueprint model; this is expected but should be monitored with telemetry.
