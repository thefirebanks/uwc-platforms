import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors/app-error";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import { listOcrTestRuns, runOcrTest } from "@/lib/server/ocr-testbed-service";
import { DEFAULT_MODEL_ID, MODEL_REGISTRY } from "@/lib/server/ocr";

function parseOptionalNumber(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function GET(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const params = request.nextUrl.searchParams;
      const cycleId = params.get("cycleId") ?? undefined;
      const stageCode = params.get("stageCode") ?? undefined;
      const limit = Math.min(Number(params.get("limit") ?? "20"), 100);

      const runs = await listOcrTestRuns({ supabase, cycleId, stageCode, limit });
      return NextResponse.json({ runs });
    },
    { operation: "ocr_testbed.list" },
  );
}

export async function POST(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { profile, supabase } = await requireAuth(["admin"]);

      const formData = await request.formData();
      const file = formData.get("file");
      const stageCode = formData.get("stageCode")?.toString();
      const cycleId = formData.get("cycleId")?.toString() ?? null;
      const modelId = formData.get("modelId")?.toString() ?? DEFAULT_MODEL_ID;
      const promptTemplate = formData.get("promptTemplate")?.toString();
      const systemPrompt = formData.get("systemPrompt")?.toString() ?? null;
      const extractionInstructions =
        formData.get("extractionInstructions")?.toString() ??
        promptTemplate ??
        null;
      const expectedSchemaTemplate = formData.get("expectedSchemaTemplate")?.toString() ?? null;
      const temperature = parseOptionalNumber(formData.get("temperature"));
      const topP = parseOptionalNumber(formData.get("topP"));
      const maxTokens = parseOptionalNumber(formData.get("maxTokens"));
      const strictSchema = formData.get("strictSchema")?.toString() === "true";

      if (!(file instanceof File)) {
        throw new AppError({
          message: "Missing file in OCR test request",
          userMessage: "Debes subir un archivo para probar.",
          status: 400,
        });
      }

      if (!stageCode) {
        throw new AppError({
          message: "Missing stageCode in OCR test request",
          userMessage: "Debes especificar un código de etapa.",
          status: 400,
        });
      }

      if (!promptTemplate) {
        throw new AppError({
          message: "Missing promptTemplate in OCR test request",
          userMessage: "Debes proporcionar instrucciones base para la prueba.",
          status: 400,
        });
      }

      if (!Object.keys(MODEL_REGISTRY).includes(modelId)) {
        throw new AppError({
          message: `Unknown modelId: ${modelId}`,
          userMessage: "El modelo seleccionado no es válido.",
          status: 400,
        });
      }

      if (
        Number.isNaN(temperature) ||
        Number.isNaN(topP) ||
        Number.isNaN(maxTokens) ||
        (temperature !== null && (temperature < 0 || temperature > 2)) ||
        (topP !== null && (topP <= 0 || topP > 1)) ||
        (maxTokens !== null && (maxTokens < 100 || maxTokens > 4096))
      ) {
        throw new AppError({
          message: "Invalid OCR model controls",
          userMessage: "Los parámetros avanzados del modelo no son válidos.",
          status: 400,
        });
      }

      const run = await runOcrTest({
        supabase,
        input: {
          cycleId,
          stageCode,
          actorId: profile.id,
          file,
          promptTemplate,
          modelId,
          systemPrompt,
          extractionInstructions,
          expectedSchemaTemplate,
          temperature,
          topP,
          maxTokens,
          strictSchema,
        },
      });

      return NextResponse.json({ run }, { status: 201 });
    },
    { operation: "ocr_testbed.run" },
  );
}
