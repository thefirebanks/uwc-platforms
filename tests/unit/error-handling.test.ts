import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors/app-error";
import { withErrorHandling } from "@/lib/errors/with-error-handling";

async function jsonBody(response: NextResponse) {
  return response.json();
}

describe("withErrorHandling", () => {
  it("returns app error details with error id", async () => {
    const response = await withErrorHandling(async () => {
      throw new AppError({
        message: "Validation failed",
        userMessage: "Error amigable",
        status: 422,
      });
    });

    expect(response.status).toBe(422);

    const body = await jsonBody(response);
    expect(body.message).toBe("Error amigable");
    expect(body.errorId).toBeTruthy();
  });

  it("returns generic safe message for unknown errors", async () => {
    const response = await withErrorHandling(async () => {
      throw new Error("Unexpected");
    });

    expect(response.status).toBe(500);

    const body = await jsonBody(response);
    expect(body.message).toContain("Ocurrió un error inesperado");
    expect(body.errorId).toBeTruthy();
  });
});
