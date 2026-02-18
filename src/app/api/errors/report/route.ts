import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { recordAuditEvent } from "@/lib/logging/audit";

const schema = z.object({
  errorId: z.string().min(5),
  context: z.string().min(3),
  notes: z.string().max(600).optional().default(""),
});

export async function POST(request: NextRequest) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin", "applicant"]);
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid bug report payload",
        userMessage: "No se pudo enviar el reporte de error.",
        status: 400,
      });
    }

    const { error } = await supabase.from("bug_reports").insert({
      reporter_id: profile.id,
      error_id: parsed.data.errorId,
      context: parsed.data.context,
      notes: parsed.data.notes,
    });

    if (error) {
      throw new AppError({
        message: "Failed to store bug report",
        userMessage: "No se pudo guardar el reporte. Intenta nuevamente.",
        status: 500,
        details: error,
      });
    }

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: "bug.reported",
      metadata: {
        errorId: parsed.data.errorId,
        context: parsed.data.context,
      },
      requestId,
    });

    return NextResponse.json({ ok: true });
  }, { operation: "errors.report" });
}
