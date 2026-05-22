import { test, expect } from "@playwright/test";

test("mock-wme.html renders OpenLayers map", async ({ page }) => {
  await page.goto("http://localhost:8765/mock-wme.html");

  // Wait for the OpenLayers canvas to be rendered
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 5000 });

  // Verify the map is ready (custom flag set by HTML)
  const mapReady = await page.evaluate(() => {
    return (window as any).mapReady === true;
  });

  expect(mapReady).toBe(true);
});
