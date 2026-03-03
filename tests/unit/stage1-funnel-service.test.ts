import { describe, expect, it } from "vitest";
import {
  buildStage1FunnelSummary,
  deriveStage1Blockers,
} from "@/lib/server/stage1-funnel-service";

const fields = [
  {
    id: "field-1",
    cycle_id: "cycle-1",
    stage_code: "documents",
    field_key: "fullName",
    field_label: "Nombre completo",
    field_type: "short_text",
    is_required: true,
    placeholder: null,
    help_text: null,
    sort_order: 1,
    is_active: true,
    section_id: "section-profile",
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "field-2",
    cycle_id: "cycle-1",
    stage_code: "documents",
    field_key: "identityFile",
    field_label: "Documento de identidad",
    field_type: "file",
    is_required: true,
    placeholder: null,
    help_text: null,
    sort_order: 2,
    is_active: true,
    section_id: "section-files",
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "field-3",
    cycle_id: "cycle-1",
    stage_code: "documents",
    field_key: "mentorEmail",
    field_label: "Correo del mentor",
    field_type: "email",
    is_required: true,
    placeholder: null,
    help_text: null,
    sort_order: 3,
    is_active: true,
    section_id: "section-recommenders",
    created_at: "2026-01-01T00:00:00.000Z",
  },
] as const;

const sections = [
  {
    id: "section-profile",
    section_key: "profile",
    is_visible: true,
  },
  {
    id: "section-files",
    section_key: "documents",
    is_visible: true,
  },
  {
    id: "section-recommenders",
    section_key: "recommenders",
    is_visible: true,
  },
] as const;

describe("deriveStage1Blockers", () => {
  it("reports missing fields, files, recommendations, and draft status", () => {
    const blockers = deriveStage1Blockers({
      application: {
        id: "app-1",
        status: "draft",
        payload: {},
        files: {},
      },
      fields: [...fields],
      sections: [...sections],
      recommendations: [],
    });

    expect(blockers.map((blocker) => blocker.code)).toEqual([
      "missing_required_fields",
      "missing_required_files",
      "recommendations_not_requested",
      "not_submitted",
    ]);
  });

  it("reports pending recommendations when invites exist but submissions are incomplete", () => {
    const blockers = deriveStage1Blockers({
      application: {
        id: "app-2",
        status: "submitted",
        payload: { fullName: "Maria Demo", mentorEmail: "mentor@example.com" },
        files: { identityFile: { path: "docs/id.pdf" } },
      },
      fields: [...fields],
      sections: [...sections],
      recommendations: [
        {
          role: "mentor",
          status: "submitted",
          submitted_at: "2026-01-03T00:00:00.000Z",
          admin_received_at: null,
        },
        {
          role: "friend",
          status: "sent",
          submitted_at: null,
          admin_received_at: null,
        },
      ],
    });

    expect(blockers).toEqual([
      expect.objectContaining({
        code: "recommendations_pending",
      }),
    ]);
  });
});

describe("buildStage1FunnelSummary", () => {
  it("aggregates blocker categories across applications", () => {
    const summary = buildStage1FunnelSummary([
      {
        applicationId: "app-1",
        status: "draft",
        blockers: [],
        blockerCodes: ["not_submitted", "missing_required_fields"],
        isReadyForReview: false,
      },
      {
        applicationId: "app-2",
        status: "submitted",
        blockers: [],
        blockerCodes: [],
        isReadyForReview: true,
      },
      {
        applicationId: "app-3",
        status: "submitted",
        blockers: [],
        blockerCodes: ["missing_required_files", "recommendations_pending"],
        isReadyForReview: false,
      },
    ]);

    expect(summary).toEqual({
      totalApplications: 3,
      readyForReview: 1,
      blocked: 2,
      notSubmitted: 1,
      missingRequiredFields: 1,
      missingRequiredFiles: 1,
      recommendationsNotRequested: 0,
      recommendationsPending: 1,
    });
  });
});
