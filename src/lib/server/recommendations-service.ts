import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/logger";
import { assertApplicantCanEditCycle } from "@/lib/server/application-service";
import { sendEmail } from "@/lib/server/email-provider";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/supabase";
import type { RecommenderRole, RecommendationStatus } from "@/types/domain";

type RecommendationRow = Database["public"]["Tables"]["recommendation_requests"]["Row"];
type RecommendationInsert = Database["public"]["Tables"]["recommendation_requests"]["Insert"];

const OTP_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type RecommendationSummary = {
  id: string;
  role: RecommenderRole;
  name: string | null;
  email: string;
  status: RecommendationStatus;
  submittedAt: string | null;
  inviteSentAt: string | null;
  openedAt: string | null;
  startedAt: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  invalidatedAt: string | null;
  adminReceivedAt: string | null;
  adminReceivedBy: string | null;
  adminReceivedReason: string | null;
  adminReceivedFile: Record<string, unknown> | null;
  adminNotes: string | null;
  createdAt: string;
};

export type RecommenderFormPayload = {
  recommenderName: string;
  relationshipTitle: string;
  knownDuration: string;
  strengths: string;
  growthAreas: string;
  endorsement: string;
  confirmsNoFamily: boolean;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function toIso(ms: number) {
  return new Date(ms).toISOString();
}

function isPast(dateLike: string | null | undefined) {
  if (!dateLike) {
    return false;
  }

  const time = Date.parse(dateLike);
  return Number.isFinite(time) && time < Date.now();
}

function hashValue(input: string) {
  const salt = process.env.RECOMMENDER_TOKEN_SALT ?? process.env.SUPABASE_SECRET_KEY ?? "local-dev";
  return createHash("sha256").update(`${salt}:${input}`).digest("hex");
}

function generateOtpCode() {
  return String(randomInt(100000, 999999));
}

function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

function roleLabel(role: RecommenderRole) {
  return role === "mentor" ? "Tutor/Profesor/Mentor" : "Amigo";
}

async function sendRawEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  const result = await sendEmail({
    to,
    subject,
    text,
  });

  if (!result.delivered) {
    throw new AppError({
      message: "Recommendation email failed",
      userMessage: "No se pudo enviar el correo de recomendación.",
      status: 502,
      details: result.errorMessage,
    });
  }

  return result;
}

function asSummary(row: RecommendationRow): RecommendationSummary {
  return {
    id: row.id,
    role: row.role,
    name: row.recommender_name,
    email: row.recommender_email,
    status: row.status,
    submittedAt: row.submitted_at,
    inviteSentAt: row.invite_sent_at,
    openedAt: row.opened_at,
    startedAt: row.started_at,
    reminderCount: row.reminder_count,
    lastReminderAt: row.last_reminder_at,
    invalidatedAt: row.invalidated_at,
    adminReceivedAt: row.admin_received_at,
    adminReceivedBy: row.admin_received_by,
    adminReceivedReason: row.admin_received_reason,
    adminReceivedFile:
      row.admin_received_file &&
      typeof row.admin_received_file === "object" &&
      !Array.isArray(row.admin_received_file)
        ? (row.admin_received_file as Record<string, unknown>)
        : null,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
  };
}

function getRecommendationAccessUrl({
  token,
  origin,
}: {
  token: string;
  origin: string;
}) {
  return `${origin}/recomendacion/${token}`;
}

function buildInviteEmailText({
  cycleName,
  role,
  accessUrl,
  isReminder,
}: {
  cycleName: string;
  role: RecommenderRole;
  accessUrl: string;
  isReminder: boolean;
}) {
  const roleName = roleLabel(role);
  return [
    `UWC Perú - ${isReminder ? "Recordatorio" : "Solicitud"} de recomendación`,
    "",
    `Has sido registrado(a) como recomendador(a) en el proceso ${cycleName}.`,
    `Rol solicitado: ${roleName}.`,
    "",
    "Abre este enlace para completar tu recomendación:",
    accessUrl,
    "",
    "Por seguridad, se te pedirá un código OTP enviado a este mismo correo.",
    "Puedes guardar borrador y continuar más tarde antes de enviar.",
  ].join("\n");
}

