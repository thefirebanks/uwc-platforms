import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEMO_PROFILES,
  seedDemoApplicant,
  ensureIdDocOcrConfig,
} from "@/lib/server/demo-seed-service";

/* -------------------------------------------------------------------------- */
/*  Guard: dev-only                                                            */
/* -------------------------------------------------------------------------- */

const deploymentEnvironment = (
  process.env.VERCEL_ENV ??
  process.env.NEXT_PUBLIC_VERCEL_ENV ??
  ""
).toLowerCase();
const isProductionDeployment = deploymentEnvironment === "production";
const devBypassEnabled =
  process.env.NEXT_PUBLIC_ENABLE_DEV_BYPASS === "true" && !isProductionDeployment;

/* -------------------------------------------------------------------------- */
/*  POST handler                                                              */
/* -------------------------------------------------------------------------- */

const requestSchema = z.object({
  profiles: z.array(z.enum(["demo1", "demo2", "demo3"])).optional(),
  updateOcrConfig: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  return withErrorHandling(async () => {
    if (!devBypassEnabled) {
      throw new AppError({
        message: "Demo seed disabled",
        userMessage: "El sembrado de demo está deshabilitado en este entorno.",
        status: 404,
      });
    }

    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = requestSchema.parse(body);

    const supabase = getSupabaseAdminClient();

    // Resolve which profiles to seed
    const profileKeys = parsed.profiles ?? ["demo1", "demo2", "demo3"];
    const profileIndexMap: Record<string, number> = { demo1: 0, demo2: 1, demo3: 2 };
    const profilesToSeed = profileKeys.map((key) => DEMO_PROFILES[profileIndexMap[key]]!);

    // Get admin actor ID (use demo admin or service role placeholder)
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .maybeSingle();
    const adminActorId = adminProfile?.id ?? null;

    // Optionally update OCR config for the ID document field
    let ocrConfigUpdated = false;
    if (parsed.updateOcrConfig) {
      ocrConfigUpdated = await ensureIdDocOcrConfig(supabase);
    }

    // Seed each demo applicant
    const results: Array<{ email: string; applicationId: string; expectedOutcome: string }> = [];
    for (const profile of profilesToSeed) {
      const result = await seedDemoApplicant(supabase, profile, adminActorId);
      results.push(result);
    }

    return NextResponse.json({
      success: true,
      seeded: results,
      ocrConfigUpdated,
      message: `Demo applications seeded. Run the rubric evaluation to verify outcomes: ${results.map((r) => `${r.email} → ${r.expectedOutcome}`).join(", ")}`,
    });
  }, { operation: "dev.demo.seed_applications" });
}
