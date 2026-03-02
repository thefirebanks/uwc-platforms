import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { assignReviewer, unassignReviewer } from "@/lib/server/reviewer-service";

const assignSchema = z.object({
  applicationId: z.string().uuid(),
  cycleId: z.string().uuid(),
  stageCode: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async () => {
      const { profile } = await requireAuth(["admin"]);
      const { id: reviewerId } = await params;
      const body = await request.json();
      const parsed = assignSchema.safeParse(body);

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid assign reviewer payload",
          userMessage: "Los datos enviados no son válidos.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const assignment = await assignReviewer({
        reviewerId,
        applicationId: parsed.data.applicationId,
        cycleId: parsed.data.cycleId,
        stageCode: parsed.data.stageCode,
        assignedBy: profile.id,
      });

      return NextResponse.json({ assignment }, { status: 201 });
    },
    { operation: "admin.reviewers.assign" },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async () => {
      await requireAuth(["admin"]);
      const { id: reviewerId } = await params;
      const { searchParams } = request.nextUrl;
      const applicationId = searchParams.get("applicationId");

      if (!applicationId) {
        throw new AppError({
          message: "Missing applicationId query param",
          userMessage: "Falta el parámetro applicationId.",
          status: 400,
        });
      }

      await unassignReviewer(reviewerId, applicationId);
      return NextResponse.json({ success: true });
    },
    { operation: "admin.reviewers.unassign" },
  );
}
