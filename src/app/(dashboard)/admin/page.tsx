import { redirect } from "next/navigation";
import {
  AdminHomeDashboard,
  type AdminHomeActivity,
  type AdminHomeStat,
} from "@/components/admin-home-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Application, CycleStageTemplate, SelectionProcess } from "@/types/domain";

function formatRelativeTime(dateIso: string) {
  const deltaMs = Date.now() - new Date(dateIso).getTime();
  const deltaMinutes = Math.max(1, Math.floor(deltaMs / (1000 * 60)));

  if (deltaMinutes < 60) {
    return `Hace ${deltaMinutes} minuto${deltaMinutes === 1 ? "" : "s"}`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `Hace ${deltaHours} hora${deltaHours === 1 ? "" : "s"}`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `Hace ${deltaDays} día${deltaDays === 1 ? "" : "s"}`;
}

function getApplicantName(application: Application) {
  const payload = application.payload as Record<string, unknown>;
  const explicit = typeof payload.fullName === "string" ? payload.fullName.trim() : "";
  if (explicit.length > 0) {
    return explicit;
  }

  const firstName = typeof payload.firstName === "string" ? payload.firstName.trim() : "";
  const paternalLastName =
    typeof payload.paternalLastName === "string" ? payload.paternalLastName.trim() : "";
  const maternalLastName =
    typeof payload.maternalLastName === "string" ? payload.maternalLastName.trim() : "";

  const combined = [firstName, paternalLastName, maternalLastName]
    .filter((part) => part.length > 0)
    .join(" ");

  return combined.length > 0 ? combined : "Postulante";
}

export default async function AdminPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  const supabase = await getSupabaseServerClient();
  const { data: cycles } = await supabase.from("cycles").select("*").order("created_at", {
    ascending: false,
  });

  const orderedCycles = (cycles as SelectionProcess[] | null) ?? [];
  const activeCycle = orderedCycles.find((cycle) => cycle.is_active) ?? orderedCycles[0] ?? null;
  const { data: activeCycleTemplatesData } = activeCycle
    ? await supabase
        .from("cycle_stage_templates")
        .select("id, cycle_id, stage_code, sort_order")
        .eq("cycle_id", activeCycle.id)
        .order("sort_order", { ascending: true })
    : { data: [] as CycleStageTemplate[] };

  const { data: activeCycleApplicationsData } = activeCycle
    ? await supabase
        .from("applications")
        .select("*")
        .eq("cycle_id", activeCycle.id)
        .order("updated_at", { ascending: false })
    : { data: [] as Application[] };

  const activeCycleApplications = (activeCycleApplicationsData as Application[] | null) ?? [];
  const activeCycleTemplates =
    (activeCycleTemplatesData as Pick<CycleStageTemplate, "id" | "stage_code" | "sort_order">[] | null) ?? [];
  const primaryActiveTemplateId =
    activeCycleTemplates.find((template) => template.stage_code === "documents")?.id ??
    activeCycleTemplates[0]?.id ??
    null;

  const totalApplications = activeCycleApplications.length;
  const completedForms = activeCycleApplications.filter(
    (application) => application.status !== "draft",
  ).length;
  const pendingEvaluations = activeCycleApplications.filter(
    (application) => application.status === "submitted",
  ).length;

  const conversionRate =
    totalApplications > 0
      ? Math.round((completedForms / totalApplications) * 100)
      : 0;

  const stats: AdminHomeStat[] = [
    {
      title: "POSTULACIONES TOTALES",
      value: String(totalApplications),
      trendLabel: totalApplications > 0 ? `${totalApplications} registradas` : "Sin registros aún",
      trendTone: totalApplications > 0 ? "up" : "neutral",
    },
    {
      title: "FORMULARIOS COMPLETADOS",
      value: String(completedForms),
      trendLabel:
        totalApplications > 0 ? `${conversionRate}% de conversión` : "Sin datos de conversión",
      trendTone: completedForms > 0 ? "up" : "neutral",
    },
    {
      title: "EVALUACIONES PENDIENTES",
      value: String(pendingEvaluations),
      trendLabel:
        pendingEvaluations > 0 ? "Requiere atención" : "Sin pendientes críticos",
      trendTone: pendingEvaluations > 0 ? "down" : "up",
    },
  ];

  const activities: AdminHomeActivity[] = activeCycleApplications.slice(0, 4).map((application) => {
    const isSubmittedLike = application.status !== "draft";
    const statusText =
      application.status === "advanced"
        ? "avanzó de etapa"
        : application.status === "eligible"
          ? "fue marcado/a elegible"
          : application.status === "ineligible"
            ? "fue marcado/a no elegible"
            : application.status === "submitted"
              ? "envió su formulario principal"
              : "actualizó su borrador";

    return {
      id: application.id,
      text: `${getApplicantName(application)} ${statusText}.`,
      timeLabel: formatRelativeTime(application.updated_at),
      icon: isSubmittedLike ? "✓" : "📝",
      iconTone: isSubmittedLike ? "green" : "blue",
      actionHref: `/admin/candidates?cycleId=${application.cycle_id}&applicationId=${application.id}`,
      actionLabel: "Ver perfil",
    } satisfies AdminHomeActivity;
  });

  return (
    <AdminHomeDashboard
      activeProcessName={activeCycle?.name ?? null}
      activeProcessEditorHref={
        activeCycle && primaryActiveTemplateId
          ? `/admin/process/${activeCycle.id}/stage/${primaryActiveTemplateId}`
          : null
      }
      stats={stats}
      activities={activities}
    />
  );
}
