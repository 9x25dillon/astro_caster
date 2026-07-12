// R-3: the Library (chapter VIII) — spine meter, ✦ Generate My Tome, vault &
// support in residence — and the Reading (chapter II) gathering soul + Oracle.
import { expect, test, openChapter } from "./helpers";
import type { Page } from "@playwright/test";

const ENTRY = {
  seed: "e2e-library-seed",
  savedAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-07-01T09:00:00.000Z",
  question: "What does the library hold?",
  spread: "three_card", source: "golden_dawn", lineage: "Golden Dawn / Hermetic",
  date: null, ai_source: "offline", model: null,
  report: "# ✦ ORACLE REPORT ✦\n\n## I. Bound\n\nA reading for the tome to bind.",
  birth: null,
};

async function seedShelf(page: Page) {
  await page.evaluate(async (entry) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("astra-bookshelf", 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "seed" });
        if (!db.objectStoreNames.contains("journal")) {
          const j = db.createObjectStore("journal", { keyPath: "id" });
          j.createIndex("seed", "seed", { unique: false });
        }
      };
      req.onsuccess = () => {
        const t = req.result.transaction("sessions", "readwrite");
        t.objectStore("sessions").put(entry);
        t.oncomplete = () => { req.result.close(); resolve(); };
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, ENTRY);
}

test("the Library: spine meter, shelf, vault, and support share chapter VIII", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
  await openChapter(page, "VIII");

  // The spine renders all eight chapters; the cast chart binds chapter I.
  await expect(page.locator(".tome-seg")).toHaveCount(8);
  await expect(page.locator(".tome-seg.bound").first()).toBeVisible();
  // The waiting list is honest about empty chapters.
  await expect(page.locator(".tome-waiting li").first()).toBeVisible();

  // Shelf, vault, and support in residence.
  await expect(page.locator(".shelf-modal")).toBeVisible();
  await expect(page.locator(".vault-export")).toBeVisible();
  await expect(page.locator(".lib-support-btn")).toBeVisible();

  // The refrain runs at the chapter's foot.
  await expect(page.locator(".chapter-refrain")).toContainText("life poem");
});

test("masthead pill is identity — it walks to the Library, whose button opens support", async ({ page }) => {
  await page.goto("/");
  await page.locator(".support-pill").click();
  await expect(page.locator(".lib-support-btn")).toBeVisible();
  await page.locator(".lib-support-btn").click();
  await expect(page.locator(".modal-overlay .modal")).toBeVisible();
});

test("the tome compiles what exists into one printed volume", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
  await seedShelf(page);
  await openChapter(page, "VIII");

  // Chart (I) + the seeded session (II) are bound.
  await expect(page.locator(".tome-seg.bound")).toHaveCount(2);

  const popupP = page.waitForEvent("popup");
  await page.locator(".tome-compile").click();
  const popup = await popupP;
  await expect(popup.locator("body")).toContainText("THE TOME");
  await expect(popup.locator("body")).toContainText("What does the library hold?");
  // The colophon ends with the refrain.
  await expect(popup.locator("body")).toContainText("life poem");
});

test("the Reading (II) gathers the soul profile and the Oracle beneath the Arcana", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
  await openChapter(page, "II");
  await expect(page.locator(".arcana-modal")).toBeVisible();
  await expect(page.locator(".soul-modal")).toBeVisible();
  await expect(page.locator(".oracle-modal")).toBeVisible();
  // No overlay chrome anywhere in the chapter.
  await expect(page.locator(".chapter-host .modal-overlay")).toHaveCount(0);
});
