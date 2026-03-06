import type { CycleStageField, StageSection } from "@/types/domain";

// ─── Resolved Section (output of groupFieldsBySections) ──────

export type ResolvedSection = {
  id: string;
  sectionKey: string;
  title: string;
  description: string;
  fields: CycleStageField[];
};

export type GroupFieldsBySectionsOptions = {
  includeInactive?: boolean;
  includeFileFields?: boolean;
};

// ─── Core Grouping Function ──────────────────────────────────
// Groups fields into sections using the DB-stored section_id on
// each field. No more hardcoded prefix matching.

export function groupFieldsBySections(
  fields: CycleStageField[],
  sections: StageSection[],
  options: GroupFieldsBySectionsOptions = {},
): ResolvedSection[] {
  const { includeInactive = false, includeFileFields = false } = options;

  // Sort sections by sort_order
  const sortedSections = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  // Find the "other" section (fallback for unassigned fields + hidden section fields)
  const otherSection = sortedSections.find((s) => s.section_key === "other");
  const fallbackSection = otherSection ?? sortedSections.find((s) => s.is_visible) ?? null;

  // Initialize buckets for each visible section
  const buckets = new Map<string, CycleStageField[]>();
  for (const section of sortedSections) {
    if (section.is_visible) {
      buckets.set(section.id, []);
    }
  }

  // Distribute fields into buckets
  for (const field of fields) {
    if (!includeInactive && !field.is_active) continue;
    if (!includeFileFields && field.field_type === "file") continue;

    const sectionId = field.section_id;

    // If field has a section_id and that section is visible, use it
    if (sectionId && buckets.has(sectionId)) {
      buckets.get(sectionId)!.push(field);
      continue;
    }

    // If field's section is hidden, or field has no section_id → "other"
    if (fallbackSection && buckets.has(fallbackSection.id)) {
      buckets.get(fallbackSection.id)!.push(field);
    }
  }

  // Build resolved sections (skip empty, keep "other" at end)
  const result: ResolvedSection[] = [];
  let otherResolved: ResolvedSection | null = null;

  for (const section of sortedSections) {
    if (!section.is_visible) continue;
    const sectionFields = buckets.get(section.id) ?? [];
    if (sectionFields.length === 0) continue;

    const resolved: ResolvedSection = {
      id: section.id,
      sectionKey: section.section_key,
      title: section.title,
      description: section.description,
      fields: sectionFields,
    };

    if (section.section_key === "other") {
      otherResolved = resolved;
    } else {
      result.push(resolved);
    }
  }

  // "other" always goes last
  if (otherResolved) {
    result.push(otherResolved);
  }

  return result;
}