function buildOtpEmailText({
  role,
  code,
}: {
  role: RecommenderRole;
  code: string;
}) {
  const roleName = roleLabel(role);
  return [
    "UWC Perú - Código de verificación",
    "",
    `Tu código OTP para continuar como ${roleName} es: ${code}`,
    "",
    "Este código vence en 15 minutos.",
    "Si no solicitaste este acceso, ignora este correo.",
  ].join("\n");
}

async function loadApplicationOwnership({
  supabase,
  applicationId,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  actorId: string;
}) {
  const { data, error } = await supabase
    .from("applications")
    .select("id, applicant_id, cycle_id, payload")
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError({
      message: "Application not found",
      userMessage: "No se encontró la postulación.",
      status: 404,
      details: error,
    });
  }

  if (data.applicant_id !== actorId) {
    throw new AppError({
      message: "Applicant cannot manage another application recommendations",
      userMessage: "No tienes permiso para gestionar estos recomendadores.",
      status: 403,
    });
  }

  return data;
}

async function assertApplicantCycleIsOpenForEdits({
  supabase,
  cycleId,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
}) {
  await assertApplicantCanEditCycle({
    supabase,
    cycleId,
  });
}

export async function listApplicantRecommendations({
  supabase,
  applicationId,
  applicantId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  applicantId: string;
}) {
  await loadApplicationOwnership({
    supabase,
    applicationId,
    actorId: applicantId,
  });

  const adminSupabase = getSupabaseAdminClient();
  const { data, error } = await adminSupabase
    .from("recommendation_requests")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError({
      message: "Failed loading recommendation requests",
      userMessage: "No se pudieron cargar los recomendadores.",
      status: 500,
      details: error,
    });
  }

  return ((data as RecommendationRow[] | null) ?? []).map(asSummary);
}

