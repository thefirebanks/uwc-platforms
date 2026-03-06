# Rubric Hardening Notes

## Gaps discovered during browser and test runs

1. API error feedback on rubric execution was too generic in candidates dashboard.
- Symptom: on 422 responses, UI often showed `No se pudo ejecutar la rúbrica automática.` instead of the precise backend message.
- Fix: dashboard now reads `message` from API error payload and displays it with error styling.

2. Rubric authoring validation did not provide actionable detail.
- Symptom: admins saw a generic invalid-format error with no path-level guidance.
- Fix: added structured validation with path-specific messages (duplicate IDs, invalid ranges, duplicate values, enabled-without-criteria).

3. Authoring flow was slow for first-time admins.
- Symptom: JSON-only entry required starting from scratch.
- Fix: replaced JSON-only authoring with dual mode (`Modo guiado` + `JSON avanzado`) and kept quick actions: baseline template, OCR template, validate rubric.

4. Search endpoint could fail before migration was applied.
- Symptom: `/admin/candidates` emitted server errors if `application_stage_evaluations` table was missing in DB cache.
- Fix: search now degrades gracefully (logs warning, continues without `reviewOutcome` data).

5. Rubric template semantics for uploaded files were incorrect.
- Symptom: baseline template used payload presence checks for file inputs.
- Fix: baseline template now uses `file_uploaded` criteria for document keys.

6. Real admissions criteria required richer logic than simple field checks.
- Symptom: criteria like “top-third proof OR minimum average”, OCR exception flags, and name-vs-ID consistency were awkward or impossible.
- Fix: added extensible criterion primitives (`any_of`, `ocr_field_in`, `ocr_field_not_in`, `field_matches_ocr`, `file_upload_count_between`) plus a UWC assistant preset that maps rules from DB-backed stage fields.

## Implemented verification
- Unit tests: rubric schema, rubric evaluator, search fallback behavior.
- Browser E2E tests: admin rubric authoring flows and execution flows.
