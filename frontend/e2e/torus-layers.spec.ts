import { test, expect, pastThreshold } from "./helpers";

// The teaching layers, and the one claim they all rest on: the torus is a
// PRODUCT of two circles, so an idea's arity decides its shape. A single
// longitude is a CIRCLE on each axis; an arc partition is a GRID; a per-body
// property is a STRIPE FIELD along one axis. lib/torusLayers holds the maths
// and test/torusLayers pins it; what a browser has to answer is different —
// does switching a layer on actually change what is DRAWN, and does the reader
// get told what appeared.

const canvas = (p: import("@playwright/test").Page) =>
  p.locator(".arcana-body canvas").first();

async function openTorus(page: import("@playwright/test").Page) {
  await pastThreshold(page);
  await page.locator('.dial-node[data-ch="V"]').click();
  await page.getByRole("button", { name: "Torus", exact: true }).click();
  await expect(page.locator(".torus-layers")).toBeVisible();
  await expect(canvas(page)).toBeVisible();

  // Stop the idle spin before comparing pixels. The torus turns gently until
  // the reader takes the wheel, so consecutive frames differ on their own and
  // a diff would prove nothing about the layer. One drag hands over control.
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(900);
}

/** The drawn surface, as bytes. */
const pixels = (p: import("@playwright/test").Page) =>
  canvas(p).evaluate((c) => (c as HTMLCanvasElement).toDataURL());

// The pixel-diff harness needs the idle spin stopped, and the only thing that
// stops it is the reader taking the wheel — a real DRAG. On a touch project
// `page.mouse` does not reach the pointer handlers, the torus keeps turning,
// and every frame differs from the last whether or not a layer did anything.
// So the diffs run on desktop, where the gesture exists; the two assertions
// below that do not need pixels run everywhere, and they are the ones that
// cover the layers on a phone.
test("the idle spin really does stop, or every diff below is meaningless", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "no mouse drag to stop the spin — see the note above");
  await openTorus(page);
  const a = await pixels(page);
  await page.waitForTimeout(700);
  expect(await pixels(page)).toBe(a);
});

for (const layer of ["Signs", "Dignity terrain", "Natal field", "Houses"]) {
  test(`the ${layer} layer changes what is drawn, and says what appeared`, async ({ page, isMobile }) => {
    test.skip(!!isMobile, "pixel diff needs the spin stopped — see the note above");
    await openTorus(page);
    const before = await pixels(page);

    await page.getByRole("switch", { name: layer }).click();
    await page.waitForTimeout(900);
    expect(await pixels(page)).not.toBe(before);

    // The sentence is the point of a teaching device: a legend that only names
    // things teaches nothing the label did not.
    await expect(page.locator(".margin-glass")).toContainText(
      layer === "Signs" ? /whole-sign aspect is a TILE/i
        : layer === "Dignity terrain" ? /varies along one axis/i
        : layer === "Natal field" ? /zero-beat/i
        : /not an even grid/i,
    );

    // And switching it back off restores the surface — a layer is a layer,
    // not a one-way change to the drawing.
    await page.getByRole("switch", { name: layer }).click();
    await page.waitForTimeout(900);
    expect(await pixels(page)).toBe(before);
  });
}

test("the natal layer names the sound, because it is the same object", async ({ page }) => {
  await openTorus(page);
  await page.getByRole("switch", { name: "Natal field" }).click();
  // Under the bedrock map two drones beat at zero exactly when the longitudes
  // meet, so a crossing of a natal line IS a zero-beat rather than a picture of
  // one. The panel has to say so where the reader can act on it.
  await expect(page.locator(".arcana-body")).toContainText(/zero-beat/i);
});

test("layers are independent — one on does not turn another on", async ({ page }) => {
  await openTorus(page);
  await page.getByRole("switch", { name: "Signs" }).click();
  await expect(page.getByRole("switch", { name: "Signs" })).toHaveAttribute("aria-checked", "true");
  for (const other of ["Dignity terrain", "Natal field", "Houses", "Fixed stars"]) {
    await expect(page.getByRole("switch", { name: other })).toHaveAttribute("aria-checked", "false");
  }
});
