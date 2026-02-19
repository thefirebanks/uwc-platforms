import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { verifyRecommendationOtp } from "@/lib/server/recommendations-service";

const tokenSchema = z.string().uuid();
const bodySchema = z.object({
  otpCode: z.string().regex(/^\d{6}$/),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  return withErrorHandling(async () => {
    const { token: rawToken } = await context.params;
    const tokenParsed = tokenSchema.safeParse(rawToken);
    const body = await request.json();
    const bodyParsed = bodySchema.safeParse(body);

    if (!tokenParsed.success || !bodyParsed.success) {
      throw new AppError({
        message: "Invalid OTP verification payload",
        userMessage: "No se pudo validar el código OTP.",
        status: 400,
      });
    }

    const result = await verifyRecommendationOtp({
      token: tokenParsed.data,
      otpCode: bodyParsed.data.otpCode,
    });
    return NextResponse.json(result);
  }, { operation: "recommendations.public.otp_verify" });
}

