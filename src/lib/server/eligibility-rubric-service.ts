import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import {
  type EligibilityAnyOfCondition,
  type EligibilityOutcome,
  type EligibilityRubricConfig,
  type EligibilityRubricCriterion,
  parseEligibilityRubricConfig,
} from "@/lib/rubric/eligibility-rubric";
import { asRecord, resolveFilePath, resolvePathValue } from "@/lib/utils/resolve-path";
import type { Database } from "@/types/supabase";
import type { ApplicationStatus } from "@/types/domain";
import { validateRecommendationPayload } from "@/lib/server/recommendations-service";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type RecommendationRow = Database["public"]["Tables"]["recommendation_requests"]["Row"];
type OcrCheckRow = Database["public"]["Tables"]["application_ocr_checks"]["Row"];
type EvaluationRow = Database["public"]["Tables"]["application_stage_evaluations"]["Row"];

type CriterionResultStatus = "pass" | "fail" | "missing_data";

export type RubricCriterionResult = {
  criterionId: string;
  label: string;
  kind: EligibilityRubricCriterion["kind"];
  status: CriterionResultStatus;
  decision: EligibilityOutcome | null;
  message: string;
};

export type RubricEvaluationResult = {
  applicationId: string;
  stageCode: string;
  outcome: EligibilityOutcome;
  criteria: RubricCriterionResult[];
  passedCount: number;
  failedCount: number;
  needsReviewCount: number;
  evaluatedAt: string;
};

export type RunEligibilityRubricInput = {
  cycleId: string;
  stageCode: string;
  actorId: string;
  trigger: "manual" | "deadline";
};

export type RunEligibilityRubricResult = {
  cycleId: string;
  stageCode: string;
  evaluated: number;
  outcomes: Record<EligibilityOutcome, number>;
  statusUpdates: {
    eligible: number;
    ineligible: number;
    submitted: number;
  };
};

const ELIGIBILITY_SYNC_STATUSES: ApplicationStatus[] = ["submitted", "eligible", "ineligible"];

function isMissing(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

function normalizeToString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function normalizeToNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ".").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeComparisonString({
  value,
  caseSensitive,
  normalizeWhitespace,
}: {
  value: string;
  caseSensitive: boolean;
  normalizeWhitespace: boolean;
}) {
  const compactWhitespace = normalizeWhitespace
    ? value.replace(/\s+/g, " ").trim()
    : value.trim();
  return caseSensitive ? compactWhitespace : compactWhitespace.toLowerCase();
}

function getOcrParsedPayload(ocrCheck: OcrCheckRow): Record<string, unknown> | null {
  const raw = asRecord(ocrCheck.raw_response);
  if (!raw) {
    return null;
  }

  const parsed = asRecord(raw.parsed);
  if (parsed) {
    return parsed;
  }

  return raw;
}

function getOcrValueByPath({
  ocrCheck,
  jsonPath,
}: {
  ocrCheck: OcrCheckRow | undefined;
  jsonPath: string;
}): unknown {
  if (!ocrCheck) {
    return null;
  }

  const parsedPayload = getOcrParsedPayload(ocrCheck);
  if (!parsedPayload) {
    return null;
  }

  return resolvePathValue(parsedPayload, jsonPath);
}

function isRecommendationComplete(recommendation: RecommendationRow) {
  return (
    recommendation.status === "submitted" ||
    Boolean(recommendation.submitted_at) ||
    Boolean(recommendation.admin_received_at)
  );
}

function isRecommendationSubmittedOnline(recommendation: RecommendationRow) {
  return recommendation.status === "submitted" || Boolean(recommendation.submitted_at);
}

function isRecommendationManuallyReceivedOnly(recommendation: RecommendationRow) {
  return Boolean(recommendation.admin_received_at) && !isRecommendationSubmittedOnline(recommendation);
}

type AnyOfConditionResult = {
  status: CriterionResultStatus;
  message: string;
};

/* ---------------------------------------------------------------------------
 * Shared per-kind condition evaluators
 *
 * These are used by both `evaluateCriterion` (full rubric criterion) and
 * `evaluateAnyOfCondition` (sub-condition within an any_of criterion).
 * Each returns a bare `{ status, message }` tuple that the caller wraps
 * into its own result type.
 * --------------------------------------------------------------------------- */

