import { test, expect, openChapter } from "./helpers";

// Session 25 — the interactive draw: a dealt spread lands face-down and each
// card turns on tap (one 3D flip per intent; instant under reduced motion).
// Presentation only: the deal underneath is the same parity-locked seeded
// draw (`parity/tarot-draw.json`), so this spec drives the widget, never the
// engine — card identity is asserted by the parity suites, not here.

async function dealSpread(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
  await openChapter(page, "II");
  await expect(page.locator(".arcana-modal")).toBeVisible();
  // Two "Draw"s exist: the tab, then the deal button.
  await page.getByRole("button", { name: "Draw", exact: true }).first().click();
  await page.locator(".arc-draw-btn").filter({ hasText: /^Draw$/ }).click();
}

test("a fresh deal lands face-down; a tap turns the card and publishes it", async ({ page }) => {
  await dealSpread(page);

  // three_card default → three cards, all face-down, each wearing its back.
  const cards = page.locator(".tarot-card");
  await expect.poll(() => cards.count(), { timeout: 15_000 }).toBe(3);
  await expect(page.locator(".tarot-card.is-facedown")).toHaveCount(3);
  await expect(page.locator(".tarot-face--back").first()).toBeVisible();

  // Turn the first card: it flips, its meaning shows, and the same tap
  // published it to the margin glass (no second tap owed).
  await page.locator(".tarot-face--back").first().click();
  await expect(page.locator(".tarot-card.is-revealed")).toHaveCount(1);
  await expect(
    page.locator(".tarot-card.is-revealed .arc-drawn-meaning")
  ).not.toBeEmpty();
  await expect(page.locator(".margin-note h3")).toBeVisible();

  // The other two wait for their own taps.
  await expect(page.locator(".tarot-card.is-facedown")).toHaveCount(2);
});

test("a new deal returns every card face-down", async ({ page }) => {
  await dealSpread(page);
  await expect(page.locator(".tarot-card.is-facedown")).toHaveCount(3);
  await page.locator(".tarot-face--back").first().click();
  await expect(page.locator(".tarot-card.is-revealed")).toHaveCount(1);

  // Draw again — the reveal state resets with the fresh spread.
  await page.locator(".arc-draw-btn").filter({ hasText: /^Draw$/ }).click();
  await expect(page.locator(".tarot-card.is-facedown")).toHaveCount(3);
  await expect(page.locator(".tarot-card.is-revealed")).toHaveCount(0);
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the turn still works — instantly — under prefers-reduced-motion", async ({ page }) => {
    await dealSpread(page);
    await expect(page.locator(".tarot-card.is-facedown")).toHaveCount(3);
    await page.locator(".tarot-face--back").first().click();
    await expect(page.locator(".tarot-card.is-revealed")).toHaveCount(1);
    await expect(
      page.locator(".tarot-card.is-revealed .arc-drawn-meaning")
    ).not.toBeEmpty();
  });
});
