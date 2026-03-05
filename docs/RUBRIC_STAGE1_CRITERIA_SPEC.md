# Stage 1 Rubric Criteria (UWC Perú)

This file captures the baseline criteria shared by admissions for first-pass automatic review.

## Core Criteria

1. Identity document uploaded
- Accepts one of: `DNI`, `Pasaporte`, `Carnet de extranjería`.
- If no valid identity document is found, applicant does not pass automatic eligibility.

2. Identity document exception flags (manual review)
- Send to `needs_review` when OCR detects exception cases such as:
  - Expired ID.
  - RENIEC certificate uploaded instead of DNI.
  - Birth certificate uploaded instead of DNI.

3. Name consistency
- Applicant name in the form must match the name extracted from the identity document OCR.
- Mismatch is routed to `needs_review`.

4. Birth-year eligibility
- Birth year extracted via OCR from identity document must be in configured allowed years.
- Current default years: `2008`, `2009`, `2010`.

5. Secondary-school grades evidence uploaded
- Accept accepted official evidence, including:
  - Certificado Oficial de Estudios (UGEL / Ministerio de Educación).
  - Constancia de Logros de Aprendizaje (Ministerio de Educación).
  - Official school grades document.
- Combinations may be accepted but can be routed to review depending on policy.

6. Top-third or academic-threshold rule
- Applicant passes this criterion if either:
  - They provide a top-third proof document, OR
  - Their computed/manual average across secondary grades is at least `14/20`.

7. Recommendations completeness
- Both recommendation letters required.
- Both must be submitted and complete (minimum answered content threshold is configurable).

8. Signed authorization uploaded
- Signed authorization by parent/guardian and applicant must be present.

9. Applicant photo uploaded
- Photo must be uploaded.

## Outcome Policy

- `eligible`: all blocking criteria pass.
- `not_eligible`: hard-fail criteria fail.
- `needs_review`: ambiguous/inconsistent/OCR-exception scenarios.

## Configuration Principles

- Field/file keys are mapped from stage fields stored in DB (source of truth).
- OCR paths are configurable in rubric settings.
- Thresholds (allowed years, grade minimum, recommendation completeness) are configurable defaults.
- Default pack should be editable, not hardcoded into runtime decisions.
