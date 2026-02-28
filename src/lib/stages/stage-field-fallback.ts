import { DEFAULT_DOCUMENT_STAGE_FIELD_PRESETS } from "@/lib/stages/templates";
import type { CycleStageField } from "@/types/domain";

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
    section_id: null,
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
  if (fields.length === 0) {
    return buildFallbackStageFields(cycleId);
  }

  return fields;
}
