import { describe, expect, it } from "vitest";
import { resolveRoleFromEmail } from "@/lib/auth/role-resolution";

describe("resolveRoleFromEmail", () => {
  it("returns admin when email is allowlisted", () => {
    const role = resolveRoleFromEmail({
      email: "Comite@pe.uwc.org",
      allowlist: "test-admin@example.com, comite@pe.uwc.org",
    });

    expect(role).toBe("admin");
  });

  it("returns applicant when email is not allowlisted", () => {
    const role = resolveRoleFromEmail({
      email: "applicant@uwc.org",
      allowlist: "test-admin@example.com, comite@pe.uwc.org",
    });

    expect(role).toBe("applicant");
  });

  it("returns applicant when email is missing", () => {
    const role = resolveRoleFromEmail({
      allowlist: "comite@pe.uwc.org",
    });

    expect(role).toBe("applicant");
  });
});
