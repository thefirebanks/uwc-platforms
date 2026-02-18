import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAuth } from "@/lib/server/auth";

const { mockGetSupabaseServerClient } = vi.hoisted(() => ({
  mockGetSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: mockGetSupabaseServerClient,
}));

type StubOptions = {
  user?: { id: string } | null;
  authError?: unknown;
  profile?: { id: string; email: string; full_name: string; role: "admin" | "applicant" } | null;
  profileError?: unknown;
};

function buildSupabaseStub({
  user = { id: "user-1" },
  authError = null,
  profile = {
    id: "user-1",
    email: "user@example.com",
    full_name: "User Example",
    role: "applicant",
  },
  profileError = null,
}: StubOptions = {}) {
  const single = vi.fn().mockResolvedValue({ data: profile, error: profileError });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const getUser = vi.fn().mockResolvedValue({
    data: { user },
    error: authError,
  });

  return {
    auth: { getUser },
    from,
  };
}

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns authenticated profile when role is allowed", async () => {
    const supabase = buildSupabaseStub({
      profile: {
        id: "admin-1",
        email: "admin@example.com",
        full_name: "Admin",
        role: "admin",
      },
      user: { id: "admin-1" },
    });
    mockGetSupabaseServerClient.mockResolvedValue(supabase);

    const result = await requireAuth(["admin"]);

    expect(result.profile.role).toBe("admin");
    expect(result.user.id).toBe("admin-1");
  });

  it("throws forbidden when authenticated user does not have the required role", async () => {
    mockGetSupabaseServerClient.mockResolvedValue(buildSupabaseStub());

    await expect(requireAuth(["admin"])).rejects.toMatchObject({
      status: 403,
      userMessage: "No tienes permisos para realizar esta acción.",
    });
  });

  it("throws unauthorized when there is no authenticated user", async () => {
    mockGetSupabaseServerClient.mockResolvedValue(
      buildSupabaseStub({
        user: null,
      }),
    );

    await expect(requireAuth(["applicant"])).rejects.toMatchObject({
      status: 401,
      userMessage: "Tu sesión expiró. Inicia sesión nuevamente.",
    });
  });

  it("throws forbidden when profile cannot be loaded", async () => {
    mockGetSupabaseServerClient.mockResolvedValue(
      buildSupabaseStub({
        profile: null,
      }),
    );

    await expect(requireAuth(["applicant"])).rejects.toMatchObject({
      status: 403,
      userMessage: "No encontramos tu perfil en el sistema. Contacta a un administrador.",
    });
  });
});
