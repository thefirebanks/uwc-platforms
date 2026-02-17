import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createRecommendationRequests } from "@/lib/server/application-service";
import { recordAuditEvent } from "@/lib/logging/audit";

const schema = z.object({
  applicationId: z.string().uuid(),
  emails: z.array(z.string().email()).min(1),
});

export async function POST(request: NextRequest) {
  return withErrorHandling(async (requestId) => {
    const { profile } = await requireAuth(["applicant"]);
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid recommendation payload",
        userMessage: "Los correos de recomendación no son válidos.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const supabase = getSupabaseAdminClient();
    const { data: application } = await supabase
      .from("applications")
      .select("applicant_id")
      .eq("id", parsed.data.applicationId)
      .maybeSingle();

    if (!application || application.applicant_id !== profile.id) {
      throw new AppError({
        message: "Application mismatch",
        userMessage: "No tienes permiso sobre esta postulación.",
        status: 403,
      });
    }

    const rows = await createRecommendationRequests({
      supabase,
      applicationId: parsed.data.applicationId,
      requesterId: profile.id,
      emails: parsed.data.emails,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: parsed.data.applicationId,
      action: "recommendations.requested",
      metadata: {
        count: rows.length,
      },
      requestId,
    });

    return NextResponse.json({ count: rows.length });
  });
}
