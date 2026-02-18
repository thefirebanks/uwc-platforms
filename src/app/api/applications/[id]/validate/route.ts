import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { validateApplication } from "@/lib/server/application-service";
import { recordAuditEvent } from "@/lib/logging/audit";

const validateSchema = z.object({
  status: z.enum(["eligible", "ineligible"]),
  notes: z.string().min(4),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = validateSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid validation payload",
        userMessage: "La validación enviada no es válida.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const application = await validateApplication({
      supabase,
      applicationId: id,
      status: parsed.data.status,
      notes: parsed.data.notes,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: id,
      action: "application.validated",
      metadata: { status: parsed.data.status },
      requestId,
    });

    return NextResponse.json({ application });
  }, { operation: "applications.validate" });
}
