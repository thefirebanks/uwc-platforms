import type { AppRole } from "@/types/domain";

export function canUseEnglishLanguageToggle(profile: {
  role: AppRole;
  email: string | null;
}) {
  const userEmail = profile.email?.trim().toLowerCase() ?? "";
  const configuredDemoAdminEmail =
    process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const configuredDemoApplicantEmails = [
    process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL?.trim().toLowerCase() ?? "",
    process.env.NEXT_PUBLIC_DEMO_APPLICANT_2_EMAIL?.trim().toLowerCase() ??
      "applicant.demo2@uwcperu.org",
  ].filter(Boolean);

  if (profile.role === "admin") {
    return true;
  }

  if (configuredDemoAdminEmail.length > 0 && configuredDemoAdminEmail === userEmail) {
    return true;
  }

  if (profile.role !== "applicant") {
    return false;
  }

  return configuredDemoApplicantEmails.includes(userEmail);
}
