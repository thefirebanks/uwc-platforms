export type PersistedCustomSection = {
  id: string;
  title: string;
  order: number;
};

export const BUILTIN_SECTION_IDS = [
  "eligibility",
  "identity",
  "family",
  "school",
  "motivation",
  "recommenders",
  "documents",
  "other",
] as const;

export type BuiltinStageSectionId = (typeof BUILTIN_SECTION_IDS)[number];

export type ParsedStageAdminConfig = {
  stageName?: string | null;
  description?: string | null;
  openDate?: string | null;
  closeDate?: string | null;
  previousStageRequirement?: string | null;
  blockIfPreviousNotMet?: boolean | null;
  customSections: PersistedCustomSection[];
  builtinSectionOrder: BuiltinStageSectionId[];
  hiddenBuiltinSectionIds: BuiltinStageSectionId[];
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

export function isBuiltinStageSectionId(value: string): value is BuiltinStageSectionId {
  return (BUILTIN_SECTION_IDS as readonly string[]).includes(value);
}

export function normalizeBuiltinSectionOrder(
  sectionOrder: readonly string[] | null | undefined,
): BuiltinStageSectionId[] {
  const seen = new Set<string>();
  const normalized: BuiltinStageSectionId[] = [];

  for (const rawId of sectionOrder ?? []) {
    const id = rawId.trim();
    if (!isBuiltinStageSectionId(id) || seen.has(id)) {
      continue;
    }
    normalized.push(id);
    seen.add(id);
  }

  for (const defaultId of BUILTIN_SECTION_IDS) {
    if (!seen.has(defaultId)) {
      normalized.push(defaultId);
    }
  }

  return normalized;
}

export function sanitizeHiddenBuiltinSectionIds(
  hiddenSectionIds: readonly string[] | null | undefined,
) {
  return Array.from(
    new Set(
      (hiddenSectionIds ?? [])
        .map((value) => value.trim())
        .filter((value): value is BuiltinStageSectionId => isBuiltinStageSectionId(value))
        .filter((value) => value !== "other"),
    ),
  );
}

export function sanitizeFieldSectionAssignments(
  assignments: Record<string, string>,
  customSections: PersistedCustomSection[],
) {
  const allowedIds = new Set<string>([
    ...customSections.map((section) => section.id),
    ...BUILTIN_SECTION_IDS,
  ]);
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
      builtinSectionOrder: normalizeBuiltinSectionOrder(undefined),
      hiddenBuiltinSectionIds: [],
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
  const builtinSectionOrder = Array.isArray(value.builtinSectionOrder)
    ? normalizeBuiltinSectionOrder(
        value.builtinSectionOrder.filter((entry): entry is string => typeof entry === "string"),
      )
    : normalizeBuiltinSectionOrder(undefined);
  const hiddenBuiltinSectionIds = Array.isArray(value.hiddenBuiltinSectionIds)
    ? sanitizeHiddenBuiltinSectionIds(
        value.hiddenBuiltinSectionIds.filter((entry): entry is string => typeof entry === "string"),
      )
    : [];
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
    builtinSectionOrder,
    hiddenBuiltinSectionIds,
    fieldSectionAssignments: sanitizeFieldSectionAssignments(rawAssignments, customSections),
  };
}
