import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { buildFallbackStageFields, resolveDocumentStageFields } from "@/lib/stages/stage-field-fallback";
import { validateRequiredFiles, validateStagePayload } from "@/lib/stages/form-schema";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/supabase";
import type { StageAutomationTrigger, StageCode } from "@/types/domain";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type StageAutomationRow = Database["public"]["Tables"]["stage_automation_templates"]["Row"];

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token) => {
    return values[token] ?? "";
  });
}

async function getConfiguredStageFields({
  supabase,
  cycleId,
  stageCode,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
  stageCode: StageCode;
}) {
  const { data, error } = await supabase
    .from("cycle_stage_fields")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("stage_code", stageCode)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError({
      message: "Failed loading stage fields",
      userMessage: "No se pudo validar la configuración de campos de esta etapa.",
      status: 500,
      details: error,
    });
  }

  const rows = ((data as Database["public"]["Tables"]["cycle_stage_fields"]["Row"][] | null) ?? []).map((row) => ({
    ...row,
    section_id: (row as Record<string, unknown>).section_id as string | null ?? null,
  }));
  if (stageCode !== "documents") {
    return rows;
  }

  if (rows.length === 0) {
    return buildFallbackStageFields(cycleId);
  }

  return resolveDocumentStageFields({
    cycleId,
    fields: rows,
  });
}

async function validateRecommendersBeforeSubmit({
  supabase,
  applicationId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
}) {
  void supabase;
  const adminSupabase = getSupabaseAdminClient();
  const { data, error } = await adminSupabase
    .from("recommendation_requests")
    .select("role, status, submitted_at, invalidated_at")
    .eq("application_id", applicationId)
    .is("invalidated_at", null);

  if (error) {
    throw new AppError({
      message: "Failed loading recommendations before submit",
      userMessage: "No se pudo validar el estado de recomendadores.",
      status: 500,
      details: error,
    });
  }

  const rows = (data ?? []) as Array<{
    role: "mentor" | "friend";
    status: string;
    submitted_at: string | null;
    invalidated_at: string | null;
  }>;

  const hasSubmittedMentor = rows.some(
    (row) => row.role === "mentor" && (row.status === "submitted" || Boolean(row.submitted_at)),
  );
  const hasSubmittedFriend = rows.some(
    (row) => row.role === "friend" && (row.status === "submitted" || Boolean(row.submitted_at)),
  );

  if (!hasSubmittedMentor || !hasSubmittedFriend) {
    throw new AppError({
      message: "Missing required submitted recommendation forms",
      userMessage:
        "Necesitas 2 recomendaciones completas (mentor y amigo) antes de enviar tu postulación.",
      status: 422,
      details: {
        hasSubmittedMentor,
        hasSubmittedFriend,
      },
    });
  }
}

async function getEnabledAutomation({
  supabase,
  cycleId,
  stageCode,
  triggerEvent,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
  stageCode: StageCode;
  triggerEvent: StageAutomationTrigger;
}) {
  const { data, error } = await supabase
    .from("stage_automation_templates")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("stage_code", stageCode)
    .eq("trigger_event", triggerEvent)
    .eq("channel", "email")
    .eq("is_enabled", true)
    .maybeSingle();

  if (error) {
    throw new AppError({
      message: "Failed loading automation template",
      userMessage: "No se pudo cargar la plantilla de automatización.",
      status: 500,
      details: error,
    });
  }

  return (data as StageAutomationRow | null) ?? null;
}

