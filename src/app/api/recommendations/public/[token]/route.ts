import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { getPublicRecommendationInfo } from "@/lib/server/recommendations-service";

const tokenSchema = z.string().uuid();

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  return withErrorHandling(async () => {
    const { token: rawToken } = await context.params;
    const parsed = tokenSchema.safeParse(rawToken);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid recommendation token format",
        userMessage: "El enlace de recomendación no es válido.",
        status: 400,
      });
    }

    const recommendation = await getPublicRecommendationInfo(parsed.data);
    return NextResponse.json({ recommendation });
  }, { operation: "recommendations.public.get" });
}

