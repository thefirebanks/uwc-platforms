import { z } from "zod";

export const OCR_REFERENCE_FILE_LIMIT = 6;
const OCR_REFERENCE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const OCR_REFERENCE_MIME_TYPE_SET = new Set<string>(OCR_REFERENCE_MIME_TYPES);

export const fieldAiReferenceFileSchema = z
  .object({
    fileName: z.string().trim().min(1).max(240),
    mimeType: z.string().trim().min(1).max(120),
    path: z.string().trim().min(4).max(500),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
    uploadedAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export type FieldAiReferenceFile = z.infer<typeof fieldAiReferenceFileSchema>;

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
    referenceFiles: z
      .array(fieldAiReferenceFileSchema)
      .max(OCR_REFERENCE_FILE_LIMIT)
      .optional(),
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
  referenceFiles: FieldAiReferenceFile[];
  expectedOutputFields: Array<{
    key: string;
    type: "text" | "number" | "decimal" | "date" | "boolean";
  }>;
};

export function isSupportedOcrReferenceMimeType(
  mimeType: string | null | undefined,
) {
  return OCR_REFERENCE_MIME_TYPE_SET.has((mimeType ?? "").trim().toLowerCase());
}

export function isSupportedOcrReferencePath(path: string) {
  const mimeType = inferMimeTypeFromPath(path);
  return isSupportedOcrReferenceMimeType(mimeType);
}

export function normalizeFieldAiReferenceFiles(
  referenceFiles: FieldAiReferenceFile[] | undefined,
) {
  const deduped = new Map<string, FieldAiReferenceFile>();

  for (const referenceFile of referenceFiles ?? []) {
    if (
      !referenceFile.path ||
      !isSupportedOcrReferencePath(referenceFile.path)
    ) {
      continue;
    }

    deduped.set(referenceFile.path, {
      ...referenceFile,
      fileName: referenceFile.fileName.trim(),
      mimeType:
        referenceFile.mimeType.trim() ||
        inferMimeTypeFromPath(referenceFile.path),
      path: referenceFile.path.trim(),
      sizeBytes:
        typeof referenceFile.sizeBytes === "number" &&
        Number.isFinite(referenceFile.sizeBytes)
          ? referenceFile.sizeBytes
          : null,
      uploadedAt: referenceFile.uploadedAt ?? null,
    });
  }

  return [...deduped.values()].slice(0, OCR_REFERENCE_FILE_LIMIT);
}

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
