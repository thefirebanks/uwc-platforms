import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import { getReviewerAssignments } from "@/lib/server/reviewer-service";

export async function GET() {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["reviewer"]);
      const assignments = await getReviewerAssignments(supabase);
      return NextResponse.json({ assignments });
    },
    { operation: "reviewer.assignments.list" },
  );
}
