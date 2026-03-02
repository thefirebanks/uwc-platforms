import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import type { Database } from "@/types/supabase";
import { renderTemplate } from "@/lib/server/automation-service";

type CommunicationRow = Database["public"]["Tables"]["communication_logs"]["Row"];
type AutomationTemplateRow = Database["public"]["Tables"]["stage_automation_templates"]["Row"];

export const COMMUNICATION_STATUSES = ["queued", "processing", "sent", "failed"] as const;
export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

export type CommunicationListFilters = {
  cycleId?: string;
  status?: CommunicationStatus;
  limit?: number;
};

export type CommunicationListResult = {
  logs: CommunicationRow[];
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

export type EmailDeliveryResult =
  | { delivered: true; providerMessageId: string }
  | { delivered: false; errorMessage: string };

type EmailDeliverer = (communication: CommunicationRow) => Promise<EmailDeliveryResult>;

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
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5;">${escapeHtml(content).replaceAll("\n", "<br/>")}</div>`,
    };
  }

  const fallbackText = `Notificación del proceso UWC Perú.\nPlantilla: ${communication.template_key}`;
  return {
    text: fallbackText,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;">${escapeHtml(fallbackText).replaceAll("\n", "<br/>")}</div>`,
  };
}

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const fromName = process.env.RESEND_FROM_NAME?.trim() || "UWC Peru";

  if (!apiKey || !fromEmail) {
    return null;
  }

  return {
    apiKey,
    fromHeader: `${fromName} <${fromEmail}>`,
  };
}

function assertEmailProviderConfigured() {
  if (getEmailConfig()) {
    return;
  }

  throw new AppError({
    message: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL",
    userMessage:
      "Falta configurar el correo saliente del sistema. Define RESEND_API_KEY y RESEND_FROM_EMAIL.",
    status: 400,
  });
}

function getResendErrorMessage(raw: unknown) {
  if (typeof raw !== "string") {
    return "Proveedor de correo devolvió error desconocido.";
  }

  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string };
    return parsed.message || parsed.error || raw;
  } catch {
    return raw;
  }
}

export async function sendCommunicationEmail(
  communication: CommunicationRow,
): Promise<EmailDeliveryResult> {
  const config = getEmailConfig();
  if (!config) {
    throw new AppError({
      message: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL",
      userMessage:
        "Falta configurar el correo saliente del sistema. Define RESEND_API_KEY y RESEND_FROM_EMAIL.",
      status: 400,
    });
  }

  const subject = communication.subject?.trim() || "Actualización de postulación UWC Perú";
  const messageBody = buildMessageBody(communication);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromHeader,
        to: [communication.recipient_email],
        subject,
        text: messageBody.text,
        html: messageBody.html,
      }),
    });

    if (!response.ok) {
      return {
        delivered: false,
        errorMessage: getResendErrorMessage(await response.text()),
      };
    }

    const payload = (await response.json()) as { id?: string };
    const providerMessageId = payload.id;

    if (!providerMessageId) {
      return {
        delivered: false,
        errorMessage: "Proveedor de correo no devolvió identificador de mensaje.",
      };
    }

    return {
      delivered: true,
      providerMessageId,
    };
  } catch {
    return {
      delivered: false,
      errorMessage: "No se pudo conectar con el proveedor de correo.",
    };
  }
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
        summary: emptySummary(),
      };
    }
  }

  const [logs, summary] = await Promise.all([
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
  ]);

  return { logs, summary };
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

  return {
    processed,
    sent,
    failed,
    skipped,
    targetStatus: input.targetStatus,
  };
}

export type PreviewEmailInput = {
  automationTemplateId: string;
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

  const defaultSample: Record<string, string> = {
    full_name: "Juan Pérez (ejemplo)",
    cycle_name: "Proceso UWC 2026 (ejemplo)",
    application_id: "00000000-0000-0000-0000-000000000000",
    application_status: "submitted",
    stage_label: template.stage_code,
  };

  const context = { ...defaultSample, ...(input.sampleValues ?? {}) };
  const subject = renderTemplate(template.template_subject, context);
  const body = renderTemplate(template.template_body, context);
  const bodyHtml = `<div style="font-family:Arial,sans-serif;line-height:1.5;">${escapeHtml(body).replaceAll("\n", "<br/>")}</div>`;

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
  const config = getEmailConfig();
  if (!config) {
    throw new AppError({
      message: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL",
      userMessage:
        "Falta configurar el correo saliente del sistema. Define RESEND_API_KEY y RESEND_FROM_EMAIL.",
      status: 400,
    });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromHeader,
        to: [recipientEmail],
        subject: `[TEST] ${subject}`,
        text: bodyText,
        html: bodyHtml,
      }),
    });

    if (!response.ok) {
      return {
        delivered: false,
        errorMessage: getResendErrorMessage(await response.text()),
      };
    }

    const payload = (await response.json()) as { id?: string };
    const providerMessageId = payload.id;

    if (!providerMessageId) {
      return {
        delivered: false,
        errorMessage: "Proveedor de correo no devolvió identificador de mensaje.",
      };
    }

    return {
      delivered: true,
      providerMessageId,
    };
  } catch {
    return {
      delivered: false,
      errorMessage: "No se pudo conectar con el proveedor de correo.",
    };
  }
}
