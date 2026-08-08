// TZ-2 — the birth offset is resolved from the birthplace's zone at the BIRTH
// MOMENT, not from the browser's clock today.
//
// The bug these cover was silent and produced a plausible-looking wrong chart:
// `tz_offset` defaulted to -5 and, on geolocate, was set from the browser's
// CURRENT offset. A July 1979 birth in New York entered from a machine sitting
// in winter (or in any other zone) was cast an hour or more off, and nothing
// anywhere said so.
//
// These drive the real ceremony, so they fail if the wiring between the
// gazetteer (which carries the IANA zone), the resolver, and the form is broken
// at any point — not just if the resolver's arithmetic is wrong. The resolver's
// own history/DST/LMT cases are unit-tested in @astra/core.
import { expect, test } from "./helpers";

/**
 * Every selector is scoped to the ceremony. The Controls panel renders behind
 * the modal with the SAME labels ("⊕ pick on map", the lat/lng fields), so an
 * unscoped `getByRole` matches two elements and fails strict mode.
 */
const modal = (page: import("@playwright/test").Page) => page.locator(".ceremony-modal");

/** Open the ceremony and fill the birth moment. */
async function ceremonyAt(
  page: import("@playwright/test").Page,
  { year, month, day, hour }: { year: number; month: number; day: number; hour: number },
) {
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 20_000 });
  await page.locator(".threshold-primary").click();
  await expect(page.locator(".ceremony-modal")).toBeVisible();

  const field = (name: string) => modal(page).locator(".ceremony-field").filter({ hasText: name }).locator("input");

  // Step 1 is the date/time step; advance from the opening panel.
  await modal(page).getByRole("button", { name: /Begin/ }).click();
  await field("Year").fill(String(year));
  // Month is a <select>, not a number input.
  await modal(page).locator(".ceremony-field").filter({ hasText: "Month" })
    .locator("select").selectOption(String(month));
  await field("Day").fill(String(day));
  await field("Hour").fill(String(hour));
  await field("Minute").fill("0");
}

/**
 * Advance to the place step, choose a city from the offline gazetteer, then
 * return to the date step — which is where the Timezone field lives. The two
 * halves of one decision sit on different steps, so the resolver has to survive
 * the round trip rather than only being right at the instant of the pick.
 */
async function pickCity(page: import("@playwright/test").Page, query: string, name: RegExp) {
  await modal(page).getByRole("button", { name: /Continue/ }).click();
  await modal(page).getByRole("button", { name: /pick on map/ }).click();
  await modal(page).getByPlaceholder(/city or place name/i).fill(query);
  await modal(page).getByRole("button", { name: "Find" }).click();
  await modal(page).getByRole("button", { name }).first().click();
  await modal(page).getByRole("button", { name: /Back/ }).click();
}

const tzField = (page: import("@playwright/test").Page) =>
  modal(page).locator(".ceremony-field").filter({ hasText: "Timezone" }).locator("input");

test("a summer birth resolves to the DST offset in force that year", async ({ page }) => {
  await ceremonyAt(page, { year: 1979, month: 7, day: 4, hour: 12 });
  await pickCity(page, "New York", /^New York City/);
  // EDT in July 1979. The old code produced -5 (the hardcoded default) or
  // whatever the test machine's clock said today — never a date-aware answer.
  await expect(tzField(page)).toHaveValue("-4");
});

test("a winter birth in the same city resolves to standard time", async ({ page }) => {
  await ceremonyAt(page, { year: 1979, month: 1, day: 4, hour: 12 });
  await pickCity(page, "New York", /^New York City/);
  await expect(tzField(page)).toHaveValue("-5");
});

test("changing the birth date after choosing the city re-resolves the offset", async ({ page }) => {
  // The offset depends on BOTH the place and the moment, so picking a city can't
  // be the only trigger — this is the ordering the naive fix gets wrong.
  await ceremonyAt(page, { year: 1979, month: 1, day: 4, hour: 12 });
  await pickCity(page, "New York", /^New York City/);
  await expect(tzField(page)).toHaveValue("-5");

  await modal(page).locator(".ceremony-field").filter({ hasText: "Month" })
    .locator("select").selectOption("7");
  await expect(tzField(page)).toHaveValue("-4");
});

test("a zone whose rules changed uses the rule of the birth year, not today's", async ({ page }) => {
  // Nepal moved to +05:45 in 1986; a 1985 birth must resolve to +05:30. No
  // amount of reading the browser's current clock can produce this.
  await ceremonyAt(page, { year: 1985, month: 1, day: 1, hour: 12 });
  await pickCity(page, "Kathmandu", /^Kathmandu/);
  await expect(tzField(page)).toHaveValue("5.5");
});

test("the resolution explains itself rather than silently adjusting", async ({ page }) => {
  await ceremonyAt(page, { year: 1979, month: 7, day: 4, hour: 12 });
  await pickCity(page, "New York", /^New York City/);
  // Voice canon: never be silently clever. An ordinary resolution still says
  // which zone it came from and that history was taken into account.
  await expect(page.locator(".ceremony-modal")).toContainText(/America\/New_York|historical rules/i);
});

test("typing an offset by hand takes it back from the resolver", async ({ page }) => {
  // The visitor is the final authority on their own birth certificate — a
  // manual entry must not be overwritten on the next keystroke elsewhere.
  await ceremonyAt(page, { year: 1979, month: 7, day: 4, hour: 12 });
  await pickCity(page, "New York", /^New York City/);
  await expect(tzField(page)).toHaveValue("-4");

  await tzField(page).fill("-9.5");
  await modal(page).locator(".ceremony-field").filter({ hasText: "Day" }).locator("input").fill("5");
  await expect(tzField(page)).toHaveValue("-9.5");
});
