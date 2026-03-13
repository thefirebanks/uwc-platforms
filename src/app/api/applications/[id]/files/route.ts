import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import {
  updateApplicationFileMetadata,
} from "@/lib/server/admin-edit-service";
import {
  listAdminFilesWithParserStatus,
  saveApplicantFile,
} from "@/lib/server/file-upload-service";
import { recordAuditEvent } from "@/lib/logging/audit";

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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const { id } = await context.params;

      const files = await listAdminFilesWithParserStatus({
        supabase,
        applicationId: id,
      });

      return NextResponse.json({ files });
    },
    { operation: "applications.files.list_admin" },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async () => {
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

      const result = await saveApplicantFile({
        supabase,
        applicationId: id,
        applicantId: profile.id,
        fileData: parsed.data,
      });

      return NextResponse.json(result);
    },
    { operation: "applications.files.save" },
  );
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
    },
    { operation: "applications.files.update_admin" },
  );
}
