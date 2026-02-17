import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { importExamCsv } from "@/lib/server/application-service";
import { recordAuditEvent } from "@/lib/logging/audit";

const schema = z.object({
  csv: z.string().min(8),
});

export async function POST(request: NextRequest) {
  return withErrorHandling(async (requestId) => {
    const { profile } = await requireAuth(["admin"]);
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid import payload",
        userMessage: "No se recibió un CSV válido para importar.",
        status: 400,
      });
    }

    const supabase = getSupabaseAdminClient();
    const result = await importExamCsv({
      supabase,
      csv: parsed.data.csv,
      actorId: profile.id,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: "exam.imported",
      metadata: result,
      requestId,
    });

    return NextResponse.json(result);
  });
}
