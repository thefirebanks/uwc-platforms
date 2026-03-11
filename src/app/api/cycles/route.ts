import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { recordAuditEvent } from "@/lib/logging/audit";
import {
  listCyclesForAdmin,
  listCyclesForApplicant,
  createCycle,
} from "@/lib/server/cycles-service";

const createCycleSchema = z.object({
  name: z.string().min(4),
  year: z.number().int().min(2020).max(2100),
  isActive: z.boolean().optional().default(false),
  maxApplicationsPerUser: z.number().int().min(1).max(10).optional().default(3),
});

export async function GET() {
  return withErrorHandling(
    async () => {
      const { profile, supabase } = await requireAuth(["admin", "applicant"]);

      if (profile.role === "admin") {
        const result = await listCyclesForAdmin(supabase);
        return NextResponse.json(result);
      }

      const result = await listCyclesForApplicant(supabase, profile.id);
      return NextResponse.json(result);
    },
    { operation: "cycles.list" },
  );
}

export async function POST(request: NextRequest) {
  return withErrorHandling(
    async (requestId) => {
      const { profile, supabase } = await requireAuth(["admin"]);
      const body = await request.json();
      const parsed = createCycleSchema.safeParse(body);

      if (!parsed.success) {
        throw new AppError({
          message: "Invalid cycle payload",
          userMessage: "No se pudo crear el proceso de selección.",
          status: 400,
          details: parsed.error.flatten(),
        });
      }

      const { cycle, templatesCreated } = await createCycle(supabase, {
        name: parsed.data.name,
        year: parsed.data.year,
        isActive: parsed.data.isActive,
        maxApplicationsPerUser: parsed.data.maxApplicationsPerUser,
      });

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        action: "cycle.created",
        metadata: {
          cycleId: cycle.id,
          name: cycle.name,
          year: parsed.data.year,
          isActive: parsed.data.isActive,
          templatesCreated,
          fieldsCreated: 7,
          automationsCreated: 2,
        },
        requestId,
      });

      return NextResponse.json({ cycle });
    },
    { operation: "cycles.create" },
  );
}
