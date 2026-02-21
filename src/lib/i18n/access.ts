import type { AppRole } from "@/types/domain";

export function canUseEnglishLanguageToggle(profile: {
  role: AppRole;
  email: string | null;
}) {
  const userEmail = profile.email?.trim().toLowerCase() ?? "";
  const configuredDemoAdminEmail =
    process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const configuredDemoApplicantEmail =
    process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL?.trim().toLowerCase() ?? "";

  if (profile.role === "admin") {
    return true;
  }

  if (configuredDemoAdminEmail.length > 0 && configuredDemoAdminEmail === userEmail) {
    return true;
  }

  if (profile.role !== "applicant") {
    return false;
  }

  return configuredDemoApplicantEmail.length > 0 && configuredDemoApplicantEmail === userEmail;
}
