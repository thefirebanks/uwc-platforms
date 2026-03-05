import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { recordAuditEvent } from "@/lib/logging/audit";
import { queueStageResultAutomations } from "@/lib/server/automation-service";
import {
  queueBroadcastCampaign,
  sendDirectCommunication,
} from "@/lib/server/communications-service";

const schema = z.object({
  templateKey: z.string().min(3).optional(),
  cycleId: z.string().uuid().optional(),
  stageCode: z.enum(["documents", "exam_placeholder"]).optional(),
  triggerEvent: z.enum(["stage_result"]).optional(),
  dryRun: z.boolean().optional(),
  broadcast: z.object({
    name: z.string().min(3).max(140),
    subject: z.string().min(3).max(180),
    bodyTemplate: z.string().min(10).max(6000),
    cycleId: z.string().uuid(),
    stageCode: z.enum(["documents", "exam_placeholder"]).optional(),
    status: z.enum(["draft", "submitted", "eligible", "ineligible", "advanced"]).optional(),
    search: z.string().max(160).optional(),
    directRecipientEmail: z.string().email().optional(),
    idempotencyKey: z.string().min(8).max(200).optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid communication payload",
        userMessage: "No se pudo procesar el envío de comunicaciones.",
        status: 400,
      });
    }

    if (parsed.data.cycleId && parsed.data.stageCode && parsed.data.triggerEvent === "stage_result") {
      const queued = await queueStageResultAutomations({
        supabase,
        cycleId: parsed.data.cycleId,
        stageCode: parsed.data.stageCode,
        actorId: profile.id,
      });

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        action: "communications.queued",
        metadata: {
          triggerEvent: "stage_result",
          cycleId: parsed.data.cycleId,
          stageCode: parsed.data.stageCode,
          sent: queued.sent,
          automationTemplateId: queued.automationTemplateId,
        },
        requestId,
      });

      return NextResponse.json({ sent: queued.sent });
    }

    if (parsed.data.broadcast) {
      const broadcastInput = {
        actorId: profile.id,
        name: parsed.data.broadcast.name,
        subject: parsed.data.broadcast.subject,
        bodyTemplate: parsed.data.broadcast.bodyTemplate,
        recipientFilter: {
          cycleId: parsed.data.broadcast.cycleId,
          stageCode: parsed.data.broadcast.stageCode as "documents" | "exam_placeholder" | undefined,
          status: parsed.data.broadcast.status,
          search: parsed.data.broadcast.search,
          directRecipientEmail: parsed.data.broadcast.directRecipientEmail,
        },
        idempotencyKey: parsed.data.broadcast.idempotencyKey,
        dryRun: parsed.data.dryRun,
      } as const;

      if (parsed.data.broadcast.directRecipientEmail && !parsed.data.dryRun) {
        const result = await sendDirectCommunication({
          supabase,
          input: broadcastInput,
        });

        await recordAuditEvent({
          supabase,
          actorId: profile.id,
          action: "communications.direct_sent",
          metadata: {
            cycleId: parsed.data.broadcast.cycleId,
            recipientEmail: result.recipientEmail,
            providerMessageId: result.providerMessageId,
          },
          requestId,
        });

        return NextResponse.json({
          campaignId: null,
          recipientCount: result.recipientCount,
          deduplicated: false,
          deliveryMode: "direct",
        });
      }

      const result = await queueBroadcastCampaign({
        supabase,
        input: broadcastInput,
      });

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        action: parsed.data.dryRun
          ? "communications.broadcast_previewed"
          : "communications.broadcast_queued",
        metadata: {
          campaignId: result.campaign?.id ?? null,
          cycleId: parsed.data.broadcast.cycleId,
          recipientCount: result.recipientCount,
          deduplicated: result.deduplicated,
        },
        requestId,
      });

      return NextResponse.json({
        campaignId: result.campaign?.id ?? null,
        recipientCount: result.recipientCount,
        deduplicated: result.deduplicated,
      });
    }

    if (!parsed.data.templateKey) {
      throw new AppError({
        message: "Missing template key or automation context",
        userMessage: "Falta indicar la plantilla o automatización de envío.",
        status: 400,
      });
    }

    const { data: applications, error } = await supabase
      .from("applications")
      .select("id, applicant_id, status");

    if (error) {
      throw new AppError({
        message: "Failed loading applications for communications",
        userMessage: "No se pudo generar la lista de correos.",
        status: 500,
        details: error,
      });
    }

    let sent = 0;

    for (const application of applications ?? []) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", application.applicant_id)
        .maybeSingle();

      if (!profileRow) {
        continue;
      }

      const { error: insertError } = await supabase.from("communication_logs").insert({
        application_id: application.id,
        template_key: parsed.data.templateKey,
        subject: "Actualización de postulación UWC Perú",
        body: `Notificación automática para plantilla ${parsed.data.templateKey}.`,
        recipient_email: profileRow.email,
        status: "queued",
        sent_by: profile.id,
      });

      if (!insertError) {
        sent += 1;
      }
    }

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: "communications.queued",
      metadata: {
        templateKey: parsed.data.templateKey,
        sent,
      },
      requestId,
    });

    return NextResponse.json({ sent });
  }, { operation: "communications.send" });
}
