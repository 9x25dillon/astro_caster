// TZ-1 / TZ-1b — wall-clock → UTC offset resolution, using the platform ICU
// tzdb through `Intl` alone. No dependency, no bundled tzdata: the platform
// already carries the historical transitions (verified 2026-08-03 — Kathmandu
// 1985 resolves to +05:30, not the modern +05:45, which only a real historical
// rule set can do).
//
// ── SCOPE BOUNDARY (TZ-4), read before extending ──────────────────────────
// This module resolves an *input*. It is never called by the chart engine, and
// `tz_offset` stays a plain number on the wire — so no IANA zone name enters
// ChartRequest, the backend never resolves a zone, and the Python↔TS parity
// contract is untouched. If a zone name were ever sent and resolved on the
// server, the client's ICU and the server's zoneinfo could disagree and
// reintroduce exactly the drift the parity CI exists to prevent. Keep
// resolution here, keep the wire numeric.
//
// It lives in @astra/core rather than the app because this package is where
// the unit-test runner is (`tsx --test`, wired into CI) — not because it is
// part of the deterministic substrate. It is not.

/** Local wall-clock fields, as a person reads them off a birth certificate. */
export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second?: number;
}

export type Ambiguity =
  | "none"
  /** The wall clock occurs twice (DST end). We take the FIRST occurrence. */
  | "fold"
  /** The wall clock never occurs (DST start). We shift forward into real time. */
  | "gap";

export interface OffsetResolution {
  /** The number to store as `tz_offset` — hours east of UTC, may be fractional. */
  hours: number;
  /** The UTC instant the wall clock resolves to. */
  utcMs: number;
  /** `lmt` means TZ-0 fired: the birth precedes standard time in this zone. */
  kind: "zone" | "lmt";
  ambiguity: Ambiguity;
  /**
   * Plain-language disclosure for the UI. The project's posture is never to be
   * silently clever (cf. the offline badge, the honest `ai_source`), so every
   * non-obvious resolution explains itself.
   */
  note?: string;
  /**
   * When `kind === "lmt"`, the zone's own offset — the value behind the
   * one-tap switch TZ-1b requires.
   */
  zoneAlternativeHours?: number;
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      // h23 so midnight is 00 and never 24, which would push the date forward.
      hourCycle: "h23",
      era: "short",
    });
    formatterCache.set(zone, f);
  }
  return f;
}

/**
 * The zone's UTC offset, in milliseconds, at a given UTC instant.
 *
 * `Intl` only ever answers "what is the local time at this UTC instant", so we
 * read the local wall clock it reports and subtract. Exact to the second, which
 * matters: LMT offsets are things like +00:53:28.
 */
export function zoneOffsetMsAt(utcMs: number, zone: string): number {
  // Snap the probe to a whole second BEFORE asking Intl. formatToParts reports
  // the local wall clock truncated to seconds, so subtracting a probe instant
  // that carries milliseconds yields a fractional-second "offset" — e.g.
  // -17762.5s where the zone's real offset is -17762s.
  //
  // That is not cosmetic. firstTransition() binary-searches on exact equality
  // with the LMT offset, and its midpoints land on arbitrary millisecond
  // values, so the predicate flipped false while still inside the LMT era and
  // the search converged on 1881-05-07 for America/New_York instead of the
  // true 1883-11-18 — every zone's transition date came out years early.
  //
  // Offsets in tzdb change only on whole seconds, so flooring the probe is
  // lossless.
  const probe = Math.floor(utcMs / 1000) * 1000;
  const parts = formatterFor(zone).formatToParts(new Date(probe));
  const get = (t: string): number => {
    const p = parts.find((x) => x.type === t);
    return p ? Number(p.value) : 0;
  };
  // BC dates would otherwise read as positive years; not reachable for birth
  // data, but the era part keeps the intent explicit rather than silently wrong.
  const bc = parts.find((x) => x.type === "era")?.value?.startsWith("B");
  const year = bc ? 1 - get("year") : get("year");

  return utcFromParts(year, get("month"), get("day"), get("hour"), get("minute"), get("second")) - probe;
}

/**
 * Date.UTC() maps two-digit years 0-99 onto 1900-1999, which would silently
 * relocate an early-CE date by nineteen centuries. setUTCFullYear has no such
 * remapping, so it recovers the intended year.
 *
 * Both callers go through here. They previously each did their own variant —
 * one guarded on `year < 100`, the other applied an unconditional shift — which
 * happened to agree only because the shift is zero above 99. One function, one
 * rule.
 */
function utcFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): number {
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  if (year >= 0 && year < 100) {
    const d = new Date(ms);
    d.setUTCFullYear(year);
    return d.getTime();
  }
  return ms;
}

const firstTransitionCache = new Map<string, number | null>();

