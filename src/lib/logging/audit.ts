import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logging/logger";
import type { Json } from "@/types/supabase";

export async function recordAuditEvent({
  supabase,
  actorId,
  applicationId,
  action,
  metadata,
  requestId,
}: {
  supabase: SupabaseClient<Database>;
  actorId?: string | null;
  applicationId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
  requestId: string;
}) {
  const payload = {
    actor_id: actorId ?? null,
    application_id: applicationId ?? null,
    action,
    metadata: (metadata ?? {}) as Json,
    request_id: requestId,
  };

  const { error } = await supabase.from("audit_events").insert(payload);

  if (error) {
    logger.error({ error, payload, requestId }, "Failed to write audit event");
  }
}
