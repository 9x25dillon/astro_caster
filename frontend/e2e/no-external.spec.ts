import { test, expect } from "./helpers";

// The observatory's BOOT path is fully self-contained: fonts are vendored in
// public/fonts/ (MOBILE_ROADMAP §7.2) and every API call is same-origin
// through the Vite proxy. Any request that leaves 127.0.0.1/localhost is a
// regression — a privacy leak and an offline-mode break.
//
// SCOPE, stated because it was once misread as absolute: this file covered
// boot and nothing else, so "Astra makes zero external requests" was recorded
// as proven when only boot had been tested. The birthplace map does leave the
// origin — Nominatim geocoding and CARTO tiles (LocationPicker.tsx:85,54).
// GAZ-5 extends coverage to that path; GAZ-4 is what makes it zero.
test("app boot makes zero external requests", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (req) => {
    const host = new URL(req.url()).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") external.push(req.url());
  });

  await page.goto("/");
  // Wait for the full boot: chart cast + wheel populated + fonts settled.
  const wheel = page.locator(".wheel-area svg").first();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);
  await page.evaluate(() => document.fonts.ready);

  expect(external, `external requests: ${external.join(", ")}`).toHaveLength(0);
});

test("serif fonts actually load from the local vendored files", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family)
  );
  expect(loaded).toContain("EB Garamond");
});

// ── GAZ-5 — the birthplace map, which is where the origin is actually left ──
//
// The two tests above cover BOOT. That narrowness is exactly how "Astra makes
// zero external requests" came to be recorded as proven at the H1 gate, and
// from there into a published privacy policy, while the map quietly talked to
// two other companies. This block closes the hole the only way that lasts: by
// driving the surface that leaks.
//
// It is deliberately TWO tests, because they answer different questions.

/**
 * The ledger is EMPTY, and that is the point.
 *
 * It used to carry two entries — `nominatim.openstreetmap.org` (geocoding,
 * which received the typed place name) and `basemaps.cartocdn.com` (tiles,
 * which revealed the region being examined). GAZ-4 retired both: search now
 * resolves against a vendored GeoNames extract and the map is a vendored
 * Natural Earth outline, so the birthplace never leaves the device.
 *
 * Keep it empty. An entry added here is a privacy regression wearing a
 * comment, and the debt it represents has already been paid once.
 */
const KNOWN_EXTERNAL: string[] = [];

const isLocal = (host: string) => host === "127.0.0.1" || host === "localhost";
const onLedger = (host: string) => KNOWN_EXTERNAL.some((k) => host === k || host.endsWith(`.${k}`));

/**
 * Open the birthplace picker and run a real search, collecting every host the
 * page reaches for. We never await a *response* — Nominatim may be slow,
 * rate-limited, or unreachable from CI, and none of that matters here. The
 * `request` event fires when the request is issued, so egress is recorded even
 * when it fails, which is the only thing this file is about.
 */
async function externalHostsDuringMapUse(page: import("@playwright/test").Page): Promise<string[]> {
  const hosts = new Set<string>();
  page.on("request", (req) => {
    const host = new URL(req.url()).hostname;
    if (!isLocal(host)) hosts.add(host);
  });

  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /pick on map/ }).first().click();
  // The offline map is an inline SVG, not a Leaflet tile container. Only this
  // HANDLE changed at GAZ-4 — the assertions below are untouched, which is what
  // makes the red→green flip meaningful rather than a rewritten goalpost.
  await expect(page.getByRole("img", { name: /world map/i })).toBeVisible({ timeout: 15_000 });

  // Drive a real search and wait for a real RESULT, not for a request. The old
  // version waited on a Nominatim call; there is no call to wait for now, so
  // waiting on the rendered hit is both stronger and honest — it proves search
  // still works, rather than only that nothing was sent.
  await page.getByPlaceholder(/city or place name/i).fill("Ulm");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByRole("button", { name: /^Ulm/ }).first()).toBeVisible({ timeout: 15_000 });

  // A beat for anything fired late (tiles used to arrive during layout), so
  // "zero requests" is measured after the surface has fully settled.
  await page.waitForTimeout(1_000);

  return [...hosts];
}

// RETIRED at GAZ-4, as this file's own instruction required: with the ledger
// empty, "reaches no host outside the ledger" and "reaches no host" are the
// same assertion, and keeping both would only make the suite slower. The
// `onLedger` helper stays as the single place a future entry would have to be
// justified — and there should never be one.
//
// ✅ GREEN AS OF GAZ-4. This test was RED ON PURPOSE from the commit that
// introduced it until the commit that fixed it, and that ordering was the whole
// point: it was written against the unmodified site, so it could only describe
// what was actually true. Its failing CI runs are the recorded, objective
// baseline that the map really did leave the origin before anyone claimed it
// stopped.
//
// It flipped with NO edit to the assertion below. The only thing GAZ-4 changed
// in this file was the DOM handle used to open the map (`.leaflet-container` →
// the inline SVG), because the map is a different component now. If you find
// yourself editing the assertion to keep this green, the app regressed — fix
// the app.
test("the birthplace map makes zero external requests", async ({ page }) => {
  const external = await externalHostsDuringMapUse(page);
  expect(external, `external hosts: ${external.join(", ") || "(none)"}`).toHaveLength(0);
});
