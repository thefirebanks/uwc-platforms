import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { searchApplications } from "@/lib/server/search-service";

const searchParamsSchema = z.object({
  cycleId: z.string().uuid().optional(),
  q: z.string().optional(),
  stageCode: z.string().optional(),
  status: z
    .enum(["draft", "submitted", "eligible", "ineligible", "advanced"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sortBy: z
    .enum(["updated_at", "created_at", "full_name"])
    .default("updated_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  return withErrorHandling(
    async (_requestId) => {
      const { supabase } = await requireAuth(["admin"]);

      const params = Object.fromEntries(request.nextUrl.searchParams);
      const parsed = searchParamsSchema.safeParse(params);

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid search parameters",
          userMessage: "Los parámetros de búsqueda no son válidos.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const result = await searchApplications({
        supabase,
        input: parsed.data,
      });

      return NextResponse.json(result);
    },
    { operation: "applications.search" },
  );
}
