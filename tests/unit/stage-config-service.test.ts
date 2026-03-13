import { describe, expect, it, vi, beforeEach } from "vitest";

/* -------------------------------------------------------------------------- */
/*  Mocks — must be declared before imports                                    */
/* -------------------------------------------------------------------------- */

const { mockRecordAuditEvent } = vi.hoisted(() => ({
  mockRecordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logging/audit", () => ({
  recordAuditEvent: mockRecordAuditEvent,
}));

import {
  stageConfigPatchSchema,
  stageConfigCycleIdSchema,
  stageConfigStageIdentifierSchema,
  patchCycleStageConfig,
} from "@/lib/server/stage-config-service";

/* -------------------------------------------------------------------------- */
/*  stageConfigCycleIdSchema                                                   */
/* -------------------------------------------------------------------------- */

describe("stageConfigCycleIdSchema", () => {
  it("accepts a valid UUID", () => {
    const result = stageConfigCycleIdSchema.safeParse("550e8400-e29b-41d4-a716-446655440000");
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID string", () => {
    const result = stageConfigCycleIdSchema.safeParse("not-a-uuid");
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = stageConfigCycleIdSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  stageConfigStageIdentifierSchema                                           */
/* -------------------------------------------------------------------------- */

describe("stageConfigStageIdentifierSchema", () => {
  it("accepts a valid stage identifier", () => {
    const result = stageConfigStageIdentifierSchema.safeParse("documents");
    expect(result.success).toBe(true);
  });

  it("rejects empty string", () => {
    const result = stageConfigStageIdentifierSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects string longer than 160 characters", () => {
    const result = stageConfigStageIdentifierSchema.safeParse("x".repeat(161));
    expect(result.success).toBe(false);
  });

  it("accepts string at boundary (160 chars)", () => {
    const result = stageConfigStageIdentifierSchema.safeParse("x".repeat(160));
    expect(result.success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  stageConfigPatchSchema — fields                                            */
/* -------------------------------------------------------------------------- */

const validField = {
  fieldKey: "first_name",
  fieldLabel: "Nombre",
  fieldType: "short_text" as const,
  isRequired: true,
  sortOrder: 1,
};

const validAutomation = {
  triggerEvent: "application_submitted" as const,
  isEnabled: true,
  templateSubject: "Gracias por tu postulación",
  templateBody: "Hemos recibido tu postulación correctamente. Te informaremos sobre los próximos pasos.",
};

const minimalValidPayload = {
  fields: [validField],
  automations: [validAutomation],
};

describe("stageConfigPatchSchema — fields", () => {
  it("accepts a minimal valid payload", () => {
    const result = stageConfigPatchSchema.safeParse(minimalValidPayload);
    expect(result.success).toBe(true);
  });

  it("rejects payload without fields array", () => {
    const result = stageConfigPatchSchema.safeParse({
      automations: [validAutomation],
    });
    expect(result.success).toBe(false);
  });

  it("rejects field with too-short fieldKey (min 2)", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      fields: [{ ...validField, fieldKey: "x" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects field with invalid fieldType", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      fields: [{ ...validField, fieldType: "checkbox" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid fieldType values", () => {
    const types = ["short_text", "long_text", "number", "date", "email", "file"] as const;
    for (const ft of types) {
      const result = stageConfigPatchSchema.safeParse({
        ...minimalValidPayload,
        fields: [{ ...validField, fieldType: ft }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts field with optional UUID id", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      fields: [{ ...validField, id: "550e8400-e29b-41d4-a716-446655440000" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects field with non-UUID id", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      fields: [{ ...validField, id: "not-a-uuid" }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults isActive to true when omitted", () => {
    const result = stageConfigPatchSchema.safeParse(minimalValidPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fields[0].isActive).toBe(true);
    }
  });

  it("accepts sortOrder at boundaries (1 and 200)", () => {
    const low = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      fields: [{ ...validField, sortOrder: 1 }],
    });
    const high = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      fields: [{ ...validField, sortOrder: 200 }],
    });
    expect(low.success).toBe(true);
    expect(high.success).toBe(true);
  });

  it("rejects sortOrder outside boundaries (0 and 201)", () => {
    const low = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      fields: [{ ...validField, sortOrder: 0 }],
    });
    const high = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      fields: [{ ...validField, sortOrder: 201 }],
    });
    expect(low.success).toBe(false);
    expect(high.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  stageConfigPatchSchema — automations                                       */
/* -------------------------------------------------------------------------- */

describe("stageConfigPatchSchema — automations", () => {
  it("rejects automation with too-short templateSubject (min 3)", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      automations: [{ ...validAutomation, templateSubject: "Hi" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects automation with too-short templateBody (min 10)", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      automations: [{ ...validAutomation, templateBody: "Short" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts stage_result trigger event", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      automations: [{ ...validAutomation, triggerEvent: "stage_result" }],
    });
    expect(result.success).toBe(true);
  });

  it("defaults channel to email when omitted", () => {
    const result = stageConfigPatchSchema.safeParse(minimalValidPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.automations[0].channel).toBe("email");
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  stageConfigPatchSchema — settings                                          */
/* -------------------------------------------------------------------------- */

describe("stageConfigPatchSchema — settings", () => {
  const validSettings = {
    stageName: "Documentos",
    previousStageRequirement: "none",
    blockIfPreviousNotMet: false,
  };

  it("accepts settings with minimum required fields", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      settings: validSettings,
    });
    expect(result.success).toBe(true);
  });

  it("rejects settings with too-short stageName", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      settings: { ...validSettings, stageName: "X" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid date strings (YYYY-MM-DD)", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      settings: {
        ...validSettings,
        openDate: "2026-01-15",
        closeDate: "2026-06-30",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      settings: { ...validSettings, openDate: "Jan 15, 2026" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts null dates", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      settings: { ...validSettings, openDate: null, closeDate: null },
    });
    expect(result.success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  stageConfigPatchSchema — sections                                          */
/* -------------------------------------------------------------------------- */

describe("stageConfigPatchSchema — sections", () => {
  it("accepts valid sections array", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      sections: [
        { sectionKey: "identity", sortOrder: 1 },
        { sectionKey: "family", sortOrder: 2 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("defaults title and description to empty strings", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      sections: [{ sectionKey: "identity", sortOrder: 1 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections![0].title).toBe("");
      expect(result.data.sections![0].description).toBe("");
    }
  });

  it("defaults isVisible to true", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      sections: [{ sectionKey: "identity", sortOrder: 1 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections![0].isVisible).toBe(true);
    }
  });

  it("rejects section with empty sectionKey", () => {
    const result = stageConfigPatchSchema.safeParse({
      ...minimalValidPayload,
      sections: [{ sectionKey: "", sortOrder: 1 }],
    });
    expect(result.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  patchCycleStageConfig — validation early exits                             */
/* -------------------------------------------------------------------------- */

describe("patchCycleStageConfig — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  const cycleId = "550e8400-e29b-41d4-a716-446655440000";
  const stageIdentifier = "documents";
  const actorId = "actor-1";
  const requestId = "req-1";
  const dummySupabase = {} as never;

  it("throws 400 for completely invalid body", async () => {
    await expect(
      patchCycleStageConfig({
        supabase: dummySupabase,
        cycleId,
        stageIdentifier,
        body: { garbage: true },
        actorId,
        requestId,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Invalid stage config payload",
    });
  });

  it("throws 400 with descriptive message for invalid field", async () => {
    await expect(
      patchCycleStageConfig({
        supabase: dummySupabase,
        cycleId,
        stageIdentifier,
        body: {
          fields: [{ fieldKey: "x", fieldLabel: "Test", fieldType: "short_text", isRequired: true, sortOrder: 1 }],
          automations: [],
        },
        actorId,
        requestId,
      }),
    ).rejects.toMatchObject({
      status: 400,
      userMessage: expect.stringContaining("campo"),
    });
  });

  it("throws 400 with descriptive message for invalid settings", async () => {
    await expect(
      patchCycleStageConfig({
        supabase: dummySupabase,
        cycleId,
        stageIdentifier,
        body: {
          fields: [validField],
          automations: [],
          settings: { stageName: "X", previousStageRequirement: "none", blockIfPreviousNotMet: false },
        },
        actorId,
        requestId,
      }),
    ).rejects.toMatchObject({
      status: 400,
      userMessage: expect.stringContaining("ajustes"),
    });
  });

  it("throws 400 with descriptive message for invalid automation", async () => {
    await expect(
      patchCycleStageConfig({
        supabase: dummySupabase,
        cycleId,
        stageIdentifier,
        body: {
          fields: [],
          automations: [{ triggerEvent: "application_submitted", isEnabled: true, templateSubject: "OK subject", templateBody: "short" }],
        },
        actorId,
        requestId,
      }),
    ).rejects.toMatchObject({
      status: 400,
      userMessage: expect.stringContaining("automatización"),
    });
  });

  it("throws 400 with descriptive message for invalid section", async () => {
    await expect(
      patchCycleStageConfig({
        supabase: dummySupabase,
        cycleId,
        stageIdentifier,
        body: {
          fields: [],
          automations: [],
          sections: [{ sectionKey: "", sortOrder: 1 }],
        },
        actorId,
        requestId,
      }),
    ).rejects.toMatchObject({
      status: 400,
      userMessage: expect.stringContaining("sección"),
    });
  });

  it("throws 404 when cycle does not exist (after schema validation)", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never;

    await expect(
      patchCycleStageConfig({
        supabase,
        cycleId,
        stageIdentifier,
        body: minimalValidPayload,
        actorId,
        requestId,
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: "Cycle not found",
    });
  });

  it("throws 400 for duplicate field keys after cycle validation", async () => {
    // Need supabase that passes ensureCycleExists and resolveTemplateByIdentifier
    const callCount: Record<string, number> = {};
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        callCount[table] = (callCount[table] ?? 0) + 1;
        if (table === "cycles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: cycleId },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "cycle_stage_templates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: "tmpl-1",
                      cycle_id: cycleId,
                      stage_code: "documents",
                      stage_label: "Documentos",
                      admin_config: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as never;

    await expect(
      patchCycleStageConfig({
        supabase,
        cycleId,
        stageIdentifier,
        body: {
          fields: [
            { ...validField, fieldKey: "dup_key", sortOrder: 1 },
            { ...validField, fieldKey: "dup_key", sortOrder: 2 },
          ],
          automations: [],
        },
        actorId,
        requestId,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Duplicate field keys",
    });
  });
});
