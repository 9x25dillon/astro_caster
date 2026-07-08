// Transit forecast scanner — port of backend/forecast.py. Steps day-by-day
// finding stations, transit-to-transit and transit-to-natal aspect exactness
// (Moon at 6h resolution), then dedups. Deterministic; no RNG. Parity is
// tolerance-based like the chart — astronomy-engine and pyswisseph differ by
// ~arcseconds, which can nudge a near-midnight station or a flat-minimum
// aspect by a day, so the vector matches event IDENTITY with a ±1-day date
// window (see parity/README + forecast.test.ts).
//
// Body coverage: the full backend mover list — Sun–Pluto via astronomy-engine
// plus Chiron and the true Node via the WASM Swiss engine (await
// initSwisseph() first; uninitialized, those movers silently drop out).

import { angularSeparation, degreeInSign, signFor } from "./astrology.js";
import { eclipticLonSpeed, julianDay } from "./ephemeris.js";

// name → swe order preserved; Moon handled specially. Chiron and the true
// Node ride the WASM Swiss engine (initSwisseph) via eclipticLonSpeed —
// same mover list as the backend's _TRANSIT_BODIES.
const TRANSIT_BODIES = [
  "Sun", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  "Chiron", "North Node",
];

// [name, angle, threshold]
const ASPECTS: [string, number, number][] = [
  ["Conjunction", 0.0, 2.5],
  ["Opposition", 180.0, 2.5],
  ["Square", 90.0, 2.0],
  ["Trine", 120.0, 2.0],
  ["Sextile", 60.0, 1.5],
];

const ASPECT_HARMONY: Record<string, string> = {
  Conjunction: "neutral", Opposition: "challenging", Square: "challenging",
  Trine: "harmonious", Sextile: "harmonious",
};

const OUTER = new Set(["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Chiron"]);
const INNER = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars"]);
const SIG_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export interface ForecastEvent {
  date: string;
  type: "station" | "transit_transit" | "transit_natal";
  planet: string;
  aspect: string | null;
  target: string | null;
  orb: number;
  significance: string;
  direction: string | null;
  summary: string;
  harmony: string | null;
}

// --- date <-> Julian Day (noon), matching the backend's swe.julday/revjul ---

function jdNoon(y: number, m: number, d: number): number {
  return julianDay(y, m, d, 12.0);
}

/** Gregorian calendar date from a Julian Day (Meeus / swe.revjul). */
function dateFromJd(jd: number): [number, number, number] {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const dd = Math.floor(365.25 * c);
  const e = Math.floor((b - dd) / 30.6001);
  const day = Math.floor(b - dd - Math.floor(30.6001 * e) + f);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  return [year, month, day];
}

