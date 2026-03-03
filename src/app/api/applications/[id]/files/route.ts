import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { assertApplicantCanEditCycle } from "@/lib/server/application-service";
import {
  listApplicationFilesForAdmin,
  updateApplicationFileMetadata,
} from "@/lib/server/admin-edit-service";
import { recordAuditEvent } from "@/lib/logging/audit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/supabase";

const applicantSchema = z.object({
  key: z.string().min(2),
  path: z.string().min(4),
  title: z.string().min(2).max(140).optional(),
  originalName: z.string().min(1).max(300).optional(),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  uploadedAt: z.string().datetime().optional(),
});

const adminSchema = z.object({
  fileKey: z.string().min(2),
  title: z.string().min(2).max(140).optional(),
  category: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  reason: z.string().min(4).max(300),
});

async function buildSignedDownloadUrl(path: string) {
  const adminSupabase = getSupabaseAdminClient();
  const { data, error } = await adminSupabase.storage
    .from("application-documents")
    .createSignedUrl(path, 60 * 60);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { supabase } = await requireAuth(["admin"]);
    const { id } = await context.params;

    const files = await listApplicationFilesForAdmin({
      supabase,
      applicationId: id,
    });

    const filesWithUrls = await Promise.all(
      files.map(async (file) => ({
        ...file,
        downloadUrl: await buildSignedDownloadUrl(file.path),
      })),
    );

    return NextResponse.json({
      files: filesWithUrls,
    });
  }, { operation: "applications.files.list_admin" });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { profile, supabase } = await requireAuth(["applicant"]);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = applicantSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid file payload",
        userMessage: "No se pudo guardar el archivo en tu postulación.",
        status: 400,
      });
    }

    const { data: app } = await supabase
      .from("applications")
      .select("id, applicant_id, cycle_id, files")
      .eq("id", id)
      .maybeSingle();

    if (!app || app.applicant_id !== profile.id) {
      throw new AppError({
        message: "Application not owned by user",
        userMessage: "No tienes permisos para modificar estos archivos.",
        status: 403,
      });
    }

    await assertApplicantCanEditCycle({
      supabase,
      cycleId: app.cycle_id,
    });

    const currentFiles = (app.files as Record<string, unknown>) ?? {};
    const currentValue = currentFiles[parsed.data.key];
    const previousTitle =
      typeof currentValue === "object" &&
      currentValue !== null &&
      typeof (currentValue as Record<string, unknown>).title === "string"
        ? ((currentValue as Record<string, unknown>).title as string)
        : undefined;

    const updatedFiles = {
      ...currentFiles,
      [parsed.data.key]: {
        path: parsed.data.path,
        title: parsed.data.title?.trim() || previousTitle || parsed.data.originalName || parsed.data.path,
        original_name: parsed.data.originalName ?? parsed.data.path.split("/").at(-1) ?? parsed.data.path,
        mime_type: parsed.data.mimeType ?? "application/octet-stream",
        size_bytes: parsed.data.sizeBytes ?? 0,
        uploaded_at: parsed.data.uploadedAt ?? new Date().toISOString(),
      },
    } as Json;

    const { data, error } = await supabase
      .from("applications")
      .update({ files: updatedFiles, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      throw new AppError({
        message: "Failed saving file metadata",
        userMessage: "No se pudo asociar el archivo a tu postulación.",
        status: 500,
      });
    }

    return NextResponse.json({ application: data });
  }, { operation: "applications.files.save" });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = adminSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid admin file metadata payload",
        userMessage: "No se pudo actualizar la metadata del archivo.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const application = await updateApplicationFileMetadata({
      supabase,
      applicationId: id,
      fileKey: parsed.data.fileKey,
      updates: {
        title: parsed.data.title,
        category: parsed.data.category,
        notes: parsed.data.notes,
      },
      reason: parsed.data.reason,
      actorId: profile.id,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: id,
      action: "application.file_metadata_updated",
      metadata: {
        fileKey: parsed.data.fileKey,
        reason: parsed.data.reason,
      },
      requestId,
    });

    return NextResponse.json({ application });
  }, { operation: "applications.files.update_admin" });
}
