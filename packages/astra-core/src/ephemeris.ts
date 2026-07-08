// The astronomical core — port of backend/ephemeris.py running the SAME
// engine: the vendored WASM Swiss Ephemeris (swisseph.ts), seas-only config,
// identical to the drift-lock configuration the parity vectors are generated
// against. Every body, house cusp, angle and eclipse comes from the same C
// code and data on both stacks, so cross-engine tolerances collapse to
// float/rounding noise. astronomy-engine is fully retired.
//
// `await initSwisseph()` once before casting; calculateChart throws a clear
// error if the engine never came up (the assets are same-origin and
// service-worker precached, so this is corrupt-cache territory).

import {
  ASPECT_DEFS,
  ELEMENTS,
  MODALITIES,
  SIGN_GLYPHS,
  angularSeparation,
  degreeInSign,
  dignityFor,
  norm360,
  signFor,
} from "./astrology.js";
import { houseOf } from "./houses.js";
import {
  SE_CHIRON,
  SE_MEAN_APOG,
  SE_TRUE_NODE,
  calcSwissBody,
  calcSwissHouses,
  nextSwissEclipse,
  swissReady,
} from "./swisseph.js";
import { detectPatterns } from "./patterns.js";
import type {
  Angles,
  Aspect,
  ChartRequest,
  ChartResponse,
  HouseCusp,
  PlanetData,
} from "./types.js";

// Swiss body ids (swephexp.h), same order as the backend's _PLANET_TABLE.
// South Node is derived from the North inline, exactly like the backend.
const PLANET_TABLE: [string, number, string][] = [
  ["Sun", 0, "☉"],
  ["Moon", 1, "☽"],
  ["Mercury", 2, "☿"],
  ["Venus", 3, "♀"],
  ["Mars", 4, "♂"],
  ["Jupiter", 5, "♃"],
  ["Saturn", 6, "♄"],
  ["Uranus", 7, "♅"],
  ["Neptune", 8, "♆"],
  ["Pluto", 9, "♇"],
  ["North Node", SE_TRUE_NODE, "☊"],
  ["Chiron", SE_CHIRON, "⚷"],
  ["Lilith", SE_MEAN_APOG, "⚸"],
];

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Meeus Gregorian Julian Day — bit-compatible with swe.julday(..., GREG_CAL). */
export function julianDay(
  year: number,
  month: number,
  day: number,
  utHours: number
): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    utHours / 24 +
    b -
    1524.5
  );
}

/** Port of ephemeris._julian_day_utc: local time + tz offset → UTC JD. */
export function julianDayUtc(req: ChartRequest): number {
  const ms =
    Date.UTC(req.year, req.month - 1, req.day, req.hour ?? 0, req.minute ?? 0, req.second ?? 0) -
    (req.tz_offset ?? 0) * 3600_000;
  const d = new Date(ms);
  const utHours =
    d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  return julianDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), utHours);
}

// ---------------------------------------------------------------------------
// Bodies — all served by the WASM Swiss engine.
// ---------------------------------------------------------------------------

const SWISS_BY_NAME: Record<string, number> = Object.fromEntries(
  PLANET_TABLE.map(([name, id]) => [name, id])
);

/** Ecliptic-of-date longitude (deg) and longitude speed (deg/day) for a named
 *  body — the forecast scanner's primitive, sharing the chart's exact frame. */
export function eclipticLonSpeed(
  jd: number,
  name: string
): { lon: number; speed: number } | null {
  const sweId = SWISS_BY_NAME[name];
  if (sweId === undefined) return null;
  const r = calcSwissBody(jd, sweId);
  return r ? { lon: r.lon, speed: r.speed } : null;
}

// ---------------------------------------------------------------------------
// Eclipses — the same Swiss search the backend's eclipse_timeline runs
// (sol_eclipse_when_glob / lun_eclipse_when, stepping peak+1 day).
// ---------------------------------------------------------------------------

export interface RawEclipse {
  is_solar: boolean;
  kind: string; // nature: "total" | "annular_total" | "annular" | "partial" | "penumbral"
  jd: number; // peak instant, for computing the luminary's longitude
  date: string; // UTC calendar date of the peak (YYYY-MM-DD)
}

/** Gregorian calendar date from a Julian Day (Meeus; matches swe.revjul). */
function jdToIsoDate(jd: number): string {
  const z = Math.floor(jd + 0.5);
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const dd = Math.floor(365.25 * c);
  const e = Math.floor((b - dd) / 30.6001);
  const day = Math.floor(b - dd - Math.floor(30.6001 * e));
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The soonest `count` eclipses (solar + lunar merged) at/after `start`, sorted
 *  by time — the backend eclipse_timeline's search, verbatim. */
export function searchEclipses(start: Date, count: number): RawEclipse[] {
  const ut =
    start.getUTCHours() + start.getUTCMinutes() / 60 + start.getUTCSeconds() / 3600;
  const jd0 = julianDay(
    start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), ut
  );
  const found: RawEclipse[] = [];
  for (const solar of [true, false]) {
    let cur = jd0;
    for (let i = 0; i < count; i++) {
      const e = nextSwissEclipse(cur, solar);
      if (!e) break;
      found.push({ is_solar: solar, kind: e.nature, jd: e.jd, date: jdToIsoDate(e.jd) });
      cur = e.jd + 1.0;
    }
  }
  found.sort((a, b) => a.jd - b.jd);
  return found.slice(0, count);
}

