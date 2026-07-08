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
const DB_VERSION = 1;
const STORE = "sessions";

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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
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
  await tx("readwrite", (s) =>
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
  await tx("readwrite", (s) =>
    s.put({ ...existing, personal, updatedAt: new Date().toISOString() })
  );
}

export function shelfGet(seed: string): Promise<ShelfEntry | null> {
  return tx<ShelfEntry | undefined>("readonly", (s) => s.get(seed)).then((r) => r ?? null);
}

export function shelfList(): Promise<ShelfEntry[]> {
  return tx<ShelfEntry[]>("readonly", (s) => s.getAll()).then((all) =>
    all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  );
}

export function shelfDelete(seed: string): Promise<void> {
  return tx("readwrite", (s) => s.delete(seed)).then(() => undefined);
}

/** Bulk import (Vault restore). Existing seeds are overwritten. */
export async function shelfImport(entries: ShelfEntry[]): Promise<number> {
  let n = 0;
  for (const e of entries) {
    if (!e || typeof e.seed !== "string" || typeof e.report !== "string") continue;
    await tx("readwrite", (s) => s.put(e));
    n += 1;
  }
  return n;
}
