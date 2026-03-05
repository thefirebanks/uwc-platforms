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
  minFilledResponses: z.number().int().min(0).max(50).default(0),
  completenessMode: z.enum(["minimum_answers", "strict_form_valid"]).default("minimum_answers"),
});

const ocrConfidenceCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("ocr_confidence"),
  fileKey: z.string().trim().min(1).max(120),
  minConfidence: z.number().min(0).max(1),
  onFail: eligibilityOutcomeSchema.default("needs_review"),
  onMissingData: eligibilityOutcomeSchema.default("needs_review"),
});

const ocrFieldInCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("ocr_field_in"),
  fileKey: z.string().trim().min(1).max(120),
  jsonPath: z.string().trim().min(1).max(240),
  allowedValues: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
  caseSensitive: z.boolean().default(false),
  onFail: eligibilityOutcomeSchema.default("needs_review"),
  onMissingData: eligibilityOutcomeSchema.default("needs_review"),
});

const ocrFieldNotInCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("ocr_field_not_in"),
  fileKey: z.string().trim().min(1).max(120),
  jsonPath: z.string().trim().min(1).max(240),
  disallowedValues: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
  caseSensitive: z.boolean().default(false),
  onFail: eligibilityOutcomeSchema.default("needs_review"),
  onMissingData: eligibilityOutcomeSchema.default("needs_review"),
});

const fieldMatchesOcrCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("field_matches_ocr"),
  fieldKey: z.string().trim().min(1).max(120),
  fileKey: z.string().trim().min(1).max(120),
  jsonPath: z.string().trim().min(1).max(240),
  caseSensitive: z.boolean().default(false),
  normalizeWhitespace: z.boolean().default(true),
  onFail: eligibilityOutcomeSchema.default("needs_review"),
  onMissingData: eligibilityOutcomeSchema.default("needs_review"),
});

const fileUploadCountBetweenCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("file_upload_count_between"),
  fileKeys: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
  minCount: z.number().int().min(0).optional(),
  maxCount: z.number().int().min(0).optional(),
}).refine((value) => typeof value.minCount === "number" || typeof value.maxCount === "number", {
  message: "file_upload_count_between criteria require minCount or maxCount",
  path: ["minCount"],
});

const anyOfConditionFieldPresentSchema = z.object({
  kind: z.literal("field_present"),
  fieldKey: z.string().trim().min(1).max(120),
});

const anyOfConditionFileUploadedSchema = z.object({
  kind: z.literal("file_uploaded"),
  fileKey: z.string().trim().min(1).max(120),
});

