import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const { id } = await context.params;

      const { data, error } = await supabase
        .from("application_stage_evaluations")
        .select("*")
        .eq("application_id", id)
        .order("evaluated_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({ evaluations: data ?? [] });
    },
    { operation: "applications.evaluation.get" },
  );
}
