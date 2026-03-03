import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ApplicationStatus, StageCode } from "@/types/domain";
import type { Database, Json } from "@/types/supabase";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type CycleRow = Database["public"]["Tables"]["cycles"]["Row"];
type RecommendationRow = Database["public"]["Tables"]["recommendation_requests"]["Row"];
type OcrRow = Database["public"]["Tables"]["application_ocr_checks"]["Row"];
type ExportPresetRow = Database["public"]["Tables"]["export_presets"]["Row"];
type RecommendationLite = Pick<RecommendationRow, "application_id" | "role" | "status">;

const STAGE_SCHEMA = z.enum(["documents", "exam_placeholder"]);
const STATUS_SCHEMA = z.enum(["draft", "submitted", "eligible", "ineligible", "advanced"]);
const ELIGIBILITY_SCHEMA = z.enum(["all", "eligible", "ineligible", "pending", "advanced"]);
const UUID_SCHEMA = z.string().uuid();
const MAX_EXPORT_ROWS = 5000;

export type ApplicationExportFilters = {
  cycleId?: string;
  stageCode?: StageCode;
  status?: ApplicationStatus;
  eligibility: "all" | "eligible" | "ineligible" | "pending" | "advanced";
};

export type ApplicationExportRow = {
  applicationId: string;
  cycleId: string;
  cycleName: string;
  applicantId: string;
  applicantEmail: string;
  applicantName: string;
  stageCode: StageCode;
  status: ApplicationStatus;
  validationNotes: string;
  mentorRecommendationSubmitted: boolean;
  friendRecommendationSubmitted: boolean;
  recommendationCompletion: "complete" | "incomplete";
  fileCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationFileExportEntry = {
  key: string;
  path: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number | null;
  uploadedAt: string | null;
  category: string | null;
  notes: string | null;
};

export type ApplicationExportPackage = {
  exportedAt: string;
  application: Pick<
    ApplicationRow,
    | "id"
    | "applicant_id"
    | "cycle_id"
    | "stage_code"
    | "status"
    | "payload"
    | "validation_notes"
    | "created_at"
    | "updated_at"
  >;
  cycle: Pick<CycleRow, "id" | "name" | "stage1_open_at" | "stage1_close_at" | "stage2_open_at" | "stage2_close_at"> | null;
  applicant: Pick<ProfileRow, "id" | "email" | "full_name"> | null;
  files: ApplicationFileExportEntry[];
  recommendations: Array<
    Pick<
      RecommendationRow,
      | "id"
      | "role"
      | "recommender_name"
      | "recommender_email"
      | "status"
      | "invite_sent_at"
      | "submitted_at"
      | "last_reminder_at"
      | "reminder_count"
      | "admin_received_at"
      | "admin_received_by"
      | "admin_received_reason"
      | "admin_received_file"
      | "admin_notes"
      | "created_at"
    >
  >;
  ocrChecks: Array<Pick<OcrRow, "id" | "file_key" | "summary" | "confidence" | "created_at">>;
};

/* -------------------------------------------------------------------------- */
/*  Exportable column registry (drives column picker UI + xlsx builder)       */
/* -------------------------------------------------------------------------- */

export type ExportableColumn = {
  key: keyof ApplicationExportRow;
  label: string;
};

export type ExportCatalogField = {
  key: string;
  label: string;
  helperText: string | null;
  kind: "core" | "payload";
  groupKey: string;
  groupLabel: string;
  defaultSelected: boolean;
};

export type ExportPresetSummary = {
  id: string;
  name: string;
  selectedFields: string[];
  updatedAt: string;
};

export type ExportCatalog = {
  fields: ExportCatalogField[];
  presets: ExportPresetSummary[];
};

export type ApplicationExportContext = {
  application: Pick<
    ApplicationRow,
    | "id"
    | "applicant_id"
    | "cycle_id"
    | "stage_code"
    | "status"
    | "payload"
    | "files"
    | "validation_notes"
    | "created_at"
    | "updated_at"
  >;
  applicant: Pick<ProfileRow, "email" | "full_name"> | null;
  cycle: Pick<CycleRow, "name"> | null;
  recommendations: RecommendationLite[];
};

export const EXPORTABLE_COLUMNS: ExportableColumn[] = [
  { key: "applicationId", label: "ID Postulación" },
  { key: "cycleId", label: "ID Ciclo" },
  { key: "cycleName", label: "Nombre del Ciclo" },
  { key: "applicantId", label: "ID Postulante" },
  { key: "applicantEmail", label: "Email Postulante" },
  { key: "applicantName", label: "Nombre Postulante" },
  { key: "stageCode", label: "Etapa" },
  { key: "status", label: "Estado" },
  { key: "validationNotes", label: "Notas de Validación" },
  { key: "mentorRecommendationSubmitted", label: "Rec. Mentor Enviada" },
  { key: "friendRecommendationSubmitted", label: "Rec. Amigo Enviada" },
  { key: "recommendationCompletion", label: "Recomendaciones" },
  { key: "fileCount", label: "Archivos Subidos" },
  { key: "createdAt", label: "Fecha Creación" },
  { key: "updatedAt", label: "Última Actualización" },
];

function parseSelectedFields(raw: Json): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function stringifyExportValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyExportValue(item)).filter(Boolean).join(" | ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export function resolveNestedExportValue(
  source: Record<string, unknown>,
  path: string,
): string {
  const segments = path.split(".").filter(Boolean);
  let current: unknown = source;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return "";
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return stringifyExportValue(current);
}