const anyOfConditionNumberBetweenSchema = z
  .object({
    kind: z.literal("number_between"),
    fieldKey: z.string().trim().min(1).max(120),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .refine((value) => typeof value.min === "number" || typeof value.max === "number", {
    message: "number_between condition requires min or max",
    path: ["min"],
  });

const anyOfConditionOcrFieldInSchema = z.object({
  kind: z.literal("ocr_field_in"),
  fileKey: z.string().trim().min(1).max(120),
  jsonPath: z.string().trim().min(1).max(240),
  allowedValues: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
  caseSensitive: z.boolean().default(false),
});

export const eligibilityAnyOfConditionSchema = z.discriminatedUnion("kind", [
  anyOfConditionFieldPresentSchema,
  anyOfConditionFileUploadedSchema,
  anyOfConditionNumberBetweenSchema,
  anyOfConditionOcrFieldInSchema,
]);

export type EligibilityAnyOfCondition = z.infer<typeof eligibilityAnyOfConditionSchema>;

const anyOfCriterionSchema = criterionBaseSchema.extend({
  kind: z.literal("any_of"),
  conditions: z.array(eligibilityAnyOfConditionSchema).min(1).max(40),
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
  ocrFieldInCriterionSchema,
  ocrFieldNotInCriterionSchema,
  fieldMatchesOcrCriterionSchema,
  fileUploadCountBetweenCriterionSchema,
  anyOfCriterionSchema,
]);

export type EligibilityRubricCriterion = z.infer<typeof eligibilityRubricCriterionSchema>;

export const eligibilityRubricConfigSchema = z.object({
  enabled: z.boolean().default(false),
  criteria: z.array(eligibilityRubricCriterionSchema).max(100).default([]),
}).superRefine((value, context) => {
  if (value.enabled && value.criteria.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["criteria"],
      message: "Enabled rubrics must include at least one criterion.",
    });
  }

  const seenCriterionIds = new Set<string>();

  value.criteria.forEach((criterion, criterionIndex) => {
    if (seenCriterionIds.has(criterion.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criteria", criterionIndex, "id"],
        message: `Duplicate criterion id "${criterion.id}".`,
      });
    } else {
      seenCriterionIds.add(criterion.id);
    }

    if (criterion.kind === "number_between") {
      if (typeof criterion.min === "number" && typeof criterion.max === "number" && criterion.min > criterion.max) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["criteria", criterionIndex, "min"],
          message: "number_between criterion requires min <= max.",
        });
      }
    }

    if (criterion.kind === "file_upload_count_between") {
      if (
        typeof criterion.minCount === "number" &&
        typeof criterion.maxCount === "number" &&
        criterion.minCount > criterion.maxCount
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["criteria", criterionIndex, "minCount"],
          message: "file_upload_count_between criterion requires minCount <= maxCount.",
        });
      }

      const seenFileKeys = new Set<string>();
      criterion.fileKeys.forEach((fileKey, fileKeyIndex) => {
        if (seenFileKeys.has(fileKey)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["criteria", criterionIndex, "fileKeys", fileKeyIndex],
            message: `Duplicate file key "${fileKey}".`,
          });
        } else {
          seenFileKeys.add(fileKey);
        }
      });
    }

    if (criterion.kind === "all_present" || criterion.kind === "any_present") {
      const seenFieldKeys = new Set<string>();
      criterion.fieldKeys.forEach((fieldKey, fieldKeyIndex) => {
        if (seenFieldKeys.has(fieldKey)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["criteria", criterionIndex, "fieldKeys", fieldKeyIndex],
            message: `Duplicate field key "${fieldKey}".`,
          });
        } else {
          seenFieldKeys.add(fieldKey);
        }
      });
    }

    if (criterion.kind === "field_in") {
      const normalize = (raw: string) => (criterion.caseSensitive ? raw : raw.toLowerCase());
      const seenValues = new Set<string>();

      criterion.allowedValues.forEach((allowedValue, allowedValueIndex) => {
        const normalized = normalize(allowedValue);
        if (seenValues.has(normalized)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["criteria", criterionIndex, "allowedValues", allowedValueIndex],
            message: `Duplicate allowed value "${allowedValue}".`,
          });
        } else {
          seenValues.add(normalized);
        }
      });
    }

    if (criterion.kind === "ocr_field_in") {
      const normalize = (raw: string) => (criterion.caseSensitive ? raw : raw.toLowerCase());
      const seenValues = new Set<string>();

      criterion.allowedValues.forEach((allowedValue, allowedValueIndex) => {
        const normalized = normalize(allowedValue);
        if (seenValues.has(normalized)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["criteria", criterionIndex, "allowedValues", allowedValueIndex],
            message: `Duplicate allowed value "${allowedValue}".`,
          });
        } else {
          seenValues.add(normalized);
        }
      });
    }

    if (criterion.kind === "ocr_field_not_in") {
      const normalize = (raw: string) => (criterion.caseSensitive ? raw : raw.toLowerCase());
      const seenValues = new Set<string>();

      criterion.disallowedValues.forEach((disallowedValue, disallowedValueIndex) => {
        const normalized = normalize(disallowedValue);
        if (seenValues.has(normalized)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["criteria", criterionIndex, "disallowedValues", disallowedValueIndex],
            message: `Duplicate disallowed value "${disallowedValue}".`,
          });
        } else {
          seenValues.add(normalized);
        }
      });
    }

    if (criterion.kind === "recommendations_complete") {
      const seenRoles = new Set<string>();
      criterion.roles.forEach((role, roleIndex) => {
        if (seenRoles.has(role)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["criteria", criterionIndex, "roles", roleIndex],
            message: `Duplicate recommendation role "${role}".`,
          });
        } else {
          seenRoles.add(role);
        }
      });
    }

    if (criterion.kind === "any_of") {
      criterion.conditions.forEach((condition, conditionIndex) => {
        if (condition.kind === "number_between") {
          if (
            typeof condition.min === "number" &&
            typeof condition.max === "number" &&
            condition.min > condition.max
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["criteria", criterionIndex, "conditions", conditionIndex, "min"],
              message: "any_of number_between condition requires min <= max.",
            });
          }
        }

        if (condition.kind === "ocr_field_in") {
          const normalize = (raw: string) =>
            condition.caseSensitive ? raw : raw.toLowerCase();
          const seenValues = new Set<string>();

          condition.allowedValues.forEach((allowedValue, allowedValueIndex) => {
            const normalized = normalize(allowedValue);
            if (seenValues.has(normalized)) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: [
                  "criteria",
                  criterionIndex,
                  "conditions",
                  conditionIndex,
                  "allowedValues",
                  allowedValueIndex,
                ],
                message: `Duplicate allowed value "${allowedValue}".`,
              });
            } else {
              seenValues.add(normalized);
            }
          });
        }
      });
    }
  });
});

export type EligibilityRubricConfig = z.infer<typeof eligibilityRubricConfigSchema>;

export type EligibilityRubricValidationResult =
  | {
      success: true;
      data: EligibilityRubricConfig;
      errors: [];
    }
  | {
      success: false;
      data: null;
      errors: string[];
    };

function formatIssuePath(path: PropertyKey[]) {
  if (path.length === 0) {
    return "rubric";
  }

  return path
    .map((segment) => {
      if (typeof segment === "number") {
        return `[${segment}]`;
      }
      if (typeof segment === "symbol") {
        return segment.toString();
      }
      return segment;
    })
    .join(".");
}

export function validateEligibilityRubricConfig(value: unknown): EligibilityRubricValidationResult {
  const parsed = eligibilityRubricConfigSchema.safeParse(value);
  if (parsed.success) {
    return {
      success: true,
      data: parsed.data,
      errors: [],
    };
  }

  const errors = parsed.error.issues.map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`);
  return {
    success: false,
    data: null,
    errors,
  };
}

export function parseEligibilityRubricConfig(value: unknown): EligibilityRubricConfig | null {
  const validation = validateEligibilityRubricConfig(value);
  if (!validation.success) {
    return null;
  }
  return validation.data;
}

export function getDefaultEligibilityRubricConfig(): EligibilityRubricConfig {
  return {
    enabled: false,
    criteria: [],
  };
}
