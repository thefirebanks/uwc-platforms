import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import {
  buildApplicationsCsv,
  buildApplicationsXlsx,
  buildExportCatalog,
  buildGroupedExportZip,
  buildMatrixCsvExport,
  buildMatrixExportResult,
  buildMatrixExportXlsx,
  getApplicationExportPackage,
  getApplicationsForExport,
  parseApplicationExportFilters,
  parseSelectedFieldsFromQuery,
  saveExportPreset,
  validateSelectedExportFields,
} from "@/lib/server/exports-service";
import { AppError } from "@/lib/errors/app-error";

function buildFileName(format: "csv" | "xlsx" | "zip") {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return `applications-export-${stamp}.${format}`;
}

function buildApplicationFileName(applicationId: string) {
  return `application-${applicationId}.json`;
}

const presetSchema = z.object({
  cycleId: z.string().uuid(),
  presetId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(120),
  selectedFields: z.array(z.string().min(1)).min(1),
});

const exportRequestSchema = z.object({
  action: z.enum(["preview", "download"]),
  cycleId: z.string().uuid(),
  stageCode: z.string().trim().optional().nullable(),
  status: z.enum(["draft", "submitted", "eligible", "ineligible", "advanced"]).optional().nullable(),
  eligibility: z.enum(["all", "eligible", "ineligible", "pending", "advanced"]).default("all"),
  query: z.string().trim().optional().nullable(),
  selectedFields: z.array(z.string().min(1)).min(1),
  format: z.enum(["csv", "xlsx"]).default("xlsx"),
  targetMode: z.enum(["filtered", "manual", "randomSample"]).default("filtered"),
  selectedApplicationIds: z.array(z.string().uuid()).optional(),
  groupAssignments: z.array(
    z.object({
      applicationId: z.string().uuid(),
      groupKey: z.string().trim().min(1).max(64),
      groupLabel: z.string().trim().min(1).max(120),
    }),
  ).optional(),
  randomSample: z.object({
    groupCount: z.number().int().min(1).max(25),
    applicantsPerGroup: z.number().int().min(1).max(100),
  }).optional(),
  groupedExportMode: z.enum(["single-sheet", "multi-sheet", "separate-files"]).default("single-sheet"),
});

