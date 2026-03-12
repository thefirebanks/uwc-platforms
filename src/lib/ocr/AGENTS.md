# OCR System

## What this module does
Client-side OCR schema definitions and AI parser config for the
Gemini-powered document analysis pipeline.

## Key files
| File | Purpose |
|------|---------|
| expected-output-schema.ts | Zod schema for validating OCR response structure |
| field-ai-parser.ts | Per-field AI parser config types |
| ../server/ocr.ts | Gemini OCR provider (server-side) — call API, parse, score |
| ../server/ocr-reference-files.ts | Upload/manage reference files for OCR prompts |
| ../server/ocr-testbed-service.ts | Prompt studio — test OCR without persisting |

## How OCR works
1. Admin configures OCR prompt template per stage (stored in `cycle_stage_templates`)
2. Per-field AI parser config in `cycle_stage_fields.ai_parser_config`
3. Admin or system triggers OCR: `POST /api/applications/[id]/ocr-check`
4. Server sends document (base64) + prompt to Gemini Flash
5. Response validated against `expected-output-schema.ts`
6. Results stored in `application_ocr_checks` table (raw_response.parsed)
7. Rubric can reference OCR results via `ocr_field_in`, `field_matches_ocr` etc.

## How to extend
- **New OCR field**: update `expected-output-schema.ts`, add parser config
- **Change provider**: modify `src/lib/server/ocr.ts` (currently Gemini-specific)
- **Test prompts**: use the OCR testbed UI (`admin-ocr-testbed.tsx` component)

## Environment
- `GEMINI_API_KEY` required for OCR functionality
