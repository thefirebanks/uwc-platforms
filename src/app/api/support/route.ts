import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import {
  createSupportTicket,
  listAdminTickets,
  listApplicantTickets,
} from "@/lib/server/support-service";

const createSchema = z.object({
  applicationId: z.string().uuid(),
  subject: z.string().min(5, "El asunto debe tener al menos 5 caracteres.").max(200),
  body: z.string().min(10, "La consulta debe tener al menos 10 caracteres.").max(2000),
});

export async function GET(_request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { profile, supabase } = await requireAuth(["admin", "applicant"]);

      if (profile.role === "admin") {
        const statusParam = _request.nextUrl.searchParams.get("status");
        const status =
          statusParam === "open" || statusParam === "replied" || statusParam === "closed"
            ? statusParam
            : undefined;
        const tickets = await listAdminTickets({ supabase, status });
        return NextResponse.json({ tickets });
      }

      const tickets = await listApplicantTickets({ supabase, applicantId: profile.id });
      return NextResponse.json({ tickets });
    },
    { operation: "support.list" },
  );
}

export async function POST(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { profile, supabase } = await requireAuth(["applicant"]);
      const body = await request.json();
      const parsed = createSchema.safeParse(body);

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid support ticket payload",
          userMessage: "Los datos enviados no son válidos.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const ticket = await createSupportTicket({
        supabase,
        input: {
          applicationId: parsed.data.applicationId,
          applicantId: profile.id,
          subject: parsed.data.subject,
          body: parsed.data.body,
        },
      });

      return NextResponse.json({ ticket }, { status: 201 });
    },
    { operation: "support.create" },
  );
}
