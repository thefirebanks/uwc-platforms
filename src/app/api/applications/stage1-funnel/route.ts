import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { getStage1Funnel } from "@/lib/server/stage1-funnel-service";

const querySchema = z.object({
  cycleId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const parsed = querySchema.safeParse({
        cycleId: request.nextUrl.searchParams.get("cycleId") ?? undefined,
      });

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid Stage 1 funnel query",
          userMessage: "Debes seleccionar un proceso válido para ver el funnel.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const result = await getStage1Funnel({
        supabase,
        cycleId: parsed.data.cycleId,
      });

      return NextResponse.json(result);
    },
    { operation: "applications.stage1_funnel" },
  );
}
