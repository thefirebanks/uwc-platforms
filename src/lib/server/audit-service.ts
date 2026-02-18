import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import type { Database, Json } from "@/types/supabase";

type AuditRow = Database["public"]["Tables"]["audit_events"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type AuditFilters = {
  action?: string;
  requestId?: string;
  applicationId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

export type AuditEventListItem = {
  id: string;
  action: string;
  requestId: string;
  applicationId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  metadata: Json;
  createdAt: string;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 5000;

function parsePositiveInt(value: string | null, fallback: number, field: string) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError({
      message: `Invalid ${field}`,
      userMessage: "Los filtros de auditoría no son válidos.",
      status: 400,
    });
  }

  return parsed;
}

function parseDate(value: string | null, field: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError({
      message: `Invalid ${field}`,
      userMessage: "Los filtros de fecha no son válidos.",
      status: 400,
    });
  }

  return date.toISOString();
}

function clean(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function applyAuditFilters(
  query: ReturnType<SupabaseClient<Database>["from"]>,
  filters: AuditFilters,
) {
  let filteredQuery = query;

  if (filters.action) {
    filteredQuery = filteredQuery.eq("action", filters.action);
  }

  if (filters.actorId) {
    filteredQuery = filteredQuery.eq("actor_id", filters.actorId);
  }

  if (filters.requestId) {
    filteredQuery = filteredQuery.ilike("request_id", `%${filters.requestId}%`);
  }

  if (filters.applicationId) {
    filteredQuery = filteredQuery.ilike("application_id", `%${filters.applicationId}%`);
  }

  if (filters.from) {
    filteredQuery = filteredQuery.gte("created_at", filters.from);
  }

  if (filters.to) {
    filteredQuery = filteredQuery.lte("created_at", filters.to);
  }

  return filteredQuery;
}

async function loadProfileMap(supabase: SupabaseClient<Database>, actorIds: string[]) {
  if (actorIds.length === 0) {
    return new Map<string, Pick<ProfileRow, "email" | "full_name">>();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", actorIds);

  if (error) {
    throw new AppError({
      message: "Failed loading actor profiles",
      userMessage: "No se pudieron cargar los datos de auditoría.",
      status: 500,
      details: error,
    });
  }

  const map = new Map<string, Pick<ProfileRow, "email" | "full_name">>();
  for (const row of data ?? []) {
    map.set(row.id, { email: row.email, full_name: row.full_name });
  }

  return map;
}

function mapAuditRowsToView(
  rows: AuditRow[],
  profileMap: Map<string, Pick<ProfileRow, "email" | "full_name">>,
): AuditEventListItem[] {
  return rows.map((row) => {
    const actor = row.actor_id ? profileMap.get(row.actor_id) : undefined;
    return {
      id: row.id,
      action: row.action,
      requestId: row.request_id,
      applicationId: row.application_id,
      actorId: row.actor_id,
      actorEmail: actor?.email ?? null,
      actorName: actor?.full_name ?? null,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  });
}

export function parseAuditFilters(searchParams: URLSearchParams): AuditFilters {
  const page = parsePositiveInt(searchParams.get("page"), DEFAULT_PAGE, "page");
  const requestedPageSize = parsePositiveInt(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
    "pageSize",
  );
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

  const from = parseDate(searchParams.get("from"), "from");
  const to = parseDate(searchParams.get("to"), "to");

  if (from && to && from > to) {
    throw new AppError({
      message: "Invalid date range",
      userMessage: "La fecha inicial no puede ser mayor a la fecha final.",
      status: 400,
    });
  }

  return {
    action: clean(searchParams.get("action")),
    requestId: clean(searchParams.get("requestId")),
    applicationId: clean(searchParams.get("applicationId")),
    actorId: clean(searchParams.get("actorId")),
    from,
    to,
    page,
    pageSize,
  };
}

export async function getAuditEventsPage({
  supabase,
  filters,
}: {
  supabase: SupabaseClient<Database>;
  filters: AuditFilters;
}) {
  const offset = (filters.page - 1) * filters.pageSize;

  const baseQuery = supabase.from("audit_events").select(
    "id, actor_id, application_id, action, metadata, request_id, created_at",
    { count: "exact" },
  );
  const filtered = applyAuditFilters(baseQuery, filters);

  const { data, error, count } = await filtered
    .order("created_at", { ascending: false })
    .range(offset, offset + filters.pageSize - 1);

  if (error) {
    throw new AppError({
      message: "Failed loading audit events",
      userMessage: "No se pudo cargar la auditoría.",
      status: 500,
      details: error,
    });
  }

  const rows = (data as AuditRow[] | null) ?? [];
  const actorIds = Array.from(new Set(rows.map((row) => row.actor_id).filter(Boolean))) as string[];
  const profileMap = await loadProfileMap(supabase, actorIds);
  const events = mapAuditRowsToView(rows, profileMap);

  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / filters.pageSize);

  return {
    events,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages,
  };
}

export async function getAuditEventsForExport({
  supabase,
  filters,
  maxRows = MAX_EXPORT_ROWS,
}: {
  supabase: SupabaseClient<Database>;
  filters: AuditFilters;
  maxRows?: number;
}) {
  const baseQuery = supabase.from("audit_events").select(
    "id, actor_id, application_id, action, metadata, request_id, created_at",
    { count: "exact" },
  );
  const filtered = applyAuditFilters(baseQuery, filters);

  const { data, error, count } = await filtered
    .order("created_at", { ascending: false })
    .limit(maxRows);

  if (error) {
    throw new AppError({
      message: "Failed loading audit events for export",
      userMessage: "No se pudo exportar la auditoría.",
      status: 500,
      details: error,
    });
  }

  const rows = (data as AuditRow[] | null) ?? [];
  const actorIds = Array.from(new Set(rows.map((row) => row.actor_id).filter(Boolean))) as string[];
  const profileMap = await loadProfileMap(supabase, actorIds);
  const events = mapAuditRowsToView(rows, profileMap);

  return {
    events,
    total: count ?? rows.length,
    truncated: (count ?? rows.length) > rows.length,
    maxRows,
  };
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildAuditCsv(events: AuditEventListItem[]) {
  const header = [
    "created_at",
    "action",
    "request_id",
    "application_id",
    "actor_id",
    "actor_email",
    "actor_name",
    "metadata",
  ]
    .map(csvCell)
    .join(",");

  const rows = events.map((event) =>
    [
      event.createdAt,
      event.action,
      event.requestId,
      event.applicationId ?? "",
      event.actorId ?? "",
      event.actorEmail ?? "",
      event.actorName ?? "",
      JSON.stringify(event.metadata ?? {}),
    ]
      .map((cell) => csvCell(String(cell)))
      .join(","),
  );

  return [header, ...rows].join("\n");
}
