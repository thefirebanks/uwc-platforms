import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { previewEmail } from "@/lib/server/communications-service";

const schema = z.object({
  automationTemplateId: z.string().uuid().optional(),
  subjectTemplate: z.string().min(3).optional(),
  bodyTemplate: z.string().min(10).optional(),
  sampleValues: z.record(z.string(), z.string()).optional(),
}).refine(
  (value) => Boolean(value.automationTemplateId || (value.subjectTemplate && value.bodyTemplate)),
  "Debe enviar una plantilla existente o asunto/cuerpo personalizados.",
);

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
