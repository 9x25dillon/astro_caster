// The birthplace picker's data is lazy (roadmap H1 bundle hygiene): none of it
// may ship at boot, and the picker must still mount on demand.
//
// This test used to guard the Leaflet chunk. GAZ-4 deleted Leaflet, but the
// property it protected got MORE important rather than less: the vendored
// gazetteer is ~3.1 MB, where the Leaflet chunk was ~164 KB. Loading that at
// boot would be a far worse regression than the one this file was written for,
// so the assertion moves to the new payload rather than retiring with the old.
import { expect, test } from "./helpers";

const MAP_DATA = /\/gazetteer\/(cities|land)\.json/;

test("the map chunk loads on demand and the picker mounts", async ({ page }) => {
  const mapDataRequests: string[] = [];
  page.on("request", (r) => {
    if (MAP_DATA.test(r.url())) mapDataRequests.push(r.url());
  });

  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
  expect(mapDataRequests, "gazetteer must not load at boot").toHaveLength(0);

  await page.getByRole("button", { name: /pick on map/ }).first().click();
  // Suspense resolves the lazy chunk, then the map draws its vendored outline.
  await expect(page.getByRole("img", { name: /world map/i })).toBeVisible({ timeout: 10_000 });

  // Both artifacts are fetched on demand: the outline to draw the map, the city
  // list to answer a search. Poll, because the picker warms them in an effect.
  await expect
    .poll(() => mapDataRequests.length, { timeout: 10_000 })
    .toBeGreaterThan(0);

  // Whatever it fetched, it stayed on our own origin — the point of GAZ-4.
  for (const url of mapDataRequests) {
    const host = new URL(url).hostname;
    expect(["127.0.0.1", "localhost"]).toContain(host);
  }
});
