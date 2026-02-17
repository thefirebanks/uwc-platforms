import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";

export async function GET() {
  return withErrorHandling(async () => {
    const { profile } = await requireAuth();
    return NextResponse.json({
      id: profile.id,
      email: profile.email,
      role: profile.role,
      fullName: profile.full_name,
    });
  });
}
