import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { previewEmail } from "@/lib/server/communications-service";

const schema = z.object({
  automationTemplateId: z.string().uuid(),
  sampleValues: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const body = await request.json();
      const parsed = schema.safeParse(body);

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid preview payload",
          userMessage: "Los datos enviados no son válidos.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const preview = await previewEmail({
        supabase,
        input: parsed.data,
      });

      return NextResponse.json(preview);
    },
    { operation: "communications.preview" },
  );
}
