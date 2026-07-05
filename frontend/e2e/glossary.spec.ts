import { test, expect } from "./helpers";

// Regression: `.gloss-entry` without flex-shrink:0 let overflow:hidden zero
// each entry's flex min-size — all 40 entries crushed to ~4px and the "all"
// tab looked empty (fixed 2026-07-01).
test("glossary lists every entry at readable height", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "⊕ Glossary" }).click();

  const entries = page.locator(".gloss-entry");
  await expect.poll(() => entries.count()).toBeGreaterThan(30);

  const heights = await entries.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height)
  );
  const crushed = heights.filter((h) => h < 20);
  expect(crushed, `${crushed.length} entries under 20px`).toHaveLength(0);
});

test("glossary search narrows the list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "⊕ Glossary" }).click();

  const entries = page.locator(".gloss-entry");
  await expect.poll(() => entries.count()).toBeGreaterThan(30);
  const all = await entries.count();

  await page.getByPlaceholder("Search terms…").fill("moon");
  await expect.poll(() => entries.count()).toBeLessThan(all);
  await expect.poll(() => entries.count()).toBeGreaterThan(0);
});
