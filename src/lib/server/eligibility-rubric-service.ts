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
  switch (condition.kind) {
    case "field_present": {
      const value = payload[condition.fieldKey];
      if (isMissing(value)) {
        return {
          status: "missing_data",
          message: `Campo "${condition.fieldKey}" ausente.`,
        };
      }
      return {
        status: "pass",
        message: `Campo "${condition.fieldKey}" presente.`,
      };
    }
    case "file_uploaded": {
      const filePath = resolveFilePath(files[condition.fileKey]);
      if (!filePath) {
        return {
          status: "missing_data",
          message: `Archivo "${condition.fileKey}" ausente.`,
        };
      }
      return {
        status: "pass",
        message: `Archivo "${condition.fileKey}" cargado.`,
      };
    }
    case "number_between": {
      const numericValue = normalizeToNumber(payload[condition.fieldKey]);
      if (numericValue === null) {
        return {
          status: "missing_data",
          message: `Valor numérico "${condition.fieldKey}" ausente.`,
        };
      }

      if (typeof condition.min === "number" && numericValue < condition.min) {
        return {
          status: "fail",
          message: `"${condition.fieldKey}" (${numericValue}) está bajo el mínimo (${condition.min}).`,
        };
      }

      if (typeof condition.max === "number" && numericValue > condition.max) {
        return {
          status: "fail",
          message: `"${condition.fieldKey}" (${numericValue}) supera el máximo (${condition.max}).`,
        };
      }

      return {
        status: "pass",
        message: `"${condition.fieldKey}" (${numericValue}) dentro del rango.`,
      };
    }
    case "ocr_field_in": {
      const ocrCheck = latestOcrByFile.get(condition.fileKey);
      if (!ocrCheck) {
        return {
          status: "missing_data",
          message: `OCR ausente para "${condition.fileKey}".`,
        };
      }

      const ocrValue = normalizeToString(
        getOcrValueByPath({
          ocrCheck,
          jsonPath: condition.jsonPath,
        }),
      );

      if (!ocrValue) {
        return {
          status: "missing_data",
          message: `OCR sin valor en "${condition.jsonPath}".`,
        };
      }

      const compareValue = condition.caseSensitive ? ocrValue : ocrValue.toLowerCase();
      const allowed = condition.allowedValues.map((value) =>
        condition.caseSensitive ? value : value.toLowerCase(),
      );

      if (!allowed.includes(compareValue)) {
        return {
          status: "fail",
          message: `OCR "${condition.jsonPath}" fuera de lista permitida.`,
        };
      }

      return {
        status: "pass",
        message: `OCR "${condition.jsonPath}" dentro de lista permitida.`,
      };
    }
    case "ocr_field_not_in": {
      const ocrCheck = latestOcrByFile.get(condition.fileKey);
      if (!ocrCheck) {
        return {
          status: "missing_data",
          message: `OCR ausente para "${condition.fileKey}".`,
        };
      }

      const ocrValue = normalizeToString(
        getOcrValueByPath({
          ocrCheck,
          jsonPath: condition.jsonPath,
        }),
      );

      if (!ocrValue) {
        return {
          status: "missing_data",
          message: `OCR sin valor en "${condition.jsonPath}".`,
        };
      }

      const compareValue = condition.caseSensitive ? ocrValue : ocrValue.toLowerCase();
      const disallowed = condition.disallowedValues.map((value) =>
        condition.caseSensitive ? value : value.toLowerCase(),
      );

      if (disallowed.includes(compareValue)) {
        return {
          status: "fail",
          message: `OCR "${condition.jsonPath}" cae en una excepción revisable.`,
        };
      }

      return {
        status: "pass",
        message: `OCR "${condition.jsonPath}" no cae en excepciones.`,
      };
    }
    case "field_matches_ocr": {
      const payloadValueRaw = normalizeToString(payload[condition.fieldKey]);
      if (!payloadValueRaw) {
        return {
          status: "missing_data",
          message: `Campo "${condition.fieldKey}" ausente.`,
        };
      }

      const ocrCheck = latestOcrByFile.get(condition.fileKey);
      if (!ocrCheck) {
        return {
          status: "missing_data",
          message: `OCR ausente para "${condition.fileKey}".`,
        };
      }

      const ocrValueRaw = normalizeToString(
        getOcrValueByPath({
          ocrCheck,
          jsonPath: condition.jsonPath,
        }),
      );
      if (!ocrValueRaw) {
        return {
          status: "missing_data",
          message: `OCR sin valor en "${condition.jsonPath}".`,
        };
      }

      const normalizeWhitespace = condition.normalizeWhitespace ?? true;
      const payloadValue = normalizeWhitespace
        ? payloadValueRaw.replace(/\s+/g, " ").trim()
        : payloadValueRaw;
      const ocrValue = normalizeWhitespace ? ocrValueRaw.replace(/\s+/g, " ").trim() : ocrValueRaw;

      const left = condition.caseSensitive ? payloadValue : payloadValue.toLowerCase();
      const right = condition.caseSensitive ? ocrValue : ocrValue.toLowerCase();

      if (left !== right) {
        return {
          status: "fail",
          message: `Campo "${condition.fieldKey}" no coincide con OCR "${condition.jsonPath}".`,
        };
      }

      return {
        status: "pass",
        message: `Campo "${condition.fieldKey}" coincide con OCR "${condition.jsonPath}".`,
      };
    }
    default: {
      return {
        status: "missing_data",
        message: "Condición any_of no soportada.",
      };
    }
  }
}

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

  const fail = (message: string): RubricCriterionResult => ({
    criterionId: criterion.id,
    label: criterion.label,
    kind: criterion.kind,
    status: "fail",
    decision: criterion.onFail,
    message,
  });

  const missing = (message: string): RubricCriterionResult => ({
    criterionId: criterion.id,
    label: criterion.label,
    kind: criterion.kind,
    status: "missing_data",
    decision: criterion.onMissingData,
    message,
  });

  const pass = (message: string): RubricCriterionResult => ({
    criterionId: criterion.id,
    label: criterion.label,
    kind: criterion.kind,
    status: "pass",
    decision: null,
    message,
  });

  switch (criterion.kind) {
    case "field_present": {
      const value = payload[criterion.fieldKey];
      if (isMissing(value)) {
        return missing(`El campo \"${criterion.fieldKey}\" está vacío o no existe.`);
      }
      return pass(`El campo \"${criterion.fieldKey}\" fue completado.`);
    }
    case "all_present": {
      const missingKeys = criterion.fieldKeys.filter((fieldKey) => isMissing(payload[fieldKey]));
      if (missingKeys.length > 0) {
        return missing(`Faltan campos obligatorios: ${missingKeys.join(", ")}.`);
      }
      return pass(`Todos los campos requeridos están presentes.`);
    }
    case "any_present": {
      const hasAny = criterion.fieldKeys.some((fieldKey) => !isMissing(payload[fieldKey]));
      if (!hasAny) {
        return missing(`Ninguno de los campos opcionales fue completado: ${criterion.fieldKeys.join(", ")}.`);
      }
      return pass(`Se encontró al menos un campo válido en ${criterion.fieldKeys.join(", ")}.`);
    }
    case "field_in": {
      const rawValue = normalizeToString(payload[criterion.fieldKey]);
      if (!rawValue) {
        return missing(`No hay valor para \"${criterion.fieldKey}\".`);
      }

      const compareValue = criterion.caseSensitive ? rawValue : rawValue.toLowerCase();
      const allowed = criterion.allowedValues.map((value) =>
        criterion.caseSensitive ? value : value.toLowerCase(),
      );

      if (!allowed.includes(compareValue)) {
        return fail(
          `El valor \"${rawValue}\" no coincide con los permitidos: ${criterion.allowedValues.join(", ")}.`,
        );
      }

      return pass(`El valor de \"${criterion.fieldKey}\" cumple los permitidos.`);
    }
    case "number_between": {
      const numericValue = normalizeToNumber(payload[criterion.fieldKey]);
      if (numericValue === null) {
        return missing(`No hay valor numérico para \"${criterion.fieldKey}\".`);
      }

      if (typeof criterion.min === "number" && numericValue < criterion.min) {
        return fail(`\"${criterion.fieldKey}\" (${numericValue}) está bajo el mínimo (${criterion.min}).`);
      }
      if (typeof criterion.max === "number" && numericValue > criterion.max) {
        return fail(`\"${criterion.fieldKey}\" (${numericValue}) supera el máximo (${criterion.max}).`);
      }

      return pass(`\"${criterion.fieldKey}\" (${numericValue}) está dentro de rango.`);
    }
    case "file_uploaded": {
      const filePath = resolveFilePath(files[criterion.fileKey]);
      if (!filePath) {
        return missing(`No se encontró archivo cargado en \"${criterion.fileKey}\".`);
      }
      return pass(`Existe archivo cargado para \"${criterion.fileKey}\".`);
    }
    case "recommendations_complete": {
      const roleStatuses = criterion.roles.map((role) => {
        const roleRows = recommendations.filter((recommendation) => recommendation.role === role);
        const requested = roleRows.length > 0;
        const completed = roleRows.some(isRecommendationComplete);
        const withContent = roleRows.some((recommendation) => {
          if (!isRecommendationComplete(recommendation)) {
            return false;
          }

          const responses = asRecord(recommendation.responses);
          if (!responses) {
            return false;
          }

          if (criterion.completenessMode === "strict_form_valid") {
            if (!isRecommendationSubmittedOnline(recommendation)) {
              return false;
            }

            const validation = validateRecommendationPayload({
              role: recommendation.role,
              payload: responses,
            });

            return validation.isValid;
          }

          const filledCount = Object.values(responses).filter((value) => !isMissing(value)).length;
          return filledCount >= (criterion.minFilledResponses ?? 0);
        });

        const manualReceivedWithoutSubmission = roleRows.some(isRecommendationManuallyReceivedOnly);
        return { role, requested, completed, withContent, manualReceivedWithoutSubmission };
      });

      const missingRequested = roleStatuses
        .filter((entry) => criterion.requireRequested && !entry.requested)
        .map((entry) => entry.role);
      if (missingRequested.length > 0) {
        return fail(`No se solicitaron recomendaciones para: ${missingRequested.join(", ")}.`);
      }

      const pending = roleStatuses
        .filter((entry) => !entry.completed)
        .map((entry) => entry.role);
      if (pending.length > 0) {
        return fail(`Aún faltan recomendaciones de: ${pending.join(", ")}.`);
      }

      const incompleteContent = roleStatuses
        .filter((entry) => !entry.withContent)
        .map((entry) => entry.role);
      if (incompleteContent.length > 0) {
        if (criterion.completenessMode === "strict_form_valid") {
          const manualReceivedOnlyRoles = roleStatuses
            .filter((entry) => entry.manualReceivedWithoutSubmission)
            .map((entry) => entry.role);

          if (manualReceivedOnlyRoles.length > 0) {
            return missing(
              `Recomendaciones de ${manualReceivedOnlyRoles.join(", ")} fueron registradas manualmente y requieren revisión.`,
            );
          }

          return fail(
            `Recomendaciones incompletas para: ${incompleteContent.join(", ")} (se requiere formulario completo y validado).`,
          );
        }

        return fail(
          `Recomendaciones incompletas para: ${incompleteContent.join(", ")} (mínimo ${
            criterion.minFilledResponses ?? 0
          } respuesta(s) no vacía(s)).`,
        );
      }

      return pass("Se recibieron todas las recomendaciones requeridas.");
    }
    case "ocr_confidence": {
      const ocrCheck = latestOcrByFile.get(criterion.fileKey);
      if (!ocrCheck) {
        return missing(`No existe resultado OCR para \"${criterion.fileKey}\".`);
      }

      if (ocrCheck.confidence < criterion.minConfidence) {
        return fail(
          `Confianza OCR (${ocrCheck.confidence.toFixed(2)}) bajo mínimo (${criterion.minConfidence.toFixed(2)}).`,
        );
      }

      return pass(
        `Confianza OCR (${ocrCheck.confidence.toFixed(2)}) cumple el mínimo (${criterion.minConfidence.toFixed(2)}).`,
      );
    }
    case "ocr_field_in": {
      const ocrCheck = latestOcrByFile.get(criterion.fileKey);
      if (!ocrCheck) {
        return missing(`No existe resultado OCR para "${criterion.fileKey}".`);
      }

      const rawValue = normalizeToString(
        getOcrValueByPath({
          ocrCheck,
          jsonPath: criterion.jsonPath,
        }),
      );

      if (!rawValue) {
        return missing(`No hay valor OCR para "${criterion.jsonPath}" en "${criterion.fileKey}".`);
      }

      const compareValue = criterion.caseSensitive ? rawValue : rawValue.toLowerCase();
      const allowed = criterion.allowedValues.map((value) =>
        criterion.caseSensitive ? value : value.toLowerCase(),
      );

      if (!allowed.includes(compareValue)) {
        return fail(
          `El valor OCR "${rawValue}" no coincide con los permitidos: ${criterion.allowedValues.join(", ")}.`,
        );
      }

      return pass(`El valor OCR en "${criterion.jsonPath}" cumple los permitidos.`);
    }
    case "ocr_field_not_in": {
      const ocrCheck = latestOcrByFile.get(criterion.fileKey);
      if (!ocrCheck) {
        return missing(`No existe resultado OCR para "${criterion.fileKey}".`);
      }

      const rawValue = normalizeToString(
        getOcrValueByPath({
          ocrCheck,
          jsonPath: criterion.jsonPath,
        }),
      );

      if (!rawValue) {
        return missing(`No hay valor OCR para "${criterion.jsonPath}" en "${criterion.fileKey}".`);
      }

      const compareValue = criterion.caseSensitive ? rawValue : rawValue.toLowerCase();
      const disallowed = criterion.disallowedValues.map((value) =>
        criterion.caseSensitive ? value : value.toLowerCase(),
      );

      if (disallowed.includes(compareValue)) {
        return fail(
          `El valor OCR "${rawValue}" está marcado para revisión: ${criterion.disallowedValues.join(", ")}.`,
        );
      }

      return pass(`El valor OCR en "${criterion.jsonPath}" no cae en estados observados.`);
    }
    case "field_matches_ocr": {
      const payloadValueRaw = normalizeToString(payload[criterion.fieldKey]);
      if (!payloadValueRaw) {
        return missing(`No hay valor para "${criterion.fieldKey}".`);
      }

      const ocrCheck = latestOcrByFile.get(criterion.fileKey);
      if (!ocrCheck) {
        return missing(`No existe resultado OCR para "${criterion.fileKey}".`);
      }

      const ocrValueRaw = normalizeToString(
        getOcrValueByPath({
          ocrCheck,
          jsonPath: criterion.jsonPath,
        }),
      );

      if (!ocrValueRaw) {
        return missing(`No hay valor OCR para "${criterion.jsonPath}" en "${criterion.fileKey}".`);
      }

      const payloadValue = normalizeComparisonString({
        value: payloadValueRaw,
        caseSensitive: criterion.caseSensitive,
        normalizeWhitespace: criterion.normalizeWhitespace ?? true,
      });
      const ocrValue = normalizeComparisonString({
        value: ocrValueRaw,
        caseSensitive: criterion.caseSensitive,
        normalizeWhitespace: criterion.normalizeWhitespace ?? true,
      });

      if (payloadValue !== ocrValue) {
        return fail(
          `El campo "${criterion.fieldKey}" no coincide con OCR "${criterion.jsonPath}".`,
        );
      }

      return pass(`El campo "${criterion.fieldKey}" coincide con el valor OCR.`);
    }
    case "file_upload_count_between": {
      const uploadedCount = criterion.fileKeys.reduce((count, fileKey) => {
        return resolveFilePath(files[fileKey]) ? count + 1 : count;
      }, 0);

      if (uploadedCount === 0) {
        return missing(
          `No se encontró ningún archivo en las claves: ${criterion.fileKeys.join(", ")}.`,
        );
      }

      if (
        typeof criterion.minCount === "number" &&
        uploadedCount < criterion.minCount
      ) {
        return fail(
          `Se cargaron ${uploadedCount} archivo(s), por debajo del mínimo (${criterion.minCount}).`,
        );
      }

      if (
        typeof criterion.maxCount === "number" &&
        uploadedCount > criterion.maxCount
      ) {
        return fail(
          `Se cargaron ${uploadedCount} archivo(s), por encima del máximo (${criterion.maxCount}).`,
        );
      }

      return pass(`Cantidad de archivos cargados (${uploadedCount}) dentro de rango.`);
    }
    case "any_of": {
      const conditionResults = criterion.conditions.map((condition) =>
        evaluateAnyOfCondition({
          condition,
          payload,
          files,
          latestOcrByFile,
        }),
      );

      const passing = conditionResults.find((result) => result.status === "pass");
      if (passing) {
        return pass(`Cumple al menos una condición: ${passing.message}`);
      }

      const hasFail = conditionResults.some((result) => result.status === "fail");
      if (hasFail) {
        return fail(
          `No cumplió ninguna condición de alternativa. ${conditionResults
            .map((result) => result.message)
            .join(" | ")}`,
        );
      }

      return missing(
        `No hubo evidencia suficiente para validar alternativas. ${conditionResults
          .map((result) => result.message)
          .join(" | ")}`,
      );
    }
    default: {
      return missing("Criterio no soportado.");
    }
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

export async function runEligibilityRubricEvaluation({
  supabase,
  input,
}: {
  supabase: SupabaseClient<Database>;
  input: RunEligibilityRubricInput;
}): Promise<RunEligibilityRubricResult> {
  const { data: template, error: templateError } = await supabase
    .from("cycle_stage_templates")
    .select("id, admin_config")
    .eq("cycle_id", input.cycleId)
    .eq("stage_code", input.stageCode)
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
    return {
      cycleId: input.cycleId,
      stageCode: input.stageCode,
      evaluated: 0,
      outcomes: {
        eligible: 0,
        not_eligible: 0,
        needs_review: 0,
      },
      statusUpdates: {
        eligible: 0,
        ineligible: 0,
        submitted: 0,
      },
    };
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
