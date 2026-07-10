import { test, expect, openChapter } from "./helpers";

test("observatory boots and casts the default chart", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".masthead h1")).toHaveText("☤ Astra");

  // The default chart auto-casts on mount; a populated wheel means the full
  // frontend → FastAPI → ephemeris path worked.
  const wheel = page.locator(".wheel-area svg").first();
  await expect(wheel).toBeVisible();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);

  // A fresh visitor is free tier.
  await expect(page.locator(".support-pill")).toHaveText(/Support \/ Unlock/);
});

test("the chapter dial navigates; positions are fixed; Esc goes home", async ({ page }) => {
  await page.goto("/");
  // All eight chapters present at their fixed positions (I..VIII, in order).
  const nodes = page.locator(".dial-node");
  await expect(nodes).toHaveCount(8);
  await expect(nodes.first()).toHaveAttribute("data-ch", "I");
  await expect(nodes.last()).toHaveAttribute("data-ch", "VIII");

  // Open a chapter: former modal content mounts in the stage.
  await openChapter(page, "II");
  await expect(page.locator(".chapter-host .arcana-modal")).toBeVisible();
  await expect(page.locator(".wheel-area > svg")).toHaveCount(0);

  // Esc is always home: the wheel returns.
  await page.keyboard.press("Escape");
  await expect(page.locator(".chapter-host")).toHaveCount(0);
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
});

test("number keys jump chapters", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").click({ position: { x: 5, y: 5 } }); // focus off inputs
  await page.keyboard.press("8");
  await expect(page.locator(".chapter-host .shelf-modal")).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
});

test("forecast opens from the controls as chapter III", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "☌ Forecast" }).click();
  await expect(page.locator(".chapter-host .forecast-modal")).toBeVisible();
});
