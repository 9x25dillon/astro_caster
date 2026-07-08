// Touch pass on the wheel (roadmap §4.1): long-press = hover-popover
// equivalence, and two-finger pinch zooms the instrument. Driven with
// synthetic pointer events (pointerType: "touch") — they exercise the same
// React handlers a real touch does, on both desktop and mobile projects.
import { expect, test } from "./helpers";

const wheelSvg = ".wheel-area svg";

async function center(page: import("@playwright/test").Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("long-press on a planet opens the influence popover", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(`${wheelSvg} .planet-node`).first()).toBeVisible();

  const p = await center(page, `${wheelSvg} .planet-node`);
  await page.locator(`${wheelSvg} .planet-node`).first().dispatchEvent("pointerdown", {
    pointerId: 1, pointerType: "touch", isPrimary: true,
    clientX: p.x, clientY: p.y, bubbles: true,
  });
  // Popover appears after the 450ms press threshold, before release.
  await expect(page.locator(".wheel-popover")).toBeVisible({ timeout: 3_000 });
  await page.locator(wheelSvg).dispatchEvent("pointerup", {
    pointerId: 1, pointerType: "touch", clientX: p.x, clientY: p.y, bubbles: true,
  });
});

test("two-finger pinch zooms the wheel; double-tap resets", async ({ page }) => {
  await page.goto("/");
  const svg = page.locator(wheelSvg);
  await expect(svg).toBeVisible();
  const zoomG = page.locator(`${wheelSvg} > g[transform]`).first();
  await expect(zoomG).toHaveAttribute("transform", /scale\(1\)/);

  const c = await center(page, wheelSvg);
  const touch = (id: number, type: string, x: number, y: number) =>
    svg.dispatchEvent(type, {
      pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true,
    });

  // Two fingers land 80px apart, spread to 240px → ~3x pinch.
  await touch(1, "pointerdown", c.x - 40, c.y);
  await touch(2, "pointerdown", c.x + 40, c.y);
  await touch(1, "pointermove", c.x - 120, c.y);
  await touch(2, "pointermove", c.x + 120, c.y);
  await touch(1, "pointerup", c.x - 120, c.y);
  await touch(2, "pointerup", c.x + 120, c.y);

  const zoomed = (await zoomG.getAttribute("transform")) ?? "";
  const k = Number(/scale\(([\d.]+)\)/.exec(zoomed)?.[1] ?? "1");
  expect(k).toBeGreaterThan(1.5);

  // Double-tap anywhere resets to 1x.
  await touch(3, "pointerdown", c.x, c.y);
  await touch(3, "pointerup", c.x, c.y);
  await touch(4, "pointerdown", c.x, c.y);
  await touch(4, "pointerup", c.x, c.y);
  await expect(zoomG).toHaveAttribute("transform", /scale\(1\)/);
});
