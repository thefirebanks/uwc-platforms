import { expect, test } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";

test.describe("Rubric UI Audit - Current State Screenshots", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
  });

  test("Capture current rubric wizard UI state", async ({ page }) => {
    // Login and navigate to the rubric settings
    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=settings`);
    
    // Wait for the page to fully load
    await expect(page.getByRole("button", { name: /Modo guiado \(recomendado\)/i })).toBeVisible({
      timeout: 20_000,
    });

    // Scroll down to find the rubric section
    const rubricHeader = page.getByText("Rúbrica de Elegibilidad Automática");
    await rubricHeader.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Screenshot 1: Rubric section initial state
    await page.screenshot({ 
      path: "tests/e2e/screenshots/rubric-01-initial.png",
      fullPage: false,
    });

    // Screenshot 2: Wizard Step 1 - Evidence Mapping (full view)
    const wizardSection = page.locator(".rw-shell").first();
    if (await wizardSection.isVisible()) {
      await wizardSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ 
        path: "tests/e2e/screenshots/rubric-02-step1-evidence.png",
        fullPage: true,
      });
    }

    // Screenshot 3: Scroll down to see OCR toggle area in step 1
    const ocrToggle = page.locator(".rw-ocr-toggle").first();
    if (await ocrToggle.isVisible()) {
      await ocrToggle.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ 
        path: "tests/e2e/screenshots/rubric-03-step1-ocr.png",
        fullPage: false,
      });
    }

    // Navigate to Step 2
    const continueBtn = page.getByRole("button", { name: /^Continuar$/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
      await page.waitForTimeout(500);
      
      // Check if we're on step 2 or got blocked
      const step2Visible = await page.getByText(/Definir políticas/i).isVisible().catch(() => false);
      const blockedVisible = await page.locator(".admin-feedback.error").isVisible().catch(() => false);
      
      if (step2Visible) {
        await page.screenshot({ 
          path: "tests/e2e/screenshots/rubric-04-step2-policies.png",
          fullPage: false,
        });
        
        // Navigate to Step 3
        await continueBtn.click();
        await page.waitForTimeout(500);
        
        const step3Visible = await page.getByText(/Revisar y activar/i).isVisible().catch(() => false);
        if (step3Visible) {
          await page.screenshot({ 
            path: "tests/e2e/screenshots/rubric-05-step3-review.png",
            fullPage: false,
          });
          
          // Expand all review details — use rw-check-row buttons to avoid
          // the text changing from "Detalle" → "Ocultar" shifting indexes
          const checkRows = page.locator(".rw-check-row .btn");
          const detailCount = await checkRows.count();
          for (let i = 0; i < detailCount; i++) {
            const btn = checkRows.nth(i);
            const text = await btn.textContent();
            if (text?.trim() === "Detalle") {
              await btn.click();
              await page.waitForTimeout(200);
            }
          }
          
          await page.screenshot({ 
            path: "tests/e2e/screenshots/rubric-06-step3-expanded.png",
            fullPage: true,
          });
        }
      } else if (blockedVisible) {
        // Capture the blocked state  
        await page.screenshot({ 
          path: "tests/e2e/screenshots/rubric-04-step1-blocked.png",
          fullPage: false,
        });
      }
    }

    // Screenshot: Bottom actions area
    const actionsArea = page.locator(".rw-actions").first();
    if (await actionsArea.isVisible()) {
      await actionsArea.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ 
        path: "tests/e2e/screenshots/rubric-07-actions.png",
        fullPage: false,
      });
    }
  });

  test("Capture full settings page for context", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=settings`);
    
    await expect(page.getByRole("button", { name: /Modo guiado \(recomendado\)/i })).toBeVisible({
      timeout: 20_000,
    });
    
    await page.waitForTimeout(1000);
    
    // Full page screenshot
    await page.screenshot({ 
      path: "tests/e2e/screenshots/rubric-08-full-settings-page.png",
      fullPage: true,
    });
  });
});
