/**
 * Python-compatible decimal rounding.
 *
 * `Math.round` is round-half-UP; Python's `round()` is round-half-to-EVEN.
 * Every value this package rounds is compared against a backend that used
 * Python's rule, so the difference is not cosmetic — it lands as a one-ULP
 * disagreement exactly at boundaries, which is where comparisons are most
 * likely to be looking.
 *
 * This lives in its own module rather than in `tarot.ts` (its original home)
 * because `forecast.ts` and `advanced.ts` need it too, and importing it from
 * `tarot.ts` would pull the 78-card deck JSON into every bundle that only
 * wanted to round a number.
 *
 * A1 caught this class once already, in `ephemeris.ts`'s `round6`, where it
 * moved `meta.julian_day` by 1e-6 on one case in 2000. `forecast.ts` and
 * `advanced.ts` each kept a private `round3 = Math.round(x * 1e3) / 1e3` that
 * the fix never reached; shipping the full Swiss data files moved enough orb
 * values onto exact boundaries to expose them.
 */

/** Python's `round(x, ndigits)`: round half to EVEN. */
export function pyRound(x: number, ndigits: number): number {
  const m = 10 ** ndigits;
  const scaled = x * m;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let r: number;
  if (diff > 0.5) r = floor + 1;
  else if (diff < 0.5) r = floor;
  else r = floor % 2 === 0 ? floor : floor + 1; // exactly .5 → nearest even
  return r / m;
}
