// B1 (NEXT_ARC): the Vault — export all aae.* local state as one file,
// restore it after a wipe. Done-when, verbatim: "clear browser data, import
// file, everything is back."
import { expect, test } from "./helpers";

test("vault export → wipe → restore brings the observatory's state back", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();

  // Seed distinctive state across several aae.* keys.
  await page.evaluate(() => {
    localStorage.setItem("aae.profiles", JSON.stringify([{
      id: "t1", name: "Vault Test Chart", createdAt: "2026-07-08",
      birth: { year: 1987, month: 11, day: 11, hour: 10, minute: 23, second: 0,
               lat: 34.9333, lng: -117.1833, tz_offset: -8, house_system: "P",
               zodiac: "tropical", ayanamsha: 1, label: "Vault Test Chart" },
    }]));
    localStorage.setItem("aae.forecast_bookmarks", JSON.stringify(["vault-mark"]));
  });
  await page.reload();

  // Export: capture the download and keep its contents.
  const downloadP = page.waitForEvent("download");
  await page.locator(".vault-export").click();
  const download = await downloadP;
  expect(download.suggestedFilename()).toMatch(/^astra-vault-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();

  // Wipe: the state is gone.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("aae.profiles"))).toBeNull();

  // Restore: confirm the dialog, feed the file, page reloads itself.
  page.on("dialog", (d) => d.accept());
  await page.locator(".vault-import").click();
  await page.locator('input[type="file"]').setInputFiles(path!);
  await page.waitForURL("**/*"); // reload
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem("aae.profiles")))
    .toContain("Vault Test Chart");
  expect(await page.evaluate(() => localStorage.getItem("aae.forecast_bookmarks")))
    .toContain("vault-mark");

  // The restored profile is visible in the UI.
  await expect(page.locator(".profile-item").first()).toContainText("Vault Test Chart");
});
