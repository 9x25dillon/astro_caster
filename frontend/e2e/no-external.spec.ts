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
