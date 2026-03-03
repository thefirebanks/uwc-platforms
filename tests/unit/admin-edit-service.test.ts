import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminUpdateApplicationPayload,
  adminUploadFileForApplication,
  getAdminEditHistory,
} from "@/lib/server/admin-edit-service";

const baseApplication = {
  id: "app-1",
  applicant_id: "user-1",
  cycle_id: "cycle-1",
  stage_code: "documents",
  status: "submitted",
  payload: { firstName: "Juan", paternalLastName: "Perez" },
  files: {},
  validation_notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
};

/* -------------------------------------------------------------------------- */
/*  adminUpdateApplicationPayload                                             */
/* -------------------------------------------------------------------------- */

describe("adminUpdateApplicationPayload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges changes into payload and logs each field", async () => {
    const updatedApp = {
      ...baseApplication,
      payload: { firstName: "Carlos", paternalLastName: "Perez" },
    };

    // Build supabase mock
    const loadSingle = vi.fn().mockResolvedValue({ data: baseApplication, error: null });
    const updateSingle = vi.fn().mockResolvedValue({ data: updatedApp, error: null });
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "applications") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: loadSingle }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({ single: updateSingle }),
            }),
          }),
        };
      }
      if (table === "admin_edit_log") {
        return { insert: insertFn };
      }
      return {};
    });

    const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/types/supabase").Database>;

    const result = await adminUpdateApplicationPayload({
      supabase,
      applicationId: "app-1",
      changes: { firstName: "Carlos" },
      reason: "Corrección de nombre",
      actorId: "admin-1",
    });

    expect(result).toMatchObject({ id: "app-1" });

    // Verify admin_edit_log was called with the right entries
    expect(insertFn).toHaveBeenCalledWith([
      expect.objectContaining({
        application_id: "app-1",
        actor_id: "admin-1",
        edit_type: "payload",
        field_key: "firstName",
        old_value: "Juan",
        new_value: "Carlos",
        reason: "Corrección de nombre",
      }),
    ]);
  });

  it("throws 404 when application is not found", async () => {
    const loadSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });

    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: loadSingle }),
      }),
    });

    const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/types/supabase").Database>;

    await expect(
      adminUpdateApplicationPayload({
        supabase,
        applicationId: "nonexistent",
        changes: { firstName: "Carlos" },
        reason: "test",
        actorId: "admin-1",
      }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 400 when no changes are provided", async () => {
    const loadSingle = vi.fn().mockResolvedValue({ data: baseApplication, error: null });

    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: loadSingle }),
      }),
    });

    const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/types/supabase").Database>;

    await expect(
      adminUpdateApplicationPayload({
        supabase,
        applicationId: "app-1",
        changes: {},
        reason: "test",
        actorId: "admin-1",
      }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  adminUploadFileForApplication                                             */
/* -------------------------------------------------------------------------- */

describe("adminUploadFileForApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records file upload with old and new values in edit log", async () => {
    const existingFiles = { oldFile: { path: "/old", name: "old.pdf" } };
    const appWithFiles = { ...baseApplication, files: existingFiles };
    const updatedApp = {
      ...appWithFiles,
      files: {
        ...existingFiles,
        newDoc: { path: "/new", name: "new.pdf", mime_type: "application/pdf", size_bytes: 1024 },
      },
    };

    const loadSingle = vi.fn().mockResolvedValue({ data: appWithFiles, error: null });
    const updateSingle = vi.fn().mockResolvedValue({ data: updatedApp, error: null });
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "applications") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: loadSingle }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({ single: updateSingle }),
            }),
          }),
        };
      }
      if (table === "admin_edit_log") {
        return { insert: insertFn };
      }
      return {};
    });

    const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/types/supabase").Database>;

    const result = await adminUploadFileForApplication({
      supabase,
      applicationId: "app-1",
      fileKey: "newDoc",
      filePath: "/new",
      fileName: "new.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      reason: "Replaced document",
      actorId: "admin-1",
    });

    expect(result).toMatchObject({ id: "app-1" });
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        edit_type: "files",
        field_key: "newDoc",
        old_value: null, // no previous file for this key
      }),
    );
  });

  it("preserves existing metadata when replacing an uploaded file", async () => {
    const existingFiles = {
      identificationDocument: {
        path: "/old",
        title: "Documento actualizado",
        original_name: "old.pdf",
        mime_type: "application/pdf",
        size_bytes: 512,
        category: "identidad-validada",
        notes: "Nota editada por QA",
      },
    };
    const appWithFiles = { ...baseApplication, files: existingFiles };
    const updatedApp = {
      ...appWithFiles,
      files: {
        identificationDocument: {
          path: "/new",
          title: "Documento actualizado",
          original_name: "new.png",
          mime_type: "image/png",
          size_bytes: 2048,
          category: "identidad-validada",
          notes: "Nota editada por QA",
        },
      },
    };

    const loadSingle = vi.fn().mockResolvedValue({ data: appWithFiles, error: null });
    const updateSingle = vi.fn().mockResolvedValue({ data: updatedApp, error: null });
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "applications") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: loadSingle }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({ single: updateSingle }),
            }),
          }),
        };
      }
      if (table === "admin_edit_log") {
        return { insert: insertFn };
      }
      return {};
    });

    const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/types/supabase").Database>;

    await adminUploadFileForApplication({
      supabase,
      applicationId: "app-1",
      fileKey: "identificationDocument",
      filePath: "/new",
      fileName: "new.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      reason: "Updated attachment",
      actorId: "admin-1",
    });

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        new_value: expect.objectContaining({
          title: "Documento actualizado",
          category: "identidad-validada",
          notes: "Nota editada por QA",
        }),
      }),
    );
  });

  it("throws 404 when application is not found", async () => {
    const loadSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });

    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: loadSingle }),
      }),
    });

    const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/types/supabase").Database>;

    await expect(
      adminUploadFileForApplication({
        supabase,
        applicationId: "nonexistent",
        fileKey: "doc",
        filePath: "/path",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        reason: "test",
        actorId: "admin-1",
      }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getAdminEditHistory                                                       */
/* -------------------------------------------------------------------------- */

describe("getAdminEditHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns edit log entries ordered by created_at desc", async () => {
    const entries = [
      { id: "log-1", application_id: "app-1", created_at: "2026-03-01T12:00:00Z" },
      { id: "log-2", application_id: "app-1", created_at: "2026-03-01T10:00:00Z" },
    ];

    const limit = vi.fn().mockResolvedValue({ data: entries, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/types/supabase").Database>;

    const result = await getAdminEditHistory({
      supabase,
      applicationId: "app-1",
    });

    expect(result).toHaveLength(2);
    expect(from).toHaveBeenCalledWith("admin_edit_log");
    expect(eq).toHaveBeenCalledWith("application_id", "app-1");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(50); // default limit
  });

  it("throws 500 when query fails", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: "db error" } });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient<import("@/types/supabase").Database>;

    await expect(
      getAdminEditHistory({ supabase, applicationId: "app-1" }),
    ).rejects.toMatchObject({
      status: 500,
    });
  });
});
