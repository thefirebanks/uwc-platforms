import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import type { Database } from "@/types/supabase";
import type { ApplicationStatus, EligibilityOutcome, StageCode } from "@/types/domain";
import { getApplicationName } from "@/lib/server/application-service";
import { getLatestStageEvaluationsByApplicationId } from "@/lib/server/eligibility-rubric-service";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type SearchApplicationsInput = {
  cycleId?: string;
  query?: string;
  stageCode?: StageCode;
  status?: ApplicationStatus;
  page: number;
  pageSize: number;
  sortBy: "updated_at" | "created_at" | "full_name";
  sortOrder: "asc" | "desc";
};

export type AdminCandidateRow = {
  id: string;
  cycleId: string;
  cycleName: string;
  applicantId: string;
  candidateName: string;
  candidateEmail: string;
  region: string;
  stageCode: string;
  status: ApplicationStatus;
  reviewOutcome: EligibilityOutcome | null;
  reviewEvaluatedAt: string | null;
  updatedAt: string;
};

export type SearchApplicationsResult = {
  rows: AdminCandidateRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSearchInput(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/\p{M}+/gu, "");
}

function sanitizeSearchQuery(raw: string): string {
  return raw
    .replace(/[<>:;!@#$%^&*()[\]{}|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchProfilesByFallback({
  supabase,
  rawQuery,
}: {
  supabase: SupabaseClient<Database>;
  rawQuery: string;
}) {
  const normalized = normalizeSearchInput(rawQuery);
  if (!normalized) {
    return [];
  }

  const queryVariants = Array.from(
    new Set([
      normalized,
      stripDiacritics(normalized),
      normalized.toLowerCase(),
      stripDiacritics(normalized.toLowerCase()),
    ]),
  ).filter(Boolean);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name");

  if (error) {
    throw new AppError({
      message: "Profile fallback search failed",
      userMessage: "Error al buscar candidatos.",
      status: 500,
      details: error,
    });
  }

  const matched = (data ?? []).filter((profile) => {
    const haystack = `${profile.full_name ?? ""} ${profile.email ?? ""}`;
    const normalizedHaystack = stripDiacritics(haystack.toLowerCase());
    return queryVariants.some((variant) =>
      normalizedHaystack.includes(stripDiacritics(variant.toLowerCase())),
    );
  });

  return matched.map((profile) => profile.id);
}

/* -------------------------------------------------------------------------- */
/*  Main search function                                                      */
/* -------------------------------------------------------------------------- */

export async function searchApplications({
  supabase,
  input,
}: {
  supabase: SupabaseClient<Database>;
  input: SearchApplicationsInput;
}): Promise<SearchApplicationsResult> {
  const pageSize = Math.max(1, Math.min(input.pageSize, 200));
  const page = Math.max(1, input.page);
  const offset = (page - 1) * pageSize;

  /* ---- Step 1: text search → matching profile IDs ---- */
  let matchingProfileIds: string[] | null = null;

  if (input.query) {
    const rawQuery = normalizeSearchInput(input.query);
    const sanitized = sanitizeSearchQuery(rawQuery);
    if (sanitized.length === 0) {
      return { rows: [], total: 0, page, pageSize, totalPages: 0 };
    }

    const { data: profiles, error: searchError } = await supabase
      .from("profiles")
      .select("id")
      .textSearch("search_vector", sanitized, {
        type: "websearch",
        config: "spanish",
      });

    if (searchError) {
      matchingProfileIds = await searchProfilesByFallback({
        supabase,
        rawQuery,
      });
    } else {
      matchingProfileIds = (profiles ?? []).map((p) => p.id);
      if (matchingProfileIds.length === 0) {
        matchingProfileIds = await searchProfilesByFallback({
          supabase,
          rawQuery,
        });
      }
    }

    // No matching profiles → empty result
    if (matchingProfileIds.length === 0) {
      return { rows: [], total: 0, page, pageSize, totalPages: 0 };
    }
  }

  /* ---- Step 2: query applications with filters + pagination ---- */
  let query = supabase
    .from("applications")
    .select(
      "id, applicant_id, cycle_id, stage_code, status, payload, updated_at",
      { count: "exact" },
    );

  if (input.cycleId) {
    query = query.eq("cycle_id", input.cycleId);
  }
  if (input.stageCode) {
    query = query.eq("stage_code", input.stageCode);
  }
  if (input.status) {
    query = query.eq("status", input.status);
  }
  if (matchingProfileIds) {
    query = query.in("applicant_id", matchingProfileIds);
  }

  // Sorting: for "full_name" we sort client-side after fetching (see below).
  // For DB columns we sort server-side.
  if (input.sortBy !== "full_name") {
    query = query.order(input.sortBy, {
      ascending: input.sortOrder === "asc",
    });
  } else {
    // Default ordering for name-sorted results (we re-sort client-side)
    query = query.order("updated_at", { ascending: false });
  }

  query = query.range(offset, offset + pageSize - 1);

  const { data: applications, error: appError, count } = await query;

  if (appError) {
    throw new AppError({
      message: "Failed to search applications",
      userMessage: "No se pudo buscar las postulaciones.",
      status: 500,
      details: appError,
    });
  }

  const appRows = (applications ?? []) as ApplicationRow[];
  const total = count ?? 0;

  if (appRows.length === 0) {
    return { rows: [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /* ---- Step 3: batch-fetch profiles for these applications ---- */
  const applicantIds = [...new Set(appRows.map((a) => a.applicant_id))];
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", applicantIds);

  if (profileError) {
    throw new AppError({
      message: "Failed to fetch profiles",
      userMessage: "No se pudieron cargar los perfiles de los postulantes.",
      status: 500,
      details: profileError,
    });
  }

  const profileMap = new Map<string, ProfileRow>();
  for (const p of profileRows ?? []) {
    profileMap.set(p.id, p as ProfileRow);
  }

  /* ---- Step 4: batch-fetch cycle names ---- */
  const cycleIds = [...new Set(appRows.map((a) => a.cycle_id))];
  const { data: cycleRows, error: cycleError } = await supabase
    .from("cycles")
    .select("id, name")
    .in("id", cycleIds);

  if (cycleError) {
    throw new AppError({
      message: "Failed to fetch cycles",
      userMessage: "No se pudieron cargar los procesos de selección.",
      status: 500,
      details: cycleError,
    });
  }

  const cycleMap = new Map<string, string>();
  for (const c of cycleRows ?? []) {
    cycleMap.set(c.id, c.name);
  }

  const evaluationMap = await getLatestStageEvaluationsByApplicationId({
    supabase,
    applicationIds: appRows.map((row) => row.id),
  });

  /* ---- Step 5: map to AdminCandidateRow ---- */
  const rows: AdminCandidateRow[] = appRows.map((app) => {
    const profile = profileMap.get(app.applicant_id);
    const payload = (app.payload ?? {}) as Record<string, unknown>;
    const evaluation = evaluationMap.get(`${app.id}:${app.stage_code}`);

    return {
      id: app.id,
      cycleId: app.cycle_id,
      cycleName: cycleMap.get(app.cycle_id) ?? "—",
      applicantId: app.applicant_id,
      candidateName: getApplicationName(app as unknown as import("@/types/domain").Application),
      candidateEmail: profile?.email ?? "—",
      region: pickString(payload.region),
      stageCode: app.stage_code,
      status: app.status as ApplicationStatus,
      reviewOutcome: (evaluation?.outcome as EligibilityOutcome | undefined) ?? null,
      reviewEvaluatedAt: evaluation?.evaluated_at ?? null,
      updatedAt: app.updated_at,
    };
  });

  /* ---- Step 6: client-side sort for full_name ---- */
  if (input.sortBy === "full_name") {
    rows.sort((a, b) => {
      const cmp = a.candidateName.localeCompare(b.candidateName, "es");
      return input.sortOrder === "asc" ? cmp : -cmp;
    });
  }

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