type ConditionContext = {
  payload: Record<string, unknown>;
  files: Record<string, unknown>;
  latestOcrByFile: Map<string, OcrCheckRow>;
};

function evaluateFieldPresent(
  fieldKey: string,
  ctx: ConditionContext,
): AnyOfConditionResult {
  const value = ctx.payload[fieldKey];
  if (isMissing(value)) {
    return { status: "missing_data", message: `Campo "${fieldKey}" ausente.` };
  }
  return { status: "pass", message: `Campo "${fieldKey}" presente.` };
}

function evaluateFileUploaded(
  fileKey: string,
  ctx: ConditionContext,
): AnyOfConditionResult {
  const filePath = resolveFilePath(ctx.files[fileKey]);
  if (!filePath) {
    return { status: "missing_data", message: `Archivo "${fileKey}" ausente.` };
  }
  return { status: "pass", message: `Archivo "${fileKey}" cargado.` };
}

function evaluateNumberBetween(
  fieldKey: string,
  min: number | null | undefined,
  max: number | null | undefined,
  ctx: ConditionContext,
): AnyOfConditionResult {
  const numericValue = normalizeToNumber(ctx.payload[fieldKey]);
  if (numericValue === null) {
    return {
      status: "missing_data",
      message: `Valor numérico "${fieldKey}" ausente.`,
    };
  }
  if (typeof min === "number" && numericValue < min) {
    return {
      status: "fail",
      message: `"${fieldKey}" (${numericValue}) está bajo el mínimo (${min}).`,
    };
  }
  if (typeof max === "number" && numericValue > max) {
    return {
      status: "fail",
      message: `"${fieldKey}" (${numericValue}) supera el máximo (${max}).`,
    };
  }
  return {
    status: "pass",
    message: `"${fieldKey}" (${numericValue}) dentro del rango.`,
  };
}

function evaluateOcrFieldIn(
  fileKey: string,
  jsonPath: string,
  allowedValues: string[],
  caseSensitive: boolean,
  ctx: ConditionContext,
): AnyOfConditionResult {
  const ocrCheck = ctx.latestOcrByFile.get(fileKey);
  if (!ocrCheck) {
    return { status: "missing_data", message: `OCR ausente para "${fileKey}".` };
  }
  const ocrValue = normalizeToString(getOcrValueByPath({ ocrCheck, jsonPath }));
  if (!ocrValue) {
    return { status: "missing_data", message: `OCR sin valor en "${jsonPath}".` };
  }
  const compareValue = caseSensitive ? ocrValue : ocrValue.toLowerCase();
  const allowed = allowedValues.map((v) => (caseSensitive ? v : v.toLowerCase()));
  if (!allowed.includes(compareValue)) {
    return { status: "fail", message: `OCR "${jsonPath}" fuera de lista permitida.` };
  }
  return { status: "pass", message: `OCR "${jsonPath}" dentro de lista permitida.` };
}

function evaluateOcrFieldNotIn(
  fileKey: string,
  jsonPath: string,
  disallowedValues: string[],
  caseSensitive: boolean,
  ctx: ConditionContext,
): AnyOfConditionResult {
  const ocrCheck = ctx.latestOcrByFile.get(fileKey);
  if (!ocrCheck) {
    return { status: "missing_data", message: `OCR ausente para "${fileKey}".` };
  }
  const ocrValue = normalizeToString(getOcrValueByPath({ ocrCheck, jsonPath }));
  if (!ocrValue) {
    return { status: "missing_data", message: `OCR sin valor en "${jsonPath}".` };
  }
  const compareValue = caseSensitive ? ocrValue : ocrValue.toLowerCase();
  const disallowed = disallowedValues.map((v) => (caseSensitive ? v : v.toLowerCase()));
  if (disallowed.includes(compareValue)) {
    return { status: "fail", message: `OCR "${jsonPath}" cae en una excepción revisable.` };
  }
  return { status: "pass", message: `OCR "${jsonPath}" no cae en excepciones.` };
}