export async function upsertApplicantRecommendations({
  supabase,
  applicationId,
  applicantId,
  applicantEmail,
  recommenders,
  origin,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  applicantId: string;
  applicantEmail: string | null;
  recommenders: Array<{ role: RecommenderRole; email: string }>;
  origin: string;
}) {
  const normalized = recommenders.map((item) => ({
    role: item.role,
    email: normalizeEmail(item.email),
  }));
  const normalizedApplicantEmail = applicantEmail ? normalizeEmail(applicantEmail) : null;

  const uniqueEmails = new Set(normalized.map((item) => item.email));
  if (uniqueEmails.size !== normalized.length) {
    throw new AppError({
      message: "Duplicate recommender emails across roles",
      userMessage:
        "Cada recomendador debe tener un correo distinto. No puedes repetir el mismo correo.",
      status: 400,
    });
  }

  if (normalizedApplicantEmail && normalized.some((item) => item.email === normalizedApplicantEmail)) {
    throw new AppError({
      message: "Applicant attempted to register themselves as recommender",
      userMessage:
        "No puedes registrarte como tu propio recomendador. Usa dos correos distintos al de tu cuenta.",
      status: 400,
    });
  }

  const roles = new Set(normalized.map((item) => item.role));
  if (roles.size !== normalized.length) {
    throw new AppError({
      message: "Duplicate recommender role in request",
      userMessage:
        "No puedes repetir el mismo tipo de recomendador en un solo guardado.",
      status: 400,
    });
  }

  const application = await loadApplicationOwnership({
    supabase,
    applicationId,
    actorId: applicantId,
  });
  await assertApplicantCycleIsOpenForEdits({
    supabase,
    cycleId: application.cycle_id,
  });

  const { data: cycle } = await supabase
    .from("cycles")
    .select("name, stage1_close_at")
    .eq("id", application.cycle_id)
    .maybeSingle();
  const cycleName = cycle?.name ?? "Proceso UWC";

  const adminSupabase = getSupabaseAdminClient();
  const { data: existingRows, error: existingRowsError } = await adminSupabase
    .from("recommendation_requests")
    .select("*")
    .eq("application_id", applicationId)
    .is("invalidated_at", null)
    .order("created_at", { ascending: false });

  if (existingRowsError) {
    throw new AppError({
      message: "Failed loading existing recommendations for upsert",
      userMessage: "No se pudieron actualizar los recomendadores.",
      status: 500,
      details: existingRowsError,
    });
  }

  const activeByRole = new Map<RecommenderRole, RecommendationRow>();
  for (const row of (existingRows as RecommendationRow[] | null) ?? []) {
    if (!activeByRole.has(row.role)) {
      activeByRole.set(row.role, row);
    }
  }

  const nowIso = new Date().toISOString();
  const recommendedExpiry = cycle?.stage1_close_at ?? toIso(Date.now() + 45 * 24 * 60 * 60 * 1000);
  const rowsToInsert: RecommendationInsert[] = [];
  const idsToInvalidate: string[] = [];

  for (const slot of normalized) {
    const current = activeByRole.get(slot.role);
    if (!current) {
      rowsToInsert.push({
        application_id: applicationId,
        requester_id: applicantId,
        role: slot.role,
        recommender_email: slot.email,
        token: randomUUID(),
        status: "invited",
        access_expires_at: recommendedExpiry,
      });
      continue;
    }

    if (current.recommender_email === slot.email) {
      if (current.status === "submitted") {
        continue;
      }
      continue;
    }

    if (current.status === "submitted" || current.submitted_at) {
      throw new AppError({
        message: "Cannot replace submitted recommender",
        userMessage:
          "No puedes reemplazar un recomendador que ya envió su formulario.",
        status: 422,
      });
    }

    idsToInvalidate.push(current.id);
    rowsToInsert.push({
      application_id: applicationId,
      requester_id: applicantId,
      role: slot.role,
      recommender_email: slot.email,
      token: randomUUID(),
      status: "invited",
      access_expires_at: recommendedExpiry,
    });
  }

  if (idsToInvalidate.length > 0) {
    const { error: invalidateError } = await adminSupabase
      .from("recommendation_requests")
      .update({
        status: "invalidated",
        invalidated_at: nowIso,
        invalidation_reason: "replaced_by_applicant",
      })
      .in("id", idsToInvalidate)
      .is("invalidated_at", null);

    if (invalidateError) {
      throw new AppError({
        message: "Failed invalidating replaced recommender rows",
        userMessage: "No se pudo reemplazar el recomendador. Intenta nuevamente.",
        status: 500,
        details: invalidateError,
      });
    }
  }

  let insertedRows: RecommendationRow[] = [];
  if (rowsToInsert.length > 0) {
    const { data: insertedData, error: insertError } = await adminSupabase
      .from("recommendation_requests")
      .insert(rowsToInsert)
      .select("*");

    if (insertError || !insertedData) {
      throw new AppError({
        message: "Failed creating recommender rows",
        userMessage: "No se pudieron registrar los recomendadores.",
        status: 500,
        details: insertError,
      });
    }
    insertedRows = insertedData as RecommendationRow[];
  }

  const emailResults: Array<{
    id: string;
    role: RecommenderRole;
    email: string;
    sent: boolean;
    providerMessageId: string | null;
    errorMessage: string | null;
  }> = [];
  for (const row of insertedRows) {
    const accessUrl = getRecommendationAccessUrl({
      token: row.token,
      origin,
    });
    try {
      const delivery = await sendRawEmail({
        to: row.recommender_email,
        subject: `UWC Perú · Solicitud de recomendación (${roleLabel(row.role)})`,
        text: buildInviteEmailText({
          cycleName,
          role: row.role,
          accessUrl,
          isReminder: false,
        }),
      });

      const { error: markSentError } = await adminSupabase
        .from("recommendation_requests")
        .update({
          status: "sent",
          invite_sent_at: nowIso,
        })
        .eq("id", row.id);

      if (markSentError) {
        throw markSentError;
      }
      emailResults.push({
        id: row.id,
        role: row.role,
        email: row.recommender_email,
        sent: true,
        providerMessageId: delivery.providerMessageId,
        errorMessage: null,
      });
      logger.info(
        {
          recommendationId: row.id,
          role: row.role,
          email: row.recommender_email,
          provider: "gmail",
          providerMessageId: delivery.providerMessageId,
        },
        "Recommendation invite sent",
      );
    } catch (error) {
      const errorMessage =
        error instanceof AppError
          ? error.details
            ? String(error.details)
            : error.message
          : error instanceof Error
            ? error.message
            : "Unknown recommendation invite delivery error";
      emailResults.push({
        id: row.id,
        role: row.role,
        email: row.recommender_email,
        sent: false,
        providerMessageId: null,
        errorMessage,
      });
      logger.warn(
        {
          recommendationId: row.id,
          role: row.role,
          email: row.recommender_email,
          error: errorMessage,
        },
        "Recommendation invite failed",
      );
    }
  }

  const { data: finalRowsData, error: finalRowsError } = await adminSupabase
    .from("recommendation_requests")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (finalRowsError) {
    throw new AppError({
      message: "Failed loading recommendation rows after upsert",
      userMessage: "No se pudo recargar el estado de recomendadores.",
      status: 500,
      details: finalRowsError,
    });
  }

  const finalSummaries = ((finalRowsData as RecommendationRow[] | null) ?? []).map(asSummary);

  return {
    rows: finalSummaries,
    createdCount: insertedRows.length,
    replacedCount: idsToInvalidate.length,
    failedEmailCount: emailResults.filter((result) => !result.sent).length,
    deliveryResults: emailResults,
  };
}

