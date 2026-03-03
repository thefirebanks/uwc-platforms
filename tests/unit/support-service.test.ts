import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import {
  closeSupportTicket,
  createSupportTicket,
  replySupportTicket,
} from "@/lib/server/support-service";

// Hoisted mock — replySupportTicket calls getSupabaseAdminClient() internally
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: vi.fn(),
}));

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type ReplyTicketSupabase = Parameters<typeof replySupportTicket>[0]["supabase"];
type CloseTicketSupabase = Parameters<typeof closeSupportTicket>[0]["supabase"];
type AdminSupabase = ReturnType<typeof getSupabaseAdminClient>;

/* ------------------------------------------------------------------ */
/*  Mock factory helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Builds a lightweight Supabase client stub for createSupportTicket tests.
 *
 *  - applications table  → ownership check via maybeSingle()
 *  - support_tickets     → count check (thenable) + insert.single()
 */
function createTicketMock({
  applicationRow,
  openCount,
  insertedTicket,
  insertError = false,
}: {
  applicationRow: Record<string, unknown> | null;
  openCount: number;
  insertedTicket: Record<string, unknown> | null;
  insertError?: boolean;
}) {
  return {
    from(table: string) {
      const ctx = {
        mode: "select" as "select" | "insert" | "update",
        isCountQuery: false,
        payload: null as unknown,
        filters: {} as Record<string, unknown>,
      };

      const builder = {
        select(_col?: unknown, opts?: unknown) {
          const o = opts as Record<string, unknown> | undefined;
          if (o?.count) ctx.isCountQuery = true;
          return builder;
        },
        insert(p: unknown) {
          ctx.mode = "insert";
          ctx.payload = p;
          return builder;
        },
        update(p: unknown) {
          ctx.mode = "update";
          ctx.payload = p;
          return builder;
        },
        eq(col: string, val: unknown) {
          ctx.filters[col] = val;
          return builder;
        },
        order() {
          return builder;
        },

        async maybeSingle() {
          if (table === "applications") {
            return { data: applicationRow, error: null };
          }
          return { data: null, error: null };
        },

        async single() {
          if (table === "support_tickets" && ctx.mode === "insert") {
            if (insertError) return { data: null, error: { message: "insert error" } };
            return { data: insertedTicket, error: null };
          }
          return { data: null, error: null };
        },

        then(resolve: (v: unknown) => void) {
          if (ctx.isCountQuery && table === "support_tickets") {
            resolve({ count: openCount, error: null });
          } else {
            resolve({ error: null });
          }
        },
      };

      return builder;
    },
  };
}

/**
 * Builds a Supabase client stub for replySupportTicket / closeSupportTicket.
 * The ticket row returned from update().single() has the update payload merged in.
 */
function createUpdateTicketMock(baseTicket: Record<string, unknown>) {
  return {
    from() {
      const ctx = {
        payload: {} as Record<string, unknown>,
      };

      const builder = {
        select() {
          return builder;
        },
        update(p: Record<string, unknown>) {
          ctx.payload = p;
          return builder;
        },
        eq() {
          return builder;
        },
        async single() {
          const merged = { ...baseTicket, ...ctx.payload };
          return { data: merged, error: null };
        },
      };

      return builder;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                            */
/* ------------------------------------------------------------------ */

const BASE_TICKET = {
  id: "ticket-1",
  application_id: "app-1",
  applicant_id: "applicant-1",
  subject: "Tengo una duda",
  body: "¿Qué documentos debo subir?",
  status: "open",
  admin_reply: null,
  replied_by: null,
  replied_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const APP_ROW = { id: "app-1", applicant_id: "applicant-1" };

/* ------------------------------------------------------------------ */

afterEach(() => {
  vi.clearAllMocks();
});

/* ================================================================== */
describe("createSupportTicket", () => {
  it("creates a ticket when ownership and count limits pass", async () => {
    const supabase = createTicketMock({
      applicationRow: APP_ROW,
      openCount: 0,
      insertedTicket: BASE_TICKET,
    }) as unknown as Parameters<typeof createSupportTicket>[0]["supabase"];

    const result = await createSupportTicket({
      supabase,
      input: {
        applicationId: "app-1",
        applicantId: "applicant-1",
        subject: "Tengo una duda",
        body: "¿Qué documentos debo subir?",
      },
    });

    expect(result.id).toBe("ticket-1");
    expect(result.status).toBe("open");
    expect(result.subject).toBe("Tengo una duda");
  });

  it("throws AppError(403) when application does not belong to applicant", async () => {
    const supabase = createTicketMock({
      applicationRow: null,   // ownership check fails
      openCount: 0,
      insertedTicket: null,
    }) as unknown as Parameters<typeof createSupportTicket>[0]["supabase"];

    await expect(
      createSupportTicket({
        supabase,
        input: {
          applicationId: "app-x",
          applicantId: "applicant-1",
          subject: "Tengo una duda",
          body: "¿Qué documentos debo subir?",
        },
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof AppError && (err as AppError).status === 403,
    );
  });

  it("throws AppError(422) when applicant already has 3 open tickets", async () => {
    const supabase = createTicketMock({
      applicationRow: APP_ROW,
      openCount: 3,           // at the limit
      insertedTicket: null,
    }) as unknown as Parameters<typeof createSupportTicket>[0]["supabase"];

    await expect(
      createSupportTicket({
        supabase,
        input: {
          applicationId: "app-1",
          applicantId: "applicant-1",
          subject: "Cuarta consulta",
          body: "Intento abrir una cuarta consulta.",
        },
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof AppError && (err as AppError).status === 422,
    );
  });
});

/* ================================================================== */
describe("replySupportTicket", () => {
  it("updates ticket to replied status and queues applicant-visible notification", async () => {
    const supabase = createUpdateTicketMock(BASE_TICKET) as unknown as ReplyTicketSupabase;

    // Spy on the admin client insert
    const adminInsertMock = vi.fn().mockReturnValue({
      then(resolve: (v: unknown) => void) {
        resolve({ error: null });
      },
    });

    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from() {
        return { insert: adminInsertMock };
      },
    } as unknown as AdminSupabase);

    const result = await replySupportTicket({
      supabase,
      ticketId: "ticket-1",
      adminReply: "Debes subir tu DNI y partida de nacimiento.",
      repliedBy: "admin-1",
    });

    // Ticket status updated
    expect(result.status).toBe("replied");
    expect(result.admin_reply).toBe("Debes subir tu DNI y partida de nacimiento.");
    expect(result.replied_by).toBe("admin-1");

    // Communication log inserted with applicant-visible flag
    expect(adminInsertMock).toHaveBeenCalledOnce();
    expect(adminInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template_key: "support.reply",
        is_applicant_visible: true,
        application_id: BASE_TICKET.application_id,
        sent_by: "admin-1",
      }),
    );
  });
});

/* ================================================================== */
describe("closeSupportTicket", () => {
  it("sets ticket status to closed", async () => {
    const supabase = createUpdateTicketMock(BASE_TICKET) as unknown as CloseTicketSupabase;

    const result = await closeSupportTicket({
      supabase,
      ticketId: "ticket-1",
    });

    expect(result.status).toBe("closed");
    expect(result.id).toBe("ticket-1");
  });
});
