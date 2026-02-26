import { redirect } from "next/navigation";
import {
  AdminCandidatesDashboard,
  type AdminCandidateRow,
  type CycleOption,
} from "@/components/admin-candidates-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Application, SelectionProcess } from "@/types/domain";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getCandidateName(application: Application) {
  const payload = application.payload as Record<string, unknown>;
  const explicit = pickString(payload.fullName);
  if (explicit) {
    return explicit;
  }

  const combined = [
    pickString(payload.firstName),
    pickString(payload.paternalLastName),
    pickString(payload.maternalLastName),
  ]
    .filter(Boolean)
    .join(" ");

  return combined || "Applicant Demo";
}

function getCandidateEmail(application: Application) {
  const payload = application.payload as Record<string, unknown>;
  return pickString(payload.email) || `${application.applicant_id.slice(0, 8)}@sin-correo.local`;
}

function getCandidateRegion(application: Application) {
  const payload = application.payload as Record<string, unknown>;
  return (
    pickString(payload.homeRegion) ||
    pickString(payload.schoolRegion) ||
    pickString(payload.region) ||
    "Sin región"
  );
}

export default async function AdminCandidatesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    cycleId?: string | string[];
    q?: string | string[];
    applicationId?: string | string[];
  }>;
}) {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  const supabase = await getSupabaseServerClient();
  const [{ data: cyclesData }, { data: applicationsData }] = await Promise.all([
    supabase.from("cycles").select("*").order("created_at", { ascending: false }),
    supabase.from("applications").select("*").order("updated_at", { ascending: false }),
  ]);

  const cycles = (cyclesData as SelectionProcess[] | null) ?? [];
  const applications = (applicationsData as Application[] | null) ?? [];
  const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle] as const));

  const cycleOptions: CycleOption[] = cycles.map((cycle) => ({
    id: cycle.id,
    name: cycle.name,
    isActive: cycle.is_active,
  }));

  const activeCycle = cycles.find((cycle) => cycle.is_active) ?? cycles[0] ?? null;
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedCycleId = Array.isArray(resolvedSearchParams.cycleId)
    ? resolvedSearchParams.cycleId[0]
    : resolvedSearchParams.cycleId;
  const requestedSearch = Array.isArray(resolvedSearchParams.q)
    ? resolvedSearchParams.q[0]
    : resolvedSearchParams.q;
  const requestedApplicationId = Array.isArray(resolvedSearchParams.applicationId)
    ? resolvedSearchParams.applicationId[0]
    : resolvedSearchParams.applicationId;
  const normalizedRequestedSearch =
    typeof requestedSearch === "string" &&
    requestedSearch.length > 0 &&
    requestedSearch !== requestedApplicationId
      ? requestedSearch
      : "";
  const initialCycleId =
    requestedCycleId && cycleOptions.some((cycle) => cycle.id === requestedCycleId)
      ? requestedCycleId
      : (activeCycle?.id ?? "all");

  const rows: AdminCandidateRow[] = applications
    .filter((application) => cycleById.has(application.cycle_id))
    .map((application) => {
      const cycle = cycleById.get(application.cycle_id)!;

      return {
        id: application.id,
        cycleId: application.cycle_id,
        cycleName: cycle.name,
        candidateName: getCandidateName(application),
        candidateEmail: getCandidateEmail(application),
        region: getCandidateRegion(application),
        stageCode: application.stage_code,
        status: application.status,
        updatedAt: application.updated_at,
      };
    });

  return (
    <AdminCandidatesDashboard
      cycleOptions={cycleOptions}
      initialRows={rows}
      defaultCycleId={initialCycleId}
      defaultSearch={normalizedRequestedSearch}
      focusApplicationId={typeof requestedApplicationId === "string" ? requestedApplicationId : ""}
    />
  );
}
