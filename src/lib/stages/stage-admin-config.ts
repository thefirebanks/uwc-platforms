export type PersistedCustomSection = {
  id: string;
  title: string;
  order: number;
};

export type ParsedStageAdminConfig = {
  stageName?: string | null;
  description?: string | null;
  openDate?: string | null;
  closeDate?: string | null;
  previousStageRequirement?: string | null;
  blockIfPreviousNotMet?: boolean | null;
  customSections: PersistedCustomSection[];
  fieldSectionAssignments: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizePersistedCustomSections(
  sections: PersistedCustomSection[],
): PersistedCustomSection[] {
  return [...sections]
    .map((section) => ({
      id: section.id.trim(),
      title: section.title.trim() || "Nueva sección",
      order: Number.isFinite(section.order) ? Math.max(1, Math.trunc(section.order)) : 1,
    }))
    .filter((section) => section.id.length > 0)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map((section, index) => ({
      ...section,
      order: index + 1,
    }));
}

export function sanitizeFieldSectionAssignments(
  assignments: Record<string, string>,
  customSections: PersistedCustomSection[],
) {
  const allowedIds = new Set(customSections.map((section) => section.id));
  return Object.fromEntries(
    Object.entries(assignments).flatMap(([fieldKey, sectionId]) => {
      const normalizedFieldKey = fieldKey.trim();
      const normalizedSectionId = sectionId.trim();

      if (
        normalizedFieldKey.length === 0 ||
        normalizedSectionId.length === 0 ||
        !allowedIds.has(normalizedSectionId)
      ) {
        return [];
      }

      return [[normalizedFieldKey, normalizedSectionId]];
    }),
  );
}

export function parseStageAdminConfig(value: unknown): ParsedStageAdminConfig {
  if (!isRecord(value)) {
    return {
      customSections: [],
      fieldSectionAssignments: {},
    };
  }

  const rawCustomSections = Array.isArray(value.customSections)
    ? value.customSections.flatMap((item, index) => {
        if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) {
          return [];
        }

        return [
          {
            id: item.id.trim(),
            title:
              typeof item.title === "string" && item.title.trim()
                ? item.title.trim()
                : "Nueva sección",
            order:
              typeof item.order === "number" && Number.isFinite(item.order)
                ? Math.max(1, Math.trunc(item.order))
                : index + 1,
          },
        ];
      })
    : [];

  const customSections = normalizePersistedCustomSections(rawCustomSections);
  const rawAssignments =
    isRecord(value.fieldSectionAssignments) &&
    Object.values(value.fieldSectionAssignments).every((entry) => typeof entry === "string")
      ? (value.fieldSectionAssignments as Record<string, string>)
      : {};

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
    customSections,
    fieldSectionAssignments: sanitizeFieldSectionAssignments(rawAssignments, customSections),
  };
}
