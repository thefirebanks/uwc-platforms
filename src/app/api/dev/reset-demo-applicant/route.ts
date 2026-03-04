import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/supabase";

const devBypassEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_BYPASS === "true";
const demoApplicantEmail = process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL;
const demoApplicant2Email =
  process.env.NEXT_PUBLIC_DEMO_APPLICANT_2_EMAIL ?? "applicant.demo2@uwcperu.org";

const requestSchema = z.object({
  email: z.string().email().optional(),
});

type ApplicationRowForReset = {
  id: string;
  files: Json;
};

function collectStoredFilePaths(files: Json): string[] {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    return [];
  }

  return Object.values(files as Record<string, Json>).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const path = (entry as Record<string, Json>).path;
    return typeof path === "string" && path.trim() ? [path.trim()] : [];
  });
}

export async function POST(request: Request) {
  return withErrorHandling(async () => {
    if (!devBypassEnabled) {
      throw new AppError({
        message: "Demo reset disabled",
        userMessage: "La limpieza de demo está deshabilitada en este entorno.",
        status: 404,
      });
    }

    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = requestSchema.parse(body);
    const allowedDemoEmails = [demoApplicantEmail, demoApplicant2Email]
      .filter((email): email is string => Boolean(email))
      .map((email) => email.trim().toLowerCase());

    if (allowedDemoEmails.length === 0) {
      throw new AppError({
        message: "Missing demo applicant email",
        userMessage: "Falta configurar el correo del postulante demo.",
        status: 500,
      });
    }

    const requestedEmail = parsed.email?.trim().toLowerCase();
    const targetEmail = requestedEmail ?? allowedDemoEmails[0];

    if (!allowedDemoEmails.includes(targetEmail)) {
      throw new AppError({
        message: "Unknown demo applicant email",
        userMessage: "El correo demo solicitado no está permitido en este entorno.",
        status: 422,
      });
    }

    const supabase = getSupabaseAdminClient();

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", targetEmail)
      .maybeSingle();

    if (profileError || !profileData) {
      throw new AppError({
        message: "Demo applicant profile not found",
        userMessage: "No se encontró el perfil del postulante demo.",
        status: 404,
        details: profileError,
      });
    }

    const applicantId = profileData.id;
    const { data: applicationRows, error: applicationError } = await supabase
      .from("applications")
      .select("id, files")
      .eq("applicant_id", applicantId);

    if (applicationError) {
      throw new AppError({
        message: "Failed listing demo applications",
        userMessage: "No se pudo obtener la postulación demo para reiniciarla.",
        status: 500,
        details: applicationError,
      });
    }

    const applications = (applicationRows as ApplicationRowForReset[] | null) ?? [];
    const applicationIds = applications.map((row) => row.id);
    const filePaths = Array.from(
      new Set(applications.flatMap((row) => collectStoredFilePaths(row.files))),
    );

    let removedStorageObjects = 0;
    let storageWarning: string | null = null;

    if (filePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("application-documents")
        .remove(filePaths);

      if (storageError) {
        storageWarning = storageError.message;
      } else {
        removedStorageObjects = filePaths.length;
      }
    }

    const deletedByTable: Record<string, number> = {
      application_ocr_checks: 0,
      recommendation_requests: 0,
      stage_transitions: 0,
      exam_imports: 0,
      communication_logs: 0,
      audit_events: 0,
      applications: 0,
    };

    if (applicationIds.length > 0) {
      const childDeletes = await Promise.all([
        supabase.from("application_ocr_checks").delete().in("application_id", applicationIds),
        supabase.from("recommendation_requests").delete().in("application_id", applicationIds),
        supabase.from("stage_transitions").delete().in("application_id", applicationIds),
        supabase.from("exam_imports").delete().in("application_id", applicationIds),
        supabase.from("communication_logs").delete().in("application_id", applicationIds),
        supabase.from("audit_events").delete().in("application_id", applicationIds),
      ]);

      const deleteErrors = childDeletes
        .map((result) => result.error)
        .filter((error) => error !== null);

      if (deleteErrors.length > 0) {
        throw new AppError({
          message: "Failed deleting demo application children",
          userMessage: "No se pudo limpiar completamente la postulación demo.",
          status: 500,
          details: deleteErrors,
        });
      }

      deletedByTable.application_ocr_checks = childDeletes[0].count ?? 0;
      deletedByTable.recommendation_requests = childDeletes[1].count ?? 0;
      deletedByTable.stage_transitions = childDeletes[2].count ?? 0;
      deletedByTable.exam_imports = childDeletes[3].count ?? 0;
      deletedByTable.communication_logs = childDeletes[4].count ?? 0;
      deletedByTable.audit_events = childDeletes[5].count ?? 0;
    }

    const { error: deleteApplicationsError, count: deletedApplicationsCount } = await supabase
      .from("applications")
      .delete({ count: "exact" })
      .eq("applicant_id", applicantId);

    if (deleteApplicationsError) {
      throw new AppError({
        message: "Failed deleting demo applications",
        userMessage: "No se pudo reiniciar la postulación demo.",
        status: 500,
        details: deleteApplicationsError,
      });
    }

    deletedByTable.applications = deletedApplicationsCount ?? applicationIds.length;

    return NextResponse.json({
      success: true,
      demoApplicantEmail: targetEmail,
      applicantId,
      deletedByTable,
      storage: {
        removedObjects: removedStorageObjects,
        attemptedObjects: filePaths.length,
        warning: storageWarning,
      },
    });
  }, { operation: "dev.demo.reset_applicant" });
}