export async function GET(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const params = request.nextUrl.searchParams;
      const applicationId = params.get("applicationId");
      const cycleId = params.get("cycleId");

      /* Single-application JSON export */
      if (applicationId) {
        const exportPackage = await getApplicationExportPackage({
          supabase,
          applicationId,
        });
        return new NextResponse(JSON.stringify(exportPackage, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${buildApplicationFileName(applicationId)}"`,
          },
        });
      }

      /* Export catalog */
      if (params.get("catalog") === "1") {
        if (!cycleId) {
          throw new AppError({
            message: "Missing cycleId for export catalog",
            userMessage: "Selecciona un proceso para cargar el catalogo de exportacion.",
            status: 400,
          });
        }
        const catalog = await buildExportCatalog({ supabase, cycleId });
        return NextResponse.json(catalog);
      }

      const format = params.get("format") === "xlsx" ? "xlsx" : "csv";
      const selectedFields = parseSelectedFieldsFromQuery(
        params.get("fields") ?? params.get("columns"),
      );
      const previewLimit = Math.min(Number(params.get("limit") ?? "5000"), 5000);

      const filters = parseApplicationExportFilters(params);
      if (selectedFields && !filters.cycleId) {
        throw new AppError({
          message: "Missing cycleId for payload-driven export",
          userMessage: "Selecciona un proceso antes de elegir campos del formulario.",
          status: 400,
        });
      }

      /* Matrix export via query params */
      if (selectedFields && filters.cycleId) {
        const { workbook, totalFiltered } = await buildMatrixExportResult({
          supabase,
          cycleId: filters.cycleId,
          stageCode: filters.stageCode,
          status: filters.status,
          eligibility: filters.eligibility,
          query: filters.query,
          selectedFields,
        });
        const sheet = workbook.sheets[0];
        const truncated = totalFiltered > previewLimit;

        if (format === "xlsx") {
          const buffer = await buildMatrixExportXlsx(workbook);
          return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename="${buildFileName("xlsx")}"`,
              "X-Export-Total-Rows": String(totalFiltered),
              "X-Export-Truncated": String(truncated),
            },
          });
        }

        const csv = buildMatrixCsvExport(sheet);
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${buildFileName("csv")}"`,
            "X-Export-Total-Rows": String(totalFiltered),
            "X-Export-Truncated": String(truncated),
          },
        });
      }

      /* Legacy flat export */
      const result = await getApplicationsForExport({ supabase, filters, maxRows: previewLimit });

      if (format === "xlsx") {
        const buffer = await buildApplicationsXlsx(result.rows);
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${buildFileName("xlsx")}"`,
            "X-Export-Total-Rows": String(result.total),
            "X-Export-Truncated": String(result.truncated),
          },
        });
      }

      const csv = buildApplicationsCsv(result.rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${buildFileName("csv")}"`,
          "X-Export-Total-Rows": String(result.total),
          "X-Export-Truncated": String(result.truncated),
        },
      });
    },
    { operation: "exports.applications" },
  );
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const body = await request.json();

    /* Preset save flow */
    const presetPayload = presetSchema.safeParse(body);
    if (presetPayload.success) {
      const catalog = await buildExportCatalog({
        supabase,
        cycleId: presetPayload.data.cycleId,
      });
      const selectedFields = validateSelectedExportFields({
        selectedFields: presetPayload.data.selectedFields,
        catalog,
      });

      const preset = await saveExportPreset({
        supabase,
        cycleId: presetPayload.data.cycleId,
        presetId: presetPayload.data.presetId,
        createdBy: profile.id,
        name: presetPayload.data.name,
        selectedFields,
      });

      return NextResponse.json({
        preset: {
          id: preset.id,
          name: preset.name,
          selectedFields,
          updatedAt: preset.updated_at,
        },
      });
    }

    /* Export download/preview flow */
    const parsed = exportRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError({
        message: "Invalid export request payload",
        userMessage: "No se pudo procesar la configuración de exportación.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    if (parsed.data.groupedExportMode === "multi-sheet" && parsed.data.format !== "xlsx") {
      throw new AppError({
        message: "Multi-sheet export requested for CSV",
        userMessage: "La opción de múltiples hojas solo está disponible para Excel.",
        status: 400,
      });
    }

    const { workbook, totalFiltered, exportedApplicants } = await buildMatrixExportResult({
      supabase,
      cycleId: parsed.data.cycleId,
      stageCode: parsed.data.stageCode,
      status: parsed.data.status,
      eligibility: parsed.data.eligibility,
      query: parsed.data.query,
      selectedFields: parsed.data.selectedFields,
      targetMode: parsed.data.targetMode,
      selectedApplicationIds: parsed.data.selectedApplicationIds,
      groupAssignments: parsed.data.groupAssignments,
      randomSample: parsed.data.randomSample,
      groupedExportMode: parsed.data.groupedExportMode,
    });

    if (parsed.data.action === "preview") {
      const firstSheet = workbook.sheets[0];
      return NextResponse.json({
        preview: {
          sheetName: firstSheet?.name ?? "Postulantes",
          applicantHeaders: firstSheet?.applicantHeaders ?? [],
          rows: firstSheet?.rows ?? [],
        },
        totalFiltered,
        exportedApplicants,
        sheetCount: workbook.sheets.length,
      });
    }

    if (parsed.data.groupedExportMode === "separate-files" && workbook.sheets.length > 1) {
      const archive = await buildGroupedExportZip({
        workbookData: workbook,
        format: parsed.data.format,
      });
      return new NextResponse(new Uint8Array(archive), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${buildFileName("zip")}"`,
        },
      });
    }

    if (parsed.data.format === "xlsx") {
      const buffer = await buildMatrixExportXlsx(workbook);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${buildFileName("xlsx")}"`,
        },
      });
    }

    const csv = buildMatrixCsvExport(workbook.sheets[0]);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildFileName("csv")}"`,
      },
    });
  }, { operation: "exports.download" });
}
