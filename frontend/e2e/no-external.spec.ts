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
 * A LEDGER OF DEBT, not an allow-list. Every entry is a promise GAZ-4 retires;
 * nothing may be added without retiring something. Suffix-matched because
 * Leaflet shards tiles across {a,b,c,d}.basemaps.cartocdn.com.
 */
const KNOWN_EXTERNAL = [
  "nominatim.openstreetmap.org", // geocoding — receives the typed place name
  "basemaps.cartocdn.com", // map tiles — reveal the region being examined
];

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
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 15_000 });

  // Tiles are fired by the map as it lays itself out; give them a bounded beat.
  // `.catch` because after GAZ-4 there will be no tile request to wait for, and
  // that is a pass, not a hang.
  await page.waitForRequest((r) => /cartocdn/.test(r.url()), { timeout: 5_000 }).catch(() => null);

  const geocode = page
    .waitForRequest((r) => /nominatim/.test(r.url()), { timeout: 8_000 })
    .catch(() => null);
  await page.getByPlaceholder(/city or place name/i).fill("Ulm");
  await page.getByRole("button", { name: "Find" }).click();
  await geocode;

  return [...hosts];
}

// GREEN NOW, and the actual guardrail during the GAZ-1..GAZ-4 rewrite: the
// picker may reach the two hosts we already owe, and NOTHING else. A new CDN,
// a new geocoder, a stray analytics beacon — any of them fails this instantly,
// which is the regression class most likely to slip in while the map is being
// replaced wholesale.
test("the birthplace map reaches no host outside the known ledger", async ({ page }) => {
  const strays = (await externalHostsDuringMapUse(page)).filter((h) => !onLedger(h));
  expect(strays, `unledgered external hosts: ${strays.join(", ") || "(none)"}`).toHaveLength(0);
});

// ⚠️ THIS TEST IS RED ON PURPOSE. It must stay red until GAZ-4 lands.
//
// It was written against the unmodified site, BEFORE any line of GAZ-1..GAZ-4
// existed — and that ordering is the whole point. A test written after the fix
// gets unconsciously shaped until it passes; a test written before it can only
// describe what is actually true. The failing CI run on the commit that merges
// this is the objective baseline: the recorded proof that the map really did
// leave the origin, before anyone claims it stopped.
//
// GAZ-4 is the gate. At that exact commit this flips red → green with NO edit
// to the assertion — which is the only kind of green worth having here.
//
// When it flips: empty KNOWN_EXTERNAL, which retires the ledger test above too.
test("the birthplace map makes zero external requests", async ({ page }) => {
  const external = await externalHostsDuringMapUse(page);
  expect(external, `external hosts: ${external.join(", ") || "(none)"}`).toHaveLength(0);
});
