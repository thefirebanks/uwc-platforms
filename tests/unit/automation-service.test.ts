import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { validateApplicationBeforeSubmit } from "@/lib/server/automation-service";

const { mockGetSupabaseAdminClient } = vi.hoisted(() => ({
  mockGetSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: mockGetSupabaseAdminClient,
}));

const MIN_REQUIRED_STAGE1_PAYLOAD = {
  fullName: "Ana Pérez",
  dateOfBirth: "2008-08-08",
  nationality: "Peruana",
  schoolName: "Colegio Demo",
  gradeAverage: 16.5,
  essay: "Quiero ir a UWC para formarme en una comunidad diversa y aportar a mi entorno.",
  recommenderRequestMessage: "Gracias por apoyar mi postulación.",
};

function createSupabaseFieldsMock(
  fields: unknown[],
  recommendationRows: unknown[] = [],
  stageSections: Array<{ id: string; section_key: string; is_visible: boolean }> = [
    { id: "section-recommenders", section_key: "recommenders", is_visible: true },
  ],
) {
  const recommendationClient = {
    from(table: string) {
      if (table === "recommendation_requests") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          is: async () => ({
            data: recommendationRows,
            error: null,
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  mockGetSupabaseAdminClient.mockReturnValue(recommendationClient);

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

      if (table === "stage_sections") {
        let eqCalls = 0;
        return {
          select() {
            return this;
          },
          eq() {
            eqCalls += 1;
            if (eqCalls >= 2) {
              return Promise.resolve({
                data: stageSections,
                error: null,
              });
            }
            return this;
          },
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
          payload: MIN_REQUIRED_STAGE1_PAYLOAD,
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
    const supabase = createSupabaseFieldsMock(
      [
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
        {
          id: "f3",
          cycle_id: "cycle-1",
          stage_code: "documents",
          field_key: "recommenderRequestMessage",
          field_label: "Mensaje para recomendadores",
          field_type: "long_text",
          is_required: true,
          placeholder: null,
          help_text: null,
          sort_order: 3,
          is_active: true,
          section_id: "section-recommenders",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      [
        {
          role: "mentor",
          status: "submitted",
          submitted_at: "2026-01-01T00:00:00.000Z",
          invalidated_at: null,
        },
        {
          role: "friend",
          status: "submitted",
          submitted_at: "2026-01-01T00:00:00.000Z",
          invalidated_at: null,
        },
      ],
    );

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
          payload: MIN_REQUIRED_STAGE1_PAYLOAD,
          files: { identificationDocument: "path/file.pdf" },
          validation_notes: null,
          error_report_count: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("does not require recommendation submissions when recommenders are optional", async () => {
    const supabase = createSupabaseFieldsMock(
      [
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
        {
          id: "f3",
          cycle_id: "cycle-1",
          stage_code: "documents",
          field_key: "recommenderRequestMessage",
          field_label: "Mensaje para recomendadores",
          field_type: "long_text",
          is_required: false,
          placeholder: null,
          help_text: null,
          sort_order: 3,
          is_active: true,
          section_id: "section-recommenders",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      [],
    );

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
          payload: MIN_REQUIRED_STAGE1_PAYLOAD,
          files: { identificationDocument: "path/file.pdf" },
          validation_notes: null,
          error_report_count: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects submit when required recommender roles are not submitted", async () => {
    const supabase = createSupabaseFieldsMock(
      [
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
        {
          id: "f3",
          cycle_id: "cycle-1",
          stage_code: "documents",
          field_key: "recommenderRequestMessage",
          field_label: "Mensaje para recomendadores",
          field_type: "long_text",
          is_required: true,
          placeholder: null,
          help_text: null,
          sort_order: 3,
          is_active: true,
          section_id: "section-recommenders",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      [
        {
          role: "mentor",
          status: "submitted",
          submitted_at: "2026-01-01T00:00:00.000Z",
          invalidated_at: null,
        },
      ],
    );

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
          payload: MIN_REQUIRED_STAGE1_PAYLOAD,
          files: { identificationDocument: "path/file.pdf" },
          validation_notes: null,
          error_report_count: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
