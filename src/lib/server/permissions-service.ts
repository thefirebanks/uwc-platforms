import type { AppRole, PermissionScope, ReviewerPermission } from "@/types/domain";
import { AppError } from "@/lib/errors/app-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Returns the permission scope for a given role + permission, or null if not permitted.
 */
export async function getPermissionScope(
  role: AppRole,
  permission: ReviewerPermission,
): Promise<PermissionScope | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("role_permissions")
    .select("scope")
    .eq("role", role)
    .eq("permission", permission)
    .maybeSingle();

  return (data?.scope as PermissionScope) ?? null;
}

/**
 * Returns true if the given role has the permission (at any scope).
 */
export async function hasPermission(
  role: AppRole,
  permission: ReviewerPermission,
): Promise<boolean> {
  const scope = await getPermissionScope(role, permission);
  return scope !== null;
}

/**
 * Throws a 403 AppError if the given role does not have the permission.
 * Returns the scope so callers can apply filtering (e.g. "assigned" → filter by reviewer_assignments).
 */
export async function requirePermission(
  role: AppRole,
  permission: ReviewerPermission,
): Promise<PermissionScope> {
  const scope = await getPermissionScope(role, permission);
  if (scope === null) {
    throw new AppError({
      message: `Role '${role}' does not have permission '${permission}'`,
      userMessage: "No tienes permisos para realizar esta acción.",
      status: 403,
    });
  }
  return scope;
}
