import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { replySupportTicket } from "@/lib/server/support-service";
import { recordAuditEvent } from "@/lib/logging/audit";

const schema = z.object({
  adminReply: z.string().min(1).max(5000),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async (requestId) => {
      const { profile, supabase } = await requireAuth(["admin"]);
      const { id } = await context.params;
      const body = await request.json();
      const parsed = schema.safeParse(body);

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid reply payload",
          userMessage: "La respuesta enviada no es válida.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const ticket = await replySupportTicket({
        supabase,
        ticketId: id,
        adminReply: parsed.data.adminReply,
        repliedBy: profile.id,
      });

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        applicationId: ticket.application_id,
        action: "support_ticket.replied",
        metadata: { ticketId: id },
        requestId,
      });

      return NextResponse.json({ ticket });
    },
    { operation: "support.reply" },
  );
}
