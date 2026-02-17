import { NextRequest, NextResponse } from "next/server";
import { applicationSchema } from "@/lib/validation/application";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import {
  getApplicantApplication,
  getApplicationsForAdmin,
  upsertApplicantApplication,
} from "@/lib/server/application-service";
import { recordAuditEvent } from "@/lib/logging/audit";

export async function GET() {
  return withErrorHandling(async () => {
    const { profile, supabase } = await requireAuth(["admin", "applicant"]);

    if (profile.role === "admin") {
      const applications = await getApplicationsForAdmin(supabase);
      return NextResponse.json({ applications });
    }

    const application = await getApplicantApplication(supabase, profile.id);
    return NextResponse.json({ application });
  });
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["applicant"]);
    const body = await request.json();

    const parsed = applicationSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError({
        message: "Invalid application payload",
        userMessage: "Hay campos inválidos en tu postulación. Revisa el formulario.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const application = await upsertApplicantApplication({
      supabase,
      applicantId: profile.id,
      payload: parsed.data,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: application.id,
      action: "application.upserted",
      metadata: { stage: application.stage_code, status: application.status },
      requestId,
    });

    return NextResponse.json({ application });
  });
}
