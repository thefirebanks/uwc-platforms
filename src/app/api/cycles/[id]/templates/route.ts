import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { recordAuditEvent } from "@/lib/logging/audit";
import { ensureCycleExists } from "@/lib/server/cycles-service";
import {
  listCycleTemplates,
  updateCycleTemplates,
  createCycleTemplate,
} from "@/lib/server/template-service";

const cycleIdSchema = z.string().uuid();

const patchTemplatesSchema = z.object({
  templates: z
    .array(
      z.object({
        id: z.string().uuid(),
        stageLabel: z.string().min(3).max(120),
        milestoneLabel: z.string().min(3).max(180),
        dueAt: z.string().datetime().nullable().optional(),
        sortOrder: z.number().int().min(0).max(99).optional(),
      }),
    )
    .min(1),
});

const createTemplateSchema = z
  .object({
    stageLabel: z.string().min(3).max(120).optional(),
    milestoneLabel: z.string().min(3).max(180).optional(),
  })
  .optional();

function parseCycleId(rawId: string) {
  const result = cycleIdSchema.safeParse(rawId);
  if (!result.success) {
    throw new AppError({
      message: "Invalid cycle id",
      userMessage: "El proceso seleccionado no es válido.",
      status: 400,
    });
  }
  return result.data;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { supabase } = await requireAuth(["admin", "applicant"]);
    const cycleId = parseCycleId((await context.params).id);
    await ensureCycleExists(supabase, cycleId);

    const templates = await listCycleTemplates(supabase, cycleId);
    return NextResponse.json({ templates });
  }, { operation: "cycles.templates.list" });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const cycleId = parseCycleId((await context.params).id);
    const body = await request.json();
    const parsed = patchTemplatesSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid cycle templates patch payload",
        userMessage: "No se pudieron guardar las plantillas de etapa.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    await ensureCycleExists(supabase, cycleId);
    const templates = await updateCycleTemplates(
      supabase,
      cycleId,
      parsed.data.templates,
    );

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: "cycle.templates_updated",
      metadata: { cycleId, updatedCount: templates.length },
      requestId,
    });

    return NextResponse.json({ templates });
  }, { operation: "cycles.templates.update" });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const cycleId = parseCycleId((await context.params).id);
    await ensureCycleExists(supabase, cycleId);

    const body = request.headers.get("content-length")
      ? await request.json().catch(() => ({}))
      : {};
    const parsedBody = createTemplateSchema.safeParse(body);

    if (!parsedBody.success) {
      throw new AppError({
        message: "Invalid cycle template create payload",
        userMessage: "No se pudo crear la nueva etapa.",
        status: 400,
        details: parsedBody.error.flatten(),
      });
    }

    const template = await createCycleTemplate(
      supabase,
      cycleId,
      parsedBody.data ?? undefined,
    );

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: "cycle.template_created",
      metadata: {
        cycleId,
        templateId: template.id,
        stageCode: template.stage_code,
      },
      requestId,
    });

    return NextResponse.json({ template }, { status: 201 });
  }, { operation: "cycles.templates.create" });
}
