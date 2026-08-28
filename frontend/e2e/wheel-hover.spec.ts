import { test, expect, pastThreshold } from "./helpers";

// A planet glyph must GROW under the pointer, not travel away from it.
//
// It used to travel. `.planet-node` carried `transform-origin: center`, and an
// SVG element's `transform-box` is `view-box` — so "center" meant the centre of
// the WHEEL, not of the glyph, and `scale(1.12)` swung the node radially
// outward by 12% of its radius. Measured: the glyph grew 3.6px and moved 30px.
// It left the pointer, the hover dropped, it snapped back under the pointer and
// hovered again — rubber-banding for as long as the cursor rested on a planet.
//
// Both assertions below are needed. The geometric one names the cause, so a
// failure says which way the fix was undone; the stability one names the
// symptom a person actually reported.

test("a hovered planet glyph grows in place, without sliding out from under the pointer", async ({ page }) => {
  await pastThreshold(page);
  const mark = page.locator(".planet-mark").first();
  await expect(mark).toBeVisible();

  const before = await mark.boundingBox();
  await mark.hover();
  await page.waitForTimeout(400);          // the 0.16s transition, settled
  const after = await mark.boundingBox();
  expect(before && after).toBeTruthy();

  // It grew.
  expect(after!.width).toBeGreaterThan(before!.width);

  // And it grew around its own centre, which is the whole point: a centre that
  // moves is a hit area that moves. One pixel of tolerance for rounding.
  const cx = (b: NonNullable<typeof before>) => b.x + b.width / 2;
  const cy = (b: NonNullable<typeof before>) => b.y + b.height / 2;
  expect(Math.abs(cx(after!) - cx(before!))).toBeLessThan(1);
  expect(Math.abs(cy(after!) - cy(before!))).toBeLessThan(1);
});

test("the hover holds while the pointer rests — no rubber-banding", async ({ page }) => {
  await pastThreshold(page);
  const node = page.locator(".planet-node").first();
  await node.hover();

  // The symptom, sampled: with the pointer still, the node must stay hovered.
  // While the glyph was fleeing, this alternated on and off several times a
  // second, which is what the oscillation looked like from the outside.
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(60);
    expect(await node.evaluate((el) => el.matches(":hover"))).toBe(true);
  }
});
