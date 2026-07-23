// bookshelf.ts — B2 of the next arc (docs/progress/NEXT_ARC.md): the local
// report library. Every Oracle session (and its deluxe Personal Report, when
// compiled) persists to IndexedDB so paid readings become a permanent,
// offline-reopenable corpus — and, later, the source the physical tome's
// compiler reads (PB1).
//
// One record per Oracle SESSION, keyed by the session seed: re-generating the
// same session overwrites idempotently; compiling the deluxe edition attaches
// to the existing entry. localStorage is wrong for this (reports are tens of
// kilobytes each) — IndexedDB has no practical ceiling for our sizes.
//
// Privacy: entries carry birth data and report text; they live in the
// browser's own storage like the profiles, and travel only inside Vault
// exports (astra-vault@2), which are built and saved locally.

import type { BirthInput } from "../types";

const DB_NAME = "astra-bookshelf";
// v2 journal (P1); v3 gallery (Archive images); v4 documents (Archive text —
// forecasts/relationships/specialist charts shelve for the tome).
const DB_VERSION = 4;
const STORE = "sessions";
const JOURNAL = "journal";
const GALLERY = "gallery";
const DOCUMENTS = "documents";

export interface ShelfPersonal {
  report_markdown: string;
  short_seed: string;
  oracle_date: string;
  ai_source: string;
  model: string | null;
  spread: string;
}

