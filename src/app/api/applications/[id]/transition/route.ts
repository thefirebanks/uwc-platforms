import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { transitionApplication } from "@/lib/server/application-service";
import { recordAuditEvent } from "@/lib/logging/audit";

const schema = z.object({
  toStage: z.enum(["documents", "exam_placeholder"]),
  reason: z.string().min(4),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid transition payload",
        userMessage: "No se pudo procesar el cambio de etapa.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const application = await transitionApplication({
      supabase,
      applicationId: id,
      toStage: parsed.data.toStage,
      reason: parsed.data.reason,
      actorId: profile.id,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: id,
      action: "application.stage_transitioned",
      metadata: {
        to: parsed.data.toStage,
        reason: parsed.data.reason,
      },
      requestId,
    });

    return NextResponse.json({ application });
  }, { operation: "applications.transition" });
}
