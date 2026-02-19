import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const API_ROUTES = [
  "src/app/api/applications/[id]/files/route.ts",
  "src/app/api/applications/[id]/ocr-check/route.ts",
  "src/app/api/applications/[id]/submit/route.ts",
  "src/app/api/applications/[id]/transition/route.ts",
  "src/app/api/applications/[id]/upload-url/route.ts",
  "src/app/api/applications/[id]/validate/route.ts",
  "src/app/api/applications/route.ts",
  "src/app/api/audit/export/route.ts",
  "src/app/api/audit/route.ts",
  "src/app/api/communications/process/route.ts",
  "src/app/api/communications/route.ts",
  "src/app/api/communications/send/route.ts",
  "src/app/api/cycles/[id]/route.ts",
  "src/app/api/cycles/[id]/stages/[stageCode]/config/route.ts",
  "src/app/api/cycles/[id]/templates/route.ts",
  "src/app/api/cycles/route.ts",
  "src/app/api/errors/report/route.ts",
  "src/app/api/exam-imports/route.ts",
  "src/app/api/exports/route.ts",
  "src/app/api/me/route.ts",
  "src/app/api/recommendations/route.ts",
  "src/app/api/recommendations/[id]/remind/route.ts",
];

const ADMIN_SENSITIVE_ROUTES = [
  "src/app/api/applications/[id]/ocr-check/route.ts",
  "src/app/api/applications/[id]/transition/route.ts",
  "src/app/api/applications/[id]/validate/route.ts",
  "src/app/api/audit/export/route.ts",
  "src/app/api/audit/route.ts",
  "src/app/api/communications/process/route.ts",
  "src/app/api/communications/route.ts",
  "src/app/api/communications/send/route.ts",
  "src/app/api/cycles/[id]/route.ts",
  "src/app/api/cycles/[id]/stages/[stageCode]/config/route.ts",
  "src/app/api/cycles/[id]/templates/route.ts",
  "src/app/api/cycles/route.ts",
  "src/app/api/exam-imports/route.ts",
  "src/app/api/exports/route.ts",
];

function readRoute(routePath: string) {
  return readFileSync(join(process.cwd(), routePath), "utf8");
}

describe("access control regression guards", () => {
  it("requires explicit authentication in every API route", () => {
    for (const routePath of API_ROUTES) {
      const source = readRoute(routePath);
      expect(source, `${routePath} must call requireAuth`).toContain("requireAuth(");
    }
  });

  it("keeps admin-only guard in all sensitive routes", () => {
    for (const routePath of ADMIN_SENSITIVE_ROUTES) {
      const source = readRoute(routePath);
      expect(source, `${routePath} must enforce admin access`).toContain('requireAuth(["admin"]');
    }
  });
});
