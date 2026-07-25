// lib/reportTokens.ts — the browser's record of purchased deluxe-edition claims.
//
// A claim is kept per Oracle-session SEED. The seed is deterministic (same
// chart + spread + question ⇒ same seed), so a purchase survives page reloads
// and identical re-runs of the Oracle Report. The map lives here rather than
// inside ArcanaModal because the Stripe redirect-return handler (which runs at
// app boot, long before the Arcana chapter mounts) has to write into it too.

const REPORT_TOKENS_KEY = "aae.report_tokens";

// Stripe's redirect carries only the checkout session id, but the claim also
// needs the raw Oracle seed — which must never travel to Stripe (it ends with
// the question; only its hash goes in the session metadata). So we stash the
// seed locally before leaving for the hosted page and read it back on return.
const PENDING_SEED_KEY = "aae.pending_report_seed";

export function loadReportToken(seed: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(REPORT_TOKENS_KEY) ?? "{}");
    return typeof map[seed] === "string" ? map[seed] : null;
  } catch { return null; }
}

export function saveReportToken(seed: string, token: string | null) {
  try {
    const map = JSON.parse(localStorage.getItem(REPORT_TOKENS_KEY) ?? "{}");
    if (token) map[seed] = token; else delete map[seed];
    localStorage.setItem(REPORT_TOKENS_KEY, JSON.stringify(map));
  } catch { /* storage unavailable — the claim just won't persist */ }
}

/** Remember which Oracle session a deluxe checkout was opened for, keyed by the
 *  checkout session id so a stale stash can't be misapplied to a later purchase. */
export function stashPendingReportSeed(sessionId: string, seed: string) {
  try {
    localStorage.setItem(PENDING_SEED_KEY, JSON.stringify({ sessionId, seed }));
  } catch { /* best-effort — the return handler surfaces the miss honestly */ }
}

/** Read back the seed for THIS checkout session. Returns null when the stash is
 *  missing or belongs to a different session (e.g. purchase finished in another
 *  browser), which the caller must surface rather than guess around. */
export function readPendingReportSeed(sessionId: string): string | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_SEED_KEY) ?? "null");
    if (!raw || typeof raw.seed !== "string") return null;
    return raw.sessionId === sessionId ? raw.seed : null;
  } catch { return null; }
}

export function clearPendingReportSeed() {
  try { localStorage.removeItem(PENDING_SEED_KEY); } catch { /* ignore */ }
}