export async function sendRecommendationReminder({
  supabase,
  recommendationId,
  actorId,
  actorRole,
  origin,
}: {
  supabase: SupabaseClient<Database>;
  recommendationId: string;
  actorId: string;
  actorRole: "admin" | "applicant";
  origin: string;
}) {
  const adminSupabase = getSupabaseAdminClient();
  const { data: row, error } = await adminSupabase
    .from("recommendation_requests")
    .select("*")
    .eq("id", recommendationId)
    .maybeSingle();

  if (error || !row) {
    throw new AppError({
      message: "Recommendation not found for reminder",
      userMessage: "No se encontró el recomendador.",
      status: 404,
      details: error,
    });
  }

  const rec = row as RecommendationRow;

  const { data: appRow, error: appError } = await supabase
    .from("applications")
    .select("id, applicant_id, cycle_id")
    .eq("id", rec.application_id)
    .maybeSingle();

  if (appError || !appRow) {
    throw new AppError({
      message: "Application not found for recommendation reminder",
      userMessage: "No se encontró la postulación asociada a este recomendador.",
      status: 404,
      details: appError,
    });
  }

  const { data: cycleRow, error: cycleError } = await supabase
    .from("cycles")
    .select("name")
    .eq("id", appRow.cycle_id)
    .maybeSingle();

  if (cycleError || !cycleRow) {
    throw new AppError({
      message: "Cycle not found for recommendation reminder",
      userMessage: "No se encontró el proceso de selección asociado.",
      status: 404,
      details: cycleError,
    });
  }

  if (actorRole === "applicant" && appRow.applicant_id !== actorId) {
    throw new AppError({
      message: "Applicant cannot remind another application's recommender",
      userMessage: "No tienes permiso para recordar este recomendador.",
      status: 403,
    });
  }

  if (actorRole === "applicant") {
    await assertApplicantCycleIsOpenForEdits({
      supabase,
      cycleId: appRow.cycle_id,
    });
  }

  if (rec.status === "invalidated" || rec.invalidated_at) {
    throw new AppError({
      message: "Recommendation invalidated",
      userMessage: "Este recomendador fue reemplazado y ya no puede recibir recordatorios.",
      status: 422,
    });
  }

  if (rec.status === "submitted" || rec.submitted_at) {
    throw new AppError({
      message: "Recommendation already submitted",
      userMessage: "Este recomendador ya completó su formulario.",
      status: 422,
    });
  }

  if (isPast(rec.access_expires_at)) {
    await adminSupabase
      .from("recommendation_requests")
      .update({ status: "expired" })
      .eq("id", rec.id);

    throw new AppError({
      message: "Recommendation link expired",
      userMessage: "El enlace del recomendador venció. Reemplázalo para generar uno nuevo.",
      status: 422,
    });
  }

  const nowIso = new Date().toISOString();
  const accessUrl = getRecommendationAccessUrl({
    token: rec.token,
    origin,
  });

  const reminderDelivery = await sendRawEmail({
    to: rec.recommender_email,
    subject: `UWC Perú · Recordatorio de recomendación (${roleLabel(rec.role)})`,
    text: buildInviteEmailText({
      cycleName: cycleRow.name,
      role: rec.role,
      accessUrl,
      isReminder: true,
    }),
  });
  logger.info(
    {
      recommendationId: rec.id,
      role: rec.role,
      email: rec.recommender_email,
      provider: "gmail",
      providerMessageId: reminderDelivery.providerMessageId,
    },
    "Recommendation reminder sent",
  );

  const { data: updatedData, error: updateError } = await adminSupabase
    .from("recommendation_requests")
    .update({
      status: rec.status === "invited" ? "sent" : rec.status,
      invite_sent_at: rec.invite_sent_at ?? nowIso,
      reminder_count: rec.reminder_count + 1,
      last_reminder_at: nowIso,
    })
    .eq("id", rec.id)
    .select("*")
    .single();

  if (updateError || !updatedData) {
    throw new AppError({
      message: "Failed updating reminder metadata",
      userMessage: "Se envió el recordatorio, pero no se pudo actualizar su estado.",
      status: 500,
      details: updateError,
    });
  }

  return asSummary(updatedData as RecommendationRow);
}

