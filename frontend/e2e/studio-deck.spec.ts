import { test, expect, openChapter } from "./helpers";

// The Studio (chapter VII) briefs art for a card. /api/deck-art has always
// taken a minor's id as readily as a trump's, but the picker only ever offered
// the handful of trumps the chart itself carries — so the Gallery's "N of 78
// collected" counted toward a deck the surface could not reach.
//
// Offline on purpose: the catalog comes from @astra/core, the same place the
// draw gets its deck, so a picker with no backend must still be a whole deck.
// That is the case the APK ships into.
const isApiCall = (url: URL) => url.pathname.startsWith("/api/");

test("the Studio picker offers the whole 78-card deck, grouped", async ({ page, context }) => {
  await context.route(isApiCall, (route) => route.abort());
  await page.goto("/");

  const wheel = page.locator(".wheel-area svg").first();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);

  await openChapter(page, "VII");
  await expect(page.locator(".arc-studio")).toBeVisible({ timeout: 20_000 });

  // The signature builds on-device; the deck-art picker is the select beside it.
  const picker = page.locator(".arc-studio .arc-draw-controls select").first();
  await expect(picker).toBeVisible();

  // The catalog is fetched lazily when the tab opens, so wait for the suits to
  // land rather than asserting into an empty picker.
  await expect
    .poll(() => picker.locator("optgroup").evaluateAll((n) => n.map((o) => (o as HTMLOptGroupElement).label)),
          { timeout: 20_000 })
    .toEqual(["Your signature", "Major Arcana", "Wands", "Cups", "Swords", "Pentacles"]);

  // Every card is reachable exactly once. Signature trumps are listed by the
  // body that carries them and left out of the Major Arcana group, so no id is
  // offered twice — the whole-soul-deck sentinel ("") is the only non-card.
  const values = await picker.locator("option").evaluateAll(
    (nodes) => nodes.map((n) => (n as HTMLOptionElement).value),
  );
  const cardIds = values.filter((v) => v !== "");
  expect(new Set(cardIds).size).toBe(78);
  expect(cardIds.length).toBe(new Set(cardIds).size);

  // Each suit is whole, and a named minor is really in there.
  for (const suit of ["Wands", "Cups", "Swords", "Pentacles"]) {
    await expect(picker.locator(`optgroup[label="${suit}"] option`)).toHaveCount(14);
  }
  await expect(picker.locator('option:text-is("Ace of Cups")')).toHaveCount(1);

  // And a minor can actually be selected — the id is what travels to /deck-art.
  await picker.selectOption("ace_of_cups");
  await expect(picker).toHaveValue("ace_of_cups");
});
