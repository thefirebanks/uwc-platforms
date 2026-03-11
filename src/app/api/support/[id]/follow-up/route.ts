import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { followUpSupportTicket } from "@/lib/server/support-service";
import { recordAuditEvent } from "@/lib/logging/audit";

const schema = z.object({
  body: z.string().min(10, "El seguimiento debe tener al menos 10 caracteres.").max(2000),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async (requestId) => {
      const { profile, supabase } = await requireAuth(["applicant"]);
      const { id } = await context.params;
      const payload = await request.json();
      const parsed = schema.safeParse(payload);

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid support follow-up payload",
          userMessage: "El mensaje enviado no es válido.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const ticket = await followUpSupportTicket({
        supabase,
        ticketId: id,
        applicantId: profile.id,
        message: parsed.data.body,
      });

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        applicationId: ticket.application_id,
        action: "support_ticket.follow_up",
        metadata: { ticketId: id },
        requestId,
      });

      return NextResponse.json({ ticket });
    },
    { operation: "support.follow_up" },
  );
}
