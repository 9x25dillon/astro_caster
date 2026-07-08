// vault.ts — B1 of the next arc (docs/progress/NEXT_ARC.md): export and
// restore ALL of the observatory's local state as a single file, so a
// browser-data clear can't erase profiles, entitlement, report claims,
// bookmarks, or the ask queue.
//
// Privacy posture: the vault file is built locally and downloaded locally —
// nothing leaves the browser. It contains birth data and entitlement tokens,
// so it is the user's to guard (the UI says so).

import {
  journalAll, journalImport, shelfImport, shelfList,
  type JournalEntry, type ShelfEntry,
} from "./bookshelf";

const PREFIX = "aae.";
const FORMAT_V1 = "astra-vault@1";
const FORMAT_V2 = "astra-vault@2"; // @2 added the Bookshelf
const FORMAT = "astra-vault@3"; // @3 adds the Journal

export interface VaultFile {
  format: string;
  exported_at: string;
  localStorage: Record<string, string>;
  bookshelf?: ShelfEntry[];
  journal?: JournalEntry[];
}

/** Snapshot every aae.* localStorage key + the Bookshelf library. */
export async function buildVault(): Promise<VaultFile> {
  const state: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX)) {
      const v = localStorage.getItem(key);
      if (v !== null) state[key] = v;
    }
  }
  const bookshelf = await shelfList().catch(() => [] as ShelfEntry[]);
  const journal = await journalAll().catch(() => [] as JournalEntry[]);
  return {
    format: FORMAT,
    exported_at: new Date().toISOString(),
    localStorage: state,
    bookshelf,
    journal,
  };
}

/** Download the vault as astra-vault-YYYY-MM-DD.json. Returns entry count. */
export async function downloadVault(): Promise<number> {
  const vault = await buildVault();
  const blob = new Blob([JSON.stringify(vault, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `astra-vault-${vault.exported_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return Object.keys(vault.localStorage).length + (vault.bookshelf?.length ?? 0) + (vault.journal?.length ?? 0);
}

/** Restore a vault file's contents (accepts @1 and @2). Only aae.*-prefixed
 *  keys are written (allowlist — a doctored file can't plant arbitrary keys);
 *  existing aae.* keys the file doesn't carry are left alone. Bookshelf
 *  entries import by seed (overwrite). Returns the count restored; throws on
 *  an unrecognized file. */
export async function restoreVault(text: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("not a vault file (invalid JSON)");
  }
  const v = parsed as Partial<VaultFile>;
  const knownFormat = v.format === FORMAT || v.format === FORMAT_V2 || v.format === FORMAT_V1;
  if (!knownFormat || typeof v.localStorage !== "object" || v.localStorage === null) {
    throw new Error("not a vault file (unrecognized format)");
  }
  let written = 0;
  for (const [key, value] of Object.entries(v.localStorage)) {
    if (!key.startsWith(PREFIX) || typeof value !== "string") continue;
    localStorage.setItem(key, value);
    written += 1;
  }
  if (Array.isArray(v.bookshelf)) {
    written += await shelfImport(v.bookshelf);
  }
  if (Array.isArray(v.journal)) {
    written += await journalImport(v.journal);
  }
  return written;
}
