// arcanaSession.ts — the readings survive the chapter dial.
//
// ArcanaModal is mounted per-chapter with distinct keys (ch-ii / ch-vi /
// ch-vii), so switching chapters REMOUNTS it and every piece of component
// state dies — which read, to the person who had just paid for an Oracle
// Report, as "the text disappeared". The paid artifact was never lost (every
// session shelves itself to the Library), but the live view was, and a reader
// who does not know about the Library has simply lost their reading.
//
// This is the in-memory keep: `useSessionState` is a drop-in for `useState`
// that writes every value through to a module-level map and initializes from
// it on the next mount. Module state lives exactly as long as the page, which
// is the right scope — surviving a reload is the shelf's job, surviving a
// chapter switch is ours.
//
// SCOPE: the keep belongs to ONE chart. A reading rendered for one birth must
// never resurface under another, so ArcanaModal declares its scope on every
// render and a scope change empties the keep.
import { useCallback, useState } from "react";

const keep = new Map<string, unknown>();
let scope: string | null = null;

/** Declare the chart identity this session belongs to. A different identity
 *  empties the keep — reading state is per-chart, never carried across. */
export function scopeArcanaSession(next: string): void {
  if (next !== scope) {
    keep.clear();
    scope = next;
  }
}

/** Read a kept value, or `fallback` when this key has never been written
 *  (or was cleared by a scope change). */
export function readKeep<T>(key: string, fallback: T): T {
  return keep.has(key) ? (keep.get(key) as T) : fallback;
}

export function writeKeep<T>(key: string, value: T): void {
  keep.set(key, value);
}

/** Tests only — forget everything, including the scope. */
export function __resetArcanaSession(): void {
  keep.clear();
  scope = null;
}

/** Tests only. */
export function keepSize(): number {
  return keep.size;
}

/** `useState`, except the value survives an unmount and is restored on the
 *  next mount (same page, same chart). Keys are global to the module — keep
 *  them distinct per concern. */
export function useSessionState<T>(
  key: string,
  initial: T | (() => T),
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    readKeep(key, initial instanceof Function ? initial() : initial),
  );
  const set = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (action) => {
      setValue((prev) => {
        const next = action instanceof Function ? action(prev) : action;
        writeKeep(key, next);
        return next;
      });
    },
    [key],
  );
  return [value, set];
}
