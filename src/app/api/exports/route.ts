import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import {
  buildApplicationsCsv,
  getApplicationExportPackage,
  getApplicationsForExport,
  parseApplicationExportFilters,
} from "@/lib/server/exports-service";

function buildCsvFileName() {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return `applications-export-${stamp}.csv`;
}

function buildApplicationFileName(applicationId: string) {
  return `application-${applicationId}.json`;
}

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const { supabase } = await requireAuth(["admin"]);
    const applicationId = request.nextUrl.searchParams.get("applicationId");

    if (applicationId) {
      const exportPackage = await getApplicationExportPackage({
        supabase,
        applicationId,
      });
      return new NextResponse(JSON.stringify(exportPackage, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${buildApplicationFileName(applicationId)}"`,
        },
      });
    }

    const filters = parseApplicationExportFilters(request.nextUrl.searchParams);
    const result = await getApplicationsForExport({ supabase, filters });
    const csv = buildApplicationsCsv(result.rows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildCsvFileName()}"`,
        "X-Export-Total-Rows": String(result.total),
        "X-Export-Truncated": String(result.truncated),
      },
    });
  }, { operation: "exports.applications_csv" });
}