function evaluateFieldMatchesOcr(
  fieldKey: string,
  fileKey: string,
  jsonPath: string,
  caseSensitive: boolean,
  doNormalizeWhitespace: boolean,
  ctx: ConditionContext,
): AnyOfConditionResult {
  const payloadValueRaw = normalizeToString(ctx.payload[fieldKey]);
  if (!payloadValueRaw) {
    return { status: "missing_data", message: `Campo "${fieldKey}" ausente.` };
  }
  const ocrCheck = ctx.latestOcrByFile.get(fileKey);
  if (!ocrCheck) {
    return { status: "missing_data", message: `OCR ausente para "${fileKey}".` };
  }
  const ocrValueRaw = normalizeToString(getOcrValueByPath({ ocrCheck, jsonPath }));
  if (!ocrValueRaw) {
    return { status: "missing_data", message: `OCR sin valor en "${jsonPath}".` };
  }

  const left = normalizeComparisonString({
    value: payloadValueRaw,
    caseSensitive,
    normalizeWhitespace: doNormalizeWhitespace,
  });
  const right = normalizeComparisonString({
    value: ocrValueRaw,
    caseSensitive,
    normalizeWhitespace: doNormalizeWhitespace,
  });

  if (left !== right) {
    return { status: "fail", message: `Campo "${fieldKey}" no coincide con OCR "${jsonPath}".` };
  }
  return { status: "pass", message: `Campo "${fieldKey}" coincide con OCR "${jsonPath}".` };
}

/* ---------------------------------------------------------------------------
 * evaluateAnyOfCondition — dispatches to shared evaluators above
 * --------------------------------------------------------------------------- */

function evaluateAnyOfCondition({
  condition,
  payload,
  files,
  latestOcrByFile,
}: {
  condition: EligibilityAnyOfCondition;
  payload: Record<string, unknown>;
  files: Record<string, unknown>;
  latestOcrByFile: Map<string, OcrCheckRow>;
}): AnyOfConditionResult {
  const ctx: ConditionContext = { payload, files, latestOcrByFile };

  switch (condition.kind) {
    case "field_present":
      return evaluateFieldPresent(condition.fieldKey, ctx);
    case "file_uploaded":
      return evaluateFileUploaded(condition.fileKey, ctx);
    case "number_between":
      return evaluateNumberBetween(condition.fieldKey, condition.min, condition.max, ctx);
    case "ocr_field_in":
      return evaluateOcrFieldIn(
        condition.fileKey, condition.jsonPath, condition.allowedValues,
        condition.caseSensitive, ctx,
      );
    case "ocr_field_not_in":
      return evaluateOcrFieldNotIn(
        condition.fileKey, condition.jsonPath, condition.disallowedValues,
        condition.caseSensitive, ctx,
      );
    case "field_matches_ocr":
      return evaluateFieldMatchesOcr(
        condition.fieldKey, condition.fileKey, condition.jsonPath,
        condition.caseSensitive, condition.normalizeWhitespace ?? true, ctx,
      );
    default:
      return { status: "missing_data", message: "Condición any_of no soportada." };
  }
}

/* ---------------------------------------------------------------------------
 * Per-kind criterion evaluators (for kinds unique to top-level criteria)
 * --------------------------------------------------------------------------- */

