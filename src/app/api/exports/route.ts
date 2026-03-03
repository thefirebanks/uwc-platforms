import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import {
  buildApplicationsCsv,
  buildApplicationsXlsx,
  buildDynamicCsvExport,
  buildDynamicExportTable,
  buildDynamicExportXlsx,
  buildExportCatalog,
  getApplicationExportPackage,
  getApplicationsForExport,
  parseApplicationExportFilters,
  saveExportPreset,
  validateSelectedExportFields,
} from "@/lib/server/exports-service";
import { AppError } from "@/lib/errors/app-error";

function buildFileName(format: "csv" | "xlsx") {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return `applications-export-${stamp}.${format}`;
}

function buildApplicationFileName(applicationId: string) {
  return `application-${applicationId}.json`;
}

function parseSelectedFields(raw: string | null): string[] | undefined {
  if (!raw) {
    return undefined;
  }

  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  return keys.length > 0 ? keys : undefined;
}

export async function GET(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const params = request.nextUrl.searchParams;
      const applicationId = params.get("applicationId");
      const cycleId = params.get("cycleId");

      /* Single-application JSON package */
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

      if (params.get("catalog") === "1") {
        if (!cycleId) {
          throw new AppError({
            message: "Missing cycleId for export catalog",
            userMessage: "Selecciona un proceso para cargar el catalogo de exportacion.",
            status: 400,
          });
        }

        const catalog = await buildExportCatalog({
          supabase,
          cycleId,
        });

        return NextResponse.json(catalog);
      }

      /* Bulk export — CSV or XLSX */
      const format = params.get("format") === "xlsx" ? "xlsx" : "csv";
      const selectedFields = parseSelectedFields(params.get("fields") ?? params.get("columns"));
      const previewLimit = Math.min(Number(params.get("limit") ?? "5000"), 5000);

      const filters = parseApplicationExportFilters(params);
      if (selectedFields && !filters.cycleId) {
        throw new AppError({
          message: "Missing cycleId for payload-driven export",
          userMessage: "Selecciona un proceso antes de elegir campos del formulario.",
          status: 400,
        });
      }
      const catalog = filters.cycleId
        ? await buildExportCatalog({ supabase, cycleId: filters.cycleId })
        : {
            fields: [],
            presets: [],
          };
      const result = await getApplicationsForExport({ supabase, filters, maxRows: previewLimit });

      if (selectedFields && filters.cycleId) {
        const validatedFields = validateSelectedExportFields({
          selectedFields,
          catalog,
        });
        const table = buildDynamicExportTable({
          records: result.records,
          selectedFields: validatedFields,
          catalog,
        });

        if (format === "xlsx") {
          const buffer = await buildDynamicExportXlsx(table);
          return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename="${buildFileName("xlsx")}"`,
              "X-Export-Total-Rows": String(result.total),
              "X-Export-Truncated": String(result.truncated),
            },
          });
        }

        const csv = buildDynamicCsvExport(table);
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${buildFileName("csv")}"`,
            "X-Export-Total-Rows": String(result.total),
            "X-Export-Truncated": String(result.truncated),
          },
        });
      }

      if (format === "xlsx") {
        const buffer = await buildApplicationsXlsx(result.rows);
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${buildFileName("xlsx")}"`,
            "X-Export-Total-Rows": String(result.total),
            "X-Export-Truncated": String(result.truncated),
          },
        });
      }

      /* Default: CSV */
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

const presetSchema = z.object({
  cycleId: z.string().uuid(),
  presetId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(120),
  selectedFields: z.array(z.string().min(1)).min(1),
});

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const body = await request.json();
    const parsed = presetSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid export preset payload",
        userMessage: "No se pudo guardar el preset de exportacion.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const catalog = await buildExportCatalog({
      supabase,
      cycleId: parsed.data.cycleId,
    });
    const selectedFields = validateSelectedExportFields({
      selectedFields: parsed.data.selectedFields,
      catalog,
    });

    const preset = await saveExportPreset({
      supabase,
      cycleId: parsed.data.cycleId,
      presetId: parsed.data.presetId,
      createdBy: profile.id,
      name: parsed.data.name,
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
  }, { operation: "exports.save_preset" });
}
