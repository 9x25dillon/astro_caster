import { test, expect, openChapter } from "./helpers";

// The Course (premium curriculum): the Classroom tab offers a Fable-composed
// course over the learning path. Free tier hits the server's 402 gate and is
// routed to the support flow — no AI work is ever attempted below oracle.
// (A real oracle-tier generation spends Fable tokens, so e2e only drives the
// gate; the offline compiler and structure are pinned by backend tests.)

test("classroom offers the course; free tier routes to support", async ({ page }) => {
  await page.goto("/");
  await openChapter(page, "II");
  await expect(page.locator(".arcana-modal")).toBeVisible();

  await page.getByRole("button", { name: "Classroom" }).click();
  // The learning path renders first (deterministic, free).
  await expect(page.locator(".arc-path")).toBeVisible({ timeout: 15_000 });

  const compose = page.getByRole("button", { name: /Compose my course/ });
  await expect(compose).toBeVisible();
  await compose.click();

  // 402 → support modal, with the course-specific explanation.
  await expect(page.locator(".modal-overlay .modal")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".arc-error")).toContainText(/Oracle tier required/);
});
