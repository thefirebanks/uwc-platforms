import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";

export async function GET() {
  return withErrorHandling(async () => {
    const { supabase } = await requireAuth(["admin"]);
    const { data: applications } = await supabase
      .from("applications")
      .select("id, applicant_id, stage_code, status, updated_at");

    const header = "application_id,applicant_id,stage,status,updated_at";
    const rows = (applications ?? []).map(
      (row) => `${row.id},${row.applicant_id},${row.stage_code},${row.status},${row.updated_at}`,
    );
    const csv = [header, ...rows].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="applications-export.csv"',
      },
    });
  });
}
