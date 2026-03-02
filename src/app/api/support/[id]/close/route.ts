import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import { closeSupportTicket } from "@/lib/server/support-service";
import { recordAuditEvent } from "@/lib/logging/audit";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async (requestId) => {
      const { profile, supabase } = await requireAuth(["admin"]);
      const { id } = await context.params;

      const ticket = await closeSupportTicket({ supabase, ticketId: id });

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        applicationId: ticket.application_id,
        action: "support_ticket.closed",
        metadata: { ticketId: id },
        requestId,
      });

      return NextResponse.json({ ticket });
    },
    { operation: "support.close" },
  );
}
