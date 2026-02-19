import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { submitRecommendation } from "@/lib/server/recommendations-service";

const tokenSchema = z.string().uuid();
const payloadSchema = z.record(z.string(), z.unknown());

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  return withErrorHandling(async () => {
    const { token: rawToken } = await context.params;
    const tokenParsed = tokenSchema.safeParse(rawToken);
    const sessionToken = request.headers.get("x-recommender-session")?.trim();
    const body = await request.json();
    const bodyParsed = payloadSchema.safeParse(body);

    if (!tokenParsed.success || !sessionToken || !bodyParsed.success) {
      throw new AppError({
        message: "Invalid recommendation submit payload",
        userMessage: "No se pudo enviar la recomendación.",
        status: 400,
      });
    }

    const recommendation = await submitRecommendation({
      token: tokenParsed.data,
      sessionToken,
      payload: bodyParsed.data,
    });

    return NextResponse.json({
      recommendation,
    });
  }, { operation: "recommendations.public.submit" });
}

