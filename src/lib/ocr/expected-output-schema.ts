export const OCR_EXPECTED_OUTPUT_TYPES = [
  "text",
  "number",
  "decimal",
  "date",
  "boolean",
] as const;

export type OcrExpectedOutputFieldType = (typeof OCR_EXPECTED_OUTPUT_TYPES)[number];

export type OcrExpectedOutputField = {
  key: string;
  type: OcrExpectedOutputFieldType;
};

const SIMPLE_TYPE_TO_SCHEMA_TOKEN: Record<OcrExpectedOutputFieldType, string> = {
  text: "string",
  number: "int",
  decimal: "number",
  date: "datetime",
  boolean: "boolean",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function resolvePathValue(root: unknown, path: string): unknown {
  const segments =
    path
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .map((segment) => segment.trim())
      .filter(Boolean) ?? [];

  if (segments.length === 0) {
    return root;
  }

  let cursor: unknown = root;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) {
      return null;
    }

    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return null;
      }
      cursor = cursor[index];
      continue;
    }

    if (typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[segment];
      continue;
    }

    return null;
  }

  return cursor;
}

export function normalizeOcrOutputKey(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!cleaned) {
    return "";
  }

  const startsWithDigit = /^[0-9]/.test(cleaned);
  return startsWithDigit ? `field_${cleaned}` : cleaned;
}

export function normalizeExpectedOutputFields(
  fields: Array<{ key: string; type: string }> | null | undefined,
): OcrExpectedOutputField[] {
  const normalized: OcrExpectedOutputField[] = [];
  const seen = new Set<string>();

  for (const field of fields ?? []) {
    const key = normalizeOcrOutputKey(field.key);
    const dedupeKey = key.toLowerCase();
    if (!key || seen.has(dedupeKey)) {
      continue;
    }

    const type = OCR_EXPECTED_OUTPUT_TYPES.includes(field.type as OcrExpectedOutputFieldType)
      ? (field.type as OcrExpectedOutputFieldType)
      : "text";

    seen.add(dedupeKey);
    normalized.push({ key, type });
  }

  return normalized.slice(0, 40);
}

function mapSchemaTokenToSimpleType(token: string): OcrExpectedOutputFieldType | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "string" || normalized === "text") {
    return "text";
  }
  if (normalized === "int" || normalized === "integer") {
    return "number";
  }
  if (normalized === "number" || normalized === "float" || normalized === "double") {
    return "decimal";
  }
  if (normalized === "boolean" || normalized === "bool") {
    return "boolean";
  }
  if (
    normalized === "date" ||
    normalized === "datetime" ||
    normalized === "date-time" ||
    normalized === "timestamp"
  ) {
    return "date";
  }

  return null;
}

export function parseExpectedOutputFieldsFromSchemaTemplate(
  schemaTemplate: string | null | undefined,
): OcrExpectedOutputField[] {
  if (!schemaTemplate?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(schemaTemplate) as unknown;
    const objectShape = asRecord(parsed);
    if (!objectShape) {
      return [];
    }

    const fields: OcrExpectedOutputField[] = [];
    for (const [rawKey, rawValue] of Object.entries(objectShape)) {
      const key = normalizeOcrOutputKey(rawKey);
      if (!key) {
        continue;
      }

      if (typeof rawValue === "string") {
        const mapped = mapSchemaTokenToSimpleType(rawValue);
        if (mapped) {
          fields.push({ key, type: mapped });
        }
        continue;
      }

      if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
        fields.push({
          key,
          type: Number.isInteger(rawValue) ? "number" : "decimal",
        });
        continue;
      }

      if (typeof rawValue === "boolean") {
        fields.push({ key, type: "boolean" });
        continue;
      }

      const descriptor = asRecord(rawValue);
      const descriptorType =
        descriptor && typeof descriptor.type === "string"
          ? mapSchemaTokenToSimpleType(descriptor.type)
          : null;
      if (descriptorType) {
        fields.push({ key, type: descriptorType });
      }
    }

    return normalizeExpectedOutputFields(fields);
  } catch {
    return [];
  }
}

export function buildSchemaTemplateFromExpectedOutputFields(
  fields: Array<{ key: string; type: string }> | null | undefined,
): string {
  const normalized = normalizeExpectedOutputFields(fields);
  const template = Object.fromEntries(
    normalized.map((field) => [field.key, SIMPLE_TYPE_TO_SCHEMA_TOKEN[field.type]]),
  );
  return JSON.stringify(template, null, 2);
}

export function buildStructuredOcrExtraction({
  formFieldKey,
  parsedPayload,
  expectedOutputFields,
}: {
  formFieldKey: string;
  parsedPayload: unknown;
  expectedOutputFields: Array<{ key: string; type: string }> | null | undefined;
}) {
  const normalizedFormFieldKey = normalizeOcrOutputKey(formFieldKey) || "document";
  const fields = normalizeExpectedOutputFields(expectedOutputFields);
  const extractedValues: Record<string, unknown> = {};
  const prefixedValues: Record<string, unknown> = {};
  const missingKeys: string[] = [];

  for (const field of fields) {
    const value = resolvePathValue(parsedPayload, field.key);
    const isEmptyString = typeof value === "string" && value.trim().length === 0;
    if (value === null || value === undefined || isEmptyString) {
      missingKeys.push(field.key);
      continue;
    }

    extractedValues[field.key] = value;
    prefixedValues[`${normalizedFormFieldKey}_${normalizeOcrOutputKey(field.key)}`] = value;
  }

  return {
    fields,
    extractedValues,
    prefixedValues,
    missingKeys,
  };
}
