import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { recordAuditEvent } from "@/lib/logging/audit";
import type { Database } from "@/types/supabase";
import { buildDefaultCycleStageTemplates } from "@/lib/stages/templates";

type CycleRow = Database["public"]["Tables"]["cycles"]["Row"];
type ApplicationCycleRow = Pick<Database["public"]["Tables"]["applications"]["Row"], "cycle_id">;

const createCycleSchema = z.object({
  name: z.string().min(4),
  year: z.number().int().min(2020).max(2100),
  isActive: z.boolean().optional().default(false),
  maxApplicationsPerUser: z.number().int().min(1).max(10).optional().default(3),
});

function defaultDatesForYear(year: number) {
  return {
    stage1OpenAt: new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString(),
    stage1CloseAt: new Date(Date.UTC(year, 4, 31, 23, 59, 59)).toISOString(),
    stage2OpenAt: new Date(Date.UTC(year, 5, 1, 0, 0, 0)).toISOString(),
    stage2CloseAt: new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString(),
  };
}

export async function GET() {
  return withErrorHandling(
    async () => {
      const { profile, supabase } = await requireAuth(["admin", "applicant"]);
      const { data: cyclesData, error: cyclesError } = await supabase
        .from("cycles")
        .select("*")
        .order("created_at", { ascending: false });

      if (cyclesError) {
        throw new AppError({
          message: "Failed loading cycles",
          userMessage: "No se pudieron cargar los procesos de selección.",
          status: 500,
          details: cyclesError,
        });
      }

      if (profile.role === "admin") {
        const { data: applicationsData, error: applicationsError } = await supabase
          .from("applications")
          .select("cycle_id");

        if (applicationsError) {
          throw new AppError({
            message: "Failed loading applications for cycles summary",
            userMessage: "No se pudieron cargar los procesos de selección.",
            status: 500,
            details: applicationsError,
          });
        }

        const cycles = (cyclesData as CycleRow[] | null) ?? [];
        const applications = (applicationsData as ApplicationCycleRow[] | null) ?? [];
        const cycleCounts = new Map<string, number>();
        for (const row of applications) {
          cycleCounts.set(row.cycle_id, (cycleCounts.get(row.cycle_id) ?? 0) + 1);
        }

        return NextResponse.json({
          cycles: cycles.map((cycle) => ({
            ...cycle,
            applicationCount: cycleCounts.get(cycle.id) ?? 0,
          })),
        });
      }

      const { data: myApplications, error: myApplicationsError } = await supabase
        .from("applications")
        .select("id, cycle_id, status, stage_code, updated_at")
        .eq("applicant_id", profile.id);

      if (myApplicationsError) {
        throw new AppError({
          message: "Failed loading applicant applications summary",
          userMessage: "No se pudieron cargar tus procesos de selección.",
          status: 500,
          details: myApplicationsError,
        });
      }

      return NextResponse.json({
        cycles: (cyclesData as CycleRow[] | null) ?? [],
        applications: myApplications ?? [],
      });
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

      const defaultDates = defaultDatesForYear(parsed.data.year);
      const { data: cycleData, error } = await supabase
        .from("cycles")
        .insert({
          name: parsed.data.name,
          is_active: false,
          stage1_open_at: defaultDates.stage1OpenAt,
          stage1_close_at: defaultDates.stage1CloseAt,
          stage2_open_at: defaultDates.stage2OpenAt,
          stage2_close_at: defaultDates.stage2CloseAt,
          max_applications_per_user: parsed.data.maxApplicationsPerUser,
        })
        .select("*")
        .single();
      const cycle = (cycleData as CycleRow | null) ?? null;

      if (error || !cycle) {
        throw new AppError({
          message: "Failed creating cycle",
          userMessage: "No se pudo crear el proceso de selección.",
          status: 500,
          details: error,
        });
      }

      const defaultTemplates = buildDefaultCycleStageTemplates({
        cycleId: cycle.id,
        stage1CloseAt: cycle.stage1_close_at,
        stage2CloseAt: cycle.stage2_close_at,
      });
      const { error: templatesError } = await supabase
        .from("cycle_stage_templates")
        .insert(defaultTemplates);

      if (templatesError) {
        throw new AppError({
          message: "Failed creating default stage templates",
          userMessage: "El proceso se creó sin plantilla de etapas. Intenta nuevamente.",
          status: 500,
          details: templatesError,
        });
      }

      if (parsed.data.isActive) {
        await supabase.from("cycles").update({ is_active: false }).neq("id", cycle.id);
        await supabase.from("cycles").update({ is_active: true }).eq("id", cycle.id);
      }

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        action: "cycle.created",
        metadata: {
          cycleId: cycle.id,
          name: cycle.name,
          year: parsed.data.year,
          isActive: parsed.data.isActive,
          templatesCreated: defaultTemplates.length,
        },
        requestId,
      });

      return NextResponse.json({ cycle });
    },
    { operation: "cycles.create" },
  );
}
