import type { AppRole } from "@/types/domain";

/**
 * Resolves the initial role for a new user based on their email and the admin allowlist.
 *
 * Returns "admin" if the email is in the allowlist, otherwise "applicant".
 *
 * Note: "reviewer" is never returned here. Reviewers are promoted by admins via the
 * reviewer management UI, which updates profiles.role directly. This function is only
 * called during initial profile creation on sign-up.
 */
export function resolveRoleFromEmail({
  email,
  allowlist,
}: {
  email?: string;
  allowlist: string;
}): Extract<AppRole, "admin" | "applicant"> {
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
