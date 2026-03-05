import { z } from "zod";

export const eligibilityOutcomeSchema = z.enum(["eligible", "not_eligible", "needs_review"]);
export type EligibilityOutcome = z.infer<typeof eligibilityOutcomeSchema>;

const criterionBaseSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(180),
  description: z.string().trim().max(600).optional(),
  onFail: eligibilityOutcomeSchema.default("not_eligible"),
  onMissingData: eligibilityOutcomeSchema.default("needs_review"),
});

const fieldPresenceCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("field_present"),
  fieldKey: z.string().trim().min(1).max(120),
});

const allPresentCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("all_present"),
  fieldKeys: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
});

const anyPresentCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("any_present"),
  fieldKeys: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
});

const fieldInCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("field_in"),
  fieldKey: z.string().trim().min(1).max(120),
  allowedValues: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
  caseSensitive: z.boolean().default(false),
});

const numberBetweenCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("number_between"),
  fieldKey: z.string().trim().min(1).max(120),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
}).refine((value) => typeof value.min === "number" || typeof value.max === "number", {
  message: "number_between criteria require min or max",
  path: ["min"],
});

const fileUploadedCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("file_uploaded"),
  fileKey: z.string().trim().min(1).max(120),
});

const recommendationsCompleteCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("recommendations_complete"),
  roles: z.array(z.enum(["mentor", "friend"]))
    .min(1)
    .max(2)
    .default(["mentor", "friend"]),
  requireRequested: z.boolean().default(true),
});

const ocrConfidenceCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("ocr_confidence"),
  fileKey: z.string().trim().min(1).max(120),
  minConfidence: z.number().min(0).max(1),
  onFail: eligibilityOutcomeSchema.default("needs_review"),
  onMissingData: eligibilityOutcomeSchema.default("needs_review"),
});

export const eligibilityRubricCriterionSchema = z.discriminatedUnion("kind", [
  fieldPresenceCriterionSchema,
  allPresentCriterionSchema,
  anyPresentCriterionSchema,
  fieldInCriterionSchema,
  numberBetweenCriterionSchema,
  fileUploadedCriterionSchema,
  recommendationsCompleteCriterionSchema,
  ocrConfidenceCriterionSchema,
]);

export type EligibilityRubricCriterion = z.infer<typeof eligibilityRubricCriterionSchema>;

export const eligibilityRubricConfigSchema = z.object({
  enabled: z.boolean().default(false),
  criteria: z.array(eligibilityRubricCriterionSchema).max(100).default([]),
});

export type EligibilityRubricConfig = z.infer<typeof eligibilityRubricConfigSchema>;

export function parseEligibilityRubricConfig(value: unknown): EligibilityRubricConfig | null {
  const parsed = eligibilityRubricConfigSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

export function getDefaultEligibilityRubricConfig(): EligibilityRubricConfig {
  return {
    enabled: false,
    criteria: [],
  };
}
