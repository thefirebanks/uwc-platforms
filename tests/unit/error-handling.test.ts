import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors/app-error";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { logger } from "@/lib/logging/logger";

vi.mock("@/lib/logging/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

async function jsonBody(response: NextResponse) {
  return response.json();
}

describe("withErrorHandling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs info with operation on successful responses", async () => {
    const response = await withErrorHandling(
      async () => NextResponse.json({ ok: true }),
      { operation: "tests.success" },
    );

    expect(response.status).toBe(200);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "tests.success",
        status: 200,
      }),
      "Request completed",
    );
  });

  it("returns app error details with error id", async () => {
    const response = await withErrorHandling(
      async () => {
        throw new AppError({
          message: "Validation failed",
          userMessage: "Error amigable",
          status: 422,
        });
      },
      { operation: "tests.app_error" },
    );

    expect(response.status).toBe(422);

    const body = await jsonBody(response);
    expect(body.message).toBe("Error amigable");
    expect(body.errorId).toBeTruthy();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "tests.app_error",
        status: 422,
      }),
      "Request failed",
    );
  });

  it("returns generic safe message for unknown errors", async () => {
    const response = await withErrorHandling(
      async () => {
        throw new Error("Unexpected");
      },
      { operation: "tests.unknown_error" },
    );

    expect(response.status).toBe(500);

    const body = await jsonBody(response);
    expect(body.message).toContain("Ocurrió un error inesperado");
    expect(body.errorId).toBeTruthy();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "tests.unknown_error",
      }),
      "Unhandled request error",
    );
  });
});
