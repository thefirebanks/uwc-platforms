import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";
import {
  buildApplicationsCsv,
  buildApplicationsXlsx,
  EXPORTABLE_COLUMNS,
  getApplicationExportPackage,
  getApplicationsForExport,
  parseApplicationExportFilters,
  type ApplicationExportRow,
} from "@/lib/server/exports-service";

function buildFileName(format: "csv" | "xlsx") {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return `applications-export-${stamp}.${format}`;
}

function buildApplicationFileName(applicationId: string) {
  return `application-${applicationId}.json`;
}

const VALID_COLUMN_KEYS = new Set(EXPORTABLE_COLUMNS.map((c) => c.key));

function parseColumnKeys(
  raw: string | null,
): Array<keyof ApplicationExportRow> | undefined {
  if (!raw) return undefined;
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => VALID_COLUMN_KEYS.has(k as keyof ApplicationExportRow));
  return keys.length > 0
    ? (keys as Array<keyof ApplicationExportRow>)
    : undefined;
}

export async function GET(request: NextRequest) {
  return withErrorHandling(
    async () => {
      const { supabase } = await requireAuth(["admin"]);
      const params = request.nextUrl.searchParams;
      const applicationId = params.get("applicationId");

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

      /* Bulk export — CSV or XLSX */
      const format = params.get("format") === "xlsx" ? "xlsx" : "csv";
      const columnKeys = parseColumnKeys(params.get("columns"));

      const filters = parseApplicationExportFilters(params);
      const result = await getApplicationsForExport({ supabase, filters });

      if (format === "xlsx") {
        const buffer = await buildApplicationsXlsx(result.rows, columnKeys);
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
      const csv = buildApplicationsCsv(result.rows, columnKeys);
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
