import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { bulkTransitionApplications } from "@/lib/server/application-service";
import { recordAuditEvent } from "@/lib/logging/audit";

const schema = z.object({
  cycleId: z.string().uuid(),
  fromStage: z.string().min(1),
  toStage: z.string().min(1),
  statusFilter: z
    .array(z.enum(["draft", "submitted", "eligible", "ineligible", "advanced"]))
    .min(1, "Debe incluir al menos un estado."),
  reason: z
    .string()
    .min(4, "El motivo debe tener al menos 4 caracteres."),
});

export async function POST(request: NextRequest) {
  return withErrorHandling(
    async (requestId) => {
      const { profile, supabase } = await requireAuth(["admin"]);
      const body = await request.json();
      const parsed = schema.safeParse(body);

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid bulk transition payload",
          userMessage: "Los datos de transición masiva no son válidos.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const result = await bulkTransitionApplications({
        supabase,
        input: parsed.data,
        actorId: profile.id,
      });

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        applicationId: null,
        action: "applications.bulk_transitioned",
        metadata: {
          ...parsed.data,
          result: {
            transitioned: result.transitioned,
            skipped: result.skipped,
            errorCount: result.errors.length,
          },
        },
        requestId,
      });

      return NextResponse.json({ result });
    },
    { operation: "applications.bulk-transition" },
  );
}
