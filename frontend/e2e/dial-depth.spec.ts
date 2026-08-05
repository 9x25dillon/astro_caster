import { test, expect, pastThreshold, openChapter } from "./helpers";

// Track E-2a — depth as STATE, not presence.
//
// The ergonomic law forbids revealing chapters over time: nodes sit at fixed
// compass positions and never move, appear, or reorder, because spatial memory
// is the whole point of the dial. So these specs care about two things — that
// the geometry is genuinely identical between a stranger's dial and a returning
// visitor's, and that an unlit chapter is explained rather than refused.

const positions = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".dial-node")].map((n) => {
      const b = n.getBoundingClientRect();
      // Relative to the dial, so a page that scrolls differently between
      // states can't masquerade as nodes having moved.
      const d = document.querySelector(".chapter-dial")!.getBoundingClientRect();
      return {
        ch: n.getAttribute("data-ch"),
        x: Math.round(b.x - d.x),
        y: Math.round(b.y - d.y),
      };
    }),
  );

test("every chapter exists from the first second, at its permanent position", async ({ page }) => {
  // E-2.1 — the map is complete and honest immediately.
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".dial-node")).toHaveCount(8);

  const first = await positions(page);
  // A stranger has only the sky, so only the Chart is lit.
  await expect(page.locator(".dial-node.waiting")).toHaveCount(7);

  // Now become someone with their own chart: several nodes light.
  await pastThreshold(page);
  await expect.poll(async () => page.locator(".dial-node.waiting").count()).toBeLessThan(7);

  const later = await positions(page);
  // The whole argument of E-2a: illumination changed, geometry did not.
  expect(later).toEqual(first);
  await expect(page.locator(".dial-node")).toHaveCount(8);
});

test("an unlit chapter is explained, never disabled", async ({ page }) => {
  // E-2.2 — it opens by click AND by its number key, and says what it needs.
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 20_000 });

  const relations = page.locator('.dial-node[data-ch="IV"]');
  await expect(relations).toHaveClass(/waiting/);
  await expect(relations).not.toBeDisabled();
  await expect(relations).toHaveAttribute("title", /Relations compares two charts/);

  await openChapter(page, "IV");
  await expect(page.locator(".chapter-needs")).toContainText(/Relations compares two charts/);

  // The keyboard route works on a waiting chapter too.
  await page.keyboard.press("Escape");
  await expect(page.locator(".threshold")).toBeVisible();
  await page.keyboard.press("5");
  await expect(page.locator(".chapter-needs")).toContainText(/Depths/);
});

test("a lit chapter carries no waiting note", async ({ page }) => {
  await pastThreshold(page);
  // The Reading has material once a real chart exists.
  await expect(page.locator('.dial-node[data-ch="II"]')).not.toHaveClass(/waiting/);
  await openChapter(page, "II");
  await expect(page.locator(".chapter-needs")).toHaveCount(0);
});

test("Relations waits for a SECOND chart, not just any chart", async ({ page }) => {
  // The one chapter whose prerequisite isn't "cast something" — worth its own
  // check, since it is the wireframe's own example of teaching by explaining.
  await pastThreshold(page);
  await expect(page.locator('.dial-node[data-ch="IV"]')).toHaveClass(/waiting/);
  await expect(page.locator('.dial-node[data-ch="IV"]'))
    .toHaveAttribute("title", /Save a second one/);
});
