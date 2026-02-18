import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import {
  COMMUNICATION_STATUSES,
  listCommunicationLogs,
} from "@/lib/server/communications-service";

const querySchema = z.object({
  cycleId: z.string().uuid().optional(),
  status: z.enum(COMMUNICATION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const parsed = querySchema.safeParse({
        cycleId: request.nextUrl.searchParams.get("cycleId") ?? undefined,
        status: request.nextUrl.searchParams.get("status") ?? undefined,
        limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      });

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid communications query",
          userMessage: "Los filtros de comunicaciones no son válidos.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const result = await listCommunicationLogs({
        supabase,
        filters: parsed.data,
      });

      return NextResponse.json(result);
    },
    { operation: "communications.list" },
  );
}