function evaluateRecommendationsComplete(
  criterion: Extract<EligibilityRubricCriterion, { kind: "recommendations_complete" }>,
  recommendations: RecommendationRow[],
): AnyOfConditionResult {
  const roleStatuses = criterion.roles.map((role) => {
    const roleRows = recommendations.filter((r) => r.role === role);
    const requested = roleRows.length > 0;
    const completed = roleRows.some(isRecommendationComplete);
    const withContent = roleRows.some((recommendation) => {
      if (!isRecommendationComplete(recommendation)) return false;
      const responses = asRecord(recommendation.responses);
      if (!responses) return false;

      if (criterion.completenessMode === "strict_form_valid") {
        if (!isRecommendationSubmittedOnline(recommendation)) return false;
        return validateRecommendationPayload({ role: recommendation.role, payload: responses }).isValid;
      }

      const filledCount = Object.values(responses).filter((v) => !isMissing(v)).length;
      return filledCount >= (criterion.minFilledResponses ?? 0);
    });
    const manualReceivedWithoutSubmission = roleRows.some(isRecommendationManuallyReceivedOnly);
    return { role, requested, completed, withContent, manualReceivedWithoutSubmission };
  });

  const missingRequested = roleStatuses
    .filter((e) => criterion.requireRequested && !e.requested)
    .map((e) => e.role);
  if (missingRequested.length > 0) {
    return { status: "fail", message: `No se solicitaron recomendaciones para: ${missingRequested.join(", ")}.` };
  }

  const pending = roleStatuses.filter((e) => !e.completed).map((e) => e.role);
  if (pending.length > 0) {
    return { status: "fail", message: `Aún faltan recomendaciones de: ${pending.join(", ")}.` };
  }

  const incompleteContent = roleStatuses.filter((e) => !e.withContent).map((e) => e.role);
  if (incompleteContent.length > 0) {
    if (criterion.completenessMode === "strict_form_valid") {
      const manualOnly = roleStatuses
        .filter((e) => e.manualReceivedWithoutSubmission)
        .map((e) => e.role);
      if (manualOnly.length > 0) {
        return {
          status: "missing_data",
          message: `Recomendaciones de ${manualOnly.join(", ")} fueron registradas manualmente y requieren revisión.`,
        };
      }
      return {
        status: "fail",
        message: `Recomendaciones incompletas para: ${incompleteContent.join(", ")} (se requiere formulario completo y validado).`,
      };
    }
    return {
      status: "fail",
      message: `Recomendaciones incompletas para: ${incompleteContent.join(", ")} (mínimo ${criterion.minFilledResponses ?? 0} respuesta(s) no vacía(s)).`,
    };
  }

  return { status: "pass", message: "Se recibieron todas las recomendaciones requeridas." };
}

function evaluateFileUploadCountBetween(
  criterion: Extract<EligibilityRubricCriterion, { kind: "file_upload_count_between" }>,
  ctx: ConditionContext,
): AnyOfConditionResult {
  const uploadedCount = criterion.fileKeys.reduce(
    (count, fileKey) => (resolveFilePath(ctx.files[fileKey]) ? count + 1 : count),
    0,
  );

  if (uploadedCount === 0) {
    return {
      status: "missing_data",
      message: `No se encontró ningún archivo en las claves: ${criterion.fileKeys.join(", ")}.`,
    };
  }
  if (typeof criterion.minCount === "number" && uploadedCount < criterion.minCount) {
    return {
      status: "fail",
      message: `Se cargaron ${uploadedCount} archivo(s), por debajo del mínimo (${criterion.minCount}).`,
    };
  }
  if (typeof criterion.maxCount === "number" && uploadedCount > criterion.maxCount) {
    return {
      status: "fail",
      message: `Se cargaron ${uploadedCount} archivo(s), por encima del máximo (${criterion.maxCount}).`,
    };
  }
  return { status: "pass", message: `Cantidad de archivos cargados (${uploadedCount}) dentro de rango.` };
}

/* ---------------------------------------------------------------------------
 * evaluateCriterion — top-level orchestrator, delegates to shared + unique
 * evaluators and wraps into RubricCriterionResult
 * --------------------------------------------------------------------------- */

