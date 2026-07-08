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
const DB_VERSION = 2; // v2 adds the journal store (P1)
const STORE = "sessions";
const JOURNAL = "journal";

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
