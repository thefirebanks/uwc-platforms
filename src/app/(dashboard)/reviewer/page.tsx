import { redirect } from "next/navigation";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { ReviewerDashboard } from "@/components/reviewer-dashboard";

export default async function ReviewerPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "reviewer") {
    redirect(profile.role === "admin" ? "/admin" : "/applicant");
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1100px", margin: "0 auto" }}>
      <h1
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: "var(--ink)",
          marginBottom: "8px",
        }}
      >
        Panel de Revisor
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: "24px" }}>
        Postulaciones asignadas para revisión.
      </p>
      <ReviewerDashboard />
    </div>
  );
}
