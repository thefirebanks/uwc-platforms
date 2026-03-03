import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import type { Database, Json } from "@/types/supabase";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type ApplicationFileValue = string | Record<string, unknown> | null;

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

export type AdminEditableFileEntry = {
  key: string;
  path: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number | null;
  uploadedAt: string | null;
  category: string | null;
  notes: string | null;
};

function parseStoredFileEntry({
  key,
  value,
}: {
  key: string;
  value: ApplicationFileValue;
}): AdminEditableFileEntry | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return {
      key,
      path: value,
      title: key,
      originalName: value.split("/").pop() ?? value,
      mimeType: "",
      sizeBytes: null,
      uploadedAt: null,
      category: null,
      notes: null,
    };
  }

  const path = typeof value.path === "string" ? value.path : "";
  if (!path) {
    return null;
  }

  return {
    key,
    path,
    title: typeof value.title === "string" ? value.title : key,
    originalName:
      typeof value.original_name === "string"
        ? value.original_name
        : typeof value.name === "string"
          ? value.name
          : (path.split("/").pop() ?? path),
    mimeType: typeof value.mime_type === "string" ? value.mime_type : "",
    sizeBytes:
      typeof value.size_bytes === "number" && Number.isFinite(value.size_bytes)
        ? value.size_bytes
        : null,
    uploadedAt: typeof value.uploaded_at === "string" ? value.uploaded_at : null,
    category: typeof value.category === "string" ? value.category : null,
    notes: typeof value.notes === "string" ? value.notes : null,
  };
}

function serializeFileEntry(entry: AdminEditableFileEntry, uploadedBy?: string | null): Json {
  const record: Record<string, unknown> = {
    path: entry.path,
    title: entry.title,
    original_name: entry.originalName,
    mime_type: entry.mimeType,
    size_bytes: entry.sizeBytes ?? 0,
    uploaded_at: entry.uploadedAt ?? new Date().toISOString(),
    category: entry.category,
    notes: entry.notes,
    uploaded_by: uploadedBy ?? null,
  };

  return record as Json;
}

async function loadApplicationOrThrow({
  supabase,
  applicationId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
}) {
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

  return application as ApplicationRow;
}

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
  const app = await loadApplicationOrThrow({
    supabase,
    applicationId,
  });
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
  const app = await loadApplicationOrThrow({
    supabase,
    applicationId,
  });
  const currentFiles = (app.files ?? {}) as Record<string, unknown>;
  const oldEntry = currentFiles[fileKey] ?? null;
  const previousEntry = parseStoredFileEntry({
    key: fileKey,
    value: oldEntry as ApplicationFileValue,
  });
  const newEntry = {
    path: filePath,
    title: previousEntry?.title ?? fileName,
    original_name: fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    uploaded_by: actorId,
    uploaded_at: new Date().toISOString(),
    category: previousEntry?.category ?? fileKey,
    notes: previousEntry?.notes ?? null,
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

export async function listApplicationFilesForAdmin({
  supabase,
  applicationId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
}) {
  const application = await loadApplicationOrThrow({
    supabase,
    applicationId,
  });
  const files = (application.files ?? {}) as Record<string, ApplicationFileValue>;

  return Object.entries(files)
    .map(([key, value]) => parseStoredFileEntry({ key, value }))
    .filter((entry): entry is AdminEditableFileEntry => Boolean(entry));
}

export async function updateApplicationFileMetadata({
  supabase,
  applicationId,
  fileKey,
  updates,
  reason,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  fileKey: string;
  updates: {
    title?: string;
    category?: string | null;
    notes?: string | null;
  };
  reason: string;
  actorId: string;
}): Promise<ApplicationRow> {
  const application = await loadApplicationOrThrow({
    supabase,
    applicationId,
  });
  const currentFiles = (application.files ?? {}) as Record<string, ApplicationFileValue>;
  const current = parseStoredFileEntry({
    key: fileKey,
    value: currentFiles[fileKey] ?? null,
  });

  if (!current) {
    throw new AppError({
      message: "File entry not found for admin metadata update",
      userMessage: "No se encontró el archivo que intentas editar.",
      status: 404,
    });
  }

  const nextEntry: AdminEditableFileEntry = {
    ...current,
    title: updates.title?.trim() || current.title,
    category:
      typeof updates.category === "string"
        ? updates.category.trim() || null
        : current.category,
    notes:
      typeof updates.notes === "string"
        ? updates.notes.trim() || null
        : current.notes,
  };

  const { error: logError } = await supabase.from("admin_edit_log").insert({
    application_id: applicationId,
    actor_id: actorId,
    edit_type: "files",
    field_key: fileKey,
    old_value: serializeFileEntry(current) as Json,
    new_value: serializeFileEntry(nextEntry) as Json,
    reason,
  });

  if (logError) {
    throw new AppError({
      message: "Failed recording admin file metadata edit",
      userMessage: "No se pudo registrar el historial del archivo.",
      status: 500,
      details: logError,
    });
  }

  const mergedFiles = {
    ...currentFiles,
    [fileKey]: serializeFileEntry(nextEntry),
  };

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
      message: "Failed updating application file metadata",
      userMessage: "No se pudo actualizar la metadata del archivo.",
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
