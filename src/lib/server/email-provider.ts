import { Buffer } from "node:buffer";
import { AppError } from "@/lib/errors/app-error";

export type EmailDeliveryResult =
  | {
      delivered: true;
      providerMessageId: string;
    }
  | {
      delivered: false;
      errorMessage: string;
    };

const GOOGLE_GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

type GoogleMailConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  senderEmail: string;
  fromName: string;
  replyToEmail: string | null;
};

function getEmailFromName() {
  return (
    process.env.EMAIL_FROM_NAME?.trim() ||
    process.env.GOOGLE_GMAIL_FROM_NAME?.trim() ||
    "UWC Peru"
  );
}

function getReplyToEmail() {
  return process.env.EMAIL_REPLY_TO?.trim() || process.env.GOOGLE_GMAIL_REPLY_TO_EMAIL?.trim() || null;
}

function getGoogleMailConfig(): GoogleMailConfig | null {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_GMAIL_REFRESH_TOKEN?.trim();
  const senderEmail = process.env.GOOGLE_GMAIL_SENDER_EMAIL?.trim();

  if (!clientId || !clientSecret || !refreshToken || !senderEmail) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    senderEmail,
    fromName: getEmailFromName(),
    replyToEmail: getReplyToEmail(),
  };
}

export function getConfiguredEmailProvider() {
  if (getGoogleMailConfig()) {
    return "gmail" as const;
  }

  return null;
}

export function assertEmailProviderConfigured() {
  if (getConfiguredEmailProvider()) {
    return;
  }

  throw new AppError({
    message: "Missing configured email provider",
    userMessage:
      "Falta configurar el correo saliente del sistema. Define GOOGLE_GMAIL_CLIENT_ID, GOOGLE_GMAIL_CLIENT_SECRET, GOOGLE_GMAIL_REFRESH_TOKEN y GOOGLE_GMAIL_SENDER_EMAIL.",
    status: 400,
  });
}

export function isGoogleMailOauthReady() {
  return Boolean(
    process.env.GOOGLE_GMAIL_CLIENT_ID?.trim() &&
      process.env.GOOGLE_GMAIL_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_GMAIL_SENDER_EMAIL?.trim(),
  );
}

export function getGoogleMailRedirectUri(origin: string) {
  return process.env.GOOGLE_GMAIL_REDIRECT_URI?.trim() || `${origin}/auth/google-mail/callback`;
}

export function buildGoogleMailConnectUrl({
  origin,
  loginHint,
}: {
  origin: string;
  loginHint?: string | null;
}) {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID?.trim();
  if (!clientId) {
    throw new AppError({
      message: "Missing GOOGLE_GMAIL_CLIENT_ID",
      userMessage: "Falta configurar GOOGLE_GMAIL_CLIENT_ID para conectar Gmail.",
      status: 400,
    });
  }

  const redirectUri = getGoogleMailRedirectUri(origin);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_GMAIL_SEND_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  if (loginHint?.trim()) {
    url.searchParams.set("login_hint", loginHint.trim());
  }
  return url.toString();
}

export async function exchangeGoogleMailCode({
  code,
  origin,
}: {
  code: string;
  origin: string;
}) {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET?.trim();
  const senderEmail = process.env.GOOGLE_GMAIL_SENDER_EMAIL?.trim();

  if (!clientId || !clientSecret || !senderEmail) {
    throw new AppError({
      message: "Missing Gmail OAuth configuration",
      userMessage:
        "Falta configurar GOOGLE_GMAIL_CLIENT_ID, GOOGLE_GMAIL_CLIENT_SECRET o GOOGLE_GMAIL_SENDER_EMAIL.",
      status: 400,
    });
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleMailRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        expires_in?: number;
        refresh_token?: string;
        scope?: string;
        token_type?: string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!response.ok) {
    throw new AppError({
      message: "Failed exchanging Gmail OAuth code",
      userMessage: "Google no aceptó el código OAuth para Gmail.",
      status: 502,
      details: payload,
    });
  }

  return {
    senderEmail,
    refreshToken: payload?.refresh_token ?? null,
    accessToken: payload?.access_token ?? null,
    expiresIn: payload?.expires_in ?? null,
    scope: payload?.scope ?? null,
    tokenType: payload?.token_type ?? null,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildDefaultEmailHtml(text: string) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.5;">${escapeHtml(text).replaceAll("\n", "<br/>")}</div>`;
}

function encodeMimeHeader(value: string) {
  const bytes = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${bytes}?=`;
}

function buildMimeMessage({
  fromEmail,
  fromName,
  replyToEmail,
  to,
  subject,
  text,
  html,
}: {
  fromEmail: string;
  fromName: string;
  replyToEmail?: string | null;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const boundary = `uwc-boundary-${crypto.randomUUID()}`;
  const lines = [
    `From: ${encodeMimeHeader(fromName)} <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  if (replyToEmail) {
    lines.push(`Reply-To: ${replyToEmail}`);
  }

  lines.push(
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text, "utf8").toString("base64"),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
    `--${boundary}--`,
    "",
  );

  return Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function getGoogleAccessToken(config: GoogleMailConfig) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!response.ok || !payload?.access_token) {
    throw new AppError({
      message: "Failed refreshing Gmail access token",
      userMessage: "No se pudo autenticar Gmail para enviar correos.",
      status: 502,
      details: payload,
    });
  }

  return payload.access_token;
}

async function sendViaGmail({
  config,
  to,
  subject,
  text,
  html,
}: {
  config: GoogleMailConfig;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<EmailDeliveryResult> {
  try {
    const accessToken = await getGoogleAccessToken(config);
    const raw = buildMimeMessage({
      fromEmail: config.senderEmail,
      fromName: config.fromName,
      replyToEmail: config.replyToEmail,
      to,
      subject,
      text,
      html,
    });

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          id?: string;
          error?: {
            message?: string;
          };
        }
      | null;

    if (!response.ok) {
      return {
        delivered: false,
        errorMessage: payload?.error?.message ?? "Google Gmail API devolvió un error.",
      };
    }

    if (!payload?.id) {
      return {
        delivered: false,
        errorMessage: "Google Gmail API no devolvió identificador de mensaje.",
      };
    }

    return {
      delivered: true,
      providerMessageId: payload.id,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    return {
      delivered: false,
      errorMessage: "No se pudo conectar con Gmail API.",
    };
  }
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailDeliveryResult> {
  const resolvedHtml = html ?? buildDefaultEmailHtml(text);
  const gmailConfig = getGoogleMailConfig();
  if (gmailConfig) {
    return sendViaGmail({
      config: gmailConfig,
      to,
      subject,
      text,
      html: resolvedHtml,
    });
  }

  throw new AppError({
    message: "Missing configured email provider",
    userMessage:
      "Falta configurar el correo saliente del sistema. Define GOOGLE_GMAIL_CLIENT_ID, GOOGLE_GMAIL_CLIENT_SECRET, GOOGLE_GMAIL_REFRESH_TOKEN y GOOGLE_GMAIL_SENDER_EMAIL.",
    status: 400,
  });
}
