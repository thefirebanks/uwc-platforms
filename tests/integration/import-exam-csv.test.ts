import { describe, expect, it } from "vitest";
import { importExamCsv } from "@/lib/server/application-service";

function createSupabaseMock() {
  const profileMap = new Map<string, { id: string }>([["applicant.demo@uwcperu.org", { id: "user-1" }]]);
  const appMap = new Map<string, { id: string }>([["user-1", { id: "app-1" }]]);

  const api = {
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq(column: string, value: string) {
          if (table === "profiles" && column === "email") {
            return {
              maybeSingle: async () => ({ data: profileMap.get(value) ?? null }),
            };
          }

          if (table === "applications" && column === "applicant_id") {
            return {
              maybeSingle: async () => ({ data: appMap.get(value) ?? null }),
            };
          }

          return {
            maybeSingle: async () => ({ data: null }),
          };
        },
        async insert() {
          return { error: null };
        },
      };
    },
  };

  return api;
}

describe("importExamCsv", () => {
  it("imports valid rows and skips unknown users", async () => {
    const csv = [
      "applicant_email,score,passed",
      "applicant.demo@uwcperu.org,16.7,true",
      "unknown@uwcperu.org,10,false",
    ].join("\n");

    const result = await importExamCsv({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: createSupabaseMock() as any,
      csv,
      actorId: "admin-1",
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
