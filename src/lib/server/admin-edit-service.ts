import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import type { Database, Json } from "@/types/supabase";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];

export type AdminEditLogRow = {
  id: string;
  application_id: string;
  actor_id: string;
  edit_type: string;
  field_key: string | null;
  old_value: Json;
  new_value: Json;
  reason: string;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/*  Admin payload edit                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Update specific fields in an application's payload on behalf of an admin.
 * Records each field change in `admin_edit_log` for auditability.
 */
export async function adminUpdateApplicationPayload({
  supabase,
  applicationId,
  changes,
  reason,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  changes: Record<string, unknown>;
  reason: string;
  actorId: string;
}): Promise<ApplicationRow> {
  /* ---- Load current application ---- */
  const { data: application, error: loadError } = await supabase
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .single();

  if (loadError || !application) {
    throw new AppError({
      message: "Application not found for admin edit",
      userMessage: "No se encontró la postulación.",
      status: 404,
      details: loadError,
    });
  }

  const app = application as ApplicationRow;
  const currentPayload = (app.payload ?? {}) as Record<string, unknown>;
  const changeKeys = Object.keys(changes);

  if (changeKeys.length === 0) {
    throw new AppError({
      message: "No changes provided",
      userMessage: "No se proporcionaron cambios.",
      status: 400,
    });
  }

  /* ---- Record each field change in admin_edit_log ---- */
  const logEntries = changeKeys.map((key) => ({
    application_id: applicationId,
    actor_id: actorId,
    edit_type: "payload" as const,
    field_key: key,
    old_value: (currentPayload[key] ?? null) as Json,
    new_value: (changes[key] ?? null) as Json,
    reason,
  }));

  const { error: logError } = await supabase
    .from("admin_edit_log")
    .insert(logEntries);

  if (logError) {
    throw new AppError({
      message: "Failed to record admin edit log",
      userMessage: "No se pudo registrar el historial de cambios.",
      status: 500,
      details: logError,
    });
  }

  /* ---- Merge changes into payload and update ---- */
  const mergedPayload = { ...currentPayload, ...changes };

  const { data: updated, error: updateError } = await supabase
    .from("applications")
    .update({
      payload: mergedPayload as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new AppError({
      message: "Failed to update application payload",
      userMessage: "No se pudo guardar los cambios.",
      status: 500,
      details: updateError,
    });
  }

  return updated as ApplicationRow;
}

/* -------------------------------------------------------------------------- */
/*  Admin file upload                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Record an admin-uploaded file for an application.
 * The actual file upload to storage happens in the route handler;
 * this function updates the application's `files` JSONB and logs the change.
 */
export async function adminUploadFileForApplication({
  supabase,
  applicationId,
  fileKey,
  filePath,
  fileName,
  mimeType,
  sizeBytes,
  reason,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  fileKey: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  reason: string;
  actorId: string;
}): Promise<ApplicationRow> {
  /* ---- Load current application ---- */
  const { data: application, error: loadError } = await supabase
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .single();

  if (loadError || !application) {
    throw new AppError({
      message: "Application not found for file upload",
      userMessage: "No se encontró la postulación.",
      status: 404,
      details: loadError,
    });
  }

  const app = application as ApplicationRow;
  const currentFiles = (app.files ?? {}) as Record<string, unknown>;
  const oldEntry = currentFiles[fileKey] ?? null;
  const newEntry = {
    path: filePath,
    name: fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    uploaded_by: actorId,
    uploaded_at: new Date().toISOString(),
  };

  /* ---- Log the change ---- */
  const { error: logError } = await supabase.from("admin_edit_log").insert({
    application_id: applicationId,
    actor_id: actorId,
    edit_type: "files",
    field_key: fileKey,
    old_value: oldEntry as Json,
    new_value: newEntry as Json,
    reason,
  });

  if (logError) {
    throw new AppError({
      message: "Failed to record file upload log",
      userMessage: "No se pudo registrar el historial del archivo.",
      status: 500,
      details: logError,
    });
  }

  /* ---- Update application files ---- */
  const mergedFiles = { ...currentFiles, [fileKey]: newEntry };

  const { data: updated, error: updateError } = await supabase
    .from("applications")
    .update({
      files: mergedFiles as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new AppError({
      message: "Failed to update application files",
      userMessage: "No se pudo registrar el archivo subido.",
      status: 500,
      details: updateError,
    });
  }

  return updated as ApplicationRow;
}

/* -------------------------------------------------------------------------- */
/*  Admin edit history                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fetch the admin edit history for an application, newest first.
 */
export async function getAdminEditHistory({
  supabase,
  applicationId,
  limit = 50,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  limit?: number;
}): Promise<AdminEditLogRow[]> {
  const { data, error } = await supabase
    .from("admin_edit_log")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError({
      message: "Failed to fetch admin edit history",
      userMessage: "No se pudo cargar el historial de ediciones.",
      status: 500,
      details: error,
    });
  }

  return (data ?? []) as AdminEditLogRow[];
}
