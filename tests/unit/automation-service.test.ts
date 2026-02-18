import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { validateApplicationBeforeSubmit } from "@/lib/server/automation-service";

function createSupabaseFieldsMock(fields: unknown[]) {
  return {
    from(table: string) {
      if (table === "cycle_stage_fields") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order: async () => ({
            data: fields,
            error: null,
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("validateApplicationBeforeSubmit", () => {
  it("rejects submit when required file is missing", async () => {
    const supabase = createSupabaseFieldsMock([
      {
        id: "f1",
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
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "f2",
        cycle_id: "cycle-1",
        stage_code: "documents",
        field_key: "identificationDocument",
        field_label: "Documento de identificación",
        field_type: "file",
        is_required: true,
        placeholder: null,
        help_text: null,
        sort_order: 2,
        is_active: true,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await expect(
      validateApplicationBeforeSubmit({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        application: {
          id: "app-1",
          applicant_id: "user-1",
          cycle_id: "cycle-1",
          stage_code: "documents",
          status: "draft",
          payload: { fullName: "Ana Pérez" },
          files: {},
          validation_notes: null,
          error_report_count: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("accepts submit when required fields and files are present", async () => {
    const supabase = createSupabaseFieldsMock([
      {
        id: "f1",
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
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "f2",
        cycle_id: "cycle-1",
        stage_code: "documents",
        field_key: "identificationDocument",
        field_label: "Documento de identificación",
        field_type: "file",
        is_required: true,
        placeholder: null,
        help_text: null,
        sort_order: 2,
        is_active: true,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await expect(
      validateApplicationBeforeSubmit({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        application: {
          id: "app-1",
          applicant_id: "user-1",
          cycle_id: "cycle-1",
          stage_code: "documents",
          status: "draft",
          payload: { fullName: "Ana Pérez" },
          files: { identificationDocument: "path/file.pdf" },
          validation_notes: null,
          error_report_count: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).resolves.toBeUndefined();
  });
});
