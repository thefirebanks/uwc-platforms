import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import {
  getCycleStageConfig,
  patchCycleStageConfig,
  stageConfigCycleIdSchema,
  stageConfigStageIdentifierSchema,
} from "@/lib/server/stage-config-service";

function parseStageConfigContext({
  rawCycleId,
  rawStageIdentifier,
}: {
  rawCycleId: string;
  rawStageIdentifier: string;
}) {
  const cycleIdParsed = stageConfigCycleIdSchema.safeParse(rawCycleId);
  const stageIdentifierParsed =
    stageConfigStageIdentifierSchema.safeParse(rawStageIdentifier);

  if (!cycleIdParsed.success || !stageIdentifierParsed.success) {
    throw new AppError({
      message: "Invalid cycle stage config context",
      userMessage: "La etapa o proceso seleccionado no es válido.",
      status: 400,
    });
  }

  return {
    cycleId: cycleIdParsed.data,
    stageIdentifier: stageIdentifierParsed.data,
  };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; stageCode: string }> },
) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const { id: rawCycleId, stageCode: rawStageIdentifier } =
        await context.params;
      const { cycleId, stageIdentifier } = parseStageConfigContext({
        rawCycleId,
        rawStageIdentifier,
      });

      const result = await getCycleStageConfig({
        supabase,
        cycleId,
        stageIdentifier,
      });

      return NextResponse.json(result);
    },
    { operation: "cycles.stage_config.get" },
  );
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; stageCode: string }> },
) {
  return withErrorHandling(
    async (requestId) => {
      const { profile, supabase } = await requireAuth(["admin"]);
      const { id: rawCycleId, stageCode: rawStageIdentifier } =
        await context.params;
      const { cycleId, stageIdentifier } = parseStageConfigContext({
        rawCycleId,
        rawStageIdentifier,
      });

      const result = await patchCycleStageConfig({
        supabase,
        cycleId,
        stageIdentifier,
        body: await request.json(),
        actorId: profile.id,
        requestId,
      });

      return NextResponse.json(result);
    },
    { operation: "cycles.stage_config.patch" },
  );
}
