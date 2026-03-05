import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors/app-error";
import type { Database } from "@/types/supabase";
import { renderTemplate } from "@/lib/server/automation-service";
import { renderSafeMarkdown } from "@/lib/markdown";
import {
  assertEmailProviderConfigured,
  sendEmail,
  type EmailDeliveryResult,
} from "@/lib/server/email-provider";
import type { ApplicationStatus, StageCode } from "@/types/domain";

type CommunicationRow = Database["public"]["Tables"]["communication_logs"]["Row"];
type AutomationTemplateRow = Database["public"]["Tables"]["stage_automation_templates"]["Row"];
type CommunicationCampaignRow = Database["public"]["Tables"]["communication_campaigns"]["Row"];
type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export const COMMUNICATION_STATUSES = ["queued", "processing", "sent", "failed"] as const;
export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

export type CommunicationListFilters = {
  cycleId?: string;
  status?: CommunicationStatus;
  limit?: number;
};

export type CommunicationListResult = {
  logs: CommunicationRow[];
  campaigns: CommunicationCampaignSummary[];
  summary: Record<CommunicationStatus, number> & { total: number };
};

export type QueueProcessingInput = {
  cycleId?: string;
  targetStatus: Extract<CommunicationStatus, "queued" | "failed">;
  limit: number;
};

export type QueueProcessingResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  targetStatus: "queued" | "failed";
};

type EmailDeliverer = (communication: CommunicationRow) => Promise<EmailDeliveryResult>;

export type BroadcastRecipientFilter = {
  cycleId: string;
  stageCode?: StageCode;
  status?: ApplicationStatus;
  search?: string;
  directRecipientEmail?: string;
};

export type BroadcastSendInput = {
  actorId: string;
  name: string;
  subject: string;
  bodyTemplate: string;
  recipientFilter: BroadcastRecipientFilter;
  idempotencyKey?: string;
  dryRun?: boolean;
};

export type BroadcastRecipient = {
  applicationId: string;
  applicantId: string;
  email: string;
  fullName: string;
  applicationStatus: ApplicationStatus;
  stageCode: StageCode;
};

export type CommunicationCampaignSummary = {
  id: string;
  name: string;
  subject: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
};

const BROADCAST_IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function emptySummary() {
  return {
    queued: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    total: 0,
  };
}

function normalizeLimit(limit?: number, fallback = 25, max = 100) {
  if (!limit) {
    return fallback;
  }

  return Math.min(Math.max(limit, 1), max);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim();
}

export function buildBroadcastIdempotencyKey({
  actorId,
  cycleId,
  name,
  subject,
  bodyTemplate,
  stageCode,
  status,
  search,
  recipientApplicationIds,
  referenceTime = new Date(),
}: {
  actorId: string;
  cycleId: string;
  name: string;
  subject: string;
  bodyTemplate: string;
  stageCode?: StageCode;
  status?: ApplicationStatus;
  search?: string;
  recipientApplicationIds?: string[];
  referenceTime?: Date;
}) {
  const normalizedRecipientIds = [...(recipientApplicationIds ?? [])].sort();
  const idempotencyBucket = Math.floor(referenceTime.getTime() / BROADCAST_IDEMPOTENCY_WINDOW_MS);

  return createHash("sha256")
    .update(
      JSON.stringify({
        actorId,
        cycleId,
        name: name.trim(),
        subject: subject.trim(),
        bodyTemplate: bodyTemplate.trim(),
        stageCode: stageCode ?? null,
        status: status ?? null,
        search: search?.trim() ?? null,
        recipientApplicationIds: normalizedRecipientIds,
        idempotencyBucket,
      }),
    )
    .digest("hex");
}

async function getCycleApplicationIds({
  supabase,
  cycleId,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
}) {
  const { data, error } = await supabase.from("applications").select("id").eq("cycle_id", cycleId);

  if (error) {
    throw new AppError({
      message: "Failed loading cycle applications for communications",
      userMessage: "No se pudo cargar el estado de comunicaciones del proceso.",
      status: 500,
      details: error,
    });
  }

  return (data ?? []).map((row) => row.id);
}

