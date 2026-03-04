import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { recordAuditEvent } from "@/lib/logging/audit";
import {
  listApplicantRecommendations,
  upsertApplicantRecommendations,
} from "@/lib/server/recommendations-service";
import type { RecommenderRole } from "@/types/domain";

const schema = z.object({
  applicationId: z.string().uuid(),
  recommenders: z
    .array(
      z.object({
        role: z.enum(["mentor", "friend"]),
        email: z.string().email(),
      }),
    )
    .min(1)
    .max(2),
});

const querySchema = z.object({
  applicationId: z.string().uuid(),
});

async function assertApplicantOwnsApplication({
  supabase,
  applicationId,
  applicantId,
}: {
  supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"];
  applicationId: string;
  applicantId: string;
}) {
  const { data: application } = await supabase
    .from("applications")
    .select("applicant_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application || application.applicant_id !== applicantId) {
    throw new AppError({
      message: "Application mismatch",
      userMessage: "No tienes permiso sobre esta postulación.",
      status: 403,
    });
  }
}

export async function GET(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { profile, supabase } = await requireAuth(["applicant"]);
      const parsed = querySchema.safeParse({
        applicationId: request.nextUrl.searchParams.get("applicationId"),
      });

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid recommendation query",
          userMessage: "No se pudo cargar la lista de recomendadores.",
          status: 400,
        });
      }

      await assertApplicantOwnsApplication({
        supabase,
        applicationId: parsed.data.applicationId,
        applicantId: profile.id,
      });

      const rows = await listApplicantRecommendations({
        supabase,
        applicationId: parsed.data.applicationId,
        applicantId: profile.id,
      });

      return NextResponse.json({
        recommenders: rows,
      });
    },
    { operation: "recommendations.list" },
  );
}

export async function PUT(request: NextRequest) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["applicant"]);
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

    await assertApplicantOwnsApplication({
      supabase,
      applicationId: parsed.data.applicationId,
      applicantId: profile.id,
    });

    const result = await upsertApplicantRecommendations({
      supabase,
      applicationId: parsed.data.applicationId,
      applicantId: profile.id,
      applicantEmail: profile.email,
      recommenders: parsed.data.recommenders as Array<{ role: RecommenderRole; email: string }>,
      origin: request.nextUrl.origin,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: parsed.data.applicationId,
      action: "recommendations.upserted",
      metadata: {
        createdCount: result.createdCount,
        replacedCount: result.replacedCount,
        failedEmailCount: result.failedEmailCount,
      },
      requestId,
    });

    return NextResponse.json({
      recommenders: result.rows,
      createdCount: result.createdCount,
      replacedCount: result.replacedCount,
      failedEmailCount: result.failedEmailCount,
    });
  }, { operation: "recommendations.upsert" });
}
