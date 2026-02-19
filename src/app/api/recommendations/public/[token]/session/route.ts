import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { getRecommendationSessionSnapshot } from "@/lib/server/recommendations-service";

const tokenSchema = z.string().uuid();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  return withErrorHandling(async () => {
    const { token: rawToken } = await context.params;
    const parsed = tokenSchema.safeParse(rawToken);
    const sessionToken = request.headers.get("x-recommender-session")?.trim();

    if (!parsed.success || !sessionToken) {
      throw new AppError({
        message: "Invalid recommendation session request",
        userMessage: "Tu sesión de recomendación no es válida.",
        status: 400,
      });
    }

    const recommendation = await getRecommendationSessionSnapshot({
      token: parsed.data,
      sessionToken,
    });

    return NextResponse.json({
      recommendation,
    });
  }, { operation: "recommendations.public.session_get" });
}

