// oracleSession.ts — an Oracle session survives a page RELOAD, not just a
// chapter switch.
//
// `arcanaSession.ts` keeps state across the remount a chapter switch causes.
// It cannot survive a full navigation, because module memory dies with the
// page — and a full navigation is exactly what returning from Stripe is.
//
// That gap cost a real purchase. Measured on the box, 2026-08-28: a $5.50
// deluxe edition was paid for at 03:07:59 and the receipt is on the ledger,
// verified, bound to one session seed — and `personal_report` generations
// EVER: 0. The customer paid, Stripe redirected them back, the page reloaded
// with no Oracle session in memory, and the button that spends the claim had
// nothing to attach to.
//
// Nothing was ever actually lost: every Oracle session shelves itself to the
// Library (IndexedDB) the moment it is generated, and a ShelfEntry already
// carries every field the deluxe compile needs. This module is the read side
// — it turns a shelved row back into the live session it came from.
import { shelfList, type ShelfEntry } from "./bookshelf";
import { sameBirth } from "./birthIdentity";
import type { BirthInput } from "../types";
import type { OracleReportResponse } from "../api/client";

/** How far back a reload will reach to restore a session.
 *
 *  A bounded window, because "persist my session" and "resurrect a reading
 *  from three weeks ago every time I open the app" are different products.
 *  The Library is the right home for anything older, and it is one click
 *  away. 24h comfortably covers the case this exists for — a checkout return
 *  is seconds later, and finishing tomorrow morning what you started tonight
 *  is still one session. */
export const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RestoredSession {
  oracle: OracleReportResponse;
  /** The exact (date, generatedAt) context the deluxe compile must echo. */
  ctx: { date: string | null; generatedAt: string };
  /** When the session was shelved — shown so a restored reading says so. */
  savedAt: string;
}

/** The local calendar date of an ISO timestamp, in `localToday()`'s format. */
function localDateOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** A shelved row, back in the shape the Oracle tab renders and the deluxe
 *  compile posts.
 *
 *  `disclaimer` is the one field a ShelfEntry does not carry. It is server
 *  copy the modal does not render, and inventing a plausible-looking one here
 *  would be worse than an empty string: a disclaimer nobody wrote is exactly
 *  the kind of text that must never be manufactured on the client. */
export function sessionFromShelf(entry: ShelfEntry): RestoredSession {
  return {
    oracle: {
      seed: entry.seed,
      question: entry.question,
      spread: entry.spread as OracleReportResponse["spread"],
      source: entry.source as OracleReportResponse["source"],
      lineage: entry.lineage,
      report: entry.report,
      ai_source: (entry.ai_source === "llm" ? "llm" : "offline"),
      model: entry.model,
      disclaimer: "",
    },
    ctx: {
      // The local date is part of the SEED for daily spreads, so it must come
      // back exactly as it was sent — never re-derived from today.
      date: entry.date,
      // Only the cover shows this; the seed does not fold it in.
      generatedAt: localDateOf(entry.savedAt) || localDateOf(entry.updatedAt),
    },
    savedAt: entry.savedAt,
  };
}

/** Which shelved session a reload should restore — the policy, with no
 *  storage in it, so every rule below is testable without a database.
 *
 *  Scoped to the birth for the same reason `arcanaSession` is: a reading must
 *  never reappear under somebody else's chart. Entries shelved before `birth`
 *  was recorded (older ones carry `birth: null`) are skipped rather than
 *  guessed at — an unattributable reading is not this chart's.
 *
 *  `entries` is expected newest-first, as `shelfList()` returns, but the
 *  newest MATCH is chosen explicitly rather than trusted from the order: the
 *  wrong session restored is the wrong claim offered. */
export function pickLatestSession(
  entries: ShelfEntry[],
  birth: BirthInput | null | undefined,
  now: number = Date.now(),
): RestoredSession | null {
  if (!birth) return null;
  let best: ShelfEntry | null = null;
  let bestAt = -Infinity;
  for (const e of entries) {
    if (!sameBirth(e.birth, birth)) continue;
    if (!e.report?.trim()) continue;   // nothing to restore
    const at = new Date(e.savedAt).getTime();
    if (Number.isNaN(at)) continue;
    if (now - at > RESTORE_WINDOW_MS) continue;
    if (at > bestAt) { best = e; bestAt = at; }
  }
  return best ? sessionFromShelf(best) : null;
}

/** The most recent Oracle session for THIS birth, within the restore window. */
export async function latestSessionForBirth(
  birth: BirthInput | null | undefined,
  now: number = Date.now(),
): Promise<RestoredSession | null> {
  if (!birth) return null;
  try {
    return pickLatestSession(await shelfList(), birth, now);
  } catch {
    return null;   // no Library (private mode, blocked storage) — not an error
  }
}
