import type { SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors/app-error";
import {
  runOcrCheck,
  DEFAULT_MODEL_ID,
  DEFAULT_OCR_MAX_TOKENS,
} from "@/lib/server/ocr";
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
  referenceFiles?: File[];
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
    referenceFiles = [],
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
  const safeName =
    file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "archivo";
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

  /* Run OCR */
  const start = Date.now();
  const ocrResult = await runOcrCheck({
    document: {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      dataBase64: Buffer.from(fileBuffer).toString("base64"),
    },
    referenceDocuments: await Promise.all(
      referenceFiles.map(async (referenceFile) => {
        const referenceBuffer = await referenceFile.arrayBuffer();
        return {
          fileName: referenceFile.name,
          mimeType: referenceFile.type || "application/octet-stream",
          dataBase64: Buffer.from(referenceBuffer).toString("base64"),
        };
      }),
    ),
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
  const requestConfig = {
    promptTemplate: promptTemplate.trim(),
    systemPrompt: systemPrompt?.trim() || null,
    extractionInstructions: extractionInstructions?.trim() || promptTemplate,
    expectedSchemaTemplate: expectedSchemaTemplate?.trim() || null,
    referenceFiles: referenceFiles.map((referenceFile) => ({
      fileName: referenceFile.name,
      mimeType: referenceFile.type || "application/octet-stream",
      sizeBytes: referenceFile.size,
    })),
    temperature: typeof temperature === "number" ? temperature : 0.2,
    topP: typeof topP === "number" ? topP : 0.9,
    maxTokens:
      typeof maxTokens === "number" ? maxTokens : DEFAULT_OCR_MAX_TOKENS,
    strictSchema: Boolean(strictSchema),
  };

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
        requestConfig,
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
          requestConfig,
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
