// freeAllowance.ts — the free tier's daily taste of the good model (FREE-1).
//
// Two readings a day are written by the same model Supporter subscribers get,
// kept deliberately short; after that the writing continues on a smaller model,
// and with no connection at all, on the engine in the browser. What the
// allowance withholds is LENGTH, not quality — the upgrade sells room to finish
// a thought, not a better mind.
//
// WHY THIS LIVES ON THE DEVICE, and not on a server:
// free readings have no account and no token, so a server-side counter would
// have to key on something — an IP, or an identifier we mint and store. Both
// contradict the privacy claim this product actually keeps (no accounts, no
// retention, nothing to hand over). Counting here means we mint nothing.
//
// The tradeoff, stated plainly because the pricing page states it too: clearing
// browser data resets the count. That is acceptable, because this is a
// COURTESY LIMIT and not a security boundary — the real spend ceiling is
// budget.py's server-side global daily cap, which no client can move. Guarding
// a ~$0.03 call with a tracking identifier would cost more in privacy than it
// saves in tokens.

const KEY = "aae.free_allowance";

/** Readings per local day written by the premium model. */
export const DAILY_PREMIUM_READINGS = 2;

interface Ledger {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  used: number;
}

/**
 * The visitor's own local day, not UTC — "two a day" should turn over when
 * their date does, not at some hour that depends on where they live.
 */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function read(): Ledger {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Ledger>;
      if (parsed && parsed.day === today() && typeof parsed.used === "number") {
        return { day: parsed.day, used: Math.max(0, parsed.used) };
      }
    }
  } catch {
    // Private-browsing or a wiped/corrupt entry. Fail OPEN: the visitor gets
    // their allowance. The global spend cap is what protects the budget, so a
    // storage failure must never read as "you've had enough".
  }
  return { day: today(), used: 0 };
}

function write(l: Ledger): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    // Storage unavailable — the allowance silently stops being counted rather
    // than blocking a reading the visitor is entitled to.
  }
}

/** Whether the next free reading still falls inside today's premium allowance. */
export function premiumAvailable(): boolean {
  return read().used < DAILY_PREMIUM_READINGS;
}

/** How many premium readings remain today (never negative). */
export function premiumRemaining(): number {
  return Math.max(0, DAILY_PREMIUM_READINGS - read().used);
}

/**
 * Record that a premium free reading was served. Call this only after the
 * request succeeds — a failed or offline reading must not spend the allowance.
 */
export function consumePremium(): void {
  const l = read();
  write({ day: l.day, used: l.used + 1 });
}

/** Test seam. */
export function resetAllowance(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
