import { describe, expect, it } from "vitest";
import {
  evaluateApplicationWithRubric,
} from "@/lib/server/eligibility-rubric-service";
import type { EligibilityRubricConfig } from "@/lib/rubric/eligibility-rubric";
import type { Database } from "@/types/supabase";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type RecommendationRow = Database["public"]["Tables"]["recommendation_requests"]["Row"];
type OcrCheckRow = Database["public"]["Tables"]["application_ocr_checks"]["Row"];

function buildApplication(overrides?: Partial<ApplicationRow>): ApplicationRow {
  return {
    id: "app-1",
    applicant_id: "user-1",
    cycle_id: "cycle-1",
    stage_code: "documents",
    status: "submitted",
    payload: {
      dob: "2008-04-15",
      nationality: "Peru",
      gradeAverage: 16.2,
    },
    files: {
      idDocument: { path: "uploads/id.pdf" },
      gradesFile: { path: "uploads/grades.pdf" },
    },
    validation_notes: null,
    error_report_count: 0,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

function buildRecommendation(role: "mentor" | "friend", submitted = true): RecommendationRow {
  return {
    id: `rec-${role}`,
    application_id: "app-1",
    requester_id: "user-1",
    role,
    recommender_name: role,
    recommender_email: `${role}@example.com`,
    token: `token-${role}`,
    status: submitted ? "submitted" : "sent",
    invite_sent_at: null,
    opened_at: null,
    started_at: null,
    submitted_at: submitted ? "2026-03-02T00:00:00Z" : null,
    invalidated_at: null,
    invalidation_reason: null,
    reminder_count: 0,
    last_reminder_at: null,
    otp_code_hash: null,
    otp_sent_at: null,
    otp_attempt_count: 0,
    otp_verified_at: null,
    access_expires_at: "2026-12-31T00:00:00Z",
    session_token_hash: null,
    session_expires_at: null,
    responses: {},
    admin_received_at: null,
    admin_received_by: null,
    admin_received_reason: null,
    admin_received_file: {},
    admin_notes: null,
    created_at: "2026-03-01T00:00:00Z",
  };
}

function buildOcrCheck(confidence: number): OcrCheckRow {
  return {
    id: "ocr-1",
    application_id: "app-1",
    actor_id: "admin-1",
    file_key: "idDocument",
    summary: "ok",
    confidence,
    raw_response: {},
    created_at: "2026-03-03T00:00:00Z",
  };
}

describe("evaluateApplicationWithRubric", () => {
  it("marks application as eligible when all criteria pass", () => {
    const rubric: EligibilityRubricConfig = {
      enabled: true,
      criteria: [
        {
          id: "c1",
          label: "DOB present",
          kind: "field_present",
          fieldKey: "dob",
          onFail: "not_eligible",
          onMissingData: "needs_review",
        },
        {
          id: "c2",
          label: "Nationality allowed",
          kind: "field_in",
          fieldKey: "nationality",
          allowedValues: ["Peru", "Chile"],
          caseSensitive: false,
          onFail: "not_eligible",
          onMissingData: "needs_review",
        },
        {
          id: "c3",
          label: "Recommendations complete",
          kind: "recommendations_complete",
          roles: ["mentor", "friend"],
          requireRequested: true,
          onFail: "not_eligible",
          onMissingData: "needs_review",
        },
        {
          id: "c4",
          label: "ID OCR confidence",
          kind: "ocr_confidence",
          fileKey: "idDocument",
          minConfidence: 0.75,
          onFail: "needs_review",
          onMissingData: "needs_review",
        },
      ],
    };

    const result = evaluateApplicationWithRubric({
      application: buildApplication(),
      rubric,
      recommendations: [buildRecommendation("mentor"), buildRecommendation("friend")],
      latestOcrByFile: new Map([["idDocument", buildOcrCheck(0.9)]]),
      evaluatedAt: "2026-03-04T00:00:00Z",
    });

    expect(result.outcome).toBe("eligible");
    expect(result.failedCount).toBe(0);
    expect(result.passedCount).toBe(4);
  });

  it("marks application as needs_review when OCR evidence is missing", () => {
    const rubric: EligibilityRubricConfig = {
      enabled: true,
      criteria: [
        {
          id: "ocr",
          label: "ID OCR confidence",
          kind: "ocr_confidence",
          fileKey: "idDocument",
          minConfidence: 0.8,
          onFail: "needs_review",
          onMissingData: "needs_review",
        },
      ],
    };

    const result = evaluateApplicationWithRubric({
      application: buildApplication(),
      rubric,
      recommendations: [],
      latestOcrByFile: new Map(),
    });

    expect(result.outcome).toBe("needs_review");
    expect(result.criteria[0]?.status).toBe("missing_data");
  });

  it("marks application as not_eligible when hard criteria fail", () => {
    const rubric: EligibilityRubricConfig = {
      enabled: true,
      criteria: [
        {
          id: "nationality",
          label: "Nationality allowed",
          kind: "field_in",
          fieldKey: "nationality",
          allowedValues: ["Ecuador"],
          caseSensitive: false,
          onFail: "not_eligible",
          onMissingData: "needs_review",
        },
      ],
    };

    const result = evaluateApplicationWithRubric({
      application: buildApplication(),
      rubric,
      recommendations: [],
      latestOcrByFile: new Map(),
    });

    expect(result.outcome).toBe("not_eligible");
    expect(result.criteria[0]?.status).toBe("fail");
  });

  it("prioritizes not_eligible over needs_review when both appear", () => {
    const rubric: EligibilityRubricConfig = {
      enabled: true,
      criteria: [
        {
          id: "ocr",
          label: "ID OCR confidence",
          kind: "ocr_confidence",
          fileKey: "idDocument",
          minConfidence: 0.95,
          onFail: "needs_review",
          onMissingData: "needs_review",
        },
        {
          id: "nationality",
          label: "Nationality allowed",
          kind: "field_in",
          fieldKey: "nationality",
          allowedValues: ["Ecuador"],
          caseSensitive: false,
          onFail: "not_eligible",
          onMissingData: "needs_review",
        },
      ],
    };

    const result = evaluateApplicationWithRubric({
      application: buildApplication(),
      rubric,
      recommendations: [],
      latestOcrByFile: new Map([["idDocument", buildOcrCheck(0.5)]]),
    });

    expect(result.outcome).toBe("not_eligible");
  });

  it("supports number parsing from string payload values", () => {
    const rubric: EligibilityRubricConfig = {
      enabled: true,
      criteria: [
        {
          id: "grade_min",
          label: "Minimum grade",
          kind: "number_between",
          fieldKey: "gradeAverage",
          min: 15,
          onFail: "not_eligible",
          onMissingData: "needs_review",
        },
      ],
    };

    const result = evaluateApplicationWithRubric({
      application: buildApplication({
        payload: {
          gradeAverage: "15,8",
        },
      }),
      rubric,
      recommendations: [],
      latestOcrByFile: new Map(),
    });

    expect(result.outcome).toBe("eligible");
    expect(result.criteria[0]?.status).toBe("pass");
  });
});
