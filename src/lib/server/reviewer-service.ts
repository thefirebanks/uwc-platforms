import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/supabase";
import type { ReviewerAssignment } from "@/types/domain";

type ReviewerAssignmentRow = Database["public"]["Tables"]["reviewer_assignments"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ReviewerProfileRow = Pick<ProfileRow, "id" | "email" | "full_name" | "role">;

export type ReviewerAssignmentWithApp = ReviewerAssignmentRow & {
  application: {
    id: string;
    applicant_id: string;
    cycle_id: string;
    stage_code: string;
    status: string;
  } | null;
  reviewer: ReviewerProfileRow | null;
};

export type InviteReviewerInput = {
  /** Email of the user to promote (or invite) as a reviewer. */
  email: string;
  /** ID of the admin performing the action. */
  adminId: string;
};

export type AssignReviewerInput = {
  reviewerId: string;
  applicationId: string;
  cycleId: string;
  stageCode: string;
  assignedBy: string;
};

/* -------------------------------------------------------------------------- */
/*  List reviewers                                                             */
/* -------------------------------------------------------------------------- */

export async function listReviewers(): Promise<ReviewerProfileRow[]> {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("role", "reviewer")
    .order("full_name", { ascending: true });

  if (error) {
    throw new AppError({
      message: "Failed to list reviewers",
      userMessage: "No se pudo cargar la lista de revisores.",
      status: 500,
      details: error,
    });
  }

  return (data ?? []) as ReviewerProfileRow[];
}

/* -------------------------------------------------------------------------- */
/*  Invite / promote reviewer                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Promotes an existing profile to reviewer role.
 * If the profile does not exist, throws a 404 — reviewers must have signed up first.
 */
export async function promoteToReviewer(input: InviteReviewerInput): Promise<ReviewerProfileRow> {
  const supabase = await getSupabaseAdminClient();

  const { data: existing, error: findError } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("email", input.email.trim().toLowerCase())
    .maybeSingle();

  if (findError) {
    throw new AppError({
      message: "Failed to look up profile",
      userMessage: "Error al buscar el perfil.",
      status: 500,
      details: findError,
    });
  }

  if (!existing) {
    throw new AppError({
      message: `No profile found for email ${input.email}`,
      userMessage: "No existe un usuario registrado con ese correo. El usuario debe crear su cuenta primero.",
      status: 404,
    });
  }

  if (existing.role === "reviewer") {
    return existing as ReviewerProfileRow;
  }

  if (existing.role === "admin") {
    throw new AppError({
      message: "Cannot demote an admin to reviewer",
      userMessage: "Este usuario es administrador y no puede ser convertido a revisor.",
      status: 409,
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ role: "reviewer" })
    .eq("id", existing.id)
    .select("id, email, full_name, role")
    .single();

  if (updateError || !updated) {
    throw new AppError({
      message: "Failed to promote profile to reviewer",
      userMessage: "No se pudo asignar el rol de revisor.",
      status: 500,
      details: updateError,
    });
  }

  return updated as ReviewerProfileRow;
}

/**
 * Demotes a reviewer back to applicant role, and removes all their assignments.
 */
export async function demoteReviewer(reviewerId: string): Promise<void> {
  const supabase = await getSupabaseAdminClient();

  // Remove all assignments first
  await supabase.from("reviewer_assignments").delete().eq("reviewer_id", reviewerId);

  const { error } = await supabase
    .from("profiles")
    .update({ role: "applicant" })
    .eq("id", reviewerId)
    .eq("role", "reviewer"); // safety: only demote actual reviewers

  if (error) {
    throw new AppError({
      message: "Failed to demote reviewer",
      userMessage: "No se pudo revocar el rol de revisor.",
      status: 500,
      details: error,
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Assignments                                                                */
/* -------------------------------------------------------------------------- */

export async function assignReviewer(
  input: AssignReviewerInput,
): Promise<ReviewerAssignment> {
  const supabase = await getSupabaseAdminClient();

  // Verify reviewer role
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", input.reviewerId)
    .maybeSingle();

  if (profileError || !profile) {
    throw new AppError({ message: "Reviewer profile not found", userMessage: "Revisor no encontrado.", status: 404 });
  }
  if (profile.role !== "reviewer") {
    throw new AppError({ message: "Profile is not a reviewer", userMessage: "El usuario no tiene rol de revisor.", status: 400 });
  }

  const { data, error } = await supabase
    .from("reviewer_assignments")
    .upsert(
      {
        reviewer_id: input.reviewerId,
        application_id: input.applicationId,
        cycle_id: input.cycleId,
        stage_code: input.stageCode,
        assigned_by: input.assignedBy,
      },
      { onConflict: "reviewer_id,application_id" },
    )
    .select()
    .single();

  if (error || !data) {
    throw new AppError({
      message: "Failed to assign reviewer",
      userMessage: "No se pudo asignar el revisor.",
      status: 500,
      details: error,
    });
  }

  return data as ReviewerAssignment;
}

export async function unassignReviewer(reviewerId: string, applicationId: string): Promise<void> {
  const supabase = await getSupabaseAdminClient();
  const { error } = await supabase
    .from("reviewer_assignments")
    .delete()
    .eq("reviewer_id", reviewerId)
    .eq("application_id", applicationId);

  if (error) {
    throw new AppError({
      message: "Failed to unassign reviewer",
      userMessage: "No se pudo eliminar la asignación.",
      status: 500,
      details: error,
    });
  }
}

/**
 * Returns all assignments for a reviewer, joined with basic application info.
 * Uses the authenticated client so RLS applies (reviewers only see their own).
 */
export async function getReviewerAssignments(
  supabase: SupabaseClient<Database>,
): Promise<ReviewerAssignmentWithApp[]> {
  const { data, error } = await supabase
    .from("reviewer_assignments")
    .select(`
      id,
      reviewer_id,
      application_id,
      cycle_id,
      stage_code,
      assigned_by,
      assigned_at,
      application:applications (
        id,
        applicant_id,
        cycle_id,
        stage_code,
        status
      ),
      reviewer:profiles!reviewer_assignments_reviewer_id_fkey (
        id,
        email,
        full_name,
        role
      )
    `)
    .order("assigned_at", { ascending: false });

  if (error) {
    throw new AppError({
      message: "Failed to fetch reviewer assignments",
      userMessage: "No se pudieron cargar las asignaciones.",
      status: 500,
      details: error,
    });
  }

  return (data ?? []) as ReviewerAssignmentWithApp[];
}

/**
 * Returns all reviewers assigned to a specific application (admin view).
 */
export async function getApplicationReviewers(
  applicationId: string,
): Promise<ReviewerProfileRow[]> {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("reviewer_assignments")
    .select(`
      reviewer:profiles!reviewer_assignments_reviewer_id_fkey (
        id, email, full_name, role
      )
    `)
    .eq("application_id", applicationId);

  if (error) {
    throw new AppError({
      message: "Failed to fetch application reviewers",
      userMessage: "No se pudieron cargar los revisores de esta postulación.",
      status: 500,
      details: error,
    });
  }

  return ((data ?? []).map((row: { reviewer: unknown }) => row.reviewer).filter(Boolean)) as ReviewerProfileRow[];
}
