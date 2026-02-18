import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { recordAuditEvent } from "@/lib/logging/audit";
import { processCommunicationQueue } from "@/lib/server/communications-service";

const schema = z.object({
  cycleId: z.string().uuid().optional(),
  targetStatus: z.enum(["queued", "failed"]).default("queued"),
  limit: z.number().int().min(1).max(200).default(30),
});

export async function POST(request: NextRequest) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid queue processing payload",
        userMessage: "No se pudo procesar la cola de comunicaciones.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const result = await processCommunicationQueue({
      supabase,
      input: parsed.data,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: parsed.data.targetStatus === "queued" ? "communications.processed" : "communications.retried",
      metadata: {
        cycleId: parsed.data.cycleId ?? null,
        ...result,
      },
      requestId,
    });

    return NextResponse.json(result);
  }, { operation: "communications.process" });
}
