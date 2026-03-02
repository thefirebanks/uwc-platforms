import { redirect } from "next/navigation";
import { AdminSupportDashboard } from "@/components/admin-support-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";

export default async function AdminSupportPage() {
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
          marginBottom: "24px",
        }}
      >
        Soporte
      </h1>
      <AdminSupportDashboard />
    </div>
  );
}
