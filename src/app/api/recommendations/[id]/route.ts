import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import {
  markRecommendationReceivedByAdmin,
  updateRecommendationByAdmin,
} from "@/lib/server/recommendations-service";
import { recordAuditEvent } from "@/lib/logging/audit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  recommenderName: z.string().max(180).nullable().optional(),
  recommenderEmail: z.string().email().optional(),
  adminNotes: z.string().max(500).nullable().optional(),
  reason: z.string().min(4).max(300),
});

async function loadRecommendationContext(recommendationId: string) {
  const adminSupabase = getSupabaseAdminClient();
  const { data, error } = await adminSupabase
    .from("recommendation_requests")
    .select("id, application_id")
    .eq("id", recommendationId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError({
      message: "Recommendation not found",
      userMessage: "No se encontró la recomendación.",
      status: 404,
      details: error,
    });
  }

  return data;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const { id } = await context.params;
    const payload = await request.json();
    const parsed = patchSchema.safeParse(payload);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid recommendation admin payload",
        userMessage: "No se pudo actualizar la recomendación.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const recommendationContext = await loadRecommendationContext(id);
    const result = await updateRecommendationByAdmin({
      recommendationId: id,
      actorId: profile.id,
      updates: {
        recommenderName: parsed.data.recommenderName,
        recommenderEmail: parsed.data.recommenderEmail,
        adminNotes: parsed.data.adminNotes,
      },
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: recommendationContext.application_id,
      action: "recommendations.admin_updated",
      metadata: {
        recommendationId: id,
        reason: parsed.data.reason,
        previous: result.previous,
      },
      requestId,
    });

    return NextResponse.json({
      recommendation: result.recommendation,
    });
  }, { operation: "recommendations.admin_update" });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const { id } = await context.params;
    const formData = await request.formData();
    const reason = formData.get("reason");
    const recommenderName = formData.get("recommenderName");
    const maybeFile = formData.get("file");

    if (typeof reason !== "string" || reason.trim().length < 4) {
      throw new AppError({
        message: "Manual recommendation receipt reason missing",
        userMessage: "Debes indicar el motivo para registrar la recomendación manualmente.",
        status: 400,
      });
    }

    let uploadedFile:
      | {
          path: string;
          originalName: string;
          mimeType: string;
          sizeBytes: number;
        }
      | null = null;

    if (maybeFile instanceof File && maybeFile.size > 0) {
      const safeName = maybeFile.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "adjunto";
      const storagePath = `recommendations/${id}/manual/${Date.now()}-${safeName}`;
      const fileBuffer = await maybeFile.arrayBuffer();
      const adminSupabase = getSupabaseAdminClient();
      const { error: uploadError } = await adminSupabase.storage
        .from("application-documents")
        .upload(storagePath, fileBuffer, {
          contentType: maybeFile.type || "application/octet-stream",
          upsert: true,
        });

      if (uploadError) {
        throw new AppError({
          message: "Failed uploading manual recommendation attachment",
          userMessage: "No se pudo subir el adjunto de la recomendación.",
          status: 500,
          details: uploadError,
        });
      }

      uploadedFile = {
        path: storagePath,
        originalName: maybeFile.name,
        mimeType: maybeFile.type || "application/octet-stream",
        sizeBytes: maybeFile.size,
      };
    }

    const recommendationContext = await loadRecommendationContext(id);
    const recommendation = await markRecommendationReceivedByAdmin({
      recommendationId: id,
      actorId: profile.id,
      reason,
      recommenderName:
        typeof recommenderName === "string" ? recommenderName : null,
      file: uploadedFile,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: recommendationContext.application_id,
      action: "recommendations.admin_marked_received",
      metadata: {
        recommendationId: id,
        reason: reason.trim(),
        attachedFile: uploadedFile?.originalName ?? null,
      },
      requestId,
    });

    return NextResponse.json({ recommendation });
  }, { operation: "recommendations.admin_mark_received" });
}
