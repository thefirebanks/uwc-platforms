import { redirect } from "next/navigation";
import { AdminAuditLog } from "@/components/admin-audit-log";
import { getSessionProfileOrRedirect } from "@/lib/server/session";

export default async function AdminAuditPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  return <AdminAuditLog />;
}
