import type { AppRole } from "@/types/domain";

export function canUseEnglishLanguageToggle(profile: {
  role: AppRole;
  email: string | null;
}) {
  if (profile.role === "admin") {
    return true;
  }

  if (profile.role !== "applicant") {
    return false;
  }

  const configuredDemoApplicantEmail =
    process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL?.trim().toLowerCase() ?? "";
  const userEmail = profile.email?.trim().toLowerCase() ?? "";

  return configuredDemoApplicantEmail.length > 0 && configuredDemoApplicantEmail === userEmail;
}
