import { test as base, expect } from "@playwright/test";

// Track E-1a — the threshold.
//
// These are the ONLY specs that must meet the app the way a stranger does, so
// they deliberately do NOT use ./helpers: that fixture pre-sets
// aae.ceremony_shown / aae.privacy_ack to skip first-run, which is exactly the
// behaviour under test here.

const test = base;

test("a first visit lands on a working instrument, not a form", async ({ page }) => {
  await page.goto("/");

  // E-1.1 — the wheel is computed and nothing is covering it.
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
  await expect(page.locator(".ceremony-modal, .modal-overlay")).toHaveCount(0);

  // E-1.3 — the ceremony did not open itself.
  await expect(page.locator(".threshold")).toBeVisible();
  await expect(page.locator(".threshold-title")).toHaveText(/sky right now/i);
});

test("the arrival wheel is the current sky, not a stored sample", async ({ page }) => {
  // E-1.2 — the cast moment must be NOW. Read the birth the store actually
  // used rather than trusting the label: a hardcoded sample would show its own
  // date here. Tolerate a couple of minutes for a slow cold boot.
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 20_000 });

  const shown = await page.locator(".threshold-sub").innerText();
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  expect(shown).toContain(String(now.getDate()));
  expect(shown).toContain(month);
});

test("the ceremony is a door: entered by action, and Escape returns to the sky", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 20_000 });

  await page.locator(".threshold-primary").click();
  await expect(page.locator(".ceremony-modal")).toBeVisible();

  // E-1.5 — backing out lands on the live sky, never an empty room.
  await page.keyboard.press("Escape");
  await expect(page.locator(".ceremony-modal")).toHaveCount(0);
  await expect(page.locator(".threshold")).toBeVisible();
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
});

test("the privacy claim is made at the birth-time field, not on a banner", async ({ page }) => {
  // E-1.4 — the claim belongs where the hesitation is. A stranger is anxious
  // at the birth-minute field, not at an arrival bar they dismiss unread.
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".privacy-banner")).toHaveCount(0);

  await page.locator(".threshold-primary").click();
  await page.getByRole("button", { name: /Begin/ }).click();

  const claim = page.locator(".ceremony-privacy");
  await expect(claim).toBeVisible();
  await expect(claim).toContainText(/never leaves this browser/i);

  // The telemetry disclosure survives the banner's retirement — it moved into
  // the threshold's fine print rather than disappearing.
  await page.keyboard.press("Escape");
  await expect(page.locator(".threshold-fine")).toContainText(/no personal identity is stored/i);
});

test("not knowing your birth time is a soft landing, not a dead end", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 20_000 });
  await page.locator(".threshold-primary").click();
  await page.getByRole("button", { name: /Begin/ }).click();

  // The offer names what noon costs before it is taken.
  const note = page.locator(".ceremony-unknown");
  await expect(note).toContainText(/houses and the rising sign/i);

  // Move OFF noon first — the ceremony's blank draft already sits at 12:00, so
  // asserting noon without this would pass whether the button works or not.
  await page.locator(".ceremony-field").filter({ hasText: "Hour" }).locator("input").fill("9");
  await page.locator(".ceremony-field").filter({ hasText: "Minute" }).locator("input").fill("15");
  await expect(page.locator(".ceremony-preview")).toContainText(/9:15 AM/);

  await page.locator(".ceremony-noon").click();

  // It actually sets the field, and then explains rather than re-offering.
  await expect(page.locator(".ceremony-preview")).toContainText(/12:00 PM/);
  await expect(note).toContainText(/Using/);
  await expect(page.locator(".ceremony-noon")).toHaveCount(0);
});

test("the morning panel greets people who have a chart, not strangers", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".morning-panel")).toHaveCount(0);
});

test("the threshold never widens the layout viewport", async ({ page }) => {
  // Regression guard. A wrapping flex row once left the band's fine print at
  // left:403 on a 412px screen; that lone overflow expanded the mobile LAYOUT
  // VIEWPORT to 688px, which carried the position:fixed thumb arc with it and
  // pushed half the chapter nodes out of reach — 18 specs failed on a defect
  // that is completely invisible at desktop widths.
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 20_000 });

  const m = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    inner: window.innerWidth,
    strays: [...document.querySelectorAll(".threshold, .threshold *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length,
  }));
  expect(m.doc).toBeLessThanOrEqual(m.inner);
  expect(m.strays).toBe(0);

  // Every chapter node stays inside the viewport and stays clickable.
  const nodes = page.locator(".dial-node");
  await expect(nodes).toHaveCount(8);
  const outside = await page.evaluate(() =>
    [...document.querySelectorAll(".dial-node")]
      .filter((n) => n.getBoundingClientRect().right > window.innerWidth + 1).length);
  expect(outside).toBe(0);
});

test("the threshold retires once the wheel is somebody's own chart", async ({ page }) => {
  // A browser that already holds a cast keeps it — and is past the threshold.
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 20_000 });

  await page.evaluate(() => {
    const raw = localStorage.getItem("aae.last_chart");
    if (!raw) throw new Error("no cached cast to rewrite");
    const parsed = JSON.parse(raw);
    parsed.birth = { ...parsed.birth, year: 1990, month: 6, day: 15, label: "Test person" };
    localStorage.setItem("aae.last_chart", JSON.stringify(parsed));
  });
  await page.reload();

  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
  await expect(page.locator(".threshold")).toHaveCount(0);
});
