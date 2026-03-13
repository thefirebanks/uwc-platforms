import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { recordAuditEvent } from "@/lib/logging/audit";
import { resolveDocumentStageFields } from "@/lib/stages/stage-field-fallback";
import { partitionConfigRowsById } from "@/lib/server/stage-config-persistence";
import {
  eligibilityRubricConfigSchema,
  parseEligibilityRubricConfig,
} from "@/lib/rubric/eligibility-rubric";
import {
  parseRubricBlueprintV1,
  rubricBlueprintV1Schema,
} from "@/lib/rubric/default-rubric-presets";
import {
  buildSchemaTemplateFromExpectedOutputFields,
  normalizeExpectedOutputFields,
  parseExpectedOutputFieldsFromSchemaTemplate,
} from "@/lib/ocr/expected-output-schema";
import {
  fieldAiParserSchema,
  normalizeFieldAiReferenceFiles,
} from "@/lib/ocr/field-ai-parser";
import type { CycleStageField } from "@/types/domain";
import type { Database, Json } from "@/types/supabase";

type StageFieldRow = Database["public"]["Tables"]["cycle_stage_fields"]["Row"];
type StageAutomationRow =
  Database["public"]["Tables"]["stage_automation_templates"]["Row"];
type StageTemplateRow =
  Database["public"]["Tables"]["cycle_stage_templates"]["Row"];
type StageSectionRow = Database["public"]["Tables"]["stage_sections"]["Row"];
type StageTemplateConfigRow = Pick<
  StageTemplateRow,
  "id" | "stage_label" | "due_at" | "ocr_prompt_template" | "admin_config"
>;

type StageConfigSupabase = SupabaseClient<Database>;

const fieldSchema = z.object({
  id: z.string().uuid().optional(),
  fieldKey: z.string().min(2).max(60),
  fieldLabel: z.string().min(2).max(120),
  fieldType: z.enum([
    "short_text",
    "long_text",
    "number",
    "date",
    "email",
    "file",
  ]),
  isRequired: z.boolean(),
  placeholder: z.string().max(180).nullable().optional(),
  helpText: z.string().max(220).nullable().optional(),
  groupName: z.string().trim().max(120).nullable().optional(),
  sortOrder: z.number().int().min(1).max(200),
  isActive: z.boolean().optional().default(true),
  sectionKey: z.string().min(1).max(120).nullable().optional(),
  aiParser: fieldAiParserSchema.nullable().optional(),
});

const automationSchema = z.object({
  id: z.string().uuid().optional(),
  triggerEvent: z.enum(["application_submitted", "stage_result"]),
  channel: z.literal("email").optional().default("email"),
  isEnabled: z.boolean(),
  templateSubject: z.string().min(3).max(180),
  templateBody: z.string().min(10).max(4000),
});

const settingsSchema = z.object({
  stageName: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  openDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  closeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  previousStageRequirement: z.string().min(1).max(160),
  blockIfPreviousNotMet: z.boolean(),
  eligibilityRubric: eligibilityRubricConfigSchema.optional(),
  rubricBlueprintV1: rubricBlueprintV1Schema.nullable().optional(),
  rubricMeta: z
    .object({
      presetId: z.literal("uwc_stage1"),
      compiledAt: z.string().datetime(),
      compiledBy: z.string().uuid().nullable().optional(),
      source: z.enum(["wizard", "advanced"]),
      version: z.literal(1),
    })
    .nullable()
    .optional(),
});

const sectionSchema = z.object({
  sectionKey: z.string().trim().min(1).max(120),
  title: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
  sortOrder: z.number().int().min(0).max(500),
  isVisible: z.boolean().optional().default(true),
});

export const stageConfigPatchSchema = z.object({
  fields: z.array(fieldSchema),
  automations: z.array(automationSchema),
  ocrPromptTemplate: z.string().max(5000).nullable().optional(),
  settings: settingsSchema.optional(),
  sections: z.array(sectionSchema).optional(),
});

export const stageConfigCycleIdSchema = z.string().uuid();
export const stageConfigStageIdentifierSchema = z.string().min(1).max(160);
export type StageConfigPatchPayload = z.infer<typeof stageConfigPatchSchema>;

