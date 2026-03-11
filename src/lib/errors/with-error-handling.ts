import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/logger";

type RouteHandler = (requestId: string) => Promise<NextResponse>;

export async function withErrorHandling(
  handler: RouteHandler,
  options?: { operation?: string },
) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const operation = options?.operation ?? "api.request";

  try {
    const response = await handler(requestId);
    logger.info(
      {
        requestId,
        operation,
        status: response.status,
        durationMs: Date.now() - startedAt,
      },
      "Request completed",
    );
    return response;
  } catch (error) {
    if (error instanceof AppError) {
      logger.warn(
        {
          requestId,
          operation,
          error: error.message,
          details: error.details,
          status: error.status,
          durationMs: Date.now() - startedAt,
        },
        "Request failed",
      );
      return NextResponse.json(
        {
          errorId: requestId,
          message: error.userMessage,
        },
        { status: error.status },
      );
    }

    logger.error(
      {
        requestId,
        operation,
        err: error instanceof Error ? error : undefined,
        errorString: String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        durationMs: Date.now() - startedAt,
      },
      "Unhandled request error",
    );
    return NextResponse.json(
      {
        errorId: requestId,
        message:
          "Ocurrió un error inesperado. Comparte este Error ID con el comité para poder ayudarte.",
      },
      { status: 500 },
    );
  }
}
