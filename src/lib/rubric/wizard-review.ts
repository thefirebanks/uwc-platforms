export type RubricOcrOptionKind = "business" | "technical";

export type RubricChecklistStatus = "ok" | "missing" | "review";

export type RubricChecklistItemId = "evidence" | "ocr" | "policies" | "result";

export type RubricChecklistItem = {
  id: RubricChecklistItemId;
  label: string;
  status: RubricChecklistStatus;
  reason: string;
};

const TECHNICAL_OCR_TOKENS = new Set([
  "confidence",
  "summary",
  "raw",
  "meta",
  "metadata",
  "debug",
  "score",
  "probability",
]);

export function classifyOcrOption(optionKey: string): RubricOcrOptionKind {
  const normalized = optionKey.trim().toLowerCase();
  if (!normalized) {
    return "business";
  }

  const segments = normalized.split(/[\s._-]+/).filter(Boolean);
  if (segments.some((segment) => TECHNICAL_OCR_TOKENS.has(segment))) {
    return "technical";
  }

  return "business";
}

export function buildRubricChecklistItems({
  evidenceMissingCount,
  ocrMissingCount,
  policyMissingCount,
  hasTechnicalOcrSelection,
}: {
  evidenceMissingCount: number;
  ocrMissingCount: number;
  policyMissingCount: number;
  hasTechnicalOcrSelection: boolean;
}): RubricChecklistItem[] {
  const normalizedEvidenceMissing = Math.max(0, evidenceMissingCount);
  const normalizedOcrMissing = Math.max(0, ocrMissingCount);
  const normalizedPolicyMissing = Math.max(0, policyMissingCount);
  const hasMissing =
    normalizedEvidenceMissing > 0 || normalizedOcrMissing > 0 || normalizedPolicyMissing > 0;

  const evidenceItem: RubricChecklistItem =
    normalizedEvidenceMissing === 0
      ? {
          id: "evidence",
          label: "Evidencia",
          status: "ok",
          reason: "Campos principales completos.",
        }
      : {
          id: "evidence",
          label: "Evidencia",
          status: "missing",
          reason: `Faltan ${normalizedEvidenceMissing} configuración(es) clave.`,
        };

  const ocrItem: RubricChecklistItem =
    normalizedOcrMissing > 0
      ? {
          id: "ocr",
          label: "OCR",
          status: "missing",
          reason: `Faltan ${normalizedOcrMissing} mapeo(s) OCR requerido(s).`,
        }
      : hasTechnicalOcrSelection
        ? {
            id: "ocr",
            label: "OCR",
            status: "review",
            reason: "Hay mapeos OCR técnicos; confirma que sean correctos.",
          }
        : {
            id: "ocr",
            label: "OCR",
            status: "ok",
            reason: "Mapeos OCR completos.",
          };

  const policyItem: RubricChecklistItem =
    normalizedPolicyMissing === 0
      ? {
          id: "policies",
          label: "Políticas",
          status: "ok",
          reason: "Umbrales y reglas válidos.",
        }
      : {
          id: "policies",
          label: "Políticas",
          status: "missing",
          reason: `Faltan ${normalizedPolicyMissing} configuración(es) de políticas.`,
        };

  const resultItem: RubricChecklistItem = hasMissing
    ? {
        id: "result",
        label: "Resultado",
        status: "missing",
        reason: "Hay bloqueos antes de activar la rúbrica.",
      }
    : hasTechnicalOcrSelection
      ? {
          id: "result",
          label: "Resultado",
          status: "review",
          reason: "Puedes activar, pero conviene revisar mapeos OCR técnicos.",
        }
      : {
          id: "result",
          label: "Resultado",
          status: "ok",
          reason: "Listo para activar.",
        };

  return [evidenceItem, ocrItem, policyItem, resultItem];
}
