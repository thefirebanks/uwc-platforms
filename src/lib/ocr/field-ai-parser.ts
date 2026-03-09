import { z } from "zod";

/**
 * Zod schema for AI-parser configuration attached to stage fields.
 * Shared across file-upload, OCR-check, and stage-config routes.
 */
export const fieldAiParserSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    modelId: z.string().trim().min(1).max(120).nullable().optional(),
    promptTemplate: z.string().trim().max(5000).nullable().optional(),
    systemPrompt: z.string().trim().max(2000).nullable().optional(),
    extractionInstructions: z.string().trim().max(6000).nullable().optional(),
    expectedSchemaTemplate: z.string().trim().max(8000).nullable().optional(),
    expectedOutputFields: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(120),
          type: z.enum(["text", "number", "decimal", "date", "boolean"]),
        }),
      )
      .max(40)
      .optional(),
    strictSchema: z.boolean().optional().default(true),
  })
  .strict();

export type FieldAiParserConfig = z.infer<typeof fieldAiParserSchema>;

export type ResolvedFieldAiParserConfig = FieldAiParserConfig & {
  extractionInstructions: string;
  expectedSchemaTemplate: string;
  expectedOutputFields: Array<{
    key: string;
    type: "text" | "number" | "decimal" | "date" | "boolean";
  }>;
};

/**
 * Infer a MIME type from a file path extension.
 * Falls back to `application/octet-stream` for unknown extensions.
 */
export function inferMimeTypeFromPath(path: string) {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg"))
    return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}
