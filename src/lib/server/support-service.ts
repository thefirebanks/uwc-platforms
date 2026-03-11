import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/supabase";
import type { SupportTicketStatus } from "@/types/domain";

type SupportTicketRow = Database["public"]["Tables"]["support_tickets"]["Row"];

const MAX_OPEN_TICKETS = 3;
const THREAD_SEPARATOR = "\n\n---\n\n";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type CreateTicketInput = {
  applicationId: string;
  applicantId: string;
  subject: string;
  body: string;
};

export type AdminTicketRow = SupportTicketRow & {
  applicant_name: string | null;
  applicant_email: string | null;
};

type ThreadAppendInput = {
  existingText: string | null;
  existingAt: string | null;
  existingAuthorLabel: string;
  newMessage: string;
  newAuthorLabel: string;
  newAt: string;
};

function formatThreadEntry({
  authoredAt,
  authorLabel,
  message,
}: {
  authoredAt: string;
  authorLabel: string;
  message: string;
}) {
  return `[${authoredAt}] ${authorLabel}\n${message.trim()}`;
}

function appendThreadMessage({
  existingText,
  existingAt,
  existingAuthorLabel,
  newMessage,
  newAuthorLabel,
  newAt,
}: ThreadAppendInput) {
  const trimmedExisting = existingText?.trim() ?? "";
  if (!trimmedExisting) {
    return formatThreadEntry({
      authoredAt: newAt,
      authorLabel: newAuthorLabel,
      message: newMessage,
    });
  }

  const structuredLooksLikeThread =
    /^\[[^\]]+\]\s.+\n[\s\S]+$/.test(trimmedExisting) ||
    trimmedExisting.includes(`${THREAD_SEPARATOR}[`);

  if (structuredLooksLikeThread) {
    return `${trimmedExisting}${THREAD_SEPARATOR}${formatThreadEntry({
      authoredAt: newAt,
      authorLabel: newAuthorLabel,
      message: newMessage,
    })}`;
  }

  return `${formatThreadEntry({
    authoredAt: existingAt ?? newAt,
    authorLabel: existingAuthorLabel,
    message: trimmedExisting,
  })}${THREAD_SEPARATOR}${formatThreadEntry({
    authoredAt: newAt,
    authorLabel: newAuthorLabel,
    message: newMessage,
  })}`;
}

/* -------------------------------------------------------------------------- */
/*  Create ticket                                                             */
/* -------------------------------------------------------------------------- */

export async function createSupportTicket({
  supabase,
  input,
}: {
  supabase: SupabaseClient<Database>;
  input: CreateTicketInput;
}): Promise<SupportTicketRow> {
  /* Verify applicant owns the application */
  const { data: app, error: appError } = await supabase
    .from("applications")
    .select("id, applicant_id")
    .eq("id", input.applicationId)
    .eq("applicant_id", input.applicantId)
    .maybeSingle();

  if (appError || !app) {
    throw new AppError({
      message: "Application not found or does not belong to applicant",
      userMessage: "No se encontró la postulación.",
      status: 403,
      details: appError,
    });
  }

  /* Enforce max open ticket limit */
  const { count, error: countError } = await supabase
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("applicant_id", input.applicantId)
    .eq("status", "open");

  if (countError) {
    throw new AppError({
      message: "Failed checking open ticket count",
      userMessage: "No se pudo verificar tus consultas activas.",
      status: 500,
      details: countError,
    });
  }

  if ((count ?? 0) >= MAX_OPEN_TICKETS) {
    throw new AppError({
      message: "Max open tickets reached",
      userMessage: `Tienes el máximo de ${MAX_OPEN_TICKETS} consultas abiertas. Espera una respuesta antes de crear otra.`,
      status: 422,
    });
  }

  /* Insert ticket */
  const { data: ticket, error: insertError } = await supabase
    .from("support_tickets")
    .insert({
      application_id: input.applicationId,
      applicant_id: input.applicantId,
      subject: input.subject,
      body: input.body,
    })
    .select("*")
    .single();

  if (insertError || !ticket) {
    throw new AppError({
      message: "Failed creating support ticket",
      userMessage: "No se pudo crear la consulta. Intenta de nuevo.",
      status: 500,
      details: insertError,
    });
  }

  return ticket as SupportTicketRow;
}

/* -------------------------------------------------------------------------- */
/*  List tickets                                                              */
/* -------------------------------------------------------------------------- */

export async function listApplicantTickets({
  supabase,
  applicantId,
}: {
  supabase: SupabaseClient<Database>;
  applicantId: string;
}): Promise<SupportTicketRow[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("applicant_id", applicantId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError({
      message: "Failed loading applicant support tickets",
      userMessage: "No se pudo cargar tus consultas.",
      status: 500,
      details: error,
    });
  }

  return (data as SupportTicketRow[] | null) ?? [];
}