async function listByFilters({
  supabase,
  status,
  limit,
  applicationIds,
}: {
  supabase: SupabaseClient<Database>;
  status?: CommunicationStatus;
  limit: number;
  applicationIds?: string[];
}) {
  let query = supabase
    .from("communication_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  if (applicationIds) {
    query = query.in("application_id", applicationIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError({
      message: "Failed loading communication logs",
      userMessage: "No se pudo cargar el historial de comunicaciones.",
      status: 500,
      details: error,
    });
  }

  return (data as CommunicationRow[] | null) ?? [];
}

async function loadStatusSummary({
  supabase,
  applicationIds,
}: {
  supabase: SupabaseClient<Database>;
  applicationIds?: string[];
}) {
  let query = supabase.from("communication_logs").select("status");

  if (applicationIds) {
    query = query.in("application_id", applicationIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError({
      message: "Failed loading communication status summary",
      userMessage: "No se pudo cargar el resumen de comunicaciones.",
      status: 500,
      details: error,
    });
  }

  const summary = emptySummary();
  for (const row of data ?? []) {
    if (row.status === "queued") {
      summary.queued += 1;
    } else if (row.status === "processing") {
      summary.processing += 1;
    } else if (row.status === "sent") {
      summary.sent += 1;
    } else if (row.status === "failed") {
      summary.failed += 1;
    }
  }

  summary.total = summary.queued + summary.processing + summary.sent + summary.failed;
  return summary;
}

async function listCampaignSummaries({
  supabase,
  cycleId,
  limit = 6,
}: {
  supabase: SupabaseClient<Database>;
  cycleId?: string;
  limit?: number;
}) {
  let query = supabase
    .from("communication_campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 20));

  if (cycleId) {
    query = query.eq("cycle_id", cycleId);
  }

  const { data: campaignRows, error: campaignError } = await query;
  if (campaignError) {
    throw new AppError({
      message: "Failed loading communication campaigns",
      userMessage: "No se pudo cargar el historial de campañas.",
      status: 500,
      details: campaignError,
    });
  }

  const campaigns = (campaignRows as CommunicationCampaignRow[] | null) ?? [];
  if (campaigns.length === 0) {
    return [];
  }

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const { data: logRows, error: logError } = await supabase
    .from("communication_logs")
    .select("campaign_id, status")
    .in("campaign_id", campaignIds);

  if (logError) {
    throw new AppError({
      message: "Failed loading campaign communication logs",
      userMessage: "No se pudo resumir el historial de campañas.",
      status: 500,
      details: logError,
    });
  }

  const statsByCampaign = new Map<
    string,
    { recipientCount: number; sentCount: number; failedCount: number }
  >();

  for (const row of logRows ?? []) {
    if (!row.campaign_id) {
      continue;
    }

    const current = statsByCampaign.get(row.campaign_id) ?? {
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
    };

    current.recipientCount += 1;
    if (row.status === "sent") {
      current.sentCount += 1;
    }
    if (row.status === "failed") {
      current.failedCount += 1;
    }
    statsByCampaign.set(row.campaign_id, current);
  }

  return campaigns.map((campaign) => {
    const stats = statsByCampaign.get(campaign.id) ?? {
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
    };

    return {
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      status: campaign.status,
      createdAt: campaign.created_at,
      sentAt: campaign.sent_at,
      recipientCount: stats.recipientCount,
      sentCount: stats.sentCount,
      failedCount: stats.failedCount,
    };
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildMessageBody(communication: CommunicationRow) {
  const content = communication.body?.trim();
  if (content) {
    return {
      text: content,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;">${renderSafeMarkdown(content)}</div>`,
    };
  }

  const fallbackText = `Notificación del proceso UWC Perú.\nPlantilla: ${communication.template_key}`;
  return {
    text: fallbackText,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;">${escapeHtml(fallbackText).replaceAll("\n", "<br/>")}</div>`,
  };
}

async function resolveBroadcastRecipients({
  supabase,
  filter,
}: {
  supabase: SupabaseClient<Database>;
  filter: BroadcastRecipientFilter;
}) {
  let query = supabase
    .from("applications")
    .select("id, applicant_id, status, stage_code, cycle_id")
    .eq("cycle_id", filter.cycleId);

  if (filter.stageCode) {
    query = query.eq("stage_code", filter.stageCode);
  }

  if (filter.status) {
    query = query.eq("status", filter.status);
  }

  const { data: applicationRows, error: applicationError } = await query;
  if (applicationError) {
    throw new AppError({
      message: "Failed loading broadcast recipient applications",
      userMessage: "No se pudo calcular la audiencia del envio.",
      status: 500,
      details: applicationError,
    });
  }

  const applications = (applicationRows as ApplicationRow[] | null) ?? [];
  if (applications.length === 0) {
    return [];
  }

  const applicantIds = [...new Set(applications.map((application) => application.applicant_id))];
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", applicantIds);

  if (profileError) {
    throw new AppError({
      message: "Failed loading broadcast recipient profiles",
      userMessage: "No se pudo cargar la audiencia del envio.",
      status: 500,
      details: profileError,
    });
  }

  const profileMap = new Map<string, ProfileRow>();
  for (const profile of (profileRows as ProfileRow[] | null) ?? []) {
    profileMap.set(profile.id, profile);
  }

  const searchNeedle = filter.search ? normalizeSearchText(filter.search) : "";

  return applications
    .map((application) => {
      const profile = profileMap.get(application.applicant_id);
      if (!profile?.email) {
        return null;
      }

      const recipient: BroadcastRecipient = {
        applicationId: application.id,
        applicantId: application.applicant_id,
        email: profile.email,
        fullName: profile.full_name ?? profile.email,
        applicationStatus: application.status as ApplicationStatus,
        stageCode: application.stage_code,
      };

      if (!searchNeedle) {
        return recipient;
      }

      const haystack = normalizeSearchText(`${recipient.fullName} ${recipient.email}`);
      return haystack.includes(searchNeedle) ? recipient : null;
    })
    .filter((recipient): recipient is BroadcastRecipient => Boolean(recipient));
}

async function loadCycleName({
  supabase,
  cycleId,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
}) {
  const { data, error } = await supabase
    .from("cycles")
    .select("name")
    .eq("id", cycleId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError({
      message: "Failed loading cycle for broadcast",
      userMessage: "No se pudo cargar el proceso para este envio.",
      status: 500,
      details: error,
    });
  }

  return data.name;
}

async function loadStageLabel({
  supabase,
  cycleId,
  stageCode,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
  stageCode?: StageCode;
}) {
  if (!stageCode) {
    return "Proceso";
  }

  const { data, error } = await supabase
    .from("cycle_stage_templates")
    .select("stage_label")
    .eq("cycle_id", cycleId)
    .eq("stage_code", stageCode)
    .maybeSingle();

  if (error) {
    throw new AppError({
      message: "Failed loading stage label for communications",
      userMessage: "No se pudo cargar la etapa de esta comunicación.",
      status: 500,
      details: error,
    });
  }

  return data?.stage_label ?? stageCode;
}

function buildCommunicationTemplateContext({
  recipientEmail,
  recipientName,
  applicationId,
  applicationStatus,
  cycleName,
  stageLabel,
}: {
  recipientEmail: string;
  recipientName?: string | null;
  applicationId?: string | null;
  applicationStatus?: ApplicationStatus | string | null;
  cycleName: string;
  stageLabel: string;
}) {
  return {
    full_name: recipientName?.trim() || recipientEmail,
    applicant_email: recipientEmail,
    application_id: applicationId ?? "",
    application_status: applicationStatus ?? "",
    cycle_name: cycleName,
    stage_label: stageLabel,
  };
}

export async function sendCommunicationEmail(
  communication: CommunicationRow,
): Promise<EmailDeliveryResult> {
  const subject = communication.subject?.trim() || "Actualización de postulación UWC Perú";
  const messageBody = buildMessageBody(communication);

  try {
    return await sendEmail({
      to: communication.recipient_email,
      subject,
      text: messageBody.text,
      html: messageBody.html,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    return {
      delivered: false,
      errorMessage: "No se pudo conectar con el proveedor de correo.",
    };
  }
}

export async function sendDirectCommunication({
  supabase,
  input,
}: {
  supabase: SupabaseClient<Database>;
  input: BroadcastSendInput;
}) {
  assertEmailProviderConfigured();

  const directRecipientEmail = input.recipientFilter.directRecipientEmail?.trim().toLowerCase();
  if (!directRecipientEmail || !isValidEmailAddress(directRecipientEmail)) {
    throw new AppError({
      message: "Invalid direct recipient email",
      userMessage: "Debes indicar un correo válido para el envío puntual.",
      status: 400,
    });
  }

  const cycleName = await loadCycleName({
    supabase,
    cycleId: input.recipientFilter.cycleId,
  });
  const stageLabel = await loadStageLabel({
    supabase,
    cycleId: input.recipientFilter.cycleId,
    stageCode: input.recipientFilter.stageCode,
  });
  const context = buildCommunicationTemplateContext({
    recipientEmail: directRecipientEmail,
    cycleName,
    stageLabel,
    applicationStatus: input.recipientFilter.status ?? "",
  });
  const subject = renderTemplate(input.subject, context);
  const bodyText = renderTemplate(input.bodyTemplate, context);
  const bodyHtml = `<div style="font-family:Arial,sans-serif;line-height:1.6;">${renderSafeMarkdown(bodyText)}</div>`;
  const delivery = await sendEmail({
    to: directRecipientEmail,
    subject,
    text: bodyText,
    html: bodyHtml,
  });

  if (!delivery.delivered) {
    throw new AppError({
      message: "Direct communication send failed",
      userMessage: delivery.errorMessage,
      status: 502,
      details: {
        recipientEmail: directRecipientEmail,
      },
    });
  }

  return {
    recipientCount: 1,
    recipientEmail: directRecipientEmail,
    providerMessageId: delivery.providerMessageId,
  };
}

export async function listCommunicationLogs({
  supabase,
  filters,
}: {
  supabase: SupabaseClient<Database>;
  filters: CommunicationListFilters;
}): Promise<CommunicationListResult> {
  const limit = normalizeLimit(filters.limit);
  let applicationIds: string[] | undefined;

  if (filters.cycleId) {
    applicationIds = await getCycleApplicationIds({
      supabase,
      cycleId: filters.cycleId,
    });

    if (applicationIds.length === 0) {
      return {
        logs: [],
        campaigns: [],
        summary: emptySummary(),
      };
    }
  }

  const [logs, summary, campaigns] = await Promise.all([
    listByFilters({
      supabase,
      status: filters.status,
      limit,
      applicationIds,
    }),
    loadStatusSummary({
      supabase,
      applicationIds,
    }),
    listCampaignSummaries({
      supabase,
      cycleId: filters.cycleId,
    }),
  ]);

  return { logs, campaigns, summary };
}

async function lockCommunicationRow({
  supabase,
  communicationId,
  expectedStatus,
}: {
  supabase: SupabaseClient<Database>;
  communicationId: string;
  expectedStatus: "queued" | "failed";
}) {
  const { data, error } = await supabase
    .from("communication_logs")
    .update({ status: "processing" })
    .eq("id", communicationId)
    .eq("status", expectedStatus)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new AppError({
      message: "Failed locking communication row",
      userMessage: "No se pudo procesar la cola de comunicaciones.",
      status: 500,
      details: error,
    });
  }

  return Boolean(data);
}

export async function processCommunicationQueue({
  supabase,
  input,
  deliverEmail = sendCommunicationEmail,
}: {
  supabase: SupabaseClient<Database>;
  input: QueueProcessingInput;
  deliverEmail?: EmailDeliverer;
}): Promise<QueueProcessingResult> {
  if (deliverEmail === sendCommunicationEmail) {
    assertEmailProviderConfigured();
  }

  const limit = normalizeLimit(input.limit, 30, 200);
  let applicationIds: string[] | undefined;

  if (input.cycleId) {
    applicationIds = await getCycleApplicationIds({
      supabase,
      cycleId: input.cycleId,
    });

    if (applicationIds.length === 0) {
      return {
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        targetStatus: input.targetStatus,
      };
    }
  }

  let query = supabase
    .from("communication_logs")
    .select("*")
    .eq("status", input.targetStatus)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (applicationIds) {
    query = query.in("application_id", applicationIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError({
      message: "Failed loading communication queue",
      userMessage: "No se pudo procesar la cola de comunicaciones.",
      status: 500,
      details: error,
    });
  }

  const queue = (data as CommunicationRow[] | null) ?? [];
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const touchedCampaignIds = new Set<string>();

  for (const communication of queue) {
    const locked = await lockCommunicationRow({
      supabase,
      communicationId: communication.id,
      expectedStatus: input.targetStatus,
    });

    if (!locked) {
      skipped += 1;
      continue;
    }

    processed += 1;
    const attemptedAt = new Date().toISOString();
    const attemptCount = communication.attempt_count + 1;
    const delivery = await deliverEmail(communication);
    if (communication.campaign_id) {
      touchedCampaignIds.add(communication.campaign_id);
    }

    if (delivery.delivered) {
      const { error: updateError } = await supabase
        .from("communication_logs")
        .update({
          status: "sent",
          attempt_count: attemptCount,
          last_attempt_at: attemptedAt,
          delivered_at: attemptedAt,
          provider_message_id: delivery.providerMessageId,
          error_message: null,
        })
        .eq("id", communication.id);

      if (updateError) {
        throw new AppError({
          message: "Failed marking communication as sent",
          userMessage: "No se pudo actualizar el estado de comunicación.",
          status: 500,
          details: updateError,
        });
      }

      sent += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("communication_logs")
      .update({
        status: "failed",
        attempt_count: attemptCount,
        last_attempt_at: attemptedAt,
        delivered_at: null,
        provider_message_id: null,
        error_message: delivery.errorMessage,
      })
      .eq("id", communication.id);

    if (updateError) {
      throw new AppError({
        message: "Failed marking communication as failed",
        userMessage: "No se pudo actualizar el estado de comunicación.",
        status: 500,
        details: updateError,
      });
    }

    failed += 1;
  }

  if (touchedCampaignIds.size > 0) {
    await Promise.all(
      Array.from(touchedCampaignIds).map(async (campaignId) => {
        const { data: campaignLogs, error: campaignLogsError } = await supabase
          .from("communication_logs")
          .select("status")
          .eq("campaign_id", campaignId);

        if (campaignLogsError) {
          return;
        }

        const statuses = (campaignLogs ?? []).map((row) => row.status);
        const nextStatus = statuses.every((status) => status === "sent")
          ? "sent"
          : statuses.some((status) => status === "failed")
            ? "partial_failure"
            : "processing";

        await supabase
          .from("communication_campaigns")
          .update({
            status: nextStatus,
            sent_at: nextStatus === "sent" ? new Date().toISOString() : null,
          })
          .eq("id", campaignId);
      }),
    );
  }

  return {
    processed,
    sent,
    failed,
    skipped,
    targetStatus: input.targetStatus,
  };
}

export async function queueBroadcastCampaign({
  supabase,
  input,
}: {
  supabase: SupabaseClient<Database>;
  input: BroadcastSendInput;
}) {
  const directRecipientEmail = input.recipientFilter.directRecipientEmail?.trim().toLowerCase();
  if (directRecipientEmail) {
    if (!isValidEmailAddress(directRecipientEmail)) {
      throw new AppError({
        message: "Invalid direct recipient email in broadcast payload",
        userMessage: "Debes indicar un correo válido para el envío puntual.",
        status: 400,
      });
    }

    if (input.dryRun) {
      return {
        campaign: null,
        recipientCount: 1,
        recipients: [],
        deduplicated: false,
      };
    }

    throw new AppError({
      message: "Direct recipient payload must be handled by direct-send flow",
      userMessage: "El envío puntual debe procesarse como envío directo.",
      status: 400,
    });
  }

  const recipients = await resolveBroadcastRecipients({
    supabase,
    filter: input.recipientFilter,
  });

  const resolvedIdempotencyKey =
    input.idempotencyKey?.trim() ||
    buildBroadcastIdempotencyKey({
      actorId: input.actorId,
      cycleId: input.recipientFilter.cycleId,
      name: input.name,
      subject: input.subject,
      bodyTemplate: input.bodyTemplate,
      stageCode: input.recipientFilter.stageCode,
      status: input.recipientFilter.status,
      search: input.recipientFilter.search,
      recipientApplicationIds: recipients.map((recipient) => recipient.applicationId),
    });

  const existingCampaign = await supabase
    .from("communication_campaigns")
    .select("*")
    .eq("idempotency_key", resolvedIdempotencyKey)
    .maybeSingle();

  if (existingCampaign.error) {
    throw new AppError({
      message: "Failed checking existing broadcast idempotency key",
      userMessage: "No se pudo preparar el envio masivo.",
      status: 500,
      details: existingCampaign.error,
    });
  }

  if (existingCampaign.data) {
    const existingCampaignRow = existingCampaign.data as CommunicationCampaignRow;
    return {
      campaign: existingCampaignRow,
      recipientCount: recipients.length,
      recipients,
      deduplicated: true,
    };
  }

  if (input.dryRun) {
    return {
      campaign: null,
      recipientCount: recipients.length,
      recipients,
      deduplicated: false,
    };
  }

  if (recipients.length === 0) {
    throw new AppError({
      message: "Broadcast campaign has no matching recipients",
      userMessage: "No hay destinatarios que coincidan con esos filtros.",
      status: 422,
    });
  }

  const cycleName = await loadCycleName({
    supabase,
    cycleId: input.recipientFilter.cycleId,
  });

  const { data: campaignData, error: campaignError } = await supabase
    .from("communication_campaigns")
    .insert({
      created_by: input.actorId,
      cycle_id: input.recipientFilter.cycleId,
      name: input.name.trim(),
      subject: input.subject.trim(),
      body_template: input.bodyTemplate,
      recipient_filter: input.recipientFilter,
      status: "queued",
      idempotency_key: resolvedIdempotencyKey,
    })
    .select("*")
    .single();

  if (campaignError || !campaignData) {
    throw new AppError({
      message: "Failed creating communication campaign",
      userMessage: "No se pudo crear la campaña de envio.",
      status: 500,
      details: campaignError,
    });
  }

  const createdCampaign = campaignData as CommunicationCampaignRow;

  const logsToInsert = recipients.map((recipient) => {
    const context = buildCommunicationTemplateContext({
      recipientEmail: recipient.email,
      recipientName: recipient.fullName,
      applicationId: recipient.applicationId,
      applicationStatus: recipient.applicationStatus,
      cycleName,
      stageLabel: recipient.stageCode,
    });

    return {
      application_id: recipient.applicationId,
      campaign_id: createdCampaign.id,
      template_key: "broadcast_custom",
      trigger_event: "broadcast",
      subject: renderTemplate(input.subject, context),
      body: renderTemplate(input.bodyTemplate, context),
      automation_template_id: null,
      recipient_email: recipient.email,
      status: "queued" as const,
      error_message: null,
      idempotency_key: resolvedIdempotencyKey,
      sent_by: input.actorId,
      attempt_count: 0,
      is_applicant_visible: true,
    };
  });

  if (logsToInsert.length > 0) {
    const { error: insertError } = await supabase.from("communication_logs").insert(logsToInsert);
    if (insertError) {
      throw new AppError({
        message: "Failed queueing broadcast communication logs",
        userMessage: "No se pudo encolar el envio masivo.",
        status: 500,
        details: insertError,
      });
    }
  }

  return {
    campaign: createdCampaign,
    recipientCount: recipients.length,
    recipients,
    deduplicated: false,
  };
}

export type PreviewEmailInput = {
  automationTemplateId?: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  sampleValues?: Record<string, string>;
};

export type PreviewEmailResult = {
  subject: string;
  bodyText: string;
  bodyHtml: string;
};

export async function previewEmail({
  supabase,
  input,
}: {
  supabase: SupabaseClient<Database>;
  input: PreviewEmailInput;
}): Promise<PreviewEmailResult> {
  let subjectTemplate = input.subjectTemplate ?? "";
  let bodyTemplate = input.bodyTemplate ?? "";
  let stageLabel = "documents";

  if (input.automationTemplateId) {
    const { data: rawTemplate, error } = await supabase
      .from("stage_automation_templates")
      .select("*")
      .eq("id", input.automationTemplateId)
      .maybeSingle();

    const template = rawTemplate as AutomationTemplateRow | null;

    if (error || !template) {
      throw new AppError({
        message: "Automation template not found",
        userMessage: "No se encontró la plantilla de automatización.",
        status: 404,
        details: error,
      });
    }

    subjectTemplate = template.template_subject;
    bodyTemplate = template.template_body;
    stageLabel = template.stage_code;
  }

  if (!subjectTemplate.trim() || !bodyTemplate.trim()) {
    throw new AppError({
      message: "Missing preview template content",
      userMessage: "Debes indicar asunto y cuerpo para previsualizar el correo.",
      status: 400,
    });
  }

  const defaultSample: Record<string, string> = {
    full_name: "Juan Pérez (ejemplo)",
    cycle_name: "Proceso UWC 2026 (ejemplo)",
    application_id: "00000000-0000-0000-0000-000000000000",
    application_status: "submitted",
    stage_label: stageLabel,
  };

  const context = { ...defaultSample, ...(input.sampleValues ?? {}) };
  const subject = renderTemplate(subjectTemplate, context);
  const body = renderTemplate(bodyTemplate, context);
  const bodyHtml = `<div style="font-family:Arial,sans-serif;line-height:1.6;">${renderSafeMarkdown(body)}</div>`;

  return {
    subject,
    bodyText: body,
    bodyHtml,
  };
}

export async function sendTestEmail({
  recipientEmail,
  subject,
  bodyText,
  bodyHtml,
}: {
  recipientEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
}): Promise<EmailDeliveryResult> {
  try {
    return await sendEmail({
      to: recipientEmail,
      subject: `[TEST] ${subject}`,
      text: bodyText,
      html: bodyHtml,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    return {
      delivered: false,
      errorMessage: "No se pudo conectar con el proveedor de correo.",
    };
  }
}