// ---------------------------------------------------------------------------
// Assembly (port of ephemeris.calculate_chart)
// ---------------------------------------------------------------------------

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

function buildPlanet(
  name: string,
  glyph: string,
  longitude: number,
  latitude: number,
  speed: number,
  declination: number,
  cusps: number[]
): PlanetData {
  const sign = signFor(longitude);
  const [d, m, s] = degreeInSign(longitude);
  return {
    id: name,
    glyph,
    longitude: round6(norm360(longitude)),
    latitude: round6(latitude),
    declination: round6(declination),
    speed: round6(speed),
    sign,
    sign_glyph: SIGN_GLYPHS[sign],
    degree: d,
    minute: m,
    second: s,
    house: houseOf(longitude, cusps),
    retrograde: speed < 0,
    dignity: dignityFor(name, sign),
    element: ELEMENTS[sign],
    modality: MODALITIES[sign],
  };
}

function isDayChart(sunLon: number, asc: number): boolean {
  return norm360(sunLon - asc) >= 180;
}

function tallyElements(planets: PlanetData[]) {
  const elements: Record<string, number> = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
  const modalities: Record<string, number> = { Cardinal: 0, Fixed: 0, Mutable: 0 };
  const heavy = new Set(["Sun", "Moon", "Ascendant", "Midheaven"]);
  const counted = new Set([
    "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
    "Uranus", "Neptune", "Pluto", "Ascendant", "Midheaven",
  ]);
  for (const p of planets) {
    if (!counted.has(p.id)) continue;
    const w = heavy.has(p.id) ? 2 : 1;
    elements[p.element] += w;
    modalities[p.modality] += w;
  }
  return { elements, modalities };
}

const NON_ASPECTING = new Set(["Descendant", "Imum Coeli", "South Node"]);

function isApplying(a: PlanetData, b: PlanetData, targetAngle: number): boolean {
  const sepNow = angularSeparation(a.longitude, b.longitude);
  const sepNext = angularSeparation(
    a.longitude + a.speed * 0.01,
    b.longitude + b.speed * 0.01
  );
  return Math.abs(sepNext - targetAngle) < Math.abs(sepNow - targetAngle);
}

export function calculateAspects(planets: PlanetData[], orbFactor = 1.0): Aspect[] {
  const aspects: Aspect[] = [];
  const bodies = planets.filter((p) => !NON_ASPECTING.has(p.id));
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const sep = angularSeparation(a.longitude, b.longitude);
      for (const ad of ASPECT_DEFS) {
        const orb = Math.abs(sep - ad.angle);
        if (orb <= ad.defaultOrb * orbFactor) {
          aspects.push({
            p1: a.id,
            p2: b.id,
            type: ad.name,
            angle: ad.angle,
            orb: Math.round(orb * 100) / 100,
            separation: Math.round(sep * 100) / 100,
            harmony: ad.harmony,
            color: ad.color,
            applying: isApplying(a, b, ad.angle),
          });
          break; // one body-pair satisfies at most one aspect family
        }
      }
    }
  }
  aspects.sort((x, y) => x.orb - y.orb);
  return aspects;
}

/**
 * Cross-aspects from one body set to another, tagging the first set's ids with
 * a `t:` prefix (port of backend ephemeris.aspects_between). Major aspects only
 * (ASPECT_DEFS[0..4]) and tighter default orbs — used for transits and, with a
 * pre-built pair of natal charts, for synastry inter-aspects.
 */
export function aspectsBetween(
  natal: PlanetData[],
  transiting: PlanetData[],
  orbFactor = 0.6
): Aspect[] {
  const out: Aspect[] = [];
  const natalCore = natal.filter((p) => !NON_ASPECTING.has(p.id));
  for (const t of transiting) {
    for (const n of natalCore) {
      const sep = angularSeparation(t.longitude, n.longitude);
      for (const ad of ASPECT_DEFS.slice(0, 5)) {
        const orb = Math.abs(sep - ad.angle);
        if (orb <= ad.defaultOrb * orbFactor) {
          out.push({
            p1: `t:${t.id}`,
            p2: n.id,
            type: ad.name,
            angle: ad.angle,
            orb: Math.round(orb * 100) / 100,
            separation: Math.round(sep * 100) / 100,
            harmony: ad.harmony,
            color: ad.color,
            applying: isApplying(t, n, ad.angle),
          });
          break;
        }
      }
    }
  }
  out.sort((x, y) => x.orb - y.orb);
  return out;
}

