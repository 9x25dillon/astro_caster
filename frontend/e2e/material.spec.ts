// R-4: the material pass — the constellation path (lessons drawn like sky,
// lit by kept reflections) wired through the margin glass.
import { expect, test, openChapter, pastThreshold } from "./helpers";

test("the Study's path is a constellation; a kept reflection lights its star", async ({ page }) => {
  // pastThreshold, not a bare goto("/"): with no birth data the observatory
  // casts THE LIVE SKY, and the learning path is derived from that chart. When
  // the anchor and growth-edge trumps land on adjacent numbers, nothing sits
  // strictly between them (build_learning_path's `lo < number < hi`), the path
  // collapses to its two endpoints, and this spec's `> 2` fails. Measured at
  // Greenwich over a full day: 2 steps 15.3% of the time, 4 steps 81.9%. So the
  // bare goto made this a test that fails for ~3.7 hours out of every 24 —
  // exactly the shape of the studio-deck duplicate-card flake, and it blocked an
  // unrelated landing-page PR twice before being diagnosed. A fixed birth is
  // deterministic (3 steps, always).
  await pastThreshold(page);

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
