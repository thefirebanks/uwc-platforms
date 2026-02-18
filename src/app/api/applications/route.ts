import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

const cycleIdSchema = z.string().uuid();

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const { profile, supabase } = await requireAuth(["admin", "applicant"]);
    const rawCycleId = request.nextUrl.searchParams.get("cycleId");
    let cycleId: string | undefined;

    if (rawCycleId) {
      const parsed = cycleIdSchema.safeParse(rawCycleId);
      if (!parsed.success) {
        throw new AppError({
          message: "Invalid cycle id filter",
          userMessage: "El proceso seleccionado no es válido.",
          status: 400,
        });
      }
      cycleId = parsed.data;
    }

    if (profile.role === "admin") {
      const applications = await getApplicationsForAdmin(supabase, cycleId);
      return NextResponse.json({ applications });
    }

    const application = await getApplicantApplication(supabase, profile.id, cycleId);
    return NextResponse.json({ application });
  }, { operation: "applications.get" });
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["applicant"]);
    const body = await request.json();
    const cycleId =
      typeof body.cycleId === "string" && body.cycleId.trim().length > 0 ? body.cycleId : undefined;

    if (cycleId) {
      const cycleIdParsed = cycleIdSchema.safeParse(cycleId);
      if (!cycleIdParsed.success) {
        throw new AppError({
          message: "Invalid cycle id payload",
          userMessage: "El proceso seleccionado no es válido.",
          status: 400,
        });
      }
    }

    const payload = {
      fullName: body.fullName,
      dateOfBirth: body.dateOfBirth,
      nationality: body.nationality,
      schoolName: body.schoolName,
      gradeAverage: body.gradeAverage,
      essay: body.essay,
    };

    const parsed = applicationSchema.safeParse(payload);
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
      cycleId,
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
  }, { operation: "applications.upsert" });
}
