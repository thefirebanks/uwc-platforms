import type { ExportCatalogField } from "@/lib/server/exports-service";

// ─── Types ────────────────────────────────────────────────────────────

export type ExportFormat = "csv" | "xlsx";
export type EligibilityFilter = "all" | "eligible" | "ineligible" | "pending" | "advanced";
export type ExportTargetMode = "filtered" | "manual" | "randomSample";
export type GroupedExportMode = "single-sheet" | "multi-sheet" | "separate-files";

export type ManualCandidateRow = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  stageCode: string;
  status: string;
};

export type PreviewResponse = {
  preview?: {
    sheetName: string;
    applicantHeaders: string[];
    rows: Array<{ label: string; values: string[] }>;
  };
  totalFiltered?: number;
  exportedApplicants?: number;
  sheetCount?: number;
};

export type FieldGroup = {
  key: string;
  label: string;
  fields: ExportCatalogField[];
};

// ─── Utility functions ────────────────────────────────────────────────

export function groupFields(fields: ExportCatalogField[]): FieldGroup[] {
  const groups = new Map<string, { label: string; fields: ExportCatalogField[] }>();

  for (const field of fields) {
    if (!groups.has(field.groupKey)) {
      groups.set(field.groupKey, { label: field.groupLabel, fields: [] });
    }
    groups.get(field.groupKey)?.fields.push(field);
  }

  return Array.from(groups.entries()).map(([key, value]) => ({
    key,
    label: value.label,
    fields: value.fields,
  }));
}

export function filterGroupedFields(
  groupedFields: FieldGroup[],
  searchQuery: string,
): FieldGroup[] {
  if (!searchQuery.trim()) return groupedFields;
  const q = searchQuery.trim().toLowerCase();
  return groupedFields
    .map((group) => ({
      ...group,
      fields: group.fields.filter((f) => f.label.toLowerCase().includes(q)),
    }))
    .filter((group) => group.fields.length > 0);
}
