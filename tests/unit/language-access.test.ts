import { afterEach, describe, expect, it } from "vitest";
import { canUseEnglishLanguageToggle } from "@/lib/i18n/access";

describe("canUseEnglishLanguageToggle", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL;
    delete process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL;
  });

  it("allows admin users", () => {
    expect(
      canUseEnglishLanguageToggle({
        role: "admin",
        email: "admin@example.com",
      }),
    ).toBe(true);
  });

  it("allows demo applicant email only when configured", () => {
    process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL = "applicant.demo@uwcperu.org";

    expect(
      canUseEnglishLanguageToggle({
        role: "applicant",
        email: "applicant.demo@uwcperu.org",
      }),
    ).toBe(true);
    expect(
      canUseEnglishLanguageToggle({
        role: "applicant",
        email: "real.applicant@school.edu",
      }),
    ).toBe(false);
  });

  it("rejects applicants when demo email is missing", () => {
    expect(
      canUseEnglishLanguageToggle({
        role: "applicant",
        email: "applicant.demo@uwcperu.org",
      }),
    ).toBe(false);
  });

  it("allows demo admin email even if role is not admin", () => {
    process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL = "admin.demo@uwcperu.org";

    expect(
      canUseEnglishLanguageToggle({
        role: "applicant",
        email: "admin.demo@uwcperu.org",
      }),
    ).toBe(true);
  });
});