function isoDate(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d
    .toString()
    .padStart(2, "0")}`;
}

function addDays(y: number, m: number, d: number, n: number): [number, number, number] {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

function daysBetween(aIso: string, bIso: string): number {
  return (Date.parse(bIso) - Date.parse(aIso)) / 86_400_000;
}

// --- positions ---

type Pos = Record<string, [number, number]>; // name -> [lon, speed]

function positions(jd: number): Pos {
  const out: Pos = {};
  for (const name of TRANSIT_BODIES) {
    const r = eclipticLonSpeed(jd, name);
    if (r) out[name] = [r.lon, r.speed];
  }
  return out;
}

function moonLon(jd: number): number {
  return eclipticLonSpeed(jd, "Moon")!.lon;
}

function orb(lonA: number, lonB: number, targetAngle: number): number {
  return Math.abs(angularSeparation(lonA, lonB) - targetAngle);
}

function bisectStation(planet: string, jdLo: number, jdHi: number, iters = 10): number {
  let lo = jdLo;
  let hi = jdHi;
  let loSpd = eclipticLonSpeed(lo, planet)!.speed;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    const midSpd = eclipticLonSpeed(mid, planet)!.speed;
    if (loSpd > 0 === midSpd > 0) {
      lo = mid;
      loSpd = midSpd;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

// --- significance ---

function sigStation(planet: string): string {
  if (OUTER.has(planet)) return "high";
  if (planet === "Mars") return "medium";
  return "low";
}

function sigT2t(p1: string, p2: string): string {
  if (OUTER.has(p1) && OUTER.has(p2)) return "high";
  if (OUTER.has(p1) || OUTER.has(p2)) return "medium";
  return "low";
}

function sigT2n(transiting: string, natalTarget: string): string {
  const lumAngles = new Set(["Sun", "Moon", "Ascendant", "Midheaven"]);
  if (OUTER.has(transiting) && lumAngles.has(natalTarget)) return "high";
  if (OUTER.has(transiting)) return "medium";
  if (lumAngles.has(natalTarget) && (transiting === "Mars" || transiting === "Jupiter"))
    return "medium";
  return "low";
}

// --- event builders (structural fields; prose summaries kept minimal) ---

function eventStation(planet: string, jd: number, goingRx: boolean): ForecastEvent {
  const lon = eclipticLonSpeed(jd, planet)!.lon;
  const sign = signFor(lon);
  const [deg, minute] = degreeInSign(lon);
  const direction = goingRx ? "retrograde" : "direct";
  const label = goingRx ? "stations retrograde" : "stations direct";
  const [y, m, d] = dateFromJd(jd);
  return {
    date: isoDate(y, m, d),
    type: "station",
    planet,
    aspect: null,
    target: null,
    orb: 0.0,
    significance: sigStation(planet),
    direction,
    summary: `${planet} ${label} at ${deg}°${minute.toString().padStart(2, "0")}' ${sign}`,
    harmony: null,
  };
}

const T2T_ACTION: Record<string, string> = {
  Conjunction: "conjunct", Opposition: "opposite", Square: "square",
  Trine: "trine", Sextile: "sextile",
};
const T2N_ACTION: Record<string, string> = {
  Conjunction: "conjuncts", Opposition: "opposes", Square: "squares",
  Trine: "trines", Sextile: "sextiles",
};

function eventT2t(p1: string, p2: string, asp: string, dateIso: string, orbVal: number): ForecastEvent {
  return {
    date: dateIso,
    type: "transit_transit",
    planet: p1,
    aspect: asp,
    target: p2,
    orb: round3(orbVal),
    significance: sigT2t(p1, p2),
    direction: null,
    summary: `${p1} ${T2T_ACTION[asp] ?? asp.toLowerCase()} ${p2}`,
    harmony: ASPECT_HARMONY[asp] ?? "neutral",
  };
}

