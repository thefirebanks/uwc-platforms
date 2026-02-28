// ─── Stage Admin Config (Non-Section Settings) ──────────────
// Section-related config (customSections, builtinSectionOrder,
// hiddenBuiltinSectionIds, fieldSectionAssignments) has moved
// to the stage_sections DB table. This file now only handles
// the non-section admin_config settings.

export type ParsedStageAdminConfig = {
  stageName?: string | null;
  description?: string | null;
  openDate?: string | null;
  closeDate?: string | null;
  previousStageRequirement?: string | null;
  blockIfPreviousNotMet?: boolean | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseStageAdminConfig(value: unknown): ParsedStageAdminConfig {
  if (!isRecord(value)) {
    return {};
  }

  return {
    stageName: typeof value.stageName === "string" ? value.stageName : null,
    description: typeof value.description === "string" ? value.description : null,
    openDate: typeof value.openDate === "string" ? value.openDate : null,
    closeDate: typeof value.closeDate === "string" ? value.closeDate : null,
    previousStageRequirement:
      typeof value.previousStageRequirement === "string"
        ? value.previousStageRequirement
        : null,
    blockIfPreviousNotMet:
      typeof value.blockIfPreviousNotMet === "boolean" ? value.blockIfPreviousNotMet : null,
  };
}