function evaluateCriterion({
  criterion,
  application,
  recommendations,
  latestOcrByFile,
}: {
  criterion: EligibilityRubricCriterion;
  application: ApplicationRow;
  recommendations: RecommendationRow[];
  latestOcrByFile: Map<string, OcrCheckRow>;
}): RubricCriterionResult {
  const payload = (application.payload as Record<string, unknown>) ?? {};
  const files = (application.files as Record<string, unknown>) ?? {};
  const ctx: ConditionContext = { payload, files, latestOcrByFile };

  const wrap = (
    raw: AnyOfConditionResult,
    decision: EligibilityOutcome | null | undefined,
  ): RubricCriterionResult => ({
    criterionId: criterion.id,
    label: criterion.label,
    kind: criterion.kind,
    status: raw.status,
    decision:
      raw.status === "pass"
        ? null
        : raw.status === "fail"
          ? (criterion.onFail ?? decision ?? null)
          : (criterion.onMissingData ?? decision ?? null),
    message: raw.message,
  });

  switch (criterion.kind) {
    case "field_present":
      return wrap(evaluateFieldPresent(criterion.fieldKey, ctx), null);

    case "all_present": {
      const missingKeys = criterion.fieldKeys.filter((k) => isMissing(payload[k]));
      if (missingKeys.length > 0) {
        return wrap({ status: "missing_data", message: `Faltan campos obligatorios: ${missingKeys.join(", ")}.` }, null);
      }
      return wrap({ status: "pass", message: "Todos los campos requeridos están presentes." }, null);
    }

    case "any_present": {
      const hasAny = criterion.fieldKeys.some((k) => !isMissing(payload[k]));
      if (!hasAny) {
        return wrap({
          status: "missing_data",
          message: `Ninguno de los campos opcionales fue completado: ${criterion.fieldKeys.join(", ")}.`,
        }, null);
      }
      return wrap({ status: "pass", message: `Se encontró al menos un campo válido en ${criterion.fieldKeys.join(", ")}.` }, null);
    }

    case "field_in": {
      const rawValue = normalizeToString(payload[criterion.fieldKey]);
      if (!rawValue) {
        return wrap({ status: "missing_data", message: `No hay valor para "${criterion.fieldKey}".` }, null);
      }
      const compareValue = criterion.caseSensitive ? rawValue : rawValue.toLowerCase();
      const allowed = criterion.allowedValues.map((v) => (criterion.caseSensitive ? v : v.toLowerCase()));
      if (!allowed.includes(compareValue)) {
        return wrap({
          status: "fail",
          message: `El valor "${rawValue}" no coincide con los permitidos: ${criterion.allowedValues.join(", ")}.`,
        }, null);
      }
      return wrap({ status: "pass", message: `El valor de "${criterion.fieldKey}" cumple los permitidos.` }, null);
    }

    case "number_between":
      return wrap(evaluateNumberBetween(criterion.fieldKey, criterion.min, criterion.max, ctx), null);

    case "file_uploaded":
      return wrap(evaluateFileUploaded(criterion.fileKey, ctx), null);

    case "recommendations_complete":
      return wrap(evaluateRecommendationsComplete(criterion, recommendations), null);

    case "ocr_confidence": {
      const ocrCheck = latestOcrByFile.get(criterion.fileKey);
      if (!ocrCheck) {
        return wrap({ status: "missing_data", message: `No existe resultado OCR para "${criterion.fileKey}".` }, null);
      }
      if (ocrCheck.confidence < criterion.minConfidence) {
        return wrap({
          status: "fail",
          message: `Confianza OCR (${ocrCheck.confidence.toFixed(2)}) bajo mínimo (${criterion.minConfidence.toFixed(2)}).`,
        }, null);
      }
      return wrap({
        status: "pass",
        message: `Confianza OCR (${ocrCheck.confidence.toFixed(2)}) cumple el mínimo (${criterion.minConfidence.toFixed(2)}).`,
      }, null);
    }

    case "ocr_field_in":
      return wrap(
        evaluateOcrFieldIn(criterion.fileKey, criterion.jsonPath, criterion.allowedValues, criterion.caseSensitive, ctx),
        null,
      );

    case "ocr_field_not_in":
      return wrap(
        evaluateOcrFieldNotIn(criterion.fileKey, criterion.jsonPath, criterion.disallowedValues, criterion.caseSensitive, ctx),
        null,
      );

    case "field_matches_ocr":
      return wrap(
        evaluateFieldMatchesOcr(
          criterion.fieldKey, criterion.fileKey, criterion.jsonPath,
          criterion.caseSensitive, criterion.normalizeWhitespace ?? true, ctx,
        ),
        null,
      );

    case "file_upload_count_between":
      return wrap(evaluateFileUploadCountBetween(criterion, ctx), null);

    case "any_of": {
      const conditionResults = criterion.conditions.map((c) =>
        evaluateAnyOfCondition({ condition: c, payload, files, latestOcrByFile }),
      );
      const passing = conditionResults.find((r) => r.status === "pass");
      if (passing) {
        return wrap({ status: "pass", message: `Cumple al menos una condición: ${passing.message}` }, null);
      }
      const hasFail = conditionResults.some((r) => r.status === "fail");
      if (hasFail) {
        return wrap({
          status: "fail",
          message: `No cumplió ninguna condición de alternativa. ${conditionResults.map((r) => r.message).join(" | ")}`,
        }, null);
      }
      return wrap({
        status: "missing_data",
        message: `No hubo evidencia suficiente para validar alternativas. ${conditionResults.map((r) => r.message).join(" | ")}`,
      }, null);
    }

    default:
      return wrap({ status: "missing_data", message: "Criterio no soportado." }, null);
  }
}

