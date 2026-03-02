import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { listReviewers, promoteToReviewer } from "@/lib/server/reviewer-service";

const promoteSchema = z.object({
  email: z.string().email("Correo electrónico inválido."),
});

export async function GET() {
  return withErrorHandling(
    async () => {
      await requireAuth(["admin"]);
      const reviewers = await listReviewers();
      return NextResponse.json({ reviewers });
    },
    { operation: "admin.reviewers.list" },
  );
}

export async function POST(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { profile } = await requireAuth(["admin"]);
      const body = await request.json();
      const parsed = promoteSchema.safeParse(body);

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid promote reviewer payload",
          userMessage: "Los datos enviados no son válidos.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const reviewer = await promoteToReviewer({
        email: parsed.data.email,
        adminId: profile.id,
      });

      return NextResponse.json({ reviewer }, { status: 201 });
    },
    { operation: "admin.reviewers.promote" },
  );
}
