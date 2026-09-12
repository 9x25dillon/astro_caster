import { test, expect } from "./helpers";

for (const viewport of [{ width: 1440, height: 720 }, { width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`active timeline stays below the wheel at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".planet-mark").first()).toBeVisible({ timeout: 20_000 });
    if (viewport.width > 900) {
      const labelsFit = await page.locator(".chapter-dial.at-rest").evaluate((dial) => {
        const bounds = dial.getBoundingClientRect();
        return [...dial.querySelectorAll("button")].every((node) => {
          const r = node.getBoundingClientRect();
          return r.left >= bounds.left && r.right <= bounds.right;
        });
      });
      expect(labelsFit).toBe(true);
    }
    const toggle = page.locator(".timeline button.chip");
    await toggle.click(); // Also guards the wheel intercepting pointer events.
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".timeline-aspects")).toBeVisible({ timeout: 20_000 });

    const date = page.getByLabel("Transit date and time", { exact: true });
    const before = await date.inputValue();
    await page.getByRole("button", { name: "Forward one month", exact: true }).click();
    await expect(date).not.toHaveValue(before);
    const stepped = await date.inputValue();
    await page.getByRole("slider", { name: "Transit date", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(date).not.toHaveValue(stepped);

    for (const y of [0, 500, 1000, 10000]) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      const geometry = await page.evaluate(() => {
        const wheel = document.querySelector(".chart-holo-stage")!.getBoundingClientRect();
        const timeline = document.querySelector(".timeline")!.getBoundingClientRect();
        return { gap: timeline.top - wheel.bottom, overflow: document.documentElement.scrollWidth - window.innerWidth };
      });
      expect(geometry.gap).toBeGreaterThanOrEqual(16);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: testInfo.outputPath("timeline-spacing.png"), fullPage: true });
  });
}
