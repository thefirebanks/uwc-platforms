import { redirect } from "next/navigation";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { AdminReviewerManagement } from "@/components/admin-reviewer-management";

export default async function AdminReviewersPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
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
        Gestión de Revisores
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: "24px" }}>
        Agrega o revoca revisores y gestiona sus asignaciones.
      </p>
      <AdminReviewerManagement />
    </div>
  );
}
