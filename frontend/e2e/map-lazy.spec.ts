// Leaflet is lazy-loaded (roadmap H1 bundle hygiene): the chunk must not ship
// at boot, and the picker must still mount on demand.
import { expect, test } from "./helpers";

test("the map chunk loads on demand and the picker mounts", async ({ page }) => {
  const leafletRequests: string[] = [];
  page.on("request", (r) => {
    if (/leaflet/i.test(r.url())) leafletRequests.push(r.url());
  });

  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
  expect(leafletRequests, "leaflet must not load at boot").toHaveLength(0);

  await page.getByRole("button", { name: /pick on map/ }).first().click();
  // Suspense resolves the lazy chunk, then leaflet builds its container.
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 10_000 });
  expect(leafletRequests.length, "leaflet chunk fetched on demand").toBeGreaterThan(0);
});