export async function listAdminTickets({
  supabase,
  status,
  limit = 100,
}: {
  supabase: SupabaseClient<Database>;
  status?: SupportTicketStatus;
  limit?: number;
}): Promise<AdminTicketRow[]> {
  let query = supabase
    .from("support_tickets")
    .select("*, applicant:profiles!applicant_id(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 500));

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError({
      message: "Failed loading admin support tickets",
      userMessage: "No se pudo cargar las consultas de soporte.",
      status: 500,
      details: error,
    });
  }

  return ((data as unknown[]) ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const applicant = r.applicant as { full_name?: string; email?: string } | null;
    return {
      ...(r as SupportTicketRow),
      applicant_name: applicant?.full_name ?? null,
      applicant_email: applicant?.email ?? null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Reply to ticket                                                           */
/* -------------------------------------------------------------------------- */

export async function replySupportTicket({
  supabase,
  ticketId,
  adminReply,
  repliedBy,
}: {
  supabase: SupabaseClient<Database>;
  ticketId: string;
  adminReply: string;
  repliedBy: string;
}): Promise<SupportTicketRow> {
  const repliedAt = new Date().toISOString();
  const { data: existingTicket, error: existingTicketError } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .single();
  const existingTicketRow = (existingTicket as SupportTicketRow | null) ?? null;

  if (existingTicketError || !existingTicketRow) {
    throw new AppError({
      message: "Support ticket not found for reply",
      userMessage: "No se encontró la consulta.",
      status: 404,
      details: existingTicketError,
    });
  }

  const adminThread = appendThreadMessage({
    existingText: existingTicketRow.admin_reply,
    existingAt: existingTicketRow.replied_at,
    existingAuthorLabel: "Equipo UWC",
    newMessage: adminReply,
    newAuthorLabel: "Equipo UWC",
    newAt: repliedAt,
  });

  const { data: ticket, error: updateError } = await supabase
    .from("support_tickets")
    .update({
      admin_reply: adminThread,
      replied_by: repliedBy,
      replied_at: repliedAt,
      status: "replied" as SupportTicketStatus,
    })
    .eq("id", ticketId)
    .select("*")
    .single();

  if (updateError || !ticket) {
    throw new AppError({
      message: "Failed updating support ticket reply",
      userMessage: "No se pudo guardar la respuesta.",
      status: 500,
      details: updateError,
    });
  }

  const updatedTicket = ticket as SupportTicketRow;

  /* Queue in-app notification (visible to applicant) via admin client */
  const adminSupabase = getSupabaseAdminClient();
  await adminSupabase.from("communication_logs").insert({
    application_id: updatedTicket.application_id,
    template_key: "support.reply",
    trigger_event: null,
    subject: `Respuesta a tu consulta: ${updatedTicket.subject}`,
    body: adminReply,
    automation_template_id: null,
    recipient_email: "",          // no email send for in-app only; comms processor will skip empty
    status: "queued" as const,
    sent_by: repliedBy,
    is_applicant_visible: true,
  });

  return updatedTicket;
}

/* -------------------------------------------------------------------------- */
/*  Applicant follow-up                                                       */
/* -------------------------------------------------------------------------- */

export async function followUpSupportTicket({
  supabase,
  ticketId,
  applicantId,
  message,
}: {
  supabase: SupabaseClient<Database>;
  ticketId: string;
  applicantId: string;
  message: string;
}): Promise<SupportTicketRow> {
  const { data: existingTicket, error: ticketError } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("applicant_id", applicantId)
    .single();
  const existingTicketRow = (existingTicket as SupportTicketRow | null) ?? null;

  if (ticketError || !existingTicketRow) {
    throw new AppError({
      message: "Support ticket not found for applicant follow-up",
      userMessage: "No se encontró la consulta.",
      status: 404,
      details: ticketError,
    });
  }

  if (existingTicketRow.status === "closed") {
    throw new AppError({
      message: "Cannot follow up on closed support ticket",
      userMessage: "La consulta está cerrada y no admite más mensajes.",
      status: 422,
    });
  }

  const now = new Date().toISOString();
  const bodyThread = appendThreadMessage({
    existingText: existingTicketRow.body,
    existingAt: existingTicketRow.created_at,
    existingAuthorLabel: "Postulante",
    newMessage: message,
    newAuthorLabel: "Postulante",
    newAt: now,
  });

  const adminSupabase = getSupabaseAdminClient();
  const { data: ticket, error: updateError } = await adminSupabase
    .from("support_tickets")
    .update({
      body: bodyThread,
      status: "open" as SupportTicketStatus,
    })
    .eq("id", ticketId)
    .eq("applicant_id", applicantId)
    .select("*")
    .single();

  if (updateError || !ticket) {
    throw new AppError({
      message: "Failed saving applicant support follow-up",
      userMessage: "No se pudo enviar tu seguimiento.",
      status: 500,
      details: updateError,
    });
  }

  return ticket as SupportTicketRow;
}

/* -------------------------------------------------------------------------- */
/*  Close ticket                                                              */
/* -------------------------------------------------------------------------- */

export async function closeSupportTicket({
  supabase,
  ticketId,
}: {
  supabase: SupabaseClient<Database>;
  ticketId: string;
}): Promise<SupportTicketRow> {
  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .update({ status: "closed" as SupportTicketStatus })
    .eq("id", ticketId)
    .select("*")
    .single();

  if (error || !ticket) {
    throw new AppError({
      message: "Failed closing support ticket",
      userMessage: "No se pudo cerrar la consulta.",
      status: 500,
      details: error,
    });
  }

  return ticket as SupportTicketRow;
}