async function queueAutomationCommunication({
  supabase,
  application,
  automation,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  application: ApplicationRow;
  automation: StageAutomationRow;
  actorId: string;
}) {
  const [{ data: profile }, { data: cycle }, { data: stageTemplate }] = await Promise.all([
    supabase.from("profiles").select("email, full_name").eq("id", application.applicant_id).maybeSingle(),
    supabase.from("cycles").select("name").eq("id", application.cycle_id).maybeSingle(),
    supabase
      .from("cycle_stage_templates")
      .select("stage_label")
      .eq("cycle_id", application.cycle_id)
      .eq("stage_code", application.stage_code)
      .maybeSingle(),
  ]);

  if (!profile?.email) {
    return false;
  }

  const payload = application.payload as Record<string, unknown>;
  const contextValues = {
    full_name:
      (typeof payload.fullName === "string" && payload.fullName.trim()) ||
      profile.full_name ||
      profile.email,
    cycle_name: cycle?.name ?? "Proceso UWC",
    application_id: application.id,
    application_status: application.status,
    stage_label: stageTemplate?.stage_label ?? application.stage_code,
  };

  const subject = renderTemplate(automation.template_subject, contextValues);
  const body = renderTemplate(automation.template_body, contextValues);
  const adminSupabase = getSupabaseAdminClient();

  const { error: insertError } = await adminSupabase.from("communication_logs").insert({
    application_id: application.id,
    template_key: `${automation.stage_code}.${automation.trigger_event}`,
    trigger_event: automation.trigger_event,
    subject,
    body,
    automation_template_id: automation.id,
    recipient_email: profile.email,
    status: "queued",
    sent_by: actorId,
  });

  if (insertError) {
    throw new AppError({
      message: "Failed queueing automation communication",
      userMessage: "No se pudo registrar la automatización de correo.",
      status: 500,
      details: insertError,
    });
  }

  return true;
}

export async function validateApplicationBeforeSubmit({
  supabase,
  application,
}: {
  supabase: SupabaseClient<Database>;
  application: ApplicationRow;
}) {
  const fields = await getConfiguredStageFields({
    supabase,
    cycleId: application.cycle_id,
    stageCode: application.stage_code,
  });

  const payloadValidation = validateStagePayload({
    fields: fields.filter((field) => field.field_type !== "file"),
    payload: (application.payload as Record<string, unknown>) ?? {},
    skipFileValidation: true,
  });

  if (!payloadValidation.isValid) {
    const firstMessage = Object.values(payloadValidation.errors)[0] ?? "Campos incompletos.";
    throw new AppError({
      message: "Application payload invalid for stage",
      userMessage: `No puedes enviar la postulación: ${firstMessage}`,
      status: 422,
      details: payloadValidation.errors,
    });
  }

  const fileValidation = validateRequiredFiles({
    fields,
    files: (application.files as Record<string, string | { path?: string }>) ?? {},
  });

  if (!fileValidation.isValid) {
    const firstMissing = fileValidation.missingFields[0];
    throw new AppError({
      message: "Missing required file fields",
      userMessage: `Falta adjuntar ${firstMissing.field_label} para enviar la postulación.`,
      status: 422,
      details: fileValidation.missingFields.map((field) => field.field_key),
    });
  }

  await validateRecommendersBeforeSubmit({
    supabase,
    applicationId: application.id,
  });
}

export async function queueApplicationAutomationIfEnabled({
  supabase,
  application,
  triggerEvent,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  application: ApplicationRow;
  triggerEvent: StageAutomationTrigger;
  actorId: string;
}) {
  const automation = await getEnabledAutomation({
    supabase,
    cycleId: application.cycle_id,
    stageCode: application.stage_code,
    triggerEvent,
  });

  if (!automation) {
    return { queued: false, automationTemplateId: null };
  }

  const queued = await queueAutomationCommunication({
    supabase,
    application,
    automation,
    actorId,
  });

  return { queued, automationTemplateId: automation.id };
}

export async function queueStageResultAutomations({
  supabase,
  cycleId,
  stageCode,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
  stageCode: StageCode;
  actorId: string;
}) {
  const automation = await getEnabledAutomation({
    supabase,
    cycleId,
    stageCode,
    triggerEvent: "stage_result",
  });

  if (!automation) {
    throw new AppError({
      message: "No enabled stage_result automation found",
      userMessage:
        "No hay automatización activa para resultados de etapa. Actívala en configuración de etapa.",
      status: 422,
    });
  }

  const { data: applicationsData, error: applicationsError } = await supabase
    .from("applications")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("stage_code", stageCode);

  if (applicationsError) {
    throw new AppError({
      message: "Failed loading applications for stage_result automation",
      userMessage: "No se pudo generar la lista de postulaciones para enviar resultados.",
      status: 500,
      details: applicationsError,
    });
  }

  let sent = 0;
  for (const application of ((applicationsData as ApplicationRow[] | null) ?? [])) {
    const queued = await queueAutomationCommunication({
      supabase,
      application,
      automation,
      actorId,
    });
    if (queued) {
      sent += 1;
    }
  }

  return {
    sent,
    automationTemplateId: automation.id,
  };
}
