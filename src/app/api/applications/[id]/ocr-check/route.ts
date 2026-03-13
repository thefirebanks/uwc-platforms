import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import {
  executeOcrCheck,
  getOcrCheckHistory,
} from "@/lib/server/ocr-check-service";
import { recordAuditEvent } from "@/lib/logging/audit";

const schema = z.object({
  fileKey: z.string().min(2),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const { id } = await context.params;

      const parsed = querySchema.safeParse({
        limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      });

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid OCR history query",
          userMessage: "No se pudo cargar el historial OCR.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const checks = await getOcrCheckHistory({
        supabase,
        applicationId: id,
        limit: parsed.data.limit,
      });

      return NextResponse.json({ checks });
    },
    { operation: "applications.ocr_history" },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async (requestId) => {
      const { profile, supabase } = await requireAuth(["admin"]);
      const { id } = await context.params;
      const body = await request.json();
      const parsed = schema.safeParse(body);

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid OCR payload",
          userMessage: "No se pudo ejecutar la validación OCR.",
          status: 400,
        });
      }

      const result = await executeOcrCheck({
        supabase,
        applicationId: id,
        fileKey: parsed.data.fileKey,
        actorId: profile.id,
      });

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        applicationId: id,
        action: "application.ocr_checked",
        metadata: {
          fileKey: parsed.data.fileKey,
          confidence: result.confidence,
          checkId: result.check.id,
        },
        requestId,
      });

      return NextResponse.json({
        summary: result.summary,
        confidence: result.confidence,
        rawResponse: result.rawResponse,
        checkId: result.check.id,
        createdAt: result.check.created_at,
      });
    },
    { operation: "applications.ocr_check" },
  );
}