export async function listAdminRecommendations({
  applicationId,
}: {
  applicationId: string;
}) {
  const adminSupabase = getSupabaseAdminClient();
  const { data, error } = await adminSupabase
    .from("recommendation_requests")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError({
      message: "Failed loading admin recommendation list",
      userMessage: "No se pudieron cargar las recomendaciones.",
      status: 500,
      details: error,
    });
  }

  return ((data as RecommendationRow[] | null) ?? []).map(asSummary);
}

export async function updateRecommendationByAdmin({
  recommendationId,
  actorId,
  updates,
}: {
  recommendationId: string;
  actorId: string;
  updates: {
    recommenderName?: string | null;
    recommenderEmail?: string;
    adminNotes?: string | null;
  };
}) {
  const adminSupabase = getSupabaseAdminClient();
  const { data: row, error } = await adminSupabase
    .from("recommendation_requests")
    .select("*")
    .eq("id", recommendationId)
    .maybeSingle();

  if (error || !row) {
    throw new AppError({
      message: "Recommendation not found for admin update",
      userMessage: "No se encontró la recomendación.",
      status: 404,
      details: error,
    });
  }

  const recommendation = row as RecommendationRow;

  const nextEmail = updates.recommenderEmail
    ? normalizeEmail(updates.recommenderEmail)
    : recommendation.recommender_email;
  const nextName =
    typeof updates.recommenderName === "string"
      ? updates.recommenderName.trim() || null
      : recommendation.recommender_name;
  const nextAdminNotes =
    typeof updates.adminNotes === "string"
      ? updates.adminNotes.trim() || null
      : recommendation.admin_notes;

  const { data: updatedData, error: updateError } = await adminSupabase
    .from("recommendation_requests")
    .update({
      recommender_name: nextName,
      recommender_email: nextEmail,
      admin_notes: nextAdminNotes,
    })
    .eq("id", recommendationId)
    .select("*")
    .single();

  if (updateError || !updatedData) {
    throw new AppError({
      message: "Failed updating recommendation by admin",
      userMessage: "No se pudo actualizar la recomendación.",
      status: 500,
      details: updateError,
    });
  }

  return {
    recommendation: asSummary(updatedData as RecommendationRow),
    previous: {
      recommenderName: recommendation.recommender_name,
      recommenderEmail: recommendation.recommender_email,
      adminNotes: recommendation.admin_notes,
    },
    actorId,
  };
}

