import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { profile, supabase } = await requireAuth(["applicant"]);
      const applicationId = request.nextUrl.searchParams.get("applicationId");

      // Build base query: applicant-visible comms for this applicant's applications
      let query = supabase
        .from("communication_logs")
        .select("*")
        .eq("is_applicant_visible", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (applicationId) {
        // Verify the applicant owns this application
        const { data: app, error: appError } = await supabase
          .from("applications")
          .select("id")
          .eq("id", applicationId)
          .eq("applicant_id", profile.id)
          .maybeSingle();

        if (appError || !app) {
          throw new AppError({
            message: "Application not found or does not belong to applicant",
            userMessage: "No se encontró la postulación.",
            status: 403,
            details: appError,
          });
        }

        query = query.eq("application_id", applicationId);
      } else {
        // Get all application IDs belonging to this applicant
        const { data: apps, error: appsError } = await supabase
          .from("applications")
          .select("id")
          .eq("applicant_id", profile.id);

        if (appsError) {
          throw new AppError({
            message: "Failed loading applicant applications",
            userMessage: "No se pudo cargar tus notificaciones.",
            status: 500,
            details: appsError,
          });
        }

        const ids = (apps ?? []).map((a) => a.id);
        if (ids.length === 0) {
          return NextResponse.json({ communications: [] });
        }

        query = query.in("application_id", ids);
      }

      const { data, error } = await query;

      if (error) {
        throw new AppError({
          message: "Failed loading applicant communications",
          userMessage: "No se pudo cargar tus notificaciones.",
          status: 500,
          details: error,
        });
      }

      return NextResponse.json({ communications: data ?? [] });
    },
    { operation: "applicant.communications.list" },
  );
}
