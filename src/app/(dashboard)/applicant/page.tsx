import { redirect } from "next/navigation";
import { Box, Container } from "@mui/material";
import {
  ApplicantProcessesDashboard,
  type ApplicantApplicationSummary,
  type StageTemplateSummary,
  type RecentTransition,
} from "@/components/applicant-processes-dashboard";
import { ApplicantTopNav } from "@/components/applicant-top-nav";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SelectionProcess } from "@/types/domain";

export default async function ApplicantPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "applicant") {
    redirect("/admin");
  }

  const supabase = await getSupabaseServerClient();

  // Fetch applications first so we can scope the cycles query
  const { data: applications } = await supabase
    .from("applications")
    .select("id, cycle_id, status, stage_code, updated_at")
    .eq("applicant_id", profile.id)
    .order("updated_at", { ascending: false });

  const appliedCycleIds = ((applications ?? []) as ApplicantApplicationSummary[]).map(
    (a) => a.cycle_id,
  );

  // Only fetch cycles that are active OR that this applicant has applied to.
  // This prevents orphan seed/test cycles from appearing in the dashboard.
  const cyclesQuery = supabase
    .from("cycles")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: cycles } =
    appliedCycleIds.length > 0
      ? await cyclesQuery.or(`is_active.eq.true,id.in.(${appliedCycleIds.join(",")})`)
      : await cyclesQuery.eq("is_active", true);

  const applicationIds = ((applications ?? []) as ApplicantApplicationSummary[]).map((a) => a.id);
  const applicationRows = (applications as ApplicantApplicationSummary[] | null) ?? [];
  const cycleRows = (cycles as SelectionProcess[] | null) ?? [];
  const activeCycleIds = new Set(cycleRows.filter((cycle) => cycle.is_active).map((cycle) => cycle.id));
  const activeApplication = applicationRows.find((app) => activeCycleIds.has(app.cycle_id)) ?? null;
  const latestApplication = applicationRows[0] ?? null;
  const currentProcessHref =
    activeApplication?.cycle_id
      ? `/applicant/process/${activeApplication.cycle_id}`
      : latestApplication?.cycle_id
        ? `/applicant/process/${latestApplication.cycle_id}`
        : null;

  // eslint-disable-next-line react-hooks/purity -- server component; Date.now() is safe here
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch stage templates and recent transitions only if there are applications
  const [{ data: stageTemplates }, { data: recentTransitions }] =
    applicationIds.length > 0
      ? await Promise.all([
          supabase
            .from("cycle_stage_templates")
            .select("cycle_id, stage_code, stage_label, sort_order")
            .in(
              "cycle_id",
              ((applications ?? []) as ApplicantApplicationSummary[]).map((a) => a.cycle_id),
            ),
          supabase
            .from("stage_transitions")
            .select("application_id, from_stage, to_stage, created_at")
            .in("application_id", applicationIds)
            .gte(
              "created_at",
              sevenDaysAgo,
            )
            .order("created_at", { ascending: false })
            .limit(10),
        ])
      : [{ data: [] }, { data: [] }];

  return (
    <>
      <ApplicantTopNav
        accountDisplayName={profile.full_name ?? null}
        accountEmail={profile.email}
        currentProcessHref={currentProcessHref}
      />
      <Box sx={{ pt: "var(--topbar-height)" }}>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <ApplicantProcessesDashboard
            processes={(cycles as SelectionProcess[] | null) ?? []}
            applications={(applications as ApplicantApplicationSummary[] | null) ?? []}
            maxApplications={3}
            stageTemplates={(stageTemplates as StageTemplateSummary[] | null) ?? []}
            recentTransitions={(recentTransitions as RecentTransition[] | null) ?? []}
            applicantName={profile.full_name ?? null}
          />
        </Container>
      </Box>
    </>
  );
}
