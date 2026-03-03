import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import { demoteReviewer } from "@/lib/server/reviewer-service";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async () => {
      await requireAuth(["admin"]);
      const { id } = await params;
      await demoteReviewer(id);
      return NextResponse.json({ success: true });
    },
    { operation: "admin.reviewers.demote" },
  );
}
