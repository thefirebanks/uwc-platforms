import type { CycleStageField } from "@/types/domain";

export type StagePayloadValue = string | number | boolean | null;
export type StagePayload = Record<string, StagePayloadValue>;

export function normalizeFieldKey(label: string) {
  const normalized = label
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((chunk, index) => {
      const lower = chunk.toLowerCase();
      if (index === 0) {
        return lower;
      }
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join("");

  return normalized.length > 0 ? normalized : "campoNuevo";
}

function parseNumber(rawValue: unknown) {
  if (typeof rawValue === "number") {
    return Number.isNaN(rawValue) ? null : rawValue;
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function parseString(rawValue: unknown) {
  if (typeof rawValue !== "string") {
    return "";
  }

  return rawValue.trim();
}

export function validateStagePayload({
  fields,
  payload,
  skipFileValidation = true,
}: {
  fields: CycleStageField[];
  payload: Record<string, unknown>;
  skipFileValidation?: boolean;
}) {
  const errors: Record<string, string> = {};
  const normalizedPayload: StagePayload = {};

  for (const field of fields) {
    if (!field.is_active) {
      continue;
    }

    const rawValue = payload[field.field_key];

    if (field.field_type === "file") {
      if (!skipFileValidation && field.is_required) {
        const candidate = parseString(rawValue);
        if (!candidate) {
          errors[field.field_key] = `${field.field_label} es obligatorio.`;
        }
      }
      continue;
    }

    if (field.field_type === "number") {
      const parsed = parseNumber(rawValue);
      if (parsed === null) {
        if (field.is_required) {
          errors[field.field_key] = `${field.field_label} es obligatorio.`;
        }
        continue;
      }

      normalizedPayload[field.field_key] = parsed;
      continue;
    }

    const parsedText = parseString(rawValue);
    if (!parsedText) {
      if (field.is_required) {
        errors[field.field_key] = `${field.field_label} es obligatorio.`;
      }
      continue;
    }

    if (field.field_type === "date" && Number.isNaN(Date.parse(parsedText))) {
      errors[field.field_key] = `${field.field_label} tiene una fecha inválida.`;
      continue;
    }

    normalizedPayload[field.field_key] = parsedText;
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    normalizedPayload,
  };
}

export function validateRequiredFiles({
  fields,
  files,
}: {
  fields: CycleStageField[];
  files: Record<string, string | { path?: string } | undefined> | null | undefined;
}) {
  function hasFile(key: string) {
    const candidate = files?.[key];
    if (!candidate) {
      return false;
    }

    if (typeof candidate === "string") {
      return candidate.trim().length > 0;
    }

    if (typeof candidate === "object" && typeof candidate.path === "string") {
      return candidate.path.trim().length > 0;
    }

    return false;
  }

  const missingFields = fields.filter(
    (field) =>
      field.is_active &&
      field.field_type === "file" &&
      field.is_required &&
      !hasFile(field.field_key),
  );

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}
