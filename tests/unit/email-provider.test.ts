import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleMailConnectUrl,
  exchangeGoogleMailCode,
  sendEmail,
} from "@/lib/server/email-provider";
import { AppError } from "@/lib/errors/app-error";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("buildGoogleMailConnectUrl", () => {
  it("builds an OAuth URL with offline access and gmail.send scope", () => {
    vi.stubEnv(
      "GOOGLE_GMAIL_CLIENT_ID",
      "client-id.apps.googleusercontent.com",
    );

    const url = new URL(
      buildGoogleMailConnectUrl({
        origin: "http://localhost:3000",
        loginHint: "informes@pe.uwc.org",
      }),
    );

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe(
      "client-id.apps.googleusercontent.com",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/auth/google-mail/callback",
    );
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/gmail.send",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("login_hint")).toBe("informes@pe.uwc.org");
  });
});

describe("exchangeGoogleMailCode", () => {
  it("exchanges an OAuth code for a refresh token", async () => {
    vi.stubEnv("GOOGLE_GMAIL_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_GMAIL_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_GMAIL_SENDER_EMAIL", "informes@pe.uwc.org");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          expires_in: 3600,
          refresh_token: "refresh-token",
          scope: "https://www.googleapis.com/auth/gmail.send",
          token_type: "Bearer",
        }),
        { status: 200 },
      ),
    );

    const result = await exchangeGoogleMailCode({
      code: "oauth-code",
      origin: "http://localhost:3000",
    });

    expect(result.refreshToken).toBe("refresh-token");
    expect(result.senderEmail).toBe("informes@pe.uwc.org");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});

describe("sendEmail", () => {
  it("prefers Gmail when Gmail credentials are configured", async () => {
    vi.stubEnv("GOOGLE_GMAIL_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_GMAIL_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_GMAIL_REFRESH_TOKEN", "refresh-token");
    vi.stubEnv("GOOGLE_GMAIL_SENDER_EMAIL", "informes@pe.uwc.org");

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-token",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "gmail-message-id",
          }),
          { status: 200 },
        ),
      );

    const result = await sendEmail({
      to: "applicant@example.com",
      subject: "Hola",
      text: "Mensaje de prueba",
    });

    expect(result).toEqual({
      delivered: true,
      providerMessageId: "gmail-message-id",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("falls back to Resend when Gmail is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@uwcperu.org");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re_test_abc" }), { status: 200 }),
    );

    const result = await sendEmail({
      to: "applicant@example.com",
      subject: "Hola",
      text: "Mensaje de prueba",
    });

    expect(result).toEqual({
      delivered: true,
      providerMessageId: "re_test_abc",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("throws when no outbound mail provider is configured", async () => {
    await expect(
      sendEmail({
        to: "applicant@example.com",
        subject: "Hola",
        text: "Mensaje de prueba",
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.status === 400,
    );
  });
});
