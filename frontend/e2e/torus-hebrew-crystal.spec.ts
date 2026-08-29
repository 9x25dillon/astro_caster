import { test, expect, pastThreshold } from "./helpers";

// The letters, the fourth dimension and the crystal — the three things added on
// top of the torus, checked where only a browser can check them.
//
// What the unit tests already own: the alphabet's partition, the plane-pair
// algebra, the 32 point groups, the restriction theorem. None of that needs a
// page. What needs a page is whether switching these on actually changes the
// pixels, whether the surfaces are reachable from the controls, and whether the
// panel SAYS the findings rather than merely computing them — a claim that only
// lives in a comment is a claim the reader never meets.

const canvas = (p: import("@playwright/test").Page) =>
  p.locator(".arcana-body canvas").first();

async function openTorus(page: import("@playwright/test").Page) {
  await pastThreshold(page);
  await page.locator('.dial-node[data-ch="V"]').click();
  await page.getByRole("button", { name: "Torus", exact: true }).click();
  await expect(page.locator(".torus-layers")).toBeVisible();
  await expect(canvas(page)).toBeVisible();
  // Stop the idle spin — same reason as torus-layers.spec: the surface turns on
  // its own until the reader takes the wheel, and a diff against a moving
  // target proves nothing.
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(900);
}

const pixels = (p: import("@playwright/test").Page) =>
  canvas(p).evaluate((c) => (c as HTMLCanvasElement).toDataURL());

test("the letters appear on the surface and are reversible", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "pixel diff needs the spin stopped");
  await openTorus(page);
  const before = await pixels(page);

  await page.getByRole("switch", { name: "Hebrew letters" }).click();
  await page.waitForTimeout(900);
  expect(await pixels(page)).not.toBe(before);

  await page.getByRole("switch", { name: "Hebrew letters" }).click();
  await page.waitForTimeout(900);
  expect(await pixels(page)).toBe(before);
});

test("the letters name the partition, and the moving tile", async ({ page }) => {
  await openTorus(page);
  await page.getByRole("switch", { name: "Hebrew letters" }).click();
  // The 3 + 7 + 12 split, said where the reader is
  await expect(page.locator(".margin-glass")).toContainText(/3 \+ 7 \+ 12/);
  // and the one quantity on the surface that survives every rotation
  await expect(page.locator(".arcana-body")).toContainText(/gematria/i);
  await expect(page.locator(".arcana-body")).toContainText(/tile/i);
});

test("both attribution tables ship, and switching changes the letter over the Sun", async ({ page }) => {
  await openTorus(page);
  await page.getByRole("switch", { name: "Hebrew letters" }).click();
  const rail = page.locator(".torus-hebrew-rail");
  await expect(rail).toBeVisible();

  const body = page.locator(".arcana-body");
  // Sun is body A by default; under the Sefer Yetzirah it carries Kaf
  await expect(body).toContainText(/Kaf/);
  await rail.getByRole("combobox").selectOption("golden-dawn");
  // and under the Golden Dawn, Resh — the two tables disagree about every planet
  await expect(body).toContainText(/Resh/);
  await expect(body).not.toContainText(/Kaf/);
});

test("the three mothers are the three ways the surface turns, one at a time", async ({ page }) => {
  await openTorus(page);
  // The mothers only exist where there is a fourth dimension to turn in
  await expect(page.locator(".torus-mothers")).toHaveCount(0);
  await page.getByLabel("Surface").selectOption("clifford");
  await expect(page.locator(".torus-mothers")).toBeVisible();

  // Aleph is the one that was already here: the Hopf flow, renamed by proof
  await expect(page.getByRole("radio", { name: /Aleph/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: /Mem/ }).click();
  await expect(page.getByRole("radio", { name: /Mem/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /Aleph/ })).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".margin-glass")).toContainText(/inside\s*out/i);
});

test("the hyper-torus is reachable and asks for two more bodies", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "pixel diff needs the spin stopped");
  await openTorus(page);
  await page.getByLabel("Surface").selectOption("hyper");
  const before = await pixels(page);

  // With neither extra circle set, the hyper-torus IS the donut — so the
  // pixels must not change until a third body is actually chosen.
  await page.getByLabel("Third circle").selectOption("Mars");
  await page.waitForTimeout(2500);
  expect(await pixels(page)).not.toBe(before);
  await expect(page.locator(".arcana-body")).toContainText(/third and fourth circles/i);
});

test("the crystal says the theorem, on both sides of it", async ({ page }) => {
  await openTorus(page);
  await page.getByRole("switch", { name: "Crystal" }).click();
  await expect(page.locator(".margin-glass")).toContainText(/32/);

  const body = page.locator(".arcana-body");
  // A Sun–Moon pair over a year passes through majors and minors alike, so the
  // readout has to be able to say both things. Which one shows depends on the
  // sky today, so accept either — but it must be one of them, in these words.
  await expect(body).toContainText(/harmonic/i);
  await expect(body).toContainText(/(order \d+, path \d+|no crystal at all)/i);
});

test("the triclinic lattice is separate from the shards, and bends the surface", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "pixel diff needs the spin stopped");
  await openTorus(page);
  await page.getByRole("switch", { name: "Crystal" }).click();
  await page.waitForTimeout(900);
  const shardsOnly = await pixels(page);

  await page.getByLabel("triclinic lattice").check();
  await page.waitForTimeout(900);
  expect(await pixels(page)).not.toBe(shardsOnly);

  // Off again restores it — a cubic cell is the identity matrix
  await page.getByLabel("triclinic lattice").uncheck();
  await page.waitForTimeout(900);
  expect(await pixels(page)).toBe(shardsOnly);
});
