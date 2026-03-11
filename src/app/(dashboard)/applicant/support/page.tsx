import { redirect } from "next/navigation";
import { Box, Container } from "@mui/material";
import { ApplicantTopNav } from "@/components/applicant-top-nav";
import { ApplicantSupportCenter } from "@/components/applicant-support-center";
import { ApplicantCommunicationsDashboard } from "@/components/applicant-communications-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ApplicantApplication = {
  id: string;
  cycle_id: string;
  updated_at: string;
};

type CycleState = {
  id: string;
  is_active: boolean;
};

export default async function ApplicantSupportPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "applicant") {
    redirect("/admin");
  }

  const supabase = await getSupabaseServerClient();
  const { data: applications } = await supabase
    .from("applications")
    .select("id, cycle_id, updated_at")
    .eq("applicant_id", profile.id)
    .order("updated_at", { ascending: false });

  const appRows = (applications as ApplicantApplication[] | null) ?? [];
  const cycleIds = [...new Set(appRows.map((app) => app.cycle_id))];

  const { data: cycles } =
    cycleIds.length > 0
      ? await supabase.from("cycles").select("id, is_active").in("id", cycleIds)
      : { data: [] as CycleState[] };

  const activeCycleIds = new Set(((cycles as CycleState[] | null) ?? []).filter((c) => c.is_active).map((c) => c.id));
  const activeApplication = appRows.find((app) => activeCycleIds.has(app.cycle_id)) ?? null;
  const latestApplication = appRows[0] ?? null;

  const defaultApplicationId = activeApplication?.id ?? latestApplication?.id ?? null;
  const currentProcessHref =
    activeApplication?.cycle_id
      ? `/applicant/process/${activeApplication.cycle_id}`
      : latestApplication?.cycle_id
        ? `/applicant/process/${latestApplication.cycle_id}`
        : null;

  return (
    <>
      <ApplicantTopNav
        accountDisplayName={profile.full_name ?? null}
        accountEmail={profile.email}
        currentProcessHref={currentProcessHref}
      />
      <Box sx={{ pt: "var(--topbar-height)" }}>
        <Container maxWidth="lg" sx={{ py: 4, display: "grid", gap: 2.5 }}>
          <section
            style={{
              border: "1px solid var(--sand)",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface)",
              padding: "20px 22px",
            }}
          >
            <h1
              style={{
                margin: "0 0 6px",
                fontSize: "1.4rem",
                color: "var(--ink)",
                fontWeight: 700,
              }}
            >
              Soporte
            </h1>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--ink-light)" }}>
              Administra tus consultas, responde dentro del mismo hilo y revisa notificaciones de respuestas.
            </p>
          </section>

          <ApplicantSupportCenter defaultApplicationId={defaultApplicationId} />

          <section
            style={{
              border: "1px solid var(--sand)",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface)",
              padding: "16px 18px",
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: "15px", color: "var(--ink)" }}>Notificaciones</h2>
            <ApplicantCommunicationsDashboard />
          </section>
        </Container>
      </Box>
    </>
  );
}
