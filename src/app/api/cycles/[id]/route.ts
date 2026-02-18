import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { recordAuditEvent } from "@/lib/logging/audit";
import type { Database } from "@/types/supabase";

type CycleRow = Database["public"]["Tables"]["cycles"]["Row"];

const patchCycleSchema = z
  .object({
    name: z.string().min(4).optional(),
    stage1OpenAt: z.string().datetime().optional(),
    stage1CloseAt: z.string().datetime().optional(),
    stage2OpenAt: z.string().datetime().optional(),
    stage2CloseAt: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
    maxApplicationsPerUser: z.number().int().min(1).max(10).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

function assertDateOrder({
  stage1OpenAt,
  stage1CloseAt,
  stage2OpenAt,
  stage2CloseAt,
}: {
  stage1OpenAt: string | null;
  stage1CloseAt: string | null;
  stage2OpenAt: string | null;
  stage2CloseAt: string | null;
}) {
  if (!stage1OpenAt || !stage1CloseAt || !stage2OpenAt || !stage2CloseAt) {
    return;
  }

  const s1Open = new Date(stage1OpenAt).getTime();
  const s1Close = new Date(stage1CloseAt).getTime();
  const s2Open = new Date(stage2OpenAt).getTime();
  const s2Close = new Date(stage2CloseAt).getTime();

  if (!(s1Open <= s1Close && s1Close <= s2Open && s2Open <= s2Close)) {
    throw new AppError({
      message: "Invalid stage date order",
      userMessage:
        "Las fechas de etapas no son válidas. Verifica el orden entre Stage 1 y Stage 2.",
      status: 400,
    });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async (requestId) => {
      const { profile, supabase } = await requireAuth(["admin"]);
      const { id } = await context.params;
      const body = await request.json();
      const parsed = patchCycleSchema.safeParse(body);

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid cycle patch payload",
          userMessage: "No se pudo actualizar el proceso de selección.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const { data: existingData, error: existingError } = await supabase
        .from("cycles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      const existing = (existingData as CycleRow | null) ?? null;

      if (existingError || !existing) {
        throw new AppError({
          message: "Cycle not found",
          userMessage: "No se encontró el proceso de selección.",
          status: 404,
          details: existingError,
        });
      }

      const nextStage1OpenAt = parsed.data.stage1OpenAt ?? existing.stage1_open_at;
      const nextStage1CloseAt = parsed.data.stage1CloseAt ?? existing.stage1_close_at;
      const nextStage2OpenAt = parsed.data.stage2OpenAt ?? existing.stage2_open_at;
      const nextStage2CloseAt = parsed.data.stage2CloseAt ?? existing.stage2_close_at;

      assertDateOrder({
        stage1OpenAt: nextStage1OpenAt,
        stage1CloseAt: nextStage1CloseAt,
        stage2OpenAt: nextStage2OpenAt,
        stage2CloseAt: nextStage2CloseAt,
      });

      if (parsed.data.isActive === true) {
        await supabase.from("cycles").update({ is_active: false }).neq("id", id);
      }

      const { data: cycleData, error } = await supabase
        .from("cycles")
        .update({
          name: parsed.data.name,
          is_active: parsed.data.isActive,
          stage1_open_at: parsed.data.stage1OpenAt,
          stage1_close_at: parsed.data.stage1CloseAt,
          stage2_open_at: parsed.data.stage2OpenAt,
          stage2_close_at: parsed.data.stage2CloseAt,
          max_applications_per_user: parsed.data.maxApplicationsPerUser,
        })
        .eq("id", id)
        .select("*")
        .single();
      const cycle = (cycleData as CycleRow | null) ?? null;

      if (error || !cycle) {
        throw new AppError({
          message: "Failed updating cycle",
          userMessage: "No se pudo actualizar el proceso de selección.",
          status: 500,
          details: error,
        });
      }

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        action: "cycle.updated",
        metadata: {
          cycleId: cycle.id,
          updatedFields: Object.keys(parsed.data),
          isActive: cycle.is_active,
        },
        requestId,
      });

      return NextResponse.json({ cycle });
    },
    { operation: "cycles.update" },
  );
}
