import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { recordAuditEvent } from "@/lib/logging/audit";
import { runEligibilityRubricEvaluation } from "@/lib/server/eligibility-rubric-service";

const schema = z.object({
  cycleId: z.string().uuid(),
  stageCode: z.string().trim().min(1).max(120).default("documents"),
  trigger: z.enum(["manual", "deadline"]).default("manual"),
});

export async function POST(request: NextRequest) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid rubric evaluation payload",
        userMessage: "No se pudo ejecutar la evaluación automática.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const result = await runEligibilityRubricEvaluation({
      supabase,
      input: {
        cycleId: parsed.data.cycleId,
        stageCode: parsed.data.stageCode,
        actorId: profile.id,
        trigger: parsed.data.trigger,
      },
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: "applications.rubric_evaluated",
      metadata: {
        cycleId: parsed.data.cycleId,
        stageCode: parsed.data.stageCode,
        trigger: parsed.data.trigger,
        evaluated: result.evaluated,
        outcomes: result.outcomes,
      },
      requestId,
    });

    return NextResponse.json({ result });
  }, { operation: "applications.rubric_evaluate" });
}