function toIsoDateBoundary(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function defaultSectionTitle(sectionKey: string, fallbackOrder: number) {
  const normalized = sectionKey.trim();
  if (normalized === "other") {
    return "Otros campos";
  }
  if (normalized === "identity") {
    return "Datos personales";
  }
  if (normalized === "family") {
    return "Familia";
  }
  if (normalized === "school") {
    return "Información académica";
  }
  if (normalized === "motivation") {
    return "Motivación";
  }
  if (normalized === "documents") {
    return "Documentos";
  }
  if (normalized === "recommenders") {
    return "Recomendaciones";
  }
  return `Sección ${fallbackOrder}`;
}

function describePatchValidationError(
  error: z.ZodError<StageConfigPatchPayload>,
) {
  const issue = error.issues[0];
  if (!issue) {
    return "No se pudo guardar la configuración de etapa.";
  }

  const [head, second] = issue.path;
  if (head === "sections" && typeof second === "number") {
    return `La sección ${second + 1} tiene datos inválidos.`;
  }
  if (head === "settings") {
    return "Revisa los ajustes de la etapa antes de guardar.";
  }
  if (head === "fields" && typeof second === "number") {
    return `El campo ${second + 1} tiene configuración inválida.`;
  }
  if (head === "automations" && typeof second === "number") {
    return `La automatización ${second + 1} tiene datos inválidos.`;
  }

  return "No se pudo guardar la configuración de etapa.";
}

function parseStageAdminConfig(value: Json | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, Json | undefined>;

  return {
    stageName: typeof record.stageName === "string" ? record.stageName : null,
    description:
      typeof record.description === "string" ? record.description : null,
    openDate: typeof record.openDate === "string" ? record.openDate : null,
    closeDate: typeof record.closeDate === "string" ? record.closeDate : null,
    previousStageRequirement:
      typeof record.previousStageRequirement === "string"
        ? record.previousStageRequirement
        : null,
    blockIfPreviousNotMet:
      typeof record.blockIfPreviousNotMet === "boolean"
        ? record.blockIfPreviousNotMet
        : null,
    eligibilityRubric: parseEligibilityRubricConfig(record.eligibilityRubric),
    rubricBlueprintV1: parseRubricBlueprintV1(record.rubricBlueprintV1),
    rubricMeta:
      record.rubricMeta &&
      typeof record.rubricMeta === "object" &&
      !Array.isArray(record.rubricMeta)
        ? (record.rubricMeta as Record<string, Json>)
        : null,
  };
}

function normalizeAiParserConfig({
  fieldType,
  aiParser,
  fieldLabel,
}: {
  fieldType: z.infer<typeof fieldSchema>["fieldType"];
  aiParser: z.infer<typeof fieldAiParserSchema> | null | undefined;
  fieldLabel: string;
}): Json | null {
  if (!aiParser || !aiParser.enabled) {
    return null;
  }

  if (fieldType !== "file") {
    throw new AppError({
      message: "AI parser enabled for non-file field",
      userMessage: `Solo los campos de tipo Archivo pueden habilitar parsing IA. Revisa "${fieldLabel}".`,
      status: 400,
    });
  }

  const extractionInstructions = aiParser.extractionInstructions?.trim() ?? "";
  const expectedSchemaTemplate = aiParser.expectedSchemaTemplate?.trim() ?? "";
  const expectedOutputFields = normalizeExpectedOutputFields(
    aiParser.expectedOutputFields ?? [],
  );
  const referenceFiles = normalizeFieldAiReferenceFiles(
    aiParser.referenceFiles,
  );
  const inferredFieldsFromSchema =
    expectedOutputFields.length > 0
      ? expectedOutputFields
      : parseExpectedOutputFieldsFromSchemaTemplate(expectedSchemaTemplate);
  const resolvedSchemaTemplate =
    expectedSchemaTemplate ||
    (inferredFieldsFromSchema.length > 0
      ? buildSchemaTemplateFromExpectedOutputFields(inferredFieldsFromSchema)
      : "");

  if (!extractionInstructions) {
    throw new AppError({
      message: "Missing extraction instructions in AI parser config",
      userMessage: `Debes definir instrucciones de extracción para "${fieldLabel}" antes de guardar.`,
      status: 400,
    });
  }

  if (!resolvedSchemaTemplate) {
    throw new AppError({
      message: "Missing expected schema template in AI parser config",
      userMessage: `Debes definir un esquema JSON esperado para "${fieldLabel}" antes de guardar.`,
      status: 400,
    });
  }

  try {
    JSON.parse(resolvedSchemaTemplate);
  } catch (error) {
    throw new AppError({
      message: "Invalid expected schema template in AI parser config",
      userMessage: `El esquema JSON esperado de "${fieldLabel}" no es válido.`,
      status: 400,
      details: error instanceof Error ? error.message : error,
    });
  }

  return {
    enabled: true,
    modelId: aiParser.modelId?.trim() || null,
    promptTemplate: aiParser.promptTemplate?.trim() || null,
    systemPrompt: aiParser.systemPrompt?.trim() || null,
    extractionInstructions,
    expectedSchemaTemplate: resolvedSchemaTemplate,
    referenceFiles,
    expectedOutputFields:
      inferredFieldsFromSchema.length > 0
        ? inferredFieldsFromSchema
        : parseExpectedOutputFieldsFromSchemaTemplate(resolvedSchemaTemplate),
    strictSchema: aiParser.strictSchema ?? true,
  } satisfies Record<string, Json>;
}

async function ensureCycleExists({
  cycleId,
  supabase,
}: {
  cycleId: string;
  supabase: StageConfigSupabase;
}) {
  const { data, error } = await supabase
    .from("cycles")
    .select("id")
    .eq("id", cycleId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError({
      message: "Cycle not found",
      userMessage: "No se encontró el proceso de selección.",
      status: 404,
      details: error,
    });
  }
}

async function resolveTemplateByIdentifier({
  cycleId,
  stageIdentifier,
  supabase,
}: {
  cycleId: string;
  stageIdentifier: string;
  supabase: StageConfigSupabase;
}) {
  const byId = await supabase
    .from("cycle_stage_templates")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("id", stageIdentifier)
    .maybeSingle();

  if (byId.data) {
    return byId.data as StageTemplateRow;
  }

  if (byId.error) {
    throw new AppError({
      message: "Failed resolving stage template by id",
      userMessage: "No se pudo identificar la etapa.",
      status: 500,
      details: byId.error,
    });
  }

  const byCode = await supabase
    .from("cycle_stage_templates")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("stage_code", stageIdentifier)
    .maybeSingle();

  if (byCode.error || !byCode.data) {
    throw new AppError({
      message: "Stage template not found",
      userMessage: "No se encontró la etapa seleccionada.",
      status: 404,
      details: byCode.error,
    });
  }

  return byCode.data as StageTemplateRow;
}

export type CycleStageConfigResult = {
  fields: CycleStageField[];
  sections: StageSectionRow[];
  automations: StageAutomationRow[];
  ocrPromptTemplate: string | null;
  settings: {
    stageName: string;
    description: string;
    openDate: string | null;
    closeDate: string | null;
    previousStageRequirement: string;
    blockIfPreviousNotMet: boolean;
    eligibilityRubric: Json | null;
    rubricBlueprintV1: Json | null;
    rubricMeta: Json | null;
  };
};

export async function getCycleStageConfig({
  supabase,
  cycleId,
  stageIdentifier,
}: {
  supabase: StageConfigSupabase;
  cycleId: string;
  stageIdentifier: string;
}): Promise<CycleStageConfigResult> {
  await ensureCycleExists({ cycleId, supabase });
  const stageTemplate = await resolveTemplateByIdentifier({
    cycleId,
    stageIdentifier,
    supabase,
  });
  const stageCode = stageTemplate.stage_code;

  const [
    { data: fieldsData, error: fieldsError },
    { data: sectionsData, error: sectionsError },
  ] = await Promise.all([
    supabase
      .from("cycle_stage_fields")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", stageCode)
      .order("sort_order", { ascending: true }),
    supabase
      .from("stage_sections")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", stageCode)
      .order("sort_order", { ascending: true }),
  ]);

  if (fieldsError) {
    throw new AppError({
      message: "Failed loading stage fields",
      userMessage: "No se pudieron cargar los campos de la etapa.",
      status: 500,
      details: fieldsError,
    });
  }

  if (sectionsError) {
    throw new AppError({
      message: "Failed loading stage sections",
      userMessage: "No se pudieron cargar las secciones de la etapa.",
      status: 500,
      details: sectionsError,
    });
  }

  const [
    { data: automationsData, error: automationsError },
    { data: templateData, error: templateError },
  ] = await Promise.all([
    supabase
      .from("stage_automation_templates")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", stageCode)
      .order("created_at", { ascending: true }),
    supabase
      .from("cycle_stage_templates")
      .select("id, stage_label, due_at, ocr_prompt_template, admin_config")
      .eq("id", stageTemplate.id)
      .eq("cycle_id", cycleId)
      .maybeSingle(),
  ]);

  if (automationsError) {
    throw new AppError({
      message: "Failed loading stage automations",
      userMessage: "No se pudieron cargar las automatizaciones de la etapa.",
      status: 500,
      details: automationsError,
    });
  }

  if (templateError) {
    throw new AppError({
      message: "Failed loading stage template metadata",
      userMessage: "No se pudo cargar la configuración OCR de la etapa.",
      status: 500,
      details: templateError,
    });
  }

  const rawFields = ((fieldsData as StageFieldRow[] | null) ?? []).map((row) => ({
    ...row,
    section_id: row.section_id ?? null,
  }));
  const fields =
    stageCode === "documents"
      ? resolveDocumentStageFields({
          cycleId,
          fields: rawFields,
        })
      : rawFields;

  const parsedAdminConfig = parseStageAdminConfig(
    (templateData as StageTemplateConfigRow | null)?.admin_config ?? null,
  );

  return {
    fields,
    sections: (sectionsData ?? []) as StageSectionRow[],
    automations: (automationsData as StageAutomationRow[] | null) ?? [],
    ocrPromptTemplate:
      (templateData as Pick<StageTemplateRow, "ocr_prompt_template"> | null)
        ?.ocr_prompt_template ?? null,
    settings: {
      stageName:
        parsedAdminConfig.stageName ??
        (templateData as Pick<StageTemplateRow, "stage_label"> | null)
          ?.stage_label ??
        stageTemplate.stage_label,
      description: parsedAdminConfig.description ?? "",
      openDate: parsedAdminConfig.openDate ?? null,
      closeDate: parsedAdminConfig.closeDate ?? null,
      previousStageRequirement:
        parsedAdminConfig.previousStageRequirement ?? "none",
      blockIfPreviousNotMet:
        parsedAdminConfig.blockIfPreviousNotMet ?? false,
      eligibilityRubric: (parsedAdminConfig.eligibilityRubric ?? null) as Json,
      rubricBlueprintV1: (parsedAdminConfig.rubricBlueprintV1 ?? null) as Json,
      rubricMeta: (parsedAdminConfig.rubricMeta ?? null) as Json,
    },
  };
}

/* ---------------------------------------------------------------------------
 * Private sub-functions for patchCycleStageConfig
 * --------------------------------------------------------------------------- */

type ResolvedSettings = {
  stageName: string;
  description: string;
  openDate: string | null;
  closeDate: string | null;
  previousStageRequirement: string;
  blockIfPreviousNotMet: boolean;
  eligibilityRubric: ReturnType<typeof parseEligibilityRubricConfig>;
  rubricBlueprintV1: ReturnType<typeof parseRubricBlueprintV1>;
  rubricMeta: Record<string, Json> | null;
};

function resolveIncomingSettings(
  settings: z.infer<typeof settingsSchema> | undefined,
  stageTemplate: StageTemplateRow,
  existingConfig: ReturnType<typeof parseStageAdminConfig>,
): ResolvedSettings {
  if (settings) {
    return {
      stageName: settings.stageName.trim(),
      description: (settings.description ?? "").trim(),
      openDate: settings.openDate ?? null,
      closeDate: settings.closeDate ?? null,
      previousStageRequirement: settings.previousStageRequirement,
      blockIfPreviousNotMet: settings.blockIfPreviousNotMet,
      eligibilityRubric: settings.eligibilityRubric ?? null,
      rubricBlueprintV1: settings.rubricBlueprintV1 ?? null,
      rubricMeta: settings.rubricMeta ?? null,
    };
  }
  return {
    stageName: stageTemplate.stage_label,
    description: existingConfig.description ?? "",
    openDate: existingConfig.openDate ?? null,
    closeDate: existingConfig.closeDate ?? null,
    previousStageRequirement:
      existingConfig.previousStageRequirement ?? "none",
    blockIfPreviousNotMet: existingConfig.blockIfPreviousNotMet ?? false,
    eligibilityRubric: existingConfig.eligibilityRubric ?? null,
    rubricBlueprintV1: existingConfig.rubricBlueprintV1 ?? null,
    rubricMeta: existingConfig.rubricMeta ?? null,
  };
}

function validateUniqueFieldKeys(
  fields: z.infer<typeof fieldSchema>[],
): void {
  const normalizedKeys = fields.map((f) => f.fieldKey.trim());
  if (new Set(normalizedKeys).size !== normalizedKeys.length) {
    const duplicateKeys = Array.from(
      normalizedKeys.reduce((map, key) => {
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    )
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
      .sort();
    throw new AppError({
      message: "Duplicate field keys",
      userMessage: `No puedes repetir claves técnicas de campos. Claves duplicadas: ${duplicateKeys.join(", ")}.`,
      status: 400,
      details: { duplicateKeys },
    });
  }
}

function validateUniqueAutomations(
  automations: z.infer<typeof automationSchema>[],
): void {
  const keys = automations.map((a) => `${a.triggerEvent}:${a.channel}`);
  if (new Set(keys).size !== keys.length) {
    throw new AppError({
      message: "Duplicate automation trigger/channel",
      userMessage: "No puedes repetir automatizaciones para el mismo evento.",
      status: 400,
    });
  }
}

async function syncStageSections(
  supabase: StageConfigSupabase,
  cycleId: string,
  stageCode: string,
  incomingSections: z.infer<typeof sectionSchema>[] | undefined,
): Promise<Map<string, string>> {
  const { data: existingSectionsData } = await supabase
    .from("stage_sections")
    .select("id, section_key")
    .eq("cycle_id", cycleId)
    .eq("stage_code", stageCode);
  const existingSections = (existingSectionsData ?? []) as Array<{
    id: string;
    section_key: string;
  }>;

  if (incomingSections) {
    const incomingKeys = new Set(
      incomingSections.map((s) => s.sectionKey.trim()),
    );
    const idsToDelete = existingSections
      .filter((s) => !incomingKeys.has(s.section_key))
      .map((s) => s.id);

    if (idsToDelete.length > 0) {
      const { error } = await supabase
        .from("stage_sections")
        .delete()
        .in("id", idsToDelete);
      if (error) {
        throw new AppError({
          message: "Failed deleting removed sections",
          userMessage: "No se pudieron guardar las secciones de la etapa.",
          status: 500,
          details: error,
        });
      }
    }

    const rows = incomingSections.map((section) => {
      const normalizedKey = section.sectionKey.trim();
      const normalizedTitle = section.title.trim();
      return {
        cycle_id: cycleId,
        stage_code: stageCode,
        section_key: normalizedKey,
        title:
          normalizedTitle ||
          defaultSectionTitle(normalizedKey, Math.max(1, section.sortOrder)),
        description: (section.description ?? "").trim(),
        sort_order: section.sortOrder,
        is_visible: section.isVisible ?? true,
      };
    });

    if (rows.length > 0) {
      const { error } = await supabase.from("stage_sections").upsert(rows, {
        onConflict: "cycle_id,stage_code,section_key",
      });
      if (error) {
        throw new AppError({
          message: "Failed upserting sections",
          userMessage: "No se pudieron guardar las secciones de la etapa.",
          status: 500,
          details: error,
        });
      }
    }
  }

  const { data: refreshed } = await supabase
    .from("stage_sections")
    .select("id, section_key")
    .eq("cycle_id", cycleId)
    .eq("stage_code", stageCode);

  return new Map(
    (
      (refreshed ?? []) as Array<{ id: string; section_key: string }>
    ).map((s) => [s.section_key, s.id]),
  );
}

async function syncStageFieldsAndAutomations(
  supabase: StageConfigSupabase,
  cycleId: string,
  stageCode: string,
  fields: z.infer<typeof fieldSchema>[],
  automations: z.infer<typeof automationSchema>[],
  sectionKeyToId: Map<string, string>,
): Promise<void> {
  const [{ data: existingFieldsData }, { data: existingAutomationsData }] =
    await Promise.all([
      supabase
        .from("cycle_stage_fields")
        .select("id")
        .eq("cycle_id", cycleId)
        .eq("stage_code", stageCode),
      supabase
        .from("stage_automation_templates")
        .select("id")
        .eq("cycle_id", cycleId)
        .eq("stage_code", stageCode),
    ]);

  const incomingFieldIds = new Set(
    fields.map((f) => f.id).filter(Boolean),
  );
  const incomingAutomationIds = new Set(
    automations.map((a) => a.id).filter(Boolean),
  );

  const fieldIdsToDelete = (existingFieldsData ?? [])
    .map((r) => r.id)
    .filter((id) => !incomingFieldIds.has(id));
  const automationIdsToDelete = (existingAutomationsData ?? [])
    .map((r) => r.id)
    .filter((id) => !incomingAutomationIds.has(id));

  // Delete removed rows
  const [deleteFieldsResult, deleteAutomationsResult] = await Promise.all([
    fieldIdsToDelete.length > 0
      ? supabase.from("cycle_stage_fields").delete().in("id", fieldIdsToDelete)
      : Promise.resolve({ error: null }),
    automationIdsToDelete.length > 0
      ? supabase
          .from("stage_automation_templates")
          .delete()
          .in("id", automationIdsToDelete)
      : Promise.resolve({ error: null }),
  ]);

  if (deleteFieldsResult.error) {
    throw new AppError({
      message: "Failed deleting removed stage fields",
      userMessage: "No se pudieron guardar los campos de la etapa.",
      status: 500,
      details: deleteFieldsResult.error,
    });
  }
  if (deleteAutomationsResult.error) {
    throw new AppError({
      message: "Failed deleting removed stage automations",
      userMessage: "No se pudieron guardar las automatizaciones de la etapa.",
      status: 500,
      details: deleteAutomationsResult.error,
    });
  }

  // Build rows
  const fieldRows = fields.map((field) => {
    const resolvedSectionId = field.sectionKey
      ? (sectionKeyToId.get(field.sectionKey.trim()) ?? null)
      : null;
    const aiParserConfig = normalizeAiParserConfig({
      fieldType: field.fieldType,
      aiParser: field.aiParser,
      fieldLabel: field.fieldLabel.trim(),
    });
    return {
      ...(field.id ? { id: field.id } : {}),
      cycle_id: cycleId,
      stage_code: stageCode,
      field_key: field.fieldKey.trim(),
      field_label: field.fieldLabel.trim(),
      field_type: field.fieldType,
      is_required: field.isRequired,
      placeholder: field.placeholder ?? null,
      help_text: field.helpText ?? null,
      group_name: field.groupName?.trim() || null,
      sort_order: field.sortOrder,
      is_active: field.isActive,
      section_id: resolvedSectionId,
      ai_parser_config: aiParserConfig,
    };
  });

  const automationRows = automations.map((a) => ({
    ...(a.id ? { id: a.id } : {}),
    cycle_id: cycleId,
    stage_code: stageCode,
    trigger_event: a.triggerEvent,
    channel: a.channel,
    is_enabled: a.isEnabled,
    template_subject: a.templateSubject,
    template_body: a.templateBody,
    updated_at: new Date().toISOString(),
  }));

  // Partition and upsert
  const { inserts: fieldInserts, updates: fieldUpdates } =
    partitionConfigRowsById(fieldRows);
  const { inserts: automationInserts, updates: automationUpdates } =
    partitionConfigRowsById(automationRows);

  const [uF, iF, uA, iA] = await Promise.all([
    fieldUpdates.length > 0
      ? supabase
          .from("cycle_stage_fields")
          .upsert(fieldUpdates, { onConflict: "id" })
      : Promise.resolve({ error: null }),
    fieldInserts.length > 0
      ? supabase.from("cycle_stage_fields").insert(fieldInserts)
      : Promise.resolve({ error: null }),
    automationUpdates.length > 0
      ? supabase
          .from("stage_automation_templates")
          .upsert(automationUpdates, { onConflict: "id" })
      : Promise.resolve({ error: null }),
    automationInserts.length > 0
      ? supabase.from("stage_automation_templates").insert(automationInserts)
      : Promise.resolve({ error: null }),
  ]);

  if (uF.error || iF.error) {
    throw new AppError({
      message: "Failed upserting stage fields",
      userMessage: "No se pudieron guardar los campos de la etapa.",
      status: 500,
      details: uF.error ?? iF.error,
    });
  }
  if (uA.error || iA.error) {
    throw new AppError({
      message: "Failed upserting stage automations",
      userMessage: "No se pudieron guardar las automatizaciones de la etapa.",
      status: 500,
      details: uA.error ?? iA.error,
    });
  }
}

async function syncCycleStageDates(
  supabase: StageConfigSupabase,
  cycleId: string,
  stageCode: string,
  settings: ResolvedSettings,
  hasIncomingSettings: boolean,
): Promise<{ openDate: string | null; closeDate: string | null }> {
  if (
    !hasIncomingSettings ||
    (stageCode !== "documents" && stageCode !== "exam_placeholder")
  ) {
    return { openDate: settings.openDate, closeDate: settings.closeDate };
  }

  const cycleDatePatch =
    stageCode === "documents"
      ? {
          stage1_open_at: toIsoDateBoundary(settings.openDate),
          stage1_close_at: toIsoDateBoundary(settings.closeDate),
        }
      : {
          stage2_open_at: toIsoDateBoundary(settings.openDate),
          stage2_close_at: toIsoDateBoundary(settings.closeDate),
        };

  const { data, error } = await supabase
    .from("cycles")
    .update(cycleDatePatch)
    .eq("id", cycleId)
    .select(
      "stage1_open_at, stage1_close_at, stage2_open_at, stage2_close_at",
    )
    .maybeSingle();

  if (error) {
    throw new AppError({
      message: "Failed saving cycle stage dates",
      userMessage: "No se pudieron guardar las fechas de la etapa.",
      status: 500,
      details: error,
    });
  }

  if (!data) {
    return { openDate: settings.openDate, closeDate: settings.closeDate };
  }

  return {
    openDate:
      stageCode === "documents"
        ? (data.stage1_open_at?.slice(0, 10) ?? null)
        : (data.stage2_open_at?.slice(0, 10) ?? null),
    closeDate:
      stageCode === "documents"
        ? (data.stage1_close_at?.slice(0, 10) ?? null)
        : (data.stage2_close_at?.slice(0, 10) ?? null),
  };
}

function buildAdminConfig(
  incomingSettings: ResolvedSettings,
  existingConfig: ReturnType<typeof parseStageAdminConfig>,
  hasIncomingSettings: boolean,
): Record<string, Json> {
  return {
    stageName: incomingSettings.stageName,
    description: incomingSettings.description,
    openDate:
      (hasIncomingSettings
        ? incomingSettings.openDate
        : existingConfig.openDate) ?? null,
    closeDate:
      (hasIncomingSettings
        ? incomingSettings.closeDate
        : existingConfig.closeDate) ?? null,
    previousStageRequirement: incomingSettings.previousStageRequirement,
    blockIfPreviousNotMet: incomingSettings.blockIfPreviousNotMet,
    eligibilityRubric: (incomingSettings.eligibilityRubric ?? null) as Json,
    rubricBlueprintV1: (incomingSettings.rubricBlueprintV1 ?? null) as Json,
    rubricMeta: (incomingSettings.rubricMeta ?? null) as Json,
  };
}

async function reloadAndSaveTemplate(
  supabase: StageConfigSupabase,
  cycleId: string,
  stageCode: string,
  stageTemplate: StageTemplateRow,
  incomingSettings: ResolvedSettings,
  adminConfig: Record<string, Json>,
  ocrPromptTemplate: string | null | undefined,
  hasIncomingSettings: boolean,
  cycleDates: { openDate: string | null; closeDate: string | null },
  actorId: string,
  stageIdentifier: string,
  requestId: string,
): Promise<CycleStageConfigResult> {
  const [
    { data: savedFieldsData, error: savedFieldsError },
    { data: savedAutomationsData, error: savedAutomationsError },
    { data: savedSectionsData, error: savedSectionsError },
  ] = await Promise.all([
    supabase
      .from("cycle_stage_fields")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", stageCode)
      .order("sort_order", { ascending: true }),
    supabase
      .from("stage_automation_templates")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", stageCode)
      .order("created_at", { ascending: true }),
    supabase
      .from("stage_sections")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", stageCode)
      .order("sort_order", { ascending: true }),
  ]);

  const trimmedOcr =
    ocrPromptTemplate && ocrPromptTemplate.trim().length > 0
      ? ocrPromptTemplate.trim()
      : null;

  const { data: savedTemplateData, error: savedTemplateError } = await supabase
    .from("cycle_stage_templates")
    .update({
      stage_label: hasIncomingSettings
        ? incomingSettings.stageName
        : stageTemplate.stage_label,
      due_at: hasIncomingSettings
        ? toIsoDateBoundary(incomingSettings.closeDate)
        : stageTemplate.due_at,
      ocr_prompt_template: trimmedOcr,
      admin_config: adminConfig,
    })
    .eq("cycle_id", cycleId)
    .eq("id", stageTemplate.id)
    .select("id, stage_label, due_at, ocr_prompt_template, admin_config")
    .maybeSingle();

  if (savedFieldsError) {
    throw new AppError({
      message: "Failed loading saved stage fields",
      userMessage: "No se pudieron guardar los campos de la etapa.",
      status: 500,
      details: savedFieldsError,
    });
  }
  if (savedAutomationsError) {
    throw new AppError({
      message: "Failed loading saved stage automations",
      userMessage: "No se pudieron guardar las automatizaciones de la etapa.",
      status: 500,
      details: savedAutomationsError,
    });
  }
  if (savedSectionsError) {
    throw new AppError({
      message: "Failed loading saved stage sections",
      userMessage: "No se pudieron guardar las secciones de la etapa.",
      status: 500,
      details: savedSectionsError,
    });
  }
  if (savedTemplateError) {
    throw new AppError({
      message: "Failed saving OCR prompt template",
      userMessage: "No se pudo guardar el prompt OCR de la etapa.",
      status: 500,
      details: savedTemplateError,
    });
  }

  const savedFields = (savedFieldsData as StageFieldRow[] | null) ?? [];
  const savedAutomations =
    (savedAutomationsData as StageAutomationRow[] | null) ?? [];
  const savedTemplate =
    (savedTemplateData as StageTemplateConfigRow | null) ?? null;
  const savedAdminConfig = parseStageAdminConfig(
    savedTemplate?.admin_config ?? null,
  );

  await recordAuditEvent({
    supabase,
    actorId,
    action: "cycle.stage_config_updated",
    metadata: {
      cycleId,
      stageIdentifier,
      stageCode,
      fieldsSaved: savedFields.length,
      automationsSaved: savedAutomations.length,
      sectionsSaved: (savedSectionsData ?? []).length,
      stageSettingsSaved: hasIncomingSettings,
      hasOcrPromptTemplate: Boolean(savedTemplate?.ocr_prompt_template),
    },
    requestId,
  });

  return {
    fields: savedFields.sort((a, b) => a.sort_order - b.sort_order),
    sections: (savedSectionsData ?? []) as StageSectionRow[],
    automations: savedAutomations,
    ocrPromptTemplate: savedTemplate?.ocr_prompt_template ?? null,
    settings: {
      stageName:
        savedAdminConfig.stageName ??
        savedTemplate?.stage_label ??
        incomingSettings.stageName,
      description: savedAdminConfig.description ?? "",
      openDate:
        (stageCode === "documents" || stageCode === "exam_placeholder"
          ? cycleDates.openDate
          : (savedAdminConfig.openDate ?? incomingSettings.openDate)) ?? null,
      closeDate:
        (stageCode === "documents" || stageCode === "exam_placeholder"
          ? cycleDates.closeDate
          : (savedAdminConfig.closeDate ?? incomingSettings.closeDate)) ?? null,
      previousStageRequirement:
        savedAdminConfig.previousStageRequirement ??
        incomingSettings.previousStageRequirement,
      blockIfPreviousNotMet:
        savedAdminConfig.blockIfPreviousNotMet ??
        incomingSettings.blockIfPreviousNotMet,
      eligibilityRubric:
        (savedAdminConfig.eligibilityRubric ??
          incomingSettings.eligibilityRubric ??
          null) as Json,
      rubricBlueprintV1:
        (savedAdminConfig.rubricBlueprintV1 ??
          incomingSettings.rubricBlueprintV1 ??
          null) as Json,
      rubricMeta:
        ((savedAdminConfig.rubricMeta as Json | null) ??
          (incomingSettings.rubricMeta as Json | null) ??
          null) as Json,
    },
  };
}

/* ---------------------------------------------------------------------------
 * Main orchestrator — now delegates to focused sub-functions above
 * --------------------------------------------------------------------------- */

export async function patchCycleStageConfig({
  supabase,
  cycleId,
  stageIdentifier,
  body,
  actorId,
  requestId,
}: {
  supabase: StageConfigSupabase;
  cycleId: string;
  stageIdentifier: string;
  body: unknown;
  actorId: string;
  requestId: string;
}): Promise<CycleStageConfigResult> {
  // 1. Validate input
  const parsed = stageConfigPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError({
      message: "Invalid stage config payload",
      userMessage: describePatchValidationError(parsed.error),
      status: 400,
      details: parsed.error.flatten(),
    });
  }

  // 2. Resolve stage template
  await ensureCycleExists({ cycleId, supabase });
  const stageTemplate = await resolveTemplateByIdentifier({
    cycleId,
    stageIdentifier,
    supabase,
  });
  const stageCode = stageTemplate.stage_code;
  const existingConfig = parseStageAdminConfig(
    stageTemplate.admin_config ?? null,
  );

  // 3. Resolve settings (incoming or existing defaults)
  const incomingSettings = resolveIncomingSettings(
    parsed.data.settings,
    stageTemplate,
    existingConfig,
  );

  // 4. Validate uniqueness constraints
  validateUniqueFieldKeys(parsed.data.fields);
  validateUniqueAutomations(parsed.data.automations);

  // 5. Sync sections → get sectionKey-to-ID map
  const sectionKeyToId = await syncStageSections(
    supabase,
    cycleId,
    stageCode,
    parsed.data.sections,
  );

  // 6. Sync fields + automations (delete/upsert)
  await syncStageFieldsAndAutomations(
    supabase,
    cycleId,
    stageCode,
    parsed.data.fields,
    parsed.data.automations,
    sectionKeyToId,
  );

  // 7. Sync cycle-level dates for special stages
  const cycleDates = await syncCycleStageDates(
    supabase,
    cycleId,
    stageCode,
    incomingSettings,
    Boolean(parsed.data.settings),
  );

  // 8. Build admin config JSON
  const adminConfig = buildAdminConfig(
    incomingSettings,
    existingConfig,
    Boolean(parsed.data.settings),
  );

  // 9. Reload all saved rows, save template, audit, and return
  return reloadAndSaveTemplate(
    supabase,
    cycleId,
    stageCode,
    stageTemplate,
    incomingSettings,
    adminConfig,
    parsed.data.ocrPromptTemplate,
    Boolean(parsed.data.settings),
    cycleDates,
    actorId,
    stageIdentifier,
    requestId,
  );
}
