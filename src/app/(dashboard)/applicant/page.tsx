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

  const [
    { data: cycles },
    { data: applications },
  ] = await Promise.all([
    supabase.from("cycles").select("*").order("created_at", { ascending: false }),
    supabase
      .from("applications")
      .select("id, cycle_id, status, stage_code, updated_at")
      .eq("applicant_id", profile.id)
      .order("updated_at", { ascending: false }),
  ]);

  const applicationIds = ((applications ?? []) as ApplicantApplicationSummary[]).map((a) => a.id);

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
              new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            )
            .order("created_at", { ascending: false })
            .limit(10),
        ])
      : [{ data: [] }, { data: [] }];

  return (
    <>
      <ApplicantTopNav />
      <Box sx={{ pt: "var(--topbar-height)" }}>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <ApplicantProcessesDashboard
            processes={(cycles as SelectionProcess[] | null) ?? []}
            applications={(applications as ApplicantApplicationSummary[] | null) ?? []}
            maxApplications={3}
            stageTemplates={(stageTemplates as StageTemplateSummary[] | null) ?? []}
            recentTransitions={(recentTransitions as RecentTransition[] | null) ?? []}
          />
        </Container>
      </Box>
    </>
  );
}