export async function markRecommendationReceivedByAdmin({
  recommendationId,
  actorId,
  reason,
  recommenderName,
  file,
}: {
  recommendationId: string;
  actorId: string;
  reason: string;
  recommenderName?: string | null;
  file?: {
    path: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
}) {
  const adminSupabase = getSupabaseAdminClient();
  const { data: row, error } = await adminSupabase
    .from("recommendation_requests")
    .select("*")
    .eq("id", recommendationId)
    .maybeSingle();

  if (error || !row) {
    throw new AppError({
      message: "Recommendation not found for manual receipt",
      userMessage: "No se encontró la recomendación.",
      status: 404,
      details: error,
    });
  }

  const recommendation = row as RecommendationRow;

  if (recommendation.invalidated_at || recommendation.status === "invalidated") {
    throw new AppError({
      message: "Invalidated recommendation cannot be manually received",
      userMessage: "No puedes registrar manualmente una recomendación invalidada.",
      status: 422,
    });
  }

  const nowIso = new Date().toISOString();
  const nextFile =
    file
      ? ({
          path: file.path,
          original_name: file.originalName,
          mime_type: file.mimeType,
          size_bytes: file.sizeBytes,
          uploaded_at: nowIso,
        } satisfies Record<string, unknown>)
      : recommendation.admin_received_file;

  const mergedResponses =
    recommendation.responses &&
    typeof recommendation.responses === "object" &&
    !Array.isArray(recommendation.responses)
      ? { ...(recommendation.responses as Record<string, unknown>), manual_received: true }
      : { manual_received: true };

  const { data: updatedData, error: updateError } = await adminSupabase
    .from("recommendation_requests")
    .update({
      recommender_name:
        typeof recommenderName === "string"
          ? recommenderName.trim() || recommendation.recommender_name
          : recommendation.recommender_name,
      status: "submitted",
      submitted_at: recommendation.submitted_at ?? nowIso,
      admin_received_at: nowIso,
      admin_received_by: actorId,
      admin_received_reason: reason.trim(),
      admin_received_file: nextFile ?? {},
      responses: mergedResponses,
      session_token_hash: null,
      session_expires_at: null,
    })
    .eq("id", recommendationId)
    .select("*")
    .single();

  if (updateError || !updatedData) {
    throw new AppError({
      message: "Failed marking recommendation as manually received",
      userMessage: "No se pudo registrar la recomendación recibida.",
      status: 500,
      details: updateError,
    });
  }

  return asSummary(updatedData as RecommendationRow);
}

function maskEmail(email: string) {
  const [localPart, domain = ""] = email.split("@");
  if (!localPart) {
    return email;
  }

  const safeLocal =
    localPart.length <= 2
      ? `${localPart.charAt(0)}*`
      : `${localPart.slice(0, 2)}${"*".repeat(Math.max(2, localPart.length - 2))}`;

  return `${safeLocal}@${domain}`;
}

async function getRecommendationByToken(token: string) {
  const adminSupabase = getSupabaseAdminClient();
  const { data, error } = await adminSupabase
    .from("recommendation_requests")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    throw new AppError({
      message: "Recommendation token not found",
      userMessage: "El enlace de recomendación no es válido o ya no existe.",
      status: 404,
      details: error,
    });
  }

  const row = data as RecommendationRow;
  if (row.status === "invalidated" || row.invalidated_at) {
    throw new AppError({
      message: "Recommendation token invalidated",
      userMessage: "Este enlace fue invalidado. Solicita un nuevo enlace al postulante.",
      status: 410,
    });
  }

  if (isPast(row.access_expires_at)) {
    await adminSupabase
      .from("recommendation_requests")
      .update({ status: "expired" })
      .eq("id", row.id);

    throw new AppError({
      message: "Recommendation token expired",
      userMessage: "Este enlace ya venció. Solicita al postulante que te reenvíe uno nuevo.",
      status: 410,
    });
  }

  return row;
}

export async function getPublicRecommendationInfo(token: string) {
  const row = await getRecommendationByToken(token);
  return {
    id: row.id,
    role: row.role,
    maskedEmail: maskEmail(row.recommender_email),
    status: row.status,
    submittedAt: row.submitted_at,
    accessExpiresAt: row.access_expires_at,
  };
}

export async function requestRecommendationOtp(token: string) {
  const row = await getRecommendationByToken(token);

  if (row.status === "submitted" || row.submitted_at) {
    throw new AppError({
      message: "Recommendation already submitted",
      userMessage: "Este formulario ya fue enviado y no puede editarse.",
      status: 410,
    });
  }

  const code = generateOtpCode();
  const now = Date.now();
  const adminSupabase = getSupabaseAdminClient();

  const otpDelivery = await sendRawEmail({
    to: row.recommender_email,
    subject: "UWC Perú · Código OTP para recomendación",
    text: buildOtpEmailText({ role: row.role, code }),
  });
  logger.info(
    {
      recommendationId: row.id,
      role: row.role,
      email: row.recommender_email,
      provider: "gmail",
      providerMessageId: otpDelivery.providerMessageId,
    },
    "Recommendation OTP sent",
  );

  const { error: updateError } = await adminSupabase
    .from("recommendation_requests")
    .update({
      otp_code_hash: hashValue(`${row.id}:${code}`),
      otp_sent_at: toIso(now),
      otp_attempt_count: 0,
      status: row.status === "invited" || row.status === "sent" ? "opened" : row.status,
      opened_at: row.opened_at ?? toIso(now),
    })
    .eq("id", row.id);

  if (updateError) {
    throw new AppError({
      message: "Failed saving OTP metadata",
      userMessage: "No se pudo registrar la verificación OTP. Intenta nuevamente.",
      status: 500,
      details: updateError,
    });
  }

  return {
    maskedEmail: maskEmail(row.recommender_email),
    expiresInMinutes: 15,
  };
}

