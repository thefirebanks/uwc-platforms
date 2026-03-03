import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors/app-error";
import { recordAuditEvent } from "@/lib/logging/audit";
import { exchangeGoogleMailCode } from "@/lib/server/email-provider";
import { requireAuth } from "@/lib/server/auth";
import { withErrorHandling } from "@/lib/errors/with-error-handling";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildHtmlPage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: ui-sans-serif, system-ui, sans-serif; background: #f7f5ef; color: #1e2a2f; margin: 0; padding: 40px 20px; }
      main { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #d7d2c6; border-radius: 16px; padding: 24px; box-shadow: 0 12px 32px rgba(17, 24, 39, 0.08); }
      h1 { margin-top: 0; font-size: 28px; }
      p { line-height: 1.6; }
      pre { white-space: pre-wrap; word-break: break-word; background: #f3f0e8; border-radius: 12px; padding: 16px; border: 1px solid #e3ddd0; }
      a { color: #0a5f80; }
    </style>
  </head>
  <body>
    <main>
      ${body}
    </main>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const code = request.nextUrl.searchParams.get("code");
    const oauthError = request.nextUrl.searchParams.get("error");

    if (oauthError) {
      throw new AppError({
        message: "Google OAuth returned an error",
        userMessage: "Google no autorizó la conexión del correo.",
        status: 400,
        details: {
          error: oauthError,
          errorDescription: request.nextUrl.searchParams.get("error_description"),
        },
      });
    }

    if (!code) {
      throw new AppError({
        message: "Missing Google OAuth code",
        userMessage: "Google no devolvió el código necesario para conectar Gmail.",
        status: 400,
      });
    }

    const exchanged = await exchangeGoogleMailCode({
      code,
      origin: request.nextUrl.origin,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: null,
      action: "google_mail.connected",
      metadata: {
        senderEmail: exchanged.senderEmail,
        hasRefreshToken: Boolean(exchanged.refreshToken),
      },
      requestId,
    });

    if (!exchanged.refreshToken) {
      return new NextResponse(
        buildHtmlPage({
          title: "Gmail conectado sin refresh token",
          body: `
            <h1>Google devolvió acceso temporal, pero no refresh token</h1>
            <p>Esto suele pasar cuando la cuenta ya autorizó antes al mismo cliente OAuth. Revoca el acceso anterior o repite el flujo manteniendo <code>prompt=consent</code>.</p>
            <p>Vuelve a intentar desde <a href="/api/google-mail/connect">/api/google-mail/connect</a>.</p>
          `,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
          },
        },
      );
    }

    const envSnippet = [
      `GOOGLE_GMAIL_CLIENT_ID=${process.env.GOOGLE_GMAIL_CLIENT_ID ?? ""}`,
      "GOOGLE_GMAIL_CLIENT_SECRET=<paste-your-client-secret>",
      `GOOGLE_GMAIL_REFRESH_TOKEN=${exchanged.refreshToken}`,
      `GOOGLE_GMAIL_SENDER_EMAIL=${exchanged.senderEmail}`,
      `EMAIL_FROM_NAME=${process.env.EMAIL_FROM_NAME ?? "UWC Peru"}`,
    ].join("\n");

    return new NextResponse(
      buildHtmlPage({
        title: "Gmail conectado",
        body: `
          <h1>Gmail autorizado correctamente</h1>
          <p>Guarda estas variables en <code>.env.local</code> y en tu entorno desplegado. Después reinicia el servidor.</p>
          <pre>${escapeHtml(envSnippet)}</pre>
          <p>Si el cliente OAuth sigue en modo <strong>Testing</strong>, este refresh token puede dejar de servir después de 7 días. Para uso real, publica ese cliente en modo <strong>Production</strong>.</p>
          <p>Cuando termines, vuelve al panel y prueba <code>test-send</code> o un recordatorio de recomendación.</p>
        `,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Request-Id": requestId || randomUUID(),
        },
      },
    );
  }, { operation: "google_mail.callback" });
}
