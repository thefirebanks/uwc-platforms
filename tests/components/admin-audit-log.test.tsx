import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminAuditLog } from "@/components/admin-audit-log";

describe("AdminAuditLog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads audit events and applies request filter", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          events: [
            {
              id: "evt-1",
              action: "application.validated",
              requestId: "req-abc-001",
              applicationId: "app-1",
              actorId: "actor-1",
              actorName: "Admin Demo",
              actorEmail: "admin.demo@uwcperu.org",
              metadata: { status: "eligible" },
              createdAt: "2026-02-18T20:00:00.000Z",
            },
          ],
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
        }),
        { status: 200 },
      );
    });

    render(<AdminAuditLog />);

    expect(await screen.findByText("application.validated")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exportar CSV" })).toHaveAttribute(
      "href",
      "/api/audit/export",
    );

    await userEvent.type(screen.getByLabelText("Request ID"), "req-abc");
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const secondCallUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(secondCallUrl).toContain("/api/audit?");
    expect(secondCallUrl).toContain("requestId=req-abc");
    expect(screen.getByRole("link", { name: "Exportar CSV" })).toHaveAttribute(
      "href",
      expect.stringContaining("requestId=req-abc"),
    );
  });
});
