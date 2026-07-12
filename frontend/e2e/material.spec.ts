// R-4: the material pass — the constellation path (lessons drawn like sky,
// lit by kept reflections) wired through the margin glass.
import { expect, test, openChapter } from "./helpers";

test("the Study's path is a constellation; a kept reflection lights its star", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();

  // Chapter VI opens straight to the classroom and charts the path.
  await openChapter(page, "VI");
  const stars = page.locator(".cp-star");
  await expect(page.locator(".constellation-path")).toBeVisible({ timeout: 15_000 });
  expect(await stars.count()).toBeGreaterThan(2);
  // A fresh path has no walked stars.
  await expect(page.locator(".cp-star.walked")).toHaveCount(0);

  // Selecting a star publishes its lesson into the margin glass.
  await stars.first().click();
  await expect(page.locator(".margin-note h3")).toBeVisible();
  const lesson = await page.locator(".margin-note h3").innerText();

  // Keep a reflection for it — the margin pad is prompted (the lesson's ✎).
  await page.locator(".margin-journal .jr-open").click();
  await page.locator(".margin-journal .jr-text").fill("Walked this step under a clear sky.");
  await page.locator(".margin-journal .jr-save").click();
  await expect(page.locator(".margin-journal .jr-save")).toContainText("kept");

  // Re-entering the Study, the star stays lit.
  await page.keyboard.press("Escape");
  await openChapter(page, "VI");
  await expect(page.locator(".cp-star.walked")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".cp-star.walked")).toContainText(lesson.replace(/^The /, ""));
});
