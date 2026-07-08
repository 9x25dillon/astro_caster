// vault.ts — B1 of the next arc (docs/progress/NEXT_ARC.md): export and
// restore ALL of the observatory's local state as a single file, so a
// browser-data clear can't erase profiles, entitlement, report claims,
// bookmarks, or the ask queue.
//
// Privacy posture: the vault file is built locally and downloaded locally —
// nothing leaves the browser. It contains birth data and entitlement tokens,
// so it is the user's to guard (the UI says so).

const PREFIX = "aae.";
const FORMAT = "astra-vault@1";

export interface VaultFile {
  format: string;
  exported_at: string;
  localStorage: Record<string, string>;
}

/** Snapshot every aae.* localStorage key. */
export function buildVault(): VaultFile {
  const state: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX)) {
      const v = localStorage.getItem(key);
      if (v !== null) state[key] = v;
    }
  }
  return { format: FORMAT, exported_at: new Date().toISOString(), localStorage: state };
}

/** Download the vault as astra-vault-YYYY-MM-DD.json. Returns the key count. */
export function downloadVault(): number {
  const vault = buildVault();
  const blob = new Blob([JSON.stringify(vault, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `astra-vault-${vault.exported_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return Object.keys(vault.localStorage).length;
}

/** Restore a vault file's contents. Only aae.*-prefixed keys are written
 *  (allowlist — a doctored file can't plant arbitrary keys). Existing aae.*
 *  keys the file doesn't carry are left alone. Returns the count written;
 *  throws on an unrecognized file. */
export function restoreVault(text: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("not a vault file (invalid JSON)");
  }
  const v = parsed as Partial<VaultFile>;
  if (v.format !== FORMAT || typeof v.localStorage !== "object" || v.localStorage === null) {
    throw new Error("not a vault file (unrecognized format)");
  }
  let written = 0;
  for (const [key, value] of Object.entries(v.localStorage)) {
    if (!key.startsWith(PREFIX) || typeof value !== "string") continue;
    localStorage.setItem(key, value);
    written += 1;
  }
  return written;
}