// Sidereal support without a sid-mode export: the wasm computes Fagan/Bradley
// (its default mode), and standard ayanamshas differ from FB by a
// body-independent longitude shift (verified vs pyswisseph: identical across
// bodies to ~1e-13). Lahiri−FB drifts by only ~3e-8° across 1800s–2100s, so a
// J2000-calibrated constant stays ~40× inside the 1e-6 parity assert.
const AYANAMSHA_SHIFT: Record<number, number> = {
  0: 0, // Fagan/Bradley — the wasm's native mode
  1: 0.883207640726, // Lahiri (swe.get_ayanamsa_ut Δ at J2000)
};

/** Effective tropical→sidereal longitude offset at jd for an ayanamsha.
 *  Derived from the wasm itself (tropical Sun − FB-sidereal Sun), which
 *  carries Swiss's frame correction; the mode shift rides on top. The same
 *  offset applies to every longitude — bodies, cusps and angles alike
 *  (object-independence verified to ~1e-11). */
function siderealOffset(jd: number, shift: number): number {
  const trop = calcSwissBody(jd, 0)!;
  const sid = calcSwissBody(jd, 0, true)!;
  return norm360(trop.lon - sid.lon - shift);
}

export function calculateChart(req: ChartRequest): ChartResponse {
  const sidereal = req.zodiac === "sidereal";
  const shift = AYANAMSHA_SHIFT[req.ayanamsha ?? 1];
  if (sidereal && shift === undefined) {
    throw new Error(
      `@astra/core: unsupported ayanamsha ${req.ayanamsha} offline (Fagan/Bradley 0 and Lahiri 1 are available)`
    );
  }
  if (!swissReady()) {
    throw new Error("@astra/core: await initSwisseph() before casting a chart");
  }

  const jd = julianDayUtc(req);

  // Houses + angles from the same swe_houses C the backend runs — every house
  // system pyswisseph accepts works here too, and the Vertex is real now.
  // Sidereal cusps/angles are the tropical ones minus the effective offset —
  // exactly what swe_houses_ex does internally (residual ~1e-11).
  const off = sidereal ? siderealOffset(jd, shift!) : 0;
  const h = calcSwissHouses(jd, req.lat, req.lng, req.house_system ?? "P")!;
  const cusps = h.cusps.map((c) => norm360(c - off));
  const asc = norm360(h.asc - off);
  const mc = norm360(h.mc - off);
  const angles: Angles = {
    ascendant: round6(asc),
    midheaven: round6(mc),
    descendant: round6(norm360(asc + 180)),
    imum_coeli: round6(norm360(mc + 180)),
    vertex: round6(norm360(h.vertex - off)),
  };

  const planets: PlanetData[] = [];
  let sunLon: number | null = null;
  let moonLon: number | null = null;
  for (const [name, sweId, glyph] of PLANET_TABLE) {
    // A body can be unavailable (e.g. Chiron outside the seas file's range) —
    // the backend skips it on swe.Error, we skip on null.
    const r = calcSwissBody(jd, sweId, sidereal);
    if (!r) continue;
    // Sidereal: FB longitude + the mode shift; lat/speed/decl are
    // mode-independent (verified to ~1e-12).
    const lon = sidereal ? norm360(r.lon + shift!) : r.lon;
    planets.push(buildPlanet(name, glyph, lon, r.lat, r.speed, r.dec, cusps));
    if (name === "Sun") sunLon = lon;
    if (name === "Moon") moonLon = lon;
    if (name === "North Node") {
      // Derive the South Node opposite the North (backend parity: same speed,
      // mirrored latitude and declination).
      planets.push(
        buildPlanet("South Node", "☋", norm360(lon + 180), -r.lat, r.speed, -r.dec, cusps)
      );
    }
  }

  if (sunLon !== null && moonLon !== null) {
    const pof = isDayChart(sunLon, asc)
      ? norm360(asc + moonLon - sunLon)
      : norm360(asc + sunLon - moonLon);
    planets.push(buildPlanet("Part of Fortune", "⊗", pof, 0, 0, 0, cusps));
  }

  planets.push(buildPlanet("Ascendant", "Asc", asc, 0, 0, 0, cusps));
  planets.push(buildPlanet("Midheaven", "MC", mc, 0, 0, 0, cusps));

  const houses: HouseCusp[] = cusps.map((c, i) => {
    const [d, m] = degreeInSign(c);
    return { index: i + 1, longitude: round6(c), sign: signFor(c), degree: d, minute: m };
  });

  const aspects = calculateAspects(planets);
  const patterns = detectPatterns(planets, aspects);
  const { elements, modalities } = tallyElements(planets);

  return {
    planets,
    houses,
    angles,
    aspects,
    patterns,
    elements,
    modalities,
    meta: {
      ephemeris: "swiss-wasm",
      zodiac: req.zodiac ?? "tropical",
      house_system: req.house_system ?? "P",
      julian_day: jd.toFixed(6),
    },
  };
}
