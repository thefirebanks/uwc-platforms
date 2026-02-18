import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import {
  buildAuditCsv,
  getAuditEventsForExport,
  parseAuditFilters,
} from "@/lib/server/audit-service";

function buildFileName() {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return `audit-events-${stamp}.csv`;
}

export async function GET(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const filters = parseAuditFilters(request.nextUrl.searchParams);
      const result = await getAuditEventsForExport({ supabase, filters });
      const csv = buildAuditCsv(result.events);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${buildFileName()}"`,
          "X-Audit-Total-Rows": String(result.total),
          "X-Audit-Truncated": String(result.truncated),
        },
      });
    },
    { operation: "audit.export" },
  );
}