export async function verifyRecommendationOtp({
  token,
  otpCode,
}: {
  token: string;
  otpCode: string;
}) {
  const row = await getRecommendationByToken(token);
  const adminSupabase = getSupabaseAdminClient();

  if (!row.otp_code_hash || !row.otp_sent_at) {
    throw new AppError({
      message: "OTP not requested before verify",
      userMessage: "Primero solicita un código OTP.",
      status: 400,
    });
  }

  if (row.otp_attempt_count >= 5) {
    throw new AppError({
      message: "OTP attempt limit reached",
      userMessage: "Demasiados intentos OTP. Solicita un nuevo código.",
      status: 429,
    });
  }

  if (Date.parse(row.otp_sent_at) + OTP_TTL_MS < Date.now()) {
    throw new AppError({
      message: "OTP code expired",
      userMessage: "El código OTP venció. Solicita uno nuevo.",
      status: 401,
    });
  }

  const expected = row.otp_code_hash;
  const actual = hashValue(`${row.id}:${otpCode.trim()}`);

  if (expected !== actual) {
    await adminSupabase
      .from("recommendation_requests")
      .update({ otp_attempt_count: row.otp_attempt_count + 1 })
      .eq("id", row.id);

    throw new AppError({
      message: "OTP mismatch",
      userMessage: "El código OTP es incorrecto.",
      status: 401,
    });
  }

  const sessionToken = generateSessionToken();
  const now = Date.now();
  const { data: updatedData, error: updateError } = await adminSupabase
    .from("recommendation_requests")
    .update({
      otp_verified_at: toIso(now),
      session_token_hash: hashValue(`${row.id}:${sessionToken}`),
      session_expires_at: toIso(now + SESSION_TTL_MS),
      started_at: row.started_at ?? toIso(now),
      status: row.status === "submitted" ? row.status : "in_progress",
    })
    .eq("id", row.id)
    .select("*")
    .single();

  if (updateError || !updatedData) {
    throw new AppError({
      message: "Failed creating recommendation session",
      userMessage: "No se pudo iniciar tu sesión de recomendación. Intenta nuevamente.",
      status: 500,
      details: updateError,
    });
  }

  const updated = updatedData as RecommendationRow;

  return {
    sessionToken,
    recommendation: {
      id: updated.id,
      role: updated.role,
      status: updated.status,
      responses: (updated.responses as Record<string, unknown> | null) ?? {},
      submittedAt: updated.submitted_at,
      maskedEmail: maskEmail(updated.recommender_email),
    },
  };
}

async function assertRecommendationSession({
  token,
  sessionToken,
}: {
  token: string;
  sessionToken: string;
}) {
  const row = await getRecommendationByToken(token);

  if (!row.session_token_hash || !row.session_expires_at) {
    throw new AppError({
      message: "Recommendation session missing",
      userMessage: "Tu sesión expiró. Vuelve a verificar tu OTP.",
      status: 401,
    });
  }

  if (Date.parse(row.session_expires_at) < Date.now()) {
    throw new AppError({
      message: "Recommendation session expired",
      userMessage: "Tu sesión expiró. Solicita un nuevo OTP para continuar.",
      status: 401,
    });
  }

  if (hashValue(`${row.id}:${sessionToken}`) !== row.session_token_hash) {
    throw new AppError({
      message: "Recommendation session token mismatch",
      userMessage: "Tu sesión no es válida. Solicita un nuevo OTP para continuar.",
      status: 401,
    });
  }

  return row;
}

