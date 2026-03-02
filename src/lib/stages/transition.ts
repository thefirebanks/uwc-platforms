import type { ApplicationStatus, StageCode } from "@/types/domain";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface TransitionContext {
  fromStage: StageCode;
  toStage: StageCode;
  status: ApplicationStatus;
}

export type TransitionRule = {
  fromStage: StageCode;
  toStage: StageCode;
  requiredStatuses: ApplicationStatus[];
};

/* -------------------------------------------------------------------------- */
/*  Legacy hardcoded check (backward compat)                                  */
/* -------------------------------------------------------------------------- */

export function canTransition({ fromStage, toStage, status }: TransitionContext) {
  if (fromStage === "documents" && toStage === "exam_placeholder") {
    return status === "eligible" || status === "advanced";
  }

  if (fromStage === "exam_placeholder" && toStage === "documents") {
    return true;
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/*  DB-driven transition rules                                                */
/* -------------------------------------------------------------------------- */

/**
 * Derive transition rules from stage templates ordered by `sort_order`.
 *
 * For consecutive stages A (sort n) → B (sort n+1):
 *   - Forward (A→B) requires status "eligible" or "advanced"
 *   - Rollback (B→A) is always allowed (empty requiredStatuses = any status)
 */
export function deriveTransitionRules(
  templates: Array<{ stage_code: StageCode; sort_order: number }>,
): TransitionRule[] {
  if (templates.length < 2) return [];

  const sorted = [...templates].sort((a, b) => a.sort_order - b.sort_order);
  const rules: TransitionRule[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    // Forward: requires eligible or advanced
    rules.push({
      fromStage: current.stage_code,
      toStage: next.stage_code,
      requiredStatuses: ["eligible", "advanced"],
    });

    // Rollback: always allowed
    rules.push({
      fromStage: next.stage_code,
      toStage: current.stage_code,
      requiredStatuses: [],
    });
  }

  return rules;
}

/**
 * Check if a transition is valid against DB-driven rules.
 * Falls back to legacy `canTransition()` if no matching rule exists.
 */
export function canTransitionWithRules({
  fromStage,
  toStage,
  status,
  rules,
}: {
  fromStage: StageCode;
  toStage: StageCode;
  status: ApplicationStatus;
  rules: TransitionRule[];
}): boolean {
  const rule = rules.find(
    (r) => r.fromStage === fromStage && r.toStage === toStage,
  );

  if (!rule) {
    // No rule found — fall back to hardcoded legacy check
    return canTransition({ fromStage, toStage, status });
  }

  // Empty requiredStatuses means any status is allowed (rollback)
  if (rule.requiredStatuses.length === 0) return true;

  return rule.requiredStatuses.includes(status);
}
