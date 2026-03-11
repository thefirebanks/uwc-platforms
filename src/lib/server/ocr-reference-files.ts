import type { SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors/app-error";
import {
  inferMimeTypeFromPath,
  isSupportedOcrReferenceMimeType,
  normalizeFieldAiReferenceFiles,
  type FieldAiReferenceFile,
} from "@/lib/ocr/field-ai-parser";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/supabase";
import type { OcrDocumentInput } from "@/lib/server/ocr";

const STORAGE_BUCKET = "application-documents";
const STORAGE_PREFIX = "stage-ai-references";

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "archivo";
}

export async function uploadStageAiReferenceFiles({
  supabase,
  cycleId,
  stageKey,
  files,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
  stageKey: string;
  files: File[];
}) {
  if (files.length === 0) {
    return [];
  }

  const uploadedAt = new Date().toISOString();
  const uploadedFiles = await Promise.all(
    files.map(async (file) => {
      const mimeType = file.type?.trim() || inferMimeTypeFromPath(file.name);
      if (!isSupportedOcrReferenceMimeType(mimeType)) {
        throw new AppError({
          message: `Unsupported OCR reference file type: ${mimeType}`,
          userMessage:
            "Solo se permiten archivos PDF, JPG, PNG o WEBP como referencia.",
          status: 400,
        });
      }

      const safeName = sanitizeFileName(file.name);
      const storagePath = `${STORAGE_PREFIX}/${cycleId}/${stageKey}/${randomUUID()}-${safeName}`;
      const fileBuffer = await file.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        throw new AppError({
          message: "Failed uploading OCR reference file",
          userMessage: "No se pudo subir uno de los archivos de referencia.",
          status: 500,
          details: uploadError,
        });
      }

      return {
        fileName: file.name,
        mimeType,
        path: storagePath,
        sizeBytes: file.size,
        uploadedAt,
      } satisfies FieldAiReferenceFile;
    }),
  );

  return normalizeFieldAiReferenceFiles(uploadedFiles);
}

export async function loadOcrReferenceDocuments(
  referenceFiles: FieldAiReferenceFile[],
) {
  const resolvedFiles = normalizeFieldAiReferenceFiles(referenceFiles);
  if (resolvedFiles.length === 0) {
    return [];
  }

  const adminSupabase = getSupabaseAdminClient();

  return Promise.all(
    resolvedFiles.map(async (referenceFile): Promise<OcrDocumentInput> => {
      const { data: fileBlob, error: downloadError } =
        await adminSupabase.storage
          .from(STORAGE_BUCKET)
          .download(referenceFile.path);

      if (downloadError || !fileBlob) {
        throw new AppError({
          message: "Failed downloading OCR reference file",
          userMessage: "No se pudo preparar uno de los archivos de referencia.",
          status: 500,
          details: {
            path: referenceFile.path,
            downloadError,
          },
        });
      }

      const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
      return {
        fileName: referenceFile.fileName,
        mimeType:
          referenceFile.mimeType ||
          fileBlob.type ||
          inferMimeTypeFromPath(referenceFile.path),
        dataBase64: fileBuffer.toString("base64"),
      };
    }),
  );
}