function eventT2n(transiting: string, natalName: string, asp: string, dateIso: string, orbVal: number): ForecastEvent {
  return {
    date: dateIso,
    type: "transit_natal",
    planet: transiting,
    aspect: asp,
    target: natalName,
    orb: round3(orbVal),
    significance: sigT2n(transiting, natalName),
    direction: null,
    summary: `${transiting} ${T2N_ACTION[asp] ?? asp.toLowerCase()} natal ${natalName}`,
    harmony: ASPECT_HARMONY[asp] ?? "neutral",
  };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

const BIG = 999.0;

export function generateForecast(
  natal: Record<string, number>,
  startISO: string,
  days = 90,
  minSig: "high" | "medium" | "low" = "medium"
): ForecastEvent[] {
  const minRank = SIG_RANK[minSig] ?? 2;
  const events: ForecastEvent[] = [];
  const [sy, sm, sd] = startISO.split("-").map(Number);

  const dayBefore = addDays(sy, sm, sd, -1);
  let prevPos = positions(jdNoon(dayBefore[0], dayBefore[1], dayBefore[2]));

  const ttOrbs = new Map<string, number>();
  const tnOrbs = new Map<string, number>();
  const ttFired = new Set<string>();
  const tnFired = new Set<string>();

  const bodyNames = TRANSIT_BODIES;

  // Initialise orb tables from the pre-range day.
  for (let i = 0; i < bodyNames.length; i++) {
    const n1 = bodyNames[i];
    if (!(n1 in prevPos)) continue;
    const lon1 = prevPos[n1][0];
    for (let j = 0; j < bodyNames.length; j++) {
      const n2 = bodyNames[j];
      if (j <= i || !(n2 in prevPos)) continue;
      const lon2 = prevPos[n2][0];
      for (const [asp, ang] of ASPECTS) ttOrbs.set(`${n1}|${n2}|${asp}`, orb(lon1, lon2, ang));
    }
    for (const [nn, nlon] of Object.entries(natal)) {
      for (const [asp, ang] of ASPECTS) tnOrbs.set(`${n1}|${nn}|${asp}`, orb(lon1, nlon, ang));
    }
  }

  for (let offset = 0; offset < days; offset++) {
    const [ty, tm, td] = addDays(sy, sm, sd, offset);
    const todayIso = isoDate(ty, tm, td);
    const yIso = isoDate(...(addDays(ty, tm, td, -1) as [number, number, number]));
    const jd = jdNoon(ty, tm, td);
    const pos = positions(jd);

    // Stations
    for (const name of bodyNames) {
      if (name === "Sun" || name === "Moon" || name === "North Node") continue;
      if (!(name in pos) || !(name in prevPos)) continue;
      const prevSpd = prevPos[name][1];
      const currSpd = pos[name][1];
      if (prevSpd > 0 && currSpd <= 0) {
        const ev = eventStation(name, bisectStation(name, jd - 1, jd), true);
        if ((SIG_RANK[ev.significance] ?? 1) >= minRank) events.push(ev);
      } else if (prevSpd <= 0 && currSpd > 0) {
        const ev = eventStation(name, bisectStation(name, jd - 1, jd), false);
        if ((SIG_RANK[ev.significance] ?? 1) >= minRank) events.push(ev);
      }
    }

    // Transit-to-transit (skip Moon — handled at 6h)
    for (let i = 0; i < bodyNames.length; i++) {
      const n1 = bodyNames[i];
      if (n1 === "Moon" || !(n1 in pos)) continue;
      const lon1 = pos[n1][0];
      for (let j = 0; j < bodyNames.length; j++) {
        const n2 = bodyNames[j];
        if (j <= i || n2 === "Moon" || !(n2 in pos)) continue;
        const lon2 = pos[n2][0];
        for (const [asp, ang, threshold] of ASPECTS) {
          const key = `${n1}|${n2}|${asp}`;
          const curr = orb(lon1, lon2, ang);
          const prev = ttOrbs.get(key) ?? BIG;
          if (prev < threshold && curr > prev + 0.03) {
            const ev = eventT2t(n1, n2, asp, yIso, prev);
            if ((SIG_RANK[ev.significance] ?? 1) >= minRank) events.push(ev);
            ttFired.add(key);
          }
          ttOrbs.set(key, curr);
        }
      }
    }

    // Transit-to-natal (skip Moon)
    for (const tname of bodyNames) {
      if (tname === "Moon" || !(tname in pos)) continue;
      const tlon = pos[tname][0];
      for (const [nname, nlon] of Object.entries(natal)) {
        const tThreshold = INNER.has(tname) ? 1.0 : 1.5;
        for (const [asp, ang] of ASPECTS) {
          const key = `${tname}|${nname}|${asp}`;
          const curr = orb(tlon, nlon, ang);
          const prev = tnOrbs.get(key) ?? BIG;
          if (prev < tThreshold && curr > prev + 0.02) {
            const ev = eventT2n(tname, nname, asp, yIso, prev);
            if ((SIG_RANK[ev.significance] ?? 1) >= minRank) events.push(ev);
            tnFired.add(key);
          }
          tnOrbs.set(key, curr);
        }
      }
    }

    // Moon at 6h resolution
    const jdMidnight = jd - 0.5;
    const moonIdx = bodyNames.indexOf("Moon");
    for (const subFrac of [0.0, 0.25, 0.5, 0.75]) {
      const ml = moonLon(jdMidnight + subFrac);
      for (const n2 of bodyNames) {
        if (n2 === "Moon" || !(n2 in pos)) continue;
        if (bodyNames.indexOf(n2) <= moonIdx) continue;
        const lon2 = pos[n2][0];
        for (const [asp, ang, threshold] of ASPECTS) {
          const key = `Moon|${n2}|${asp}`;
          const curr = orb(ml, lon2, ang);
          const prev = ttOrbs.get(key) ?? BIG;
          if (prev < threshold && curr > prev + 0.03) {
            const ev = eventT2t("Moon", n2, asp, todayIso, prev);
            if ((SIG_RANK[ev.significance] ?? 1) >= minRank) events.push(ev);
            ttFired.add(key);
          }
          ttOrbs.set(key, curr);
        }
      }
      for (const [nname, nlon] of Object.entries(natal)) {
        for (const [asp, ang] of ASPECTS) {
          const key = `Moon|${nname}|${asp}`;
          const curr = orb(ml, nlon, ang);
          const prev = tnOrbs.get(key) ?? BIG;
          if (prev < 1.0 && curr > prev + 0.02) {
            const ev = eventT2n("Moon", nname, asp, todayIso, prev);
            if ((SIG_RANK[ev.significance] ?? 1) >= minRank) events.push(ev);
            tnFired.add(key);
          }
          tnOrbs.set(key, curr);
        }
      }
    }

    prevPos = pos;
  }

  // Final pass: aspects still approaching exactness on the last day.
  const aspThresholds: Record<string, number> = Object.fromEntries(
    ASPECTS.map(([asp, , thr]) => [asp, thr])
  );
  const lastDay = addDays(sy, sm, sd, days - 1);
  const lastIso = isoDate(lastDay[0], lastDay[1], lastDay[2]);

  for (const [key, finalOrb] of ttOrbs) {
    if (ttFired.has(key)) continue;
    const [n1, n2, asp] = key.split("|");
    if (finalOrb < (aspThresholds[asp] ?? 2.0)) {
      const ev = eventT2t(n1, n2, asp, lastIso, finalOrb);
      if ((SIG_RANK[ev.significance] ?? 1) >= minRank) events.push(ev);
    }
  }
  for (const [key, finalOrb] of tnOrbs) {
    if (tnFired.has(key)) continue;
    const [tname, nname, asp] = key.split("|");
    const tThreshold = INNER.has(tname) ? 1.0 : 1.5;
    if (finalOrb < tThreshold) {
      const ev = eventT2n(tname, nname, asp, lastIso, finalOrb);
      if ((SIG_RANK[ev.significance] ?? 1) >= minRank) events.push(ev);
    }
  }

  const rank = (e: ForecastEvent) => SIG_RANK[e.significance] ?? 1;
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank(b) - rank(a)));

  // Dedup: same (planet, aspect, target, direction) within 10 days → smallest orb.
  const deduped: ForecastEvent[] = [];
  const lastSeen = new Map<string, number>();
  for (const ev of events) {
    const sigKey = `${ev.planet}|${ev.aspect}|${ev.target}|${ev.direction}`;
    const prevIdx = lastSeen.get(sigKey);
    if (prevIdx !== undefined) {
      const prevEv = deduped[prevIdx];
      if (daysBetween(prevEv.date, ev.date) <= 10) {
        if ((ev.orb ?? 999) < (prevEv.orb ?? 999)) deduped[prevIdx] = ev;
        continue;
      }
    }
    lastSeen.set(sigKey, deduped.length);
    deduped.push(ev);
  }

  deduped.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank(b) - rank(a)));
  return deduped;
}
