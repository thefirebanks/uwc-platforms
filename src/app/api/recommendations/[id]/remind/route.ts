import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import { sendRecommendationReminder } from "@/lib/server/recommendations-service";
import { recordAuditEvent } from "@/lib/logging/audit";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin", "applicant"]);
    const { id } = await context.params;

    const recommender = await sendRecommendationReminder({
      supabase,
      recommendationId: id,
      actorId: profile.id,
      actorRole: profile.role as "admin" | "applicant",
      origin: request.nextUrl.origin,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: "recommendations.reminder_sent",
      metadata: {
        recommendationId: id,
        role: recommender.role,
        reminderCount: recommender.reminderCount,
      },
      requestId,
    });

    return NextResponse.json({
      recommender,
    });
  }, { operation: "recommendations.remind" });
}

