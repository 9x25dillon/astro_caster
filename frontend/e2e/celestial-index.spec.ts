import { test, expect } from "./helpers";

test("celestial index selects real chart bodies with the keyboard", async ({ page }, testInfo) => {
  await page.goto("/");
  const moon = page.getByRole("button", { name: "Inspect Moon", exact: true });
  await expect(moon).toBeVisible({ timeout: 20_000 });
  await moon.focus();
  await page.keyboard.press("Enter");
  await expect(moon).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".index-coordinate")).toContainText(/Moon/);
  await expect(page.locator(".index-coordinate")).toContainText(/\d+°/);
  await expect(page.locator(".detail")).toContainText(/Moon/);
  await page.screenshot({ path: testInfo.outputPath("observatory.png"), fullPage: true });
});

test("index fits narrow screens and honors reduced motion", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Celestial Index" })).toBeVisible();
  expect(await page.locator(".index-lattice").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("observatory-mobile.png"), fullPage: true });
});