export function evaluateApplicationWithRubric({
  application,
  rubric,
  recommendations,
  latestOcrByFile,
  evaluatedAt,
}: {
  application: ApplicationRow;
  rubric: EligibilityRubricConfig;
  recommendations: RecommendationRow[];
  latestOcrByFile: Map<string, OcrCheckRow>;
  evaluatedAt?: string;
}): RubricEvaluationResult {
  const criteria = rubric.criteria.map((criterion) =>
    evaluateCriterion({
      criterion,
      application,
      recommendations,
      latestOcrByFile,
    }),
  );

  let outcome: EligibilityOutcome = "eligible";

  for (const result of criteria) {
    if (result.status === "pass") {
      continue;
    }

    if (result.decision === "not_eligible") {
      outcome = "not_eligible";
      break;
    }

    if (result.decision === "needs_review" && outcome === "eligible") {
      outcome = "needs_review";
    }
  }

  return {
    applicationId: application.id,
    stageCode: application.stage_code,
    outcome,
    criteria,
    passedCount: criteria.filter((criterion) => criterion.status === "pass").length,
    failedCount: criteria.filter((criterion) => criterion.status === "fail").length,
    needsReviewCount: criteria.filter((criterion) => criterion.decision === "needs_review").length,
    evaluatedAt: evaluatedAt ?? new Date().toISOString(),
  };
}

function pickLatestOcrChecksByApplication(
  ocrChecks: OcrCheckRow[],
): Map<string, Map<string, OcrCheckRow>> {
  const byApplication = new Map<string, Map<string, OcrCheckRow>>();

  for (const check of ocrChecks) {
    const byFile = byApplication.get(check.application_id) ?? new Map<string, OcrCheckRow>();
    const existing = byFile.get(check.file_key);

    if (!existing || Date.parse(check.created_at) > Date.parse(existing.created_at)) {
      byFile.set(check.file_key, check);
    }

    byApplication.set(check.application_id, byFile);
  }

  return byApplication;
}

function getRubricFromTemplateAdminConfig(value: unknown): EligibilityRubricConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const rubricValue = (value as Record<string, unknown>).eligibilityRubric;
  return parseEligibilityRubricConfig(rubricValue);
}

function mapOutcomeToApplicationStatus(outcome: EligibilityOutcome): ApplicationStatus {
  if (outcome === "eligible") {
    return "eligible";
  }

  if (outcome === "not_eligible") {
    return "ineligible";
  }

  return "submitted";
}

/** Load the rubric config from the stage template and validate it is enabled. */
async function loadAndValidateRubric({
  supabase,
  cycleId,
  stageCode,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
  stageCode: string;
}): Promise<EligibilityRubricConfig> {
  const { data: template, error: templateError } = await supabase
    .from("cycle_stage_templates")
    .select("id, admin_config")
    .eq("cycle_id", cycleId)
    .eq("stage_code", stageCode)
    .maybeSingle();

  if (templateError || !template) {
    throw new AppError({
      message: "Stage template not found for rubric evaluation",
      userMessage: "No se encontró la configuración de etapa para evaluar la rúbrica.",
      status: 404,
      details: templateError,
    });
  }

  const rubric = getRubricFromTemplateAdminConfig(template.admin_config);

  if (!rubric || !rubric.enabled || rubric.criteria.length === 0) {
    throw new AppError({
      message: "Eligibility rubric is missing or disabled",
      userMessage:
        "La rúbrica automática está desactivada o no tiene criterios configurados en esta etapa.",
      status: 422,
    });
  }

  return rubric;
}

/**
 * Load applications eligible for rubric evaluation, fetch their
 * recommendations and OCR checks, then evaluate each application.
 * Returns null (with an early-return result) when no applications exist.
 */