const CORE_EXPORT_FIELD_DEFINITIONS: ExportCatalogField[] = EXPORTABLE_COLUMNS.map((column) => ({
  key: column.key,
  label: column.label,
  helperText: null,
  kind: "core" as const,
  groupKey: "core",
  groupLabel: "Información base",
  defaultSelected: ["applicationId", "applicantName", "applicantEmail", "status", "stageCode"].includes(column.key),
}));

function getCoreExportValue(row: ApplicationExportRow, key: keyof ApplicationExportRow) {
  return stringifyExportValue(row[key]);
}

function clean(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseUuid(raw: string | null, fieldName: string) {
  if (!raw) {
    return undefined;
  }

  const parsed = UUID_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new AppError({
      message: `Invalid ${fieldName}`,
      userMessage: "Los filtros de exportación no son válidos.",
      status: 400,
    });
  }

  return parsed.data;
}

function parseStage(raw: string | null) {
  const value = clean(raw);
  if (!value || value === "all") {
    return undefined;
  }

  const parsed = STAGE_SCHEMA.safeParse(value);
  if (!parsed.success) {
    throw new AppError({
      message: "Invalid stage filter",
      userMessage: "La etapa seleccionada no es válida.",
      status: 400,
    });
  }

  return parsed.data;
}

function parseStatus(raw: string | null) {
  const value = clean(raw);
  if (!value || value === "all") {
    return undefined;
  }

  const parsed = STATUS_SCHEMA.safeParse(value);
  if (!parsed.success) {
    throw new AppError({
      message: "Invalid status filter",
      userMessage: "El estado seleccionado no es válido.",
      status: 400,
    });
  }

  return parsed.data;
}

function parseEligibility(raw: string | null): ApplicationExportFilters["eligibility"] {
  const value = clean(raw) ?? "all";
  const parsed = ELIGIBILITY_SCHEMA.safeParse(value);
  if (!parsed.success) {
    throw new AppError({
      message: "Invalid eligibility filter",
      userMessage: "La elegibilidad seleccionada no es válida.",
      status: 400,
    });
  }

  return parsed.data;
}

function countFiles(files: Json) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    return 0;
  }

  let count = 0;
  for (const value of Object.values(files)) {
    if (typeof value === "string" && value.length > 0) {
      count += 1;
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).path === "string" &&
      ((value as Record<string, unknown>).path as string).length > 0
    ) {
      count += 1;
    }
  }

  return count;
}

