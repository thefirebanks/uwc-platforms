import { DEFAULT_DOCUMENT_STAGE_FIELD_PRESETS } from "@/lib/stages/templates";
import type { CycleStageField } from "@/types/domain";

const LEGACY_DOCUMENT_FIELD_KEYS = new Set([
  "fullName",
  "dateOfBirth",
  "nationality",
  "schoolName",
  "gradeAverage",
  "essay",
  "identificationDocument",
]);

function looksLikeLegacyDocumentDefaults(fields: Pick<CycleStageField, "field_key">[]) {
  if (fields.length === 0) {
    return true;
  }

  if (fields.length > LEGACY_DOCUMENT_FIELD_KEYS.size) {
    return false;
  }

  return fields.every((field) => LEGACY_DOCUMENT_FIELD_KEYS.has(field.field_key));
}

export function buildFallbackStageFields(cycleId: string): CycleStageField[] {
  return DEFAULT_DOCUMENT_STAGE_FIELD_PRESETS.map((preset, index) => ({
    id: `fallback-${preset.fieldKey}`,
    cycle_id: cycleId,
    stage_code: "documents",
    field_key: preset.fieldKey,
    field_label: preset.fieldLabel,
    field_type: preset.fieldType,
    is_required: preset.isRequired,
    placeholder: preset.placeholder,
    help_text: preset.helpText,
    sort_order: preset.sortOrder ?? index + 1,
    is_active: true,
    created_at: new Date().toISOString(),
  }));
}

export function resolveDocumentStageFields({
  cycleId,
  fields,
}: {
  cycleId: string;
  fields: CycleStageField[];
}) {
  if (looksLikeLegacyDocumentDefaults(fields)) {
    return buildFallbackStageFields(cycleId);
  }

  return fields;
}
