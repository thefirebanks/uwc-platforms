import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import { buildGoogleMailConnectUrl } from "@/lib/server/email-provider";

export async function GET(request: Request) {
  return withErrorHandling(async () => {
    const { profile } = await requireAuth(["admin"]);
    const origin = new URL(request.url).origin;
    const loginHint = process.env.GOOGLE_GMAIL_SENDER_EMAIL?.trim() || profile.email;
    const redirectUrl = buildGoogleMailConnectUrl({
      origin,
      loginHint,
    });

    return NextResponse.redirect(redirectUrl);
  }, { operation: "google_mail.connect" });
}
