import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { createRecommendationRequests } from "@/lib/server/application-service";
import { recordAuditEvent } from "@/lib/logging/audit";

const schema = z.object({
  applicationId: z.string().uuid(),
  emails: z.array(z.string().email()).min(1),
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

      const { data, error } = await supabase
        .from("recommendation_requests")
        .select("recommender_email, submitted_at, created_at")
        .eq("application_id", parsed.data.applicationId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new AppError({
          message: "Failed loading recommendation requests",
          userMessage: "No se pudieron cargar los recomendadores.",
          status: 500,
          details: error,
        });
      }

      return NextResponse.json({
        recommenders: (data ?? []).map((row) => ({
          email: row.recommender_email,
          submittedAt: row.submitted_at,
          createdAt: row.created_at,
        })),
      });
    },
    { operation: "recommendations.list" },
  );
}

export async function POST(request: NextRequest) {
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

    return NextResponse.json({
      count: rows.length,
      emails: rows.map((row) => row.recommender_email),
    });
  }, { operation: "recommendations.request" });
}
