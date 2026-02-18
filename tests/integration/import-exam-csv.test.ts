import { describe, expect, it } from "vitest";
import { importExamCsv } from "@/lib/server/application-service";

describe("importExamCsv", () => {
  it("simulates import and skips invalid rows", async () => {
    const csv = [
      "applicant_email,score,passed",
      "applicant.demo@uwcperu.org,16.7,true",
      ",10,false",
      "applicant.demo@uwcperu.org,not-a-number,true",
    ].join("\n");

    const result = await importExamCsv({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: {} as any,
      csv,
      actorId: "ignored-in-demo",
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(2);
  });
});
