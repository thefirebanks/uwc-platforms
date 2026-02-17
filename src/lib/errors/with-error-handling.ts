import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/logger";

type RouteHandler = (requestId: string) => Promise<NextResponse>;

export async function withErrorHandling(handler: RouteHandler) {
  const requestId = randomUUID();

  try {
    return await handler(requestId);
  } catch (error) {
    if (error instanceof AppError) {
      Sentry.captureMessage(error.message, {
        level: "warning",
        extra: { requestId, details: error.details },
      });
      logger.warn({ requestId, error: error.message, details: error.details }, "Request failed");
      return NextResponse.json(
        {
          errorId: requestId,
          message: error.userMessage,
        },
        { status: error.status },
      );
    }

    Sentry.captureException(error, {
      extra: { requestId },
    });
    logger.error({ requestId, error }, "Unhandled request error");
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
