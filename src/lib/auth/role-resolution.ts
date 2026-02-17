import type { AppRole } from "@/types/domain";

export function resolveRoleFromEmail({
  email,
  allowlist,
}: {
  email?: string;
  allowlist: string;
}): AppRole {
  if (!email) {
    return "applicant";
  }

  const normalized = email.trim().toLowerCase();
  const adminEmails = allowlist
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(normalized) ? "admin" : "applicant";
}
