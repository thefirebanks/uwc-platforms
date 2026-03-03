import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors/app-error";
import { runOcrCheck, DEFAULT_MODEL_ID, DEFAULT_OCR_MAX_TOKENS } from "@/lib/server/ocr";
import type { Database, Json } from "@/types/supabase";
import type { OcrTestRun } from "@/types/domain";

type OcrTestRunRow = Database["public"]["Tables"]["ocr_test_runs"]["Row"];

const STORAGE_BUCKET = "application-documents";
const STORAGE_PREFIX = "ocr-testbed";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type RunOcrTestInput = {
  cycleId?: string | null;
  stageCode: string;
  actorId: string;
  file: File;
  promptTemplate: string;
  modelId?: string | null;
  systemPrompt?: string | null;
  extractionInstructions?: string | null;
  expectedSchemaTemplate?: string | null;
  temperature?: number | null;
  topP?: number | null;
  maxTokens?: number | null;
  strictSchema?: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Run isolated OCR test                                                     */
/* -------------------------------------------------------------------------- */

export async function runOcrTest({
  supabase,
  input,
}: {
  supabase: SupabaseClient<Database>;
  input: RunOcrTestInput;
}): Promise<OcrTestRun> {
  const {
    cycleId,
    stageCode,
    actorId,
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
  } = input;

  /* Sanitise file name */
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "archivo";
  const storagePath = `${STORAGE_PREFIX}/${actorId}/${Date.now()}-${safeName}`;

  /* Upload to storage */
  const fileBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw new AppError({
      message: "Failed uploading OCR test file",
      userMessage: "No se pudo subir el archivo de prueba.",
      status: 500,
      details: uploadError,
    });
  }

  /* Create signed URL (60 s expiry — enough for Gemini to fetch) */
  const { data: signedData, error: signedError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60);

  if (signedError || !signedData?.signedUrl) {
    throw new AppError({
      message: "Failed creating signed URL for OCR test",
      userMessage: "No se pudo generar la URL del archivo.",
      status: 500,
      details: signedError,
    });
  }

  /* Run OCR */
  const start = Date.now();
  const ocrResult = await runOcrCheck({
    fileUrl: signedData.signedUrl,
    promptTemplate,
    modelId,
    systemPrompt,
    extractionInstructions,
    expectedSchemaTemplate,
    temperature,
    topP,
    maxTokens,
    strictSchema,
  });
  const durationMs = Date.now() - start;

  /* Persist test run */
  const { data: runRow, error: insertError } = await supabase
    .from("ocr_test_runs")
    .insert({
      cycle_id: cycleId ?? null,
      stage_code: stageCode,
      actor_id: actorId,
      file_name: file.name,
      file_path: storagePath,
      prompt_template: extractionInstructions?.trim() || promptTemplate,
      model_id: modelId ?? DEFAULT_MODEL_ID,
      summary: ocrResult.summary,
      confidence: ocrResult.confidence,
      raw_response: {
        ...(ocrResult.rawResponse as Record<string, unknown>),
        requestConfig: {
          systemPrompt: systemPrompt?.trim() || null,
          extractionInstructions: extractionInstructions?.trim() || promptTemplate,
          expectedSchemaTemplate: expectedSchemaTemplate?.trim() || null,
          temperature: typeof temperature === "number" ? temperature : 0.2,
          topP: typeof topP === "number" ? topP : 0.9,
          maxTokens: typeof maxTokens === "number" ? maxTokens : DEFAULT_OCR_MAX_TOKENS,
          strictSchema: Boolean(strictSchema),
        },
      } as unknown as Json,
      duration_ms: durationMs,
    })
    .select("*")
    .single();

  if (insertError || !runRow) {
    if ((insertError as { code?: string } | null)?.code === "PGRST205") {
      return {
        id: randomUUID(),
        cycle_id: cycleId ?? null,
        stage_code: stageCode,
        actor_id: actorId,
        file_name: file.name,
        file_path: storagePath,
        prompt_template: extractionInstructions?.trim() || promptTemplate,
        model_id: modelId ?? DEFAULT_MODEL_ID,
        summary: ocrResult.summary,
        confidence: ocrResult.confidence,
        raw_response: {
          ...(ocrResult.rawResponse as Record<string, unknown>),
          persistenceSkipped: true,
        },
        duration_ms: durationMs,
        created_at: new Date().toISOString(),
      } as OcrTestRun;
    }

    throw new AppError({
      message: "Failed saving OCR test run",
      userMessage: "OCR completado pero no se pudo guardar el resultado.",
      status: 500,
      details: insertError,
    });
  }

  return runRow as OcrTestRun;
}

/* -------------------------------------------------------------------------- */
/*  List test run history                                                     */
/* -------------------------------------------------------------------------- */

export async function listOcrTestRuns({
  supabase,
  cycleId,
  stageCode,
  limit = 20,
}: {
  supabase: SupabaseClient<Database>;
  cycleId?: string | null;
  stageCode?: string;
  limit?: number;
}): Promise<OcrTestRun[]> {
  let query = supabase
    .from("ocr_test_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 100));

  if (cycleId) query = query.eq("cycle_id", cycleId);
  if (stageCode) query = query.eq("stage_code", stageCode);

  const { data, error } = await query;

  if (error) {
    if ((error as { code?: string }).code === "PGRST205") {
      return [];
    }

    throw new AppError({
      message: "Failed loading OCR test runs",
      userMessage: "No se pudo cargar el historial de pruebas OCR.",
      status: 500,
      details: error,
    });
  }

  return ((data as OcrTestRunRow[] | null) ?? []) as OcrTestRun[];
}
