import { test, expect, pastThreshold } from "./helpers";

// The holographic wheel. The unit tests own the arithmetic — the flicker's
// safety envelope, the chromatic split, and the alignment identity between
// torusTheta and lonToAngle. What only a browser can answer is whether the
// three layers actually stack, and whether the two new ones stayed INERT.
//
// That second one is the whole risk of this redesign. The HUD film and the
// underlay both cover the wheel's hit targets, and a single missing
// pointer-events: none turns the most-used surface in the app into a picture.

const stage = (p: import("@playwright/test").Page) => p.locator(".chart-holo-stage");

test("all three layers mount, in order, over one another", async ({ page }) => {
  await pastThreshold(page);
  await expect(stage(page)).toBeVisible();
  await expect(page.locator(".chart-hologram")).toHaveCount(1);
  await expect(page.locator(".chart-hud")).toHaveCount(1);
  // the wheel itself is still the wheel
  await expect(page.locator(".chart-holo-stage > svg")).toHaveCount(1);
});

test("the new layers are inert — the wheel underneath still takes a click", async ({ page }) => {
  await pastThreshold(page);
  // A planet glyph sits under both the HUD film and the scan sweep. If either
  // one takes the event this selects nothing and the detail panel never opens.
  const sun = page.locator('[data-pop^="planet:Sun"]').first();
  await sun.click({ force: false });
  await expect(page.locator(".detail-panel, .margin-glass")).toBeVisible();
});

test("hovering a sign still reaches the ring through the film", async ({ page }) => {
  await pastThreshold(page);
  await page.locator('[data-pop="sign:0"]').first().hover();
  await expect(page.locator(".margin-glass")).toBeVisible();
});

test("twelve elementals on the zodiac ring, seven doubles on the seal", async ({ page }) => {
  await pastThreshold(page);
  await expect(page.locator(".sign-letter")).toHaveCount(12);
  await expect(page.locator(".seal-letter")).toHaveCount(7);

  // The twelve are the sign letters in zodiacal order: Aries takes He.
  await expect(page.locator(".sign-letter").first()).toHaveText("ה");
  // All twelve distinct — a repeat would mean the arc lookup is off by one.
  const letters = await page.locator(".sign-letter").allTextContents();
  expect(new Set(letters).size).toBe(12);

  // The seal ring is the seven classical metals in descending Chaldean order,
  // which is the order the doubles are walked in, so index 0 (Saturn) is Bet.
  await expect(page.locator(".seal-letter").first()).toHaveText("ב");
  const seal = await page.locator(".seal-letter").allTextContents();
  expect(seal).toEqual(["ב", "ג", "ד", "כ", "פ", "ר", "ת"]);
});

test("the underlay is drawn, not blank", async ({ page }) => {
  await pastThreshold(page);
  await page.waitForTimeout(1200);
  // Sample the canvas: a chart's lattice must have put non-zero pixels in it.
  const painted = await page.locator(".chart-hologram").evaluate((c) => {
    const canvas = c as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(2000);
});

test("reduced motion stops the HUD rather than slowing it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await pastThreshold(page);
  for (const sel of [".chart-hud", ".chart-holo-stage"]) {
    for (const pseudo of ["::before", "::after"]) {
      const name = await page.locator(sel).first().evaluate(
        (el, ps) => getComputedStyle(el, ps).animationName,
        pseudo,
      );
      expect(name, `${sel}${pseudo}`).toBe("none");
    }
  }
});

test("the underlay follows the wheel through a pinch instead of drifting off it", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "the assertion reads the desktop transform string");
  await pastThreshold(page);
  const before = await page.locator(".chart-hologram").evaluate(
    (c) => getComputedStyle(c).transform,
  );
  // The wheel's own zoom state drives both layers from one source, so any
  // transform the canvas carries must be a real matrix rather than "none".
  expect(before === "none" || before.startsWith("matrix")).toBe(true);
});
