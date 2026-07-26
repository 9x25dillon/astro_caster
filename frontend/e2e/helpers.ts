import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Tokens minted by global-setup; empty object when minting was unavailable. */
export function mintedTokens(): { supporter?: string; oracle?: string } {
  try {
    return JSON.parse(readFileSync(path.resolve("e2e/.tokens.json"), "utf8"));
  } catch {
    return {};
  }
}

// Every spec starts past the first-run ceremony and privacy banner so tests
// land directly on the observatory.
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      localStorage.setItem("aae.ceremony_shown", "1");
      localStorage.setItem("aae.privacy_ack", "1");
    });
    await use(context);
  },
});

export { expect } from "@playwright/test";

/**
 * Track E-1: land the browser PAST the threshold, i.e. as somebody who already
 * has a chart of their own rather than a first-time visitor meeting the live
 * sky. Arrival prefers this browser's last cast, so rewriting that cast's birth
 * to a personal one and reloading is the honest way in — and the second load
 * also caches a real chart for it, which specs that then sever the API rely on.
 */
export async function pastThreshold(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
  await page.evaluate(() => {
    const raw = localStorage.getItem("aae.last_chart");
    if (!raw) throw new Error("no cached cast to rewrite — did arrival fail?");
    const parsed = JSON.parse(raw);
    parsed.birth = { ...parsed.birth, year: 1990, month: 6, day: 15, hour: 12, label: "Test person" };
    localStorage.setItem("aae.last_chart", JSON.stringify(parsed));
  });
  await page.reload();
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
}

/**
 * Put one entry on the shelf, for specs that need a populated Library.
 *
 * Opens VERSIONLESS on purpose. Three specs each carried their own copy of this
 * pinned to `astra-bookshelf` version 2 while the app's schema had moved on to
 * 4 — harmless only for as long as nothing opened the DB before the seed ran,
 * and the moment something did they all threw VersionError. Versionless attaches
 * to whatever version exists; the stores are created only if the app somehow
 * hasn't yet, so this cannot go stale on the next schema bump.
 */
export async function seedShelf(page: import("@playwright/test").Page, entry: unknown) {
  await page.evaluate(async (e) => {
    const openDb = (version?: number) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = version ? indexedDB.open("astra-bookshelf", version)
                            : indexedDB.open("astra-bookshelf");
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "seed" });
          if (!db.objectStoreNames.contains("journal")) {
            const j = db.createObjectStore("journal", { keyPath: "id" });
            j.createIndex("seed", "seed", { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

    let db = await openDb();
    if (!db.objectStoreNames.contains("sessions")) {
      const next = db.version + 1;
      db.close();
      db = await openDb(next);
    }
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("sessions", "readwrite");
      t.objectStore("sessions").put(e);
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror = () => reject(t.error);
    });
  }, entry);
}

/** Track R: navigate via the chapter dial (fixed compass positions). */
export async function openChapter(
  page: import("@playwright/test").Page,
  ch: "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII",
) {
  await page.locator(`.dial-node[data-ch="${ch}"]`).click();
}