function mapEligibilityFilters(
  query: ReturnType<SupabaseClient<Database>["from"]>,
  eligibility: ApplicationExportFilters["eligibility"],
) {
  if (eligibility === "eligible") {
    return query.eq("status", "eligible");
  }

  if (eligibility === "ineligible") {
    return query.eq("status", "ineligible");
  }

  if (eligibility === "advanced") {
    return query.eq("status", "advanced");
  }

  if (eligibility === "pending") {
    return query.in("status", ["draft", "submitted"]);
  }

  return query;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function mapRecommendationsByApplication(rows: RecommendationLite[]) {
  const map = new Map<string, RecommendationLite[]>();
  for (const row of rows) {
    if (!map.has(row.application_id)) {
      map.set(row.application_id, []);
    }
    map.get(row.application_id)?.push(row);
  }
  return map;
}

export function parseApplicationExportFilters(
  searchParams: URLSearchParams,
): ApplicationExportFilters {
  const cycleId = parseUuid(searchParams.get("cycleId"), "cycleId");
  const stageCode = parseStage(searchParams.get("stageCode"));
  const status = parseStatus(searchParams.get("status"));
  const eligibility = parseEligibility(searchParams.get("eligibility"));

  if (status && eligibility !== "all") {
    throw new AppError({
      message: "Conflicting export filters",
      userMessage: "Usa solo Estado o Elegibilidad, no ambos al mismo tiempo.",
      status: 400,
    });
  }

  return {
    cycleId,
    stageCode,
    status,
    eligibility,
  };
}

export async function buildExportCatalog({
  supabase,
  cycleId,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
}): Promise<ExportCatalog> {
  const [
    { data: fieldsData, error: fieldsError },
    { data: sectionsData, error: sectionsError },
    { data: templatesData, error: templatesError },
    { data: presetsData, error: presetsError },
  ] = await Promise.all([
    supabase
      .from("cycle_stage_fields")
      .select("id, stage_code, field_key, field_label, section_id, sort_order, is_active")
      .eq("cycle_id", cycleId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("stage_sections")
      .select("id, stage_code, title, sort_order")
      .eq("cycle_id", cycleId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("cycle_stage_templates")
      .select("id, stage_code, stage_label, sort_order")
      .eq("cycle_id", cycleId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("export_presets")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("updated_at", { ascending: false }),
  ]);

  if (fieldsError || sectionsError || templatesError || presetsError) {
    throw new AppError({
      message: "Failed building export catalog",
      userMessage: "No se pudo cargar el catalogo de exportacion.",
      status: 500,
      details: {
        fieldsError,
        sectionsError,
        templatesError,
        presetsError,
      },
    });
  }

  const templateLabelByStage = new Map<string, string>();
  for (const template of templatesData ?? []) {
    templateLabelByStage.set(template.stage_code, template.stage_label);
  }

  const sectionTitleById = new Map<string, string>();
  for (const section of ((sectionsData as Array<{ id: string; title: string }> | null) ?? [])) {
    sectionTitleById.set(section.id, section.title);
  }

  const payloadFields: ExportCatalogField[] = (((fieldsData as unknown) as Array<{
    stage_code: string;
    field_key: string;
    field_label: string;
    section_id: string | null;
  }> | null) ?? []).map((field) => {
      const stageLabel = templateLabelByStage.get(field.stage_code) ?? field.stage_code;
      const sectionTitle = field.section_id ? sectionTitleById.get(field.section_id) : null;
      return {
        key: `payload.${field.field_key}`,
        label: field.field_label,
        helperText: field.field_key,
        kind: "payload" as const,
        groupKey: `${field.stage_code}:${sectionTitle ?? "general"}`,
        groupLabel: sectionTitle ? `${stageLabel} · ${sectionTitle}` : stageLabel,
        defaultSelected: false,
      };
    });

  const presetSummaries = ((presetsData as ExportPresetRow[] | null) ?? []).map((preset) => ({
    id: preset.id,
    name: preset.name,
    selectedFields: parseSelectedFields(preset.selected_fields),
    updatedAt: preset.updated_at,
  }));

  return {
    fields: [...CORE_EXPORT_FIELD_DEFINITIONS, ...payloadFields],
    presets: presetSummaries,
  };
}

export function validateSelectedExportFields({
  selectedFields,
  catalog,
}: {
  selectedFields: string[];
  catalog: ExportCatalog;
}) {
  const allowed = new Set(catalog.fields.map((field) => field.key));
  const normalized = Array.from(new Set(selectedFields.map((field) => field.trim()).filter(Boolean)));
  const invalid = normalized.filter((field) => !allowed.has(field));

  if (invalid.length > 0) {
    throw new AppError({
      message: "Invalid export fields selected",
      userMessage: `Los siguientes campos no son validos para este proceso: ${invalid.join(", ")}.`,
      status: 400,
      details: { invalid },
    });
  }

  return normalized;
}

export async function saveExportPreset({
  supabase,
  cycleId,
  presetId,
  createdBy,
  name,
  selectedFields,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
  presetId?: string | null;
  createdBy: string;
  name: string;
  selectedFields: string[];
}) {
  const payload = {
    cycle_id: cycleId,
    created_by: createdBy,
    name: name.trim(),
    selected_fields: selectedFields,
    updated_at: new Date().toISOString(),
  };

  const query = presetId
    ? supabase
        .from("export_presets")
        .update(payload)
        .eq("id", presetId)
        .select("*")
        .single()
    : supabase
        .from("export_presets")
        .insert(payload)
        .select("*")
        .single();

  const { data, error } = await query;

  if (error || !data) {
    throw new AppError({
      message: "Failed saving export preset",
      userMessage: "No se pudo guardar el preset de exportacion.",
      status: 500,
      details: error,
    });
  }

  return data as ExportPresetRow;
}

export async function getApplicationsForExport({
  supabase,
  filters,
  maxRows = MAX_EXPORT_ROWS,
}: {
  supabase: SupabaseClient<Database>;
  filters: ApplicationExportFilters;
  maxRows?: number;
}) {
  let query = supabase.from("applications").select(
    "id, applicant_id, cycle_id, stage_code, status, payload, files, validation_notes, created_at, updated_at",
    { count: "exact" },
  );

  if (filters.cycleId) {
    query = query.eq("cycle_id", filters.cycleId);
  }

  if (filters.stageCode) {
    query = query.eq("stage_code", filters.stageCode);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  query = mapEligibilityFilters(query, filters.eligibility);

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .limit(maxRows);

  if (error) {
    throw new AppError({
      message: "Failed loading applications for export",
      userMessage: "No se pudieron cargar las postulaciones para exportar.",
      status: 500,
      details: error,
    });
  }

  const applications = (data as ApplicationRow[] | null) ?? [];
  const applicantIds = Array.from(new Set(applications.map((item) => item.applicant_id)));
  const cycleIds = Array.from(new Set(applications.map((item) => item.cycle_id)));
  const applicationIds = applications.map((item) => item.id);

  const [
    { data: profileRows, error: profileError },
    { data: cycleRows, error: cycleError },
    { data: recommendationRows, error: recommendationError },
  ] = await Promise.all([
      applicantIds.length > 0
        ? supabase.from("profiles").select("id, email, full_name").in("id", applicantIds)
        : Promise.resolve({ data: [], error: null }),
      cycleIds.length > 0
        ? supabase.from("cycles").select("id, name").in("id", cycleIds)
        : Promise.resolve({ data: [], error: null }),
      applicationIds.length > 0
        ? supabase
            .from("recommendation_requests")
            .select("application_id, role, status")
            .in("application_id", applicationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (profileError) {
    throw new AppError({
      message: "Failed loading applicant profile data for export",
      userMessage: "No se pudo completar la exportación de postulaciones.",
      status: 500,
      details: profileError,
    });
  }

  if (cycleError) {
    throw new AppError({
      message: "Failed loading cycle data for export",
      userMessage: "No se pudo completar la exportación de postulaciones.",
      status: 500,
      details: cycleError,
    });
  }

  if (recommendationError) {
    throw new AppError({
      message: "Failed loading recommendation data for export",
      userMessage: "No se pudo completar la exportación de postulaciones.",
      status: 500,
      details: recommendationError,
    });
  }

  const profileMap = new Map<string, Pick<ProfileRow, "email" | "full_name">>();
  for (const profile of profileRows ?? []) {
    profileMap.set(profile.id, { email: profile.email, full_name: profile.full_name });
  }

  const cycleMap = new Map<string, Pick<CycleRow, "name">>();
  for (const cycle of cycleRows ?? []) {
    cycleMap.set(cycle.id, { name: cycle.name });
  }

  const recommendationMap = mapRecommendationsByApplication(
    (recommendationRows as RecommendationLite[] | null) ?? [],
  );

  const rows: ApplicationExportRow[] = applications.map((application) => {
    const applicant = profileMap.get(application.applicant_id);
    const cycle = cycleMap.get(application.cycle_id);
    const recommendations = recommendationMap.get(application.id) ?? [];
    const mentorRecommendationSubmitted = recommendations.some(
      (item) => item.role === "mentor" && item.status === "submitted",
    );
    const friendRecommendationSubmitted = recommendations.some(
      (item) => item.role === "friend" && item.status === "submitted",
    );

    return {
      applicationId: application.id,
      cycleId: application.cycle_id,
      cycleName: cycle?.name ?? "(sin nombre)",
      applicantId: application.applicant_id,
      applicantEmail: applicant?.email ?? "(sin email)",
      applicantName: applicant?.full_name ?? "(sin nombre)",
      stageCode: application.stage_code,
      status: application.status,
      validationNotes: application.validation_notes ?? "",
      mentorRecommendationSubmitted,
      friendRecommendationSubmitted,
      recommendationCompletion:
        mentorRecommendationSubmitted && friendRecommendationSubmitted ? "complete" : "incomplete",
      fileCount: countFiles(application.files),
      createdAt: application.created_at,
      updatedAt: application.updated_at,
    };
  });

  const records: ApplicationExportContext[] = applications.map((application) => ({
    application: {
      id: application.id,
      applicant_id: application.applicant_id,
      cycle_id: application.cycle_id,
      stage_code: application.stage_code,
      status: application.status,
      payload: application.payload ?? {},
      files: application.files,
      validation_notes: application.validation_notes,
      created_at: application.created_at,
      updated_at: application.updated_at,
    },
    applicant: applicantIds.length > 0
      ? profileMap.get(application.applicant_id) ?? null
      : null,
    cycle: cycleIds.length > 0
      ? cycleMap.get(application.cycle_id) ?? null
      : null,
    recommendations: recommendationMap.get(application.id) ?? [],
  }));

  return {
    rows,
    records,
    total: count ?? rows.length,
    truncated: (count ?? rows.length) > rows.length,
  };
}

export function buildApplicationsCsv(
  rows: ApplicationExportRow[],
  columnKeys?: Array<keyof ApplicationExportRow>,
) {
  const selectedKeys = columnKeys ?? EXPORTABLE_COLUMNS.map((c) => c.key);
  const keyToLabel = new Map(EXPORTABLE_COLUMNS.map((c) => [c.key, c.label]));

  const header = selectedKeys
    .map((k) => csvCell(keyToLabel.get(k) ?? String(k)))
    .join(",");

  const lines = rows.map((row) =>
    selectedKeys
      .map((key) => {
        const val = row[key];
        return csvCell(typeof val === "boolean" ? String(val) : String(val ?? ""));
      })
      .join(","),
  );

  return [header, ...lines].join("\n");
}

export function buildDynamicExportTable({
  records,
  selectedFields,
  catalog,
}: {
  records: ApplicationExportContext[];
  selectedFields: string[];
  catalog: ExportCatalog;
}) {
  const selected = validateSelectedExportFields({
    selectedFields,
    catalog,
  });

  const coreLabelMap = new Map(CORE_EXPORT_FIELD_DEFINITIONS.map((field) => [field.key, field.label]));
  const catalogLabelMap = new Map(catalog.fields.map((field) => [field.key, field.label]));

  const rows = records.map((record) => {
    const coreRow: ApplicationExportRow = {
      applicationId: record.application.id,
      cycleId: record.application.cycle_id,
      cycleName: record.cycle?.name ?? "(sin nombre)",
      applicantId: record.application.applicant_id,
      applicantEmail: record.applicant?.email ?? "(sin email)",
      applicantName: record.applicant?.full_name ?? "(sin nombre)",
      stageCode: record.application.stage_code,
      status: record.application.status,
      validationNotes: record.application.validation_notes ?? "",
      mentorRecommendationSubmitted: record.recommendations.some(
        (item) => item.role === "mentor" && item.status === "submitted",
      ),
      friendRecommendationSubmitted: record.recommendations.some(
        (item) => item.role === "friend" && item.status === "submitted",
      ),
      recommendationCompletion:
        record.recommendations.some((item) => item.role === "mentor" && item.status === "submitted") &&
        record.recommendations.some((item) => item.role === "friend" && item.status === "submitted")
          ? "complete"
          : "incomplete",
      fileCount: countFiles(record.application.files),
      createdAt: record.application.created_at,
      updatedAt: record.application.updated_at,
    };

    return selected.map((fieldKey) => {
      if (fieldKey.startsWith("payload.")) {
        return resolveNestedExportValue(
          (record.application.payload ?? {}) as Record<string, unknown>,
          fieldKey.replace(/^payload\./, ""),
        );
      }

      return getCoreExportValue(coreRow, fieldKey as keyof ApplicationExportRow);
    });
  });

  const headers = selected.map((fieldKey) => catalogLabelMap.get(fieldKey) ?? coreLabelMap.get(fieldKey) ?? fieldKey);

  return {
    selected,
    headers,
    rows,
  };
}

export function buildDynamicCsvExport(table: { headers: string[]; rows: string[][] }) {
  const header = table.headers.map((column) => csvCell(column)).join(",");
  const lines = table.rows.map((row) => row.map((value) => csvCell(value)).join(","));
  return [header, ...lines].join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Excel export                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Build an .xlsx workbook for the given rows.
 * `columnKeys` controls which columns appear and in what order.
 * Defaults to all EXPORTABLE_COLUMNS when omitted.
 */
export async function buildApplicationsXlsx(
  rows: ApplicationExportRow[],
  columnKeys?: Array<keyof ApplicationExportRow>,
): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const selectedKeys = columnKeys ?? EXPORTABLE_COLUMNS.map((c) => c.key);
  const keyToLabel = new Map(EXPORTABLE_COLUMNS.map((c) => [c.key, c.label]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UWC Peru Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Postulaciones");

  /* Header row */
  sheet.columns = selectedKeys.map((key) => ({
    header: keyToLabel.get(key) ?? String(key),
    key: String(key),
    width: 22,
  }));

  /* Style header row */
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD6E4F7" },
  };

  /* Data rows */
  for (const row of rows) {
    const record: Record<string, string | number | boolean> = {};
    for (const key of selectedKeys) {
      const raw = row[key];
      record[String(key)] = typeof raw === "boolean" ? String(raw) : (raw as string | number);
    }
    sheet.addRow(record);
  }

  /* Auto-filter on header */
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: selectedKeys.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildDynamicExportXlsx(table: {
  headers: string[];
  rows: string[][];
}): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UWC Peru Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Postulaciones");
  sheet.columns = table.headers.map((header) => ({
    header,
    key: header,
    width: 24,
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF0E7D8" },
  };

  for (const row of table.rows) {
    const record: Record<string, string> = {};
    table.headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    sheet.addRow(record);
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: table.headers.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function getApplicationExportPackage({
  supabase,
  applicationId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
}): Promise<ApplicationExportPackage> {
  const parsedApplicationId = parseUuid(applicationId, "applicationId");
  if (!parsedApplicationId) {
    throw new AppError({
      message: "Missing applicationId",
      userMessage: "Debes seleccionar una postulación para exportar.",
      status: 400,
    });
  }

  let privilegedSupabase: SupabaseClient<Database> | null = null;
  try {
    privilegedSupabase = getSupabaseAdminClient();
  } catch {
    privilegedSupabase = null;
  }

  const loadApplication = async (client: SupabaseClient<Database>) =>
    client
      .from("applications")
      .select(
        "id, applicant_id, cycle_id, stage_code, status, payload, files, validation_notes, created_at, updated_at",
      )
      .eq("id", parsedApplicationId)
      .maybeSingle();

  let dataClient: SupabaseClient<Database> = supabase;
  let { data: application, error: applicationError } = await loadApplication(supabase);

  if ((applicationError || !application) && privilegedSupabase) {
    const retry = await loadApplication(privilegedSupabase);
    if (!retry.error && retry.data) {
      application = retry.data;
      applicationError = null;
      dataClient = privilegedSupabase;
    }
  }

  if (applicationError) {
    throw new AppError({
      message: "Failed loading application for export",
      userMessage: "No se pudo exportar la postulación seleccionada.",
      status: 500,
      details: applicationError,
    });
  }

  if (!application) {
    throw new AppError({
      message: "Application not found for export",
      userMessage: "La postulación seleccionada no existe.",
      status: 404,
    });
  }

  const [{ data: applicant }, { data: cycle }, { data: recommendations, error: recommendationError }, { data: ocrChecks, error: ocrError }] =
    await Promise.all([
      dataClient
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", application.applicant_id)
        .maybeSingle(),
      dataClient
        .from("cycles")
        .select("id, name, stage1_open_at, stage1_close_at, stage2_open_at, stage2_close_at")
        .eq("id", application.cycle_id)
        .maybeSingle(),
      dataClient
        .from("recommendation_requests")
        .select(
          "id, role, recommender_name, recommender_email, status, invite_sent_at, submitted_at, last_reminder_at, reminder_count, admin_received_at, admin_received_by, admin_received_reason, admin_received_file, admin_notes, created_at",
        )
        .eq("application_id", application.id)
        .order("created_at", { ascending: true }),
      dataClient
        .from("application_ocr_checks")
        .select("id, file_key, summary, confidence, created_at")
        .eq("application_id", application.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  // Be resilient here: recommendation/OCR metadata should not block admin profile view.
  // If these optional queries fail (RLS mismatch, missing table on preview, etc.),
  // we still return the core application package.
  const safeRecommendations = recommendationError
    ? []
    : ((recommendations ?? []) as Array<
      Pick<
        RecommendationRow,
        | "id"
        | "role"
        | "recommender_name"
        | "recommender_email"
        | "status"
        | "invite_sent_at"
        | "submitted_at"
        | "last_reminder_at"
        | "reminder_count"
        | "admin_received_at"
        | "admin_received_by"
        | "admin_received_reason"
        | "admin_received_file"
        | "admin_notes"
        | "created_at"
      >
    >);
  const safeOcrChecks = ocrError
    ? []
    : (((ocrChecks ?? []) as Array<Pick<OcrRow, "id" | "file_key" | "summary" | "confidence" | "created_at">>) ?? []);

  return {
    exportedAt: new Date().toISOString(),
    application: {
      id: application.id,
      applicant_id: application.applicant_id,
      cycle_id: application.cycle_id,
      stage_code: application.stage_code,
      status: application.status,
      payload: application.payload,
      validation_notes: application.validation_notes,
      created_at: application.created_at,
      updated_at: application.updated_at,
    },
    cycle,
    applicant,
    files: normalizeApplicationFiles(application.files),
    recommendations: safeRecommendations,
    ocrChecks: safeOcrChecks,
  };
}

export function normalizeApplicationFiles(files: Json): ApplicationFileExportEntry[] {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    return [];
  }

  const entries: ApplicationFileExportEntry[] = [];

  for (const [key, value] of Object.entries(files)) {
    if (typeof value === "string") {
      entries.push({
        key,
        path: value,
        title: key,
        originalName: value.split("/").pop() ?? value,
        mimeType: "",
        sizeBytes: null,
        uploadedAt: null,
        category: null,
        notes: null,
      });
      continue;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    const record = value as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path : "";
    if (!path) {
      continue;
    }

    entries.push({
      key,
      path,
      title: typeof record.title === "string" ? record.title : key,
      originalName:
        typeof record.original_name === "string"
          ? record.original_name
          : typeof record.name === "string"
            ? record.name
          : (path.split("/").pop() ?? path),
      mimeType: typeof record.mime_type === "string" ? record.mime_type : "",
      sizeBytes: typeof record.size_bytes === "number" ? record.size_bytes : null,
      uploadedAt: typeof record.uploaded_at === "string" ? record.uploaded_at : null,
      category: typeof record.category === "string" ? record.category : null,
      notes: typeof record.notes === "string" ? record.notes : null,
    });
  }

  return entries;
}
