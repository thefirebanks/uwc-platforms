import { redirect } from "next/navigation";
import {
  AdminCandidatesDashboard,
  type CycleOption,
} from "@/components/admin-candidates-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SelectionProcess } from "@/types/domain";

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
  const { data: cyclesData } = await supabase
    .from("cycles")
    .select("*")
    .order("created_at", { ascending: false });

  const cycles = (cyclesData as SelectionProcess[] | null) ?? [];

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

  const normalizedSearch =
    typeof requestedSearch === "string" &&
    requestedSearch.length > 0 &&
    requestedSearch !== requestedApplicationId
      ? requestedSearch
      : "";

  const initialCycleId =
    requestedCycleId && cycleOptions.some((c) => c.id === requestedCycleId)
      ? requestedCycleId
      : (activeCycle?.id ?? "all");

  return (
    <AdminCandidatesDashboard
      cycleOptions={cycleOptions}
      defaultCycleId={initialCycleId}
      defaultSearch={normalizedSearch}
      focusApplicationId={typeof requestedApplicationId === "string" ? requestedApplicationId : ""}
    />
  );
}