export function validateRecommendationPayload({
  role,
  payload,
}: {
  role: RecommenderRole;
  payload: Record<string, unknown>;
}) {
  const recommenderName = String(payload.recommenderName ?? "").trim();
  const relationshipTitle = String(payload.relationshipTitle ?? "").trim();
  const knownDuration = String(payload.knownDuration ?? "").trim();
  const strengths = String(payload.strengths ?? "").trim();
  const growthAreas = String(payload.growthAreas ?? "").trim();
  const endorsement = String(payload.endorsement ?? "").trim();
  const confirmsNoFamily = Boolean(payload.confirmsNoFamily);

  const errors: Record<string, string> = {};
  if (recommenderName.length < 3) {
    errors.recommenderName = "Ingresa tu nombre completo.";
  }
  if (relationshipTitle.length < 3) {
    errors.relationshipTitle = "Describe tu rol o vínculo con el postulante.";
  }
  if (knownDuration.length < 2) {
    errors.knownDuration = "Indica hace cuánto conoces al postulante.";
  }
  if (strengths.length < 25) {
    errors.strengths = "Describe al menos una fortaleza en más detalle.";
  }
  if (growthAreas.length < 25) {
    errors.growthAreas = "Describe áreas de mejora con más detalle.";
  }
  if (endorsement.length < 25) {
    errors.endorsement = "Incluye una recomendación final más completa.";
  }
  if (role === "friend" && !confirmsNoFamily) {
    errors.confirmsNoFamily =
      "Debes confirmar que no tienes relación familiar con el postulante.";
  }

  const normalized: RecommenderFormPayload = {
    recommenderName,
    relationshipTitle,
    knownDuration,
    strengths,
    growthAreas,
    endorsement,
    confirmsNoFamily,
  };

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized,
  };
}

export async function saveRecommendationDraft({
  token,
  sessionToken,
  payload,
}: {
  token: string;
  sessionToken: string;
  payload: Record<string, unknown>;
}) {
  const row = await assertRecommendationSession({
    token,
    sessionToken,
  });

  if (row.status === "submitted" || row.submitted_at) {
    throw new AppError({
      message: "Recommendation already submitted, draft update blocked",
      userMessage: "Este formulario ya fue enviado y no se puede editar.",
      status: 422,
    });
  }

  const validation = validateRecommendationPayload({
    role: row.role,
    payload,
  });
  const adminSupabase = getSupabaseAdminClient();

  const { data, error } = await adminSupabase
    .from("recommendation_requests")
    .update({
      responses: validation.normalized,
      status: "in_progress",
      started_at: row.started_at ?? new Date().toISOString(),
    })
    .eq("id", row.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError({
      message: "Failed saving recommendation draft",
      userMessage: "No se pudo guardar tu borrador. Intenta nuevamente.",
      status: 500,
      details: error,
    });
  }

  return {
    recommendation: data as RecommendationRow,
    validationErrors: validation.errors,
  };
}

export async function submitRecommendation({
  token,
  sessionToken,
  payload,
}: {
  token: string;
  sessionToken: string;
  payload: Record<string, unknown>;
}) {
  const row = await assertRecommendationSession({
    token,
    sessionToken,
  });

  if (row.status === "submitted" || row.submitted_at) {
    throw new AppError({
      message: "Recommendation already submitted",
      userMessage: "Este formulario ya fue enviado.",
      status: 422,
    });
  }

  const validation = validateRecommendationPayload({
    role: row.role,
    payload,
  });
  if (!validation.isValid) {
    const firstMessage = Object.values(validation.errors)[0] ?? "Hay campos incompletos.";
    throw new AppError({
      message: "Recommendation payload invalid",
      userMessage: firstMessage,
      status: 422,
      details: validation.errors,
    });
  }

  const adminSupabase = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await adminSupabase
    .from("recommendation_requests")
    .update({
      responses: validation.normalized,
      status: "submitted",
      submitted_at: nowIso,
      started_at: row.started_at ?? nowIso,
      session_token_hash: null,
      session_expires_at: null,
    })
    .eq("id", row.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError({
      message: "Failed submitting recommendation form",
      userMessage: "No se pudo enviar la recomendación. Intenta nuevamente.",
      status: 500,
      details: error,
    });
  }

  return data as RecommendationRow;
}

export async function getRecommendationSessionSnapshot({
  token,
  sessionToken,
}: {
  token: string;
  sessionToken: string;
}) {
  const row = await assertRecommendationSession({
    token,
    sessionToken,
  });

  return {
    id: row.id,
    role: row.role,
    status: row.status,
    submittedAt: row.submitted_at,
    responses: (row.responses as Record<string, unknown> | null) ?? {},
  };
}
