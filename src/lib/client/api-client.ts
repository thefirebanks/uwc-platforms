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
  const headers: Record<string, string> = {};

  // Auto-set Content-Type for requests that send a body
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiRequestError(
      response.status,
      body.errorId ?? "unknown",
      body.message ?? "Ocurrió un error inesperado.",
    );
  }

  return response.json() as Promise<T>;
}
