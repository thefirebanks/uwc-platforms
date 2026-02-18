import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { submitApplication } from "@/lib/server/application-service";
import { recordAuditEvent } from "@/lib/logging/audit";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["applicant"]);
    const { id } = await context.params;

    const { data: application } = await supabase
      .from("applications")
      .select("id, applicant_id")
      .eq("id", id)
      .maybeSingle();

    if (!application || application.applicant_id !== profile.id) {
      throw new AppError({
        message: "Application ownership mismatch",
        userMessage: "No tienes permiso para enviar esta postulación.",
        status: 403,
      });
    }

    const submitted = await submitApplication({
      supabase,
      applicationId: id,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: id,
      action: "application.submitted",
      metadata: { status: submitted.status },
      requestId,
    });

    return NextResponse.json({ application: submitted });
  }, { operation: "applications.submit" });
}
