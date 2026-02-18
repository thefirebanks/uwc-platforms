import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import { getAuditEventsPage, parseAuditFilters } from "@/lib/server/audit-service";

export async function GET(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const filters = parseAuditFilters(request.nextUrl.searchParams);
      const result = await getAuditEventsPage({ supabase, filters });
      return NextResponse.json(result);
    },
    { operation: "audit.list" },
  );
}
