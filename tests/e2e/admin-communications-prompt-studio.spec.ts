import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";

test.describe("Admin communications + prompt studio workflows", () => {
  test.beforeEach(async () => {
    test.skip(!bypassReady, "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials");
  });

  test("communications tab supports direct preview, confirm, and send flow", async ({ page }) => {
    const sendPayloads: Array<Record<string, unknown>> = [];

    await loginAsAdmin(page);

    await page.route("**/api/communications?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          logs: [],
          campaigns: [],
          summary: { queued: 0, processing: 0, sent: 0, failed: 0, total: 0 },
        }),
      });
    });

    await page.route("**/api/communications/preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          subject: "Asunto de prueba",
          bodyHtml: "<p>Hola destinatario de prueba</p>",
        }),
      });
    });

    await page.route("**/api/communications/send", async (route) => {
      const payload = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      sendPayloads.push(payload);

      if (payload.dryRun) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            recipientCount: 1,
            deduplicated: false,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          recipientCount: 1,
          deduplicated: false,
          deliveryMode: "direct",
        }),
      });
    });

    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=communications`);

    await expect(page.getByRole("heading", { name: /Centro de comunicaciones/i })).toBeVisible();

    await page.getByLabel("Correo puntual (opcional)").fill("  dafirebanks@gmail.com  ");
    await page.getByRole("button", { name: "Vista previa de audiencia" }).click();

    await expect(page.getByText("Audiencia estimada: 1 destinatario(s)")).toBeVisible();
    await expect(page.getByText("Hola destinatario de prueba")).toBeVisible();

    await page.getByRole("button", { name: "Preparar envío" }).click();
    await expect(
      page.getByText("Confirmar envío inmediato a dafirebanks@gmail.com."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Confirmar envío" }).click();
    await expect(page.getByText("Correo enviado a dafirebanks@gmail.com.")).toBeVisible();

    expect(sendPayloads.length).toBeGreaterThanOrEqual(3);
    for (const payload of sendPayloads.filter((item) => item.broadcast)) {
      const broadcast = payload.broadcast as Record<string, unknown>;
      expect(broadcast.directRecipientEmail).toBe("dafirebanks@gmail.com");
    }
  });

  test("prompt studio runs a test document and renders result + comparison panels", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const initialRun: Record<string, unknown> = {
      id: "history-1",
      cycle_id: "cycle-1",
      stage_code: "documents",
      actor_id: "admin-1",
      file_name: "history.pdf",
      file_path: "ocr-testbed/admin-1/history.pdf",
      prompt_template: "old prompt",
      model_id: "gemini-flash",
      summary: "Resultado anterior",
      confidence: 0.62,
      raw_response: {
        schemaValidation: { valid: true, errors: [] },
        injectionSignals: [],
        requestConfig: { strictSchema: true, temperature: 0.2, topP: 0.9, maxTokens: 1600 },
      },
      duration_ms: 850,
      created_at: "2026-03-03T00:00:00.000Z",
    };

    let runs: Array<Record<string, unknown>> = [initialRun];

    await page.route("**/api/ocr-testbed**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ runs }),
        });
        return;
      }

      const latestRun = {
        ...initialRun,
        id: "run-2",
        file_name: "resume.pdf",
        summary: "Resultado actual",
        confidence: 0.9,
        raw_response: {
          schemaValidation: { valid: true, errors: [] },
          injectionSignals: ["IGNORE PRIOR RULES"],
          requestConfig: {
            strictSchema: true,
            temperature: 0.2,
            topP: 0.9,
            maxTokens: 1600,
          },
        },
      };
      runs = [latestRun, ...runs].slice(0, 10);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ run: latestRun }),
      });
    });

    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=prompt_studio`);
    await expect(page.getByRole("heading", { name: "Prompt Studio" })).toBeVisible();

    await page.getByRole("button", { name: "Esquema y parámetros" }).click();
    await page
      .getByLabel("Esquema JSON esperado")
      .fill('{"summary":"string","confidence":"int","injectionSignals":["string"]}');

    await page
      .locator('input[type="file"]')
      .setInputFiles({
        name: "resume.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("fake pdf"),
      });

    await page.getByRole("button", { name: "Ejecutar prueba" }).click();

    await expect(page.getByRole("heading", { name: "Resultado actual" })).toBeVisible();
    await expect(page.getByText("Comparación")).toBeVisible();
    await expect(page.getByText("Comparativa rápida")).toBeVisible();
    await expect(page.getByText("Archivo actual: resume.pdf")).toBeVisible();
    await expect(page.getByRole("heading", { name: "history.pdf" })).toBeVisible();
  });
});