export interface ShelfEntry {
  seed: string; // primary key — the session's deterministic identity
  savedAt: string;
  updatedAt: string;
  question: string;
  spread: string;
  source: string;
  lineage: string;
  date: string | null; // local date passed on the oracle call (daily spreads)
  ai_source: string;
  model: string | null;
  report: string; // the Oracle Report markdown
  birth: BirthInput | null; // for offline re-cast + plate re-deal on reprint
  personal?: ShelfPersonal;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "seed" });
      }
      if (!req.result.objectStoreNames.contains(JOURNAL)) {
        const j = req.result.createObjectStore(JOURNAL, { keyPath: "id" });
        j.createIndex("seed", "seed", { unique: false });
      }
      if (!req.result.objectStoreNames.contains(GALLERY)) {
        const g = req.result.createObjectStore(GALLERY, { keyPath: "id" });
        g.createIndex("kind", "kind", { unique: false });
        g.createIndex("cardId", "cardId", { unique: false });
      }
      if (!req.result.objectStoreNames.contains(DOCUMENTS)) {
        const d = req.result.createObjectStore(DOCUMENTS, { keyPath: "id" });
        d.createIndex("kind", "kind", { unique: false });
        d.createIndex("chapter", "chapter", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const req = run(t.objectStore(storeName));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

/** Save (or overwrite) an Oracle session. Preserves an attached personal
 *  edition if the entry already exists and the new save doesn't carry one. */
export async function shelfSaveOracle(entry: Omit<ShelfEntry, "savedAt" | "updatedAt">): Promise<void> {
  const existing = await shelfGet(entry.seed).catch(() => null);
  const now = new Date().toISOString();
  await tx(STORE, "readwrite", (s) =>
    s.put({
      ...entry,
      personal: entry.personal ?? existing?.personal,
      savedAt: existing?.savedAt ?? now,
      updatedAt: now,
    })
  );
}

/** Attach the deluxe Personal Report to its session's entry. */
export async function shelfAttachPersonal(seed: string, personal: ShelfPersonal): Promise<void> {
  const existing = await shelfGet(seed);
  if (!existing) return; // session was never shelved (shouldn't happen)
  await tx(STORE, "readwrite", (s) =>
    s.put({ ...existing, personal, updatedAt: new Date().toISOString() })
  );
}

export function shelfGet(seed: string): Promise<ShelfEntry | null> {
  return tx<ShelfEntry | undefined>(STORE, "readonly", (s) => s.get(seed)).then((r) => r ?? null);
}

export function shelfList(): Promise<ShelfEntry[]> {
  return tx<ShelfEntry[]>(STORE, "readonly", (s) => s.getAll()).then((all) =>
    all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  );
}

export function shelfDelete(seed: string): Promise<void> {
  return tx(STORE, "readwrite", (s) => s.delete(seed)).then(() => undefined);
}

/** Bulk import (Vault restore). Existing seeds are overwritten. */
export async function shelfImport(entries: ShelfEntry[]): Promise<number> {
  let n = 0;
  for (const e of entries) {
    if (!e || typeof e.seed !== "string" || typeof e.report !== "string") continue;
    await tx(STORE, "readwrite", (s) => s.put(e));
    n += 1;
  }
  return n;
}

// ── The Journal (P1) — written reflections, shelved beside their readings ──

export interface JournalEntry {
  id: string; // `${seed}|${position}` for card-prompted; `free|${seed}|${ts}` for freeform
  seed: string; // the session/reading it reflects on
  position: string | null;
  prompt: string | null;
  cardName: string | null;
  question: string | null;
  text: string;
  createdAt: string;
  updatedAt: string;
}

/** Upsert a reflection. Card-prompted entries overwrite in place (one pad per
 *  card per session); freeform entries always append. */
export async function journalSave(
  e: Omit<JournalEntry, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<JournalEntry> {
  const now = new Date().toISOString();
  const id =
    e.id ?? (e.position ? `${e.seed}|${e.position}` : `free|${e.seed}|${now}`);
  const existing = await tx<JournalEntry | undefined>(JOURNAL, "readonly", (s) => s.get(id));
  const entry: JournalEntry = {
    ...e, id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await tx(JOURNAL, "readwrite", (s) => s.put(entry));
  return entry;
}

export function journalForSeed(seed: string): Promise<JournalEntry[]> {
  return openDb().then(
    (db) =>
      new Promise<JournalEntry[]>((resolve, reject) => {
        const t = db.transaction(JOURNAL, "readonly");
        const req = t.objectStore(JOURNAL).index("seed").getAll(seed);
        req.onsuccess = () => resolve(req.result.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)));
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export function journalAll(): Promise<JournalEntry[]> {
  return tx<JournalEntry[]>(JOURNAL, "readonly", (s) => s.getAll()).then((all) =>
    all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  );
}

export function journalDelete(id: string): Promise<void> {
  return tx(JOURNAL, "readwrite", (s) => s.delete(id)).then(() => undefined);
}

/** Bulk import (Vault restore); overwrites by id. */
export async function journalImport(entries: JournalEntry[]): Promise<number> {
  let n = 0;
  for (const e of entries) {
    if (!e || typeof e.id !== "string" || typeof e.text !== "string") continue;
    await tx(JOURNAL, "readwrite", (s) => s.put(e));
    n += 1;
  }
  return n;
}

/** The whole journal as markdown — the local-first export. */
export async function journalMarkdown(): Promise<string> {
  const entries = await journalAll();
  const bySeed = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const l = bySeed.get(e.seed) ?? [];
    l.push(e);
    bySeed.set(e.seed, l);
  }
  const parts: string[] = ["# Astra Arcana — Journal", ""];
  for (const [seed, list] of bySeed) {
    const q = list.find((e) => e.question)?.question;
    parts.push(`## ${list[0].createdAt.slice(0, 10)}${q ? ` — *${q}*` : ""}`);
    parts.push(`<sub>session ${seed.length > 24 ? seed.slice(0, 24) + "…" : seed}</sub>`, "");
    for (const e of list) {
      if (e.position) {
        parts.push(`### ${e.position}${e.cardName ? ` — ${e.cardName}` : ""}`);
        if (e.prompt) parts.push(`> ✎ ${e.prompt}`, "");
      } else {
        parts.push(`### Reflection · ${e.createdAt.slice(0, 16).replace("T", " ")}`);
      }
      parts.push(e.text, "");
    }
  }
  return parts.join("\n");
}

// ── The Gallery (The Archive) — generated images, shelved to be collected ──
//
// Every rendered tarot plate, built sigil, or exported chart image persists
// here so it becomes a permanent, collectible artifact — the source for a
// physical tarot deck (VII binds these; the deck-press lays them out) and an
// illustrated companion to the deluxe tome. Images are stored as data URLs
// (base64 PNG or inline SVG) so they travel inside a Vault export unchanged.

export type GalleryKind = "plate" | "sigil" | "wheel" | "chart" | "other";

export interface GalleryItem {
  id: string;          // dedup key — e.g. `plate:${source}:${cardId}` (latest wins)
  kind: GalleryKind;
  cardId: string | null;   // the tarot card, when kind === "plate"
  title: string;           // display label, e.g. "Death — The Studio plate"
  mime: string;            // "image/png" | "image/svg+xml"
  data: string;            // a data: URL (self-contained, print- and vault-safe)
  source: string | null;   // deck lineage (golden_dawn/thoth) or generator (openai)
  seed: string | null;     // the session/chart it belongs to, when applicable
  meta: Record<string, unknown> | null; // quality, model, prompt digest, etc.
  createdAt: string;
  updatedAt: string;
}

/** Save (or overwrite) a gallery artifact. A stable id (e.g. one per card per
 *  deck source) makes re-rendering replace the previous image in place. */
export async function gallerySave(
  item: Omit<GalleryItem, "createdAt" | "updatedAt">
): Promise<GalleryItem> {
  const existing = await tx<GalleryItem | undefined>(
    GALLERY, "readonly", (s) => s.get(item.id)
  ).catch(() => undefined);
  const now = new Date().toISOString();
  const entry: GalleryItem = {
    ...item,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await tx(GALLERY, "readwrite", (s) => s.put(entry));
  return entry;
}

export function galleryList(): Promise<GalleryItem[]> {
  return tx<GalleryItem[]>(GALLERY, "readonly", (s) => s.getAll()).then((all) =>
    all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  );
}

export function galleryByKind(kind: GalleryKind): Promise<GalleryItem[]> {
  return openDb().then(
    (db) =>
      new Promise<GalleryItem[]>((resolve, reject) => {
        const t = db.transaction(GALLERY, "readonly");
        const req = t.objectStore(GALLERY).index("kind").getAll(kind);
        req.onsuccess = () =>
          resolve(req.result.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)));
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export function galleryGet(id: string): Promise<GalleryItem | null> {
  return tx<GalleryItem | undefined>(GALLERY, "readonly", (s) => s.get(id)).then(
    (r) => r ?? null
  );
}

export function galleryDelete(id: string): Promise<void> {
  return tx(GALLERY, "readwrite", (s) => s.delete(id)).then(() => undefined);
}

/** Bulk import (Vault restore); overwrites by id. */
export async function galleryImport(items: GalleryItem[]): Promise<number> {
  let n = 0;
  for (const it of items) {
    if (!it || typeof it.id !== "string" || typeof it.data !== "string") continue;
    await tx(GALLERY, "readwrite", (s) => s.put(it));
    n += 1;
  }
  return n;
}

// ── The Documents (The Archive) — shelved text the tome binds ──
//
// Chapters III (The Timing / forecasts), IV (The Relations), and V (The
// Depths / specialist charts) produce text but never persisted it, so the
// tome bound nothing from them. Each generation now shelves a markdown
// summary here, keyed so a re-run overwrites in place.

export type DocChapter = "III" | "IV" | "V";

export interface ShelfDoc {
  id: string;          // dedup key, e.g. `forecast:${seed}` (re-run replaces)
  kind: string;        // forecast | synastry | composite | progressed | …
  chapter: DocChapter; // which tome chapter it binds into
  title: string;
  markdown: string;    // the text the tome renders
  seed: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Save (or overwrite) a shelved document. */
export async function docSave(
  doc: Omit<ShelfDoc, "createdAt" | "updatedAt">
): Promise<ShelfDoc> {
  const existing = await tx<ShelfDoc | undefined>(
    DOCUMENTS, "readonly", (s) => s.get(doc.id)
  ).catch(() => undefined);
  const now = new Date().toISOString();
  const entry: ShelfDoc = {
    ...doc,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await tx(DOCUMENTS, "readwrite", (s) => s.put(entry));
  return entry;
}

export function docList(): Promise<ShelfDoc[]> {
  return tx<ShelfDoc[]>(DOCUMENTS, "readonly", (s) => s.getAll()).then((all) =>
    all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  );
}

export function docByChapter(chapter: DocChapter): Promise<ShelfDoc[]> {
  return openDb().then(
    (db) =>
      new Promise<ShelfDoc[]>((resolve, reject) => {
        const t = db.transaction(DOCUMENTS, "readonly");
        const req = t.objectStore(DOCUMENTS).index("chapter").getAll(chapter);
        req.onsuccess = () =>
          resolve(req.result.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)));
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export function docDelete(id: string): Promise<void> {
  return tx(DOCUMENTS, "readwrite", (s) => s.delete(id)).then(() => undefined);
}

/** Bulk import (Vault restore); overwrites by id. */
export async function docImport(docs: ShelfDoc[]): Promise<number> {
  let n = 0;
  for (const d of docs) {
    if (!d || typeof d.id !== "string" || typeof d.markdown !== "string") continue;
    await tx(DOCUMENTS, "readwrite", (s) => s.put(d));
    n += 1;
  }
  return n;
}
