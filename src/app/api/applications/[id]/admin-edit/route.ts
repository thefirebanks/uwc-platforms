import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { adminUpdateApplicationPayload } from "@/lib/server/admin-edit-service";
import { recordAuditEvent } from "@/lib/logging/audit";

const schema = z.object({
  changes: z
    .record(z.string(), z.unknown())
    .refine(
      (v) => Object.keys(v).length > 0,
      "Debe incluir al menos un campo a modificar.",
    ),
  reason: z
    .string()
    .min(4, "El motivo debe tener al menos 4 caracteres."),
});

export async function PATCH(
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
          message: "Invalid admin edit payload",
          userMessage: "Los datos enviados no son válidos.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const application = await adminUpdateApplicationPayload({
        supabase,
        applicationId: id,
        changes: parsed.data.changes,
        reason: parsed.data.reason,
        actorId: profile.id,
      });

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        applicationId: id,
        action: "application.admin_edited",
        metadata: {
          fieldCount: Object.keys(parsed.data.changes).length,
          fields: Object.keys(parsed.data.changes),
          reason: parsed.data.reason,
        },
        requestId,
      });

      return NextResponse.json({ application });
    },
    { operation: "applications.admin-edit" },
  );
}