/**
 * TZ-1b — the UTC instant of the zone's earliest offset change, or `null` if it
 * never changes (a zone that is LMT-only, or fixed like UTC).
 *
 * Structural, not heuristic: **every IANA zone begins with an LMT record by
 * construction**, so "still inside the first record" is exactly "before
 * standard time arrived here". That is why this is a search for the first
 * transition and not a year cutoff — standardisation dates vary enormously
 * (New York 1883, Berlin 1893, Dublin 1916, Kathmandu 1919), so any cutoff is
 * wrong in both directions.
 *
 * ~40 `Intl` calls, memoised per zone, fully deterministic.
 */
export function firstTransition(zone: string): number | null {
  const cached = firstTransitionCache.get(zone);
  if (cached !== undefined) return cached;

  // 1700 is comfortably before every IANA standardisation; `hi` is "now-ish"
  // held constant so the search cannot drift with the wall clock.
  let lo = Date.UTC(1700, 0, 1);
  let hi = Date.UTC(2100, 0, 1);
  const base = zoneOffsetMsAt(lo, zone);

  if (zoneOffsetMsAt(hi, zone) === base) {
    // Never changes anywhere in range — no standard-time adoption to detect.
    firstTransitionCache.set(zone, null);
    return null;
  }

  // Invariant: offset(lo) === base, offset(hi) !== base. Converge to the second.
  while (hi - lo > 1000) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (zoneOffsetMsAt(mid, zone) === base) lo = mid;
    else hi = mid;
  }
  firstTransitionCache.set(zone, hi);
  return hi;
}

/** Longitude → mean solar offset in hours. 15° of longitude per hour. */
export function longitudeLmtHours(lng: number): number {
  return lng / 15;
}

/**
 * TZ-1 — resolve a local wall clock in a zone to a UTC offset.
 *
 * `Intl` answers offset-from-a-UTC-instant, so going the other way is an
 * inverse solve. We probe the offset a day either side of the target: if both
 * candidate instants render back to the requested wall clock the time is
 * doubled (DST end, "fold"); if neither does, it never happened (DST start,
 * "gap").
 *
 * **Policy, chosen and pinned by test rather than left incidental:**
 *  - fold → the EARLIER of the two occurrences (the pre-transition offset)
 *  - gap  → shift FORWARD into real time, keeping the post-transition offset
 * Both are reported in `ambiguity`/`note` so the UI can say so. Birth times
 * really do land on transition nights, and silently picking one is the single
 * most common way this gets quietly wrong.
 *
 * `lng` is required because of TZ-0: below the zone's first transition the
 * birthplace's own longitude LMT is the right answer, not the zone's.
 */
export function resolveOffset(local: WallClock, zone: string, lng: number): OffsetResolution {
  const wallAsUtc = utcFromParts(
    local.year,
    local.month,
    local.day,
    local.hour,
    local.minute,
    local.second ?? 0
  );

  const offBefore = zoneOffsetMsAt(wallAsUtc - MS_PER_DAY, zone);
  const offAfter = zoneOffsetMsAt(wallAsUtc + MS_PER_DAY, zone);

  const candBefore = wallAsUtc - offBefore;
  const candAfter = wallAsUtc - offAfter;

  const beforeValid = zoneOffsetMsAt(candBefore, zone) === offBefore;
  const afterValid = zoneOffsetMsAt(candAfter, zone) === offAfter;

  let utcMs: number;
  let offsetMs: number;
  let ambiguity: Ambiguity = "none";
  let note: string | undefined;

  if (beforeValid && afterValid && offBefore !== offAfter) {
    // Doubled hour. Earlier occurrence = the larger offset = the smaller instant.
    ambiguity = "fold";
    offsetMs = Math.max(offBefore, offAfter);
    utcMs = wallAsUtc - offsetMs;
    note =
      "This clock time happened twice that night, when the clocks went back. " +
      "Astra has taken the first one.";
  } else if (!beforeValid && !afterValid) {
    // The hour never existed. Land just past the transition rather than invent it.
    ambiguity = "gap";
    offsetMs = Math.min(offBefore, offAfter);
    utcMs = wallAsUtc - offsetMs;
    note =
      "The clocks jumped forward over this time, so it never occurred. " +
      "Astra has moved it forward into real time.";
  } else {
    offsetMs = beforeValid ? offBefore : offAfter;
    utcMs = wallAsUtc - offsetMs;
  }

  // TZ-0: before standard time reached this place, the zone offset is an
  // anachronism — people kept local mean time, set by their own meridian.
  const transition = firstTransition(zone);
  if (transition !== null && utcMs < transition) {
    const lmtHours = longitudeLmtHours(lng);
    return {
      hours: lmtHours,
      utcMs: wallAsUtc - lmtHours * MS_PER_HOUR,
      kind: "lmt",
      ambiguity: "none",
      zoneAlternativeHours: offsetMs / MS_PER_HOUR,
      note:
        "This birth predates standard time here, so Astra is using local mean " +
        "time for the birthplace itself rather than the modern zone.",
    };
  }

  return { hours: offsetMs / MS_PER_HOUR, utcMs, kind: "zone", ambiguity, note };
}
