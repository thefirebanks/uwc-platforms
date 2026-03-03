import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { AppError } from "@/lib/errors/app-error";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ApplicationStatus, StageCode } from "@/types/domain";
import type { Database, Json } from "@/types/supabase";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type CycleRow = Database["public"]["Tables"]["cycles"]["Row"];
type RecommendationRow = Database["public"]["Tables"]["recommendation_requests"]["Row"];
type OcrRow = Database["public"]["Tables"]["application_ocr_checks"]["Row"];
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
      | "recommender_email"
      | "status"
      | "invite_sent_at"
      | "submitted_at"
      | "last_reminder_at"
      | "reminder_count"
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
    "id, applicant_id, cycle_id, stage_code, status, files, validation_notes, created_at, updated_at",
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

  return {
    rows,
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
          "id, role, recommender_email, status, invite_sent_at, submitted_at, last_reminder_at, reminder_count, created_at",
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
        | "recommender_email"
        | "status"
        | "invite_sent_at"
        | "submitted_at"
        | "last_reminder_at"
        | "reminder_count"
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
          : (path.split("/").pop() ?? path),
      mimeType: typeof record.mime_type === "string" ? record.mime_type : "",
      sizeBytes: typeof record.size_bytes === "number" ? record.size_bytes : null,
      uploadedAt: typeof record.uploaded_at === "string" ? record.uploaded_at : null,
    });
  }

  return entries;
}
