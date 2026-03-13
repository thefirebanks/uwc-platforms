/**
 * Typed client-side fetch wrapper for /api/* routes.
 *
 * Throws {@link ApiRequestError} on non-2xx responses, exposing
 * the server's `errorId` and Spanish user-facing `message`.
 */

export class ApiRequestError extends Error {
  status: number;
  errorId: string;
  userMessage: string;

  constructor(status: number, errorId: string, userMessage: string) {
    super(userMessage);
    this.name = "ApiRequestError";
    this.status = status;
    this.errorId = errorId;
    this.userMessage = userMessage;
  }
}

export type ApiErrorPayload = {
  message?: string;
  userMessage?: string;
  errorId?: string;
};

export type NormalizedApiError = {
  message: string;
  errorId?: string;
};

function normalizeApiErrorPayload(payload: ApiErrorPayload | null | undefined) {
  return {
    errorId: payload?.errorId ?? "unknown",
    userMessage:
      payload?.userMessage ??
      payload?.message ??
      "Ocurrió un error inesperado.",
  };
}

async function parseApiErrorPayload(response: Response): Promise<ApiErrorPayload | null> {
  return response.json().catch(() => null);
}

export function toNormalizedApiError(
  error: unknown,
  fallbackMessage: string,
): NormalizedApiError {
  if (error instanceof ApiRequestError) {
    return {
      message: error.userMessage,
      errorId: error.errorId,
    };
  }

  if (error && typeof error === "object") {
    const payload = error as ApiErrorPayload;
    if (
      typeof payload.message === "string" ||
      typeof payload.userMessage === "string"
    ) {
      return {
        message:
          payload.userMessage ??
          payload.message ??
          fallbackMessage,
        errorId:
          typeof payload.errorId === "string" ? payload.errorId : undefined,
      };
    }
  }

  return { message: fallbackMessage };
}

/**
 * Fetch a JSON API endpoint. Automatically sets Content-Type for requests
 * with a body and throws {@link ApiRequestError} on failure.
 *
 * @example
 * const data = await fetchApi<{ cycles: Cycle[] }>("/api/cycles");
 *
 * @example
 * const result = await fetchApi<{ ok: true }>("/api/me", {
 *   method: "PATCH",
 *   body: JSON.stringify({ fullName: "Ada" }),
 * });
 */
export async function fetchApi<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetchApiResponse(url, options);
  return response.json() as Promise<T>;
}

export async function fetchApiResponse(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const requestHeaders = new Headers(options?.headers);

  // Auto-set JSON content type only for string payloads without an explicit header.
  if (
    typeof options?.body === "string" &&
    !requestHeaders.has("content-type")
  ) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers: requestHeaders,
  });

  if (!response.ok) {
    const payload = normalizeApiErrorPayload(await parseApiErrorPayload(response));
    throw new ApiRequestError(
      response.status,
      payload.errorId,
      payload.userMessage,
    );
  }

  return response;
}