async function loadAndEvaluateApplications({
  supabase,
  input,
  rubric,
}: {
  supabase: SupabaseClient<Database>;
  input: RunEligibilityRubricInput;
  rubric: EligibilityRubricConfig;
}): Promise<{
  results: RubricEvaluationResult[];
  applicationRows: Array<Pick<ApplicationRow, "id" | "cycle_id" | "stage_code" | "status" | "payload" | "files">>;
  evaluatedAt: string;
} | null> {
  const { data: applications, error: applicationsError } = await supabase
    .from("applications")
    .select("id, cycle_id, stage_code, status, payload, files")
    .eq("cycle_id", input.cycleId)
    .eq("stage_code", input.stageCode)
    .in("status", ELIGIBILITY_SYNC_STATUSES);

  if (applicationsError) {
    throw new AppError({
      message: "Failed loading applications for rubric evaluation",
      userMessage: "No se pudieron cargar las postulaciones para ejecutar la rúbrica.",
      status: 500,
      details: applicationsError,
    });
  }

  const applicationRows = (applications ?? []) as Array<
    Pick<ApplicationRow, "id" | "cycle_id" | "stage_code" | "status" | "payload" | "files">
  >;

  if (applicationRows.length === 0) {
    return null;
  }

  const applicationIds = applicationRows.map((application) => application.id);

  const [{ data: recommendations, error: recommendationError }, { data: ocrChecks, error: ocrError }] =
    await Promise.all([
      supabase
        .from("recommendation_requests")
        .select("application_id, role, status, submitted_at, admin_received_at, responses")
        .in("application_id", applicationIds),
      supabase
        .from("application_ocr_checks")
        .select("application_id, file_key, summary, confidence, raw_response, created_at, id, actor_id")
        .in("application_id", applicationIds),
    ]);

  if (recommendationError) {
    throw new AppError({
      message: "Failed loading recommendations for rubric evaluation",
      userMessage: "No se pudieron cargar las recomendaciones para la rúbrica.",
      status: 500,
      details: recommendationError,
    });
  }

  if (ocrError) {
    throw new AppError({
      message: "Failed loading OCR checks for rubric evaluation",
      userMessage: "No se pudieron cargar los resultados OCR para la rúbrica.",
      status: 500,
      details: ocrError,
    });
  }

  const recommendationMap = new Map<string, RecommendationRow[]>();
  for (const recommendation of (recommendations ?? []) as RecommendationRow[]) {
    const current = recommendationMap.get(recommendation.application_id) ?? [];
    current.push(recommendation);
    recommendationMap.set(recommendation.application_id, current);
  }

  const latestOcrByApplication = pickLatestOcrChecksByApplication((ocrChecks ?? []) as OcrCheckRow[]);
  const evaluatedAt = new Date().toISOString();

  const results = applicationRows.map((application) => {
    const fullApplication = application as ApplicationRow;
    return evaluateApplicationWithRubric({
      application: fullApplication,
      rubric,
      recommendations: recommendationMap.get(application.id) ?? [],
      latestOcrByFile: latestOcrByApplication.get(application.id) ?? new Map<string, OcrCheckRow>(),
      evaluatedAt,
    });
  });

  return { results, applicationRows, evaluatedAt };
}

/**
 * Persist evaluation rows and sync application statuses to match rubric
 * outcomes, then return the summary counts.
 */
