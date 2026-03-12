import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchApi,
  fetchApiResponse,
  ApiRequestError,
  toNormalizedApiError,
} from "@/lib/client/api-client";

describe("fetchApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: [1, 2, 3] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchApi<{ ok: boolean; data: number[] }>("/api/test");
    expect(result).toEqual({ ok: true, data: [1, 2, 3] });
  });

  it("throws ApiRequestError with server error details on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ errorId: "abc-123", message: "Tu sesión expiró." }),
        { status: 401 },
      ),
    );

    try {
      await fetchApi("/api/test");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.errorId).toBe("abc-123");
      expect(apiErr.userMessage).toBe("Tu sesión expiró.");
    }
  });

  it("handles non-JSON error responses gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(fetchApi("/api/test")).rejects.toThrow(ApiRequestError);

    try {
      await fetchApi("/api/test");
    } catch (err) {
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.errorId).toBe("unknown");
      expect(apiErr.userMessage).toBe("Ocurrió un error inesperado.");
    }
  });

  it("auto-sets Content-Type when body is provided", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await fetchApi("/api/test", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    });

    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("does not set Content-Type for GET requests without body", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await fetchApi("/api/test");

    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBeNull();
  });

  it("preserves explicit content-type header when provided", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await fetchApi("/api/test", {
      method: "POST",
      headers: new Headers({ "Content-Type": "text/plain" }),
      body: "raw",
    });

    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("text/plain");
  });

  it("does not force JSON content-type for FormData payloads", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const formData = new FormData();
    formData.append("file", "content");

    await fetchApi("/api/test", {
      method: "POST",
      body: formData,
    });

    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBeNull();
  });

  it("passes through additional fetch options", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await fetchApi("/api/test", { cache: "no-store" });

    const [, init] = mockFetch.mock.calls[0];
    expect(init?.cache).toBe("no-store");
  });

  it("returns raw response via fetchApiResponse when request succeeds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const response = await fetchApiResponse("/api/test");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("normalizes ApiRequestError into ui-safe object", () => {
    const error = new ApiRequestError(400, "abc-123", "Solicitud inválida.");
    expect(toNormalizedApiError(error, "Fallback")).toEqual({
      message: "Solicitud inválida.",
      errorId: "abc-123",
    });
  });

  it("normalizes plain payload errors into ui-safe object", () => {
    expect(
      toNormalizedApiError(
        { message: "Error plano", errorId: "plain-1" },
        "Fallback",
      ),
    ).toEqual({ message: "Error plano", errorId: "plain-1" });
  });
});
