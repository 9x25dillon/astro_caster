import { test, expect, openChapter } from "./helpers";

// A reading must survive the chapter dial.
//
// Reported live 2026-08-28, right after a $5.50 Oracle Report: "the text
// disappeared and brought me back to the first chapter", and "I don't like how
// the readings disappear if you change the chapter tabs either." One
// mechanism behind both: App.tsx mounts ArcanaModal per chapter with distinct
// keys (ch-ii / ch-vi / ch-vii), so every chapter switch REMOUNTS it and all
// component state — the draw, the Oracle Report, the Course — is destroyed.
//
// Driven offline on purpose: the deal is computed on-device, so this test
// measures the persistence and nothing else. The paid paths (Oracle, Course)
// keep their state through the same `useSessionState` keys, and cannot be
// exercised here without spending real money.
const isApiCall = (url: URL) => url.pathname.startsWith("/api/");

test("a drawn spread survives leaving the chapter and coming back", async ({ page, context }) => {
  await context.route(isApiCall, (route) => route.abort());
  await page.goto("/");

  const wheel = page.locator(".wheel-area svg").first();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);

  await openChapter(page, "II");
  await page.getByRole("button", { name: "Draw", exact: true }).first().click();
  await page.locator(".arc-draw-btn").filter({ hasText: /^Draw$/ }).click();

  const drawn = page.locator(".arc-drawn");
  await expect.poll(() => drawn.count(), { timeout: 15_000 }).toBe(3);

  // Turn one card, so we can prove the *interaction* state survives too and
  // not merely the fact that some cards exist.
  await page.locator(".tarot-face--back").first().click();
  await expect(page.locator(".tarot-card.is-revealed")).toHaveCount(1);
  const meaning = await page
    .locator(".tarot-card.is-revealed .arc-drawn-meaning")
    .first()
    .textContent();

  // Look away — the Library — then come back.
  await openChapter(page, "VIII");
  await expect(page.locator(".arcana-modal")).toHaveCount(0);
  await openChapter(page, "II");

  // The same three cards, the same one turned over, the same meaning. Before
  // the keep, this came back to an empty Draw tab with no cards at all.
  await expect(page.locator(".arc-drawn")).toHaveCount(3);
  await expect(page.locator(".tarot-card.is-revealed")).toHaveCount(1);
  await expect(
    page.locator(".tarot-card.is-revealed .arc-drawn-meaning").first()
  ).toHaveText(meaning ?? "");
});

// The other half of the contract — that a different chart EMPTIES the keep, so
// one person's reading can never resurface under another's birth data — is
// pinned in test/arcanaSession.test.ts rather than here. Driving a second
// chart through the ceremony UI would test the ceremony; the rule itself is a
// property of the keep, and the store is not exposed on `window` to reach it
// from a browser test without adding a test-only seam to shipping code.