async function persistAndSyncStatuses({
  supabase,
  input,
  results,
  evaluatedAt,
}: {
  supabase: SupabaseClient<Database>;
  input: RunEligibilityRubricInput;
  results: RubricEvaluationResult[];
  evaluatedAt: string;
}): Promise<RunEligibilityRubricResult> {
  // 1. Upsert evaluation rows
  const evaluationRows: Database["public"]["Tables"]["application_stage_evaluations"]["Insert"][] =
    results.map((result) => ({
      application_id: result.applicationId,
      cycle_id: input.cycleId,
      stage_code: input.stageCode,
      outcome: result.outcome,
      criteria_results: result.criteria as unknown as Database["public"]["Tables"]["application_stage_evaluations"]["Insert"]["criteria_results"],
      passed_count: result.passedCount,
      failed_count: result.failedCount,
      needs_review_count: result.needsReviewCount,
      evaluated_at: result.evaluatedAt,
      evaluated_by: input.actorId,
      trigger_event: input.trigger,
    }));

  const { error: upsertEvaluationError } = await supabase
    .from("application_stage_evaluations")
    .upsert(evaluationRows, { onConflict: "application_id,stage_code" });

  if (upsertEvaluationError) {
    throw new AppError({
      message: "Failed saving rubric evaluations",
      userMessage: "No se pudieron guardar los resultados de la rúbrica.",
      status: 500,
      details: upsertEvaluationError,
    });
  }

  // 2. Group application IDs by their next status
  const nextStatusIds: Record<ApplicationStatus, string[]> = {
    draft: [],
    submitted: [],
    eligible: [],
    ineligible: [],
    advanced: [],
  };

  for (const result of results) {
    const nextStatus = mapOutcomeToApplicationStatus(result.outcome);
    nextStatusIds[nextStatus].push(result.applicationId);
  }

  // 3. Batch-update application statuses in parallel
  const [markEligible, markIneligible, markSubmitted] = await Promise.all([
    nextStatusIds.eligible.length > 0
      ? supabase
          .from("applications")
          .update({ status: "eligible", updated_at: evaluatedAt })
          .in("id", nextStatusIds.eligible)
      : Promise.resolve({ error: null }),
    nextStatusIds.ineligible.length > 0
      ? supabase
          .from("applications")
          .update({ status: "ineligible", updated_at: evaluatedAt })
          .in("id", nextStatusIds.ineligible)
      : Promise.resolve({ error: null }),
    nextStatusIds.submitted.length > 0
      ? supabase
          .from("applications")
          .update({ status: "submitted", updated_at: evaluatedAt })
          .in("id", nextStatusIds.submitted)
      : Promise.resolve({ error: null }),
  ]);

  const updateError = markEligible.error ?? markIneligible.error ?? markSubmitted.error;
  if (updateError) {
    throw new AppError({
      message: "Failed syncing application status after rubric evaluation",
      userMessage: "La rúbrica se ejecutó, pero no se pudieron sincronizar los estados de postulación.",
      status: 500,
      details: updateError,
    });
  }

  // 4. Build outcome summary
  const outcomes: Record<EligibilityOutcome, number> = {
    eligible: 0,
    not_eligible: 0,
    needs_review: 0,
  };

  for (const result of results) {
    outcomes[result.outcome] += 1;
  }

  return {
    cycleId: input.cycleId,
    stageCode: input.stageCode,
    evaluated: results.length,
    outcomes,
    statusUpdates: {
      eligible: nextStatusIds.eligible.length,
      ineligible: nextStatusIds.ineligible.length,
      submitted: nextStatusIds.submitted.length,
    },
  };
}

export async function runEligibilityRubricEvaluation({
  supabase,
  input,
}: {
  supabase: SupabaseClient<Database>;
  input: RunEligibilityRubricInput;
}): Promise<RunEligibilityRubricResult> {
  // 1. Load and validate rubric configuration
  const rubric = await loadAndValidateRubric({
    supabase,
    cycleId: input.cycleId,
    stageCode: input.stageCode,
  });

  // 2. Load applications and evaluate each against the rubric
  const evaluation = await loadAndEvaluateApplications({ supabase, input, rubric });

  if (!evaluation) {
    return {
      cycleId: input.cycleId,
      stageCode: input.stageCode,
      evaluated: 0,
      outcomes: { eligible: 0, not_eligible: 0, needs_review: 0 },
      statusUpdates: { eligible: 0, ineligible: 0, submitted: 0 },
    };
  }

  // 3. Persist evaluations and sync application statuses
  return persistAndSyncStatuses({
    supabase,
    input,
    results: evaluation.results,
    evaluatedAt: evaluation.evaluatedAt,
  });
}

export async function getLatestStageEvaluationsByApplicationId({
  supabase,
  applicationIds,
}: {
  supabase: SupabaseClient<Database>;
  applicationIds: string[];
}): Promise<Map<string, EvaluationRow>> {
  const ids = Array.from(new Set(applicationIds.filter(Boolean)));
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("application_stage_evaluations")
    .select("*")
    .in("application_id", ids);

  if (error) {
    throw new AppError({
      message: "Failed loading latest stage evaluations",
      userMessage: "No se pudieron cargar los resultados de rúbrica.",
      status: 500,
      details: error,
    });
  }

  const map = new Map<string, EvaluationRow>();
  for (const row of (data ?? []) as EvaluationRow[]) {
    map.set(`${row.application_id}:${row.stage_code}`, row);
  }

  return map;
}
