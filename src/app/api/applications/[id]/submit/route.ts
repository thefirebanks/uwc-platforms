import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { assertApplicantCanEditCycle, submitApplication } from "@/lib/server/application-service";
import { recordAuditEvent } from "@/lib/logging/audit";
import { logger } from "@/lib/logging/logger";
import {
  queueApplicationAutomationIfEnabled,
  validateApplicationBeforeSubmit,
} from "@/lib/server/automation-service";
import type { Database } from "@/types/supabase";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["applicant"]);
    const { id } = await context.params;

    const { data: applicationData } = await supabase
      .from("applications")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const application = (applicationData as ApplicationRow | null) ?? null;

    if (!application || application.applicant_id !== profile.id) {
      throw new AppError({
        message: "Application ownership mismatch",
        userMessage: "No tienes permiso para enviar esta postulación.",
        status: 403,
      });
    }

    await assertApplicantCanEditCycle({
      supabase,
      cycleId: application.cycle_id,
    });

    await validateApplicationBeforeSubmit({
      supabase,
      application,
    });

    const submitted = await submitApplication({
      supabase,
      applicationId: id,
    });

    let automationResult: Awaited<ReturnType<typeof queueApplicationAutomationIfEnabled>> = {
      queued: false,
      automationTemplateId: null,
    };
    let automationQueueFailed = false;

    try {
      automationResult = await queueApplicationAutomationIfEnabled({
        supabase,
        application: submitted,
        triggerEvent: "application_submitted",
        actorId: profile.id,
      });
    } catch (error) {
      automationQueueFailed = true;
      logger.warn(
        {
          requestId,
          applicationId: id,
          actorId: profile.id,
          error,
        },
        "Failed queueing application_submitted automation",
      );
    }

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: id,
      action: "application.submitted",
      metadata: {
        status: submitted.status,
        automationQueued: automationResult.queued,
        automationTemplateId: automationResult.automationTemplateId,
        automationQueueFailed,
      },
      requestId,
    });

    return NextResponse.json({ application: submitted });
  }, { operation: "applications.submit" });
}
