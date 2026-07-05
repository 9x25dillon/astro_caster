// The astronomical core — port of backend/ephemeris.py with astronomy-engine
// (pure TS, Moshier-class) standing in for pyswisseph. Frames match the
// backend's defaults: apparent geocentric positions on the TRUE ecliptic of
// date; houses from apparent sidereal time (GAST) and true obliquity.
//
// v0.1 body coverage: Sun..Pluto + Ascendant/Midheaven + Part of Fortune.
// North/South Node, Chiron and Lilith need an ephemeris source astronomy-
// engine doesn't provide — tracked as the WASM-escalation decision in
// MOBILE_ROADMAP §3.

// astronomy-engine ships esm/astronomy.js with real ESM `export` syntax but
// no "type":"module" in its package.json, so Node's `import` condition
// mis-detects its named exports as CJS on Node < 24 (green on 26, red on CI's
// 22). Force the correctly-packaged CJS build via createRequire; types still
// come from the package's own declarations via `import type`.
import { createRequire } from "node:module";
import type * as AstronomyTypes from "astronomy-engine";

const require = createRequire(import.meta.url);
const {
  Body,
  Ecliptic,
  EquatorFromVector,
  GeoVector,
  MakeTime,
  RotateVector,
  Rotation_EQJ_EQD,
  SiderealTime,
  e_tilt,
} = require("astronomy-engine") as typeof import("astronomy-engine");
type AstroTime = AstronomyTypes.AstroTime;

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
import { ascendant, houseOf, midheaven, placidusCusps } from "./houses.js";
import { detectPatterns } from "./patterns.js";
import type {
  Angles,
  Aspect,
  ChartRequest,
  ChartResponse,
  HouseCusp,
  PlanetData,
} from "./types.js";

const PLANET_TABLE: [string, AstronomyTypes.Body, string][] = [
  ["Sun", Body.Sun, "☉"],
  ["Moon", Body.Moon, "☽"],
  ["Mercury", Body.Mercury, "☿"],
  ["Venus", Body.Venus, "♀"],
  ["Mars", Body.Mars, "♂"],
  ["Jupiter", Body.Jupiter, "♃"],
  ["Saturn", Body.Saturn, "♄"],
  ["Uranus", Body.Uranus, "♅"],
  ["Neptune", Body.Neptune, "♆"],
  ["Pluto", Body.Pluto, "♇"],
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

function timeFromJd(jd: number): AstroTime {
  // AstroTime's numeric form is UT days since J2000.0 (JD 2451545.0).
  return MakeTime(jd - 2451545.0);
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

function eclipticOfDate(body: AstronomyTypes.Body, time: AstroTime): { lon: number; lat: number } {
  // GeoVector: geocentric J2000 equatorial, corrected for light travel and
  // aberration; Ecliptic() rotates to the TRUE ecliptic and equinox of date.
  const ecl = Ecliptic(GeoVector(body, time, true));
  return { lon: norm360(ecl.elon), lat: ecl.elat };
}

function calcBody(
  jd: number,
  body: AstronomyTypes.Body
): { lon: number; lat: number; speed: number; dec: number } {
  const time = timeFromJd(jd);
  const { lon, lat } = eclipticOfDate(body, time);

  // Geocentric declination of date (equator-of-date frame, like swe FLG_EQUATORIAL).
  const eqd = RotateVector(Rotation_EQJ_EQD(time), GeoVector(body, time, true));
  const dec = EquatorFromVector(eqd).dec;

  // Longitude speed via central difference (swe reports the instantaneous rate).
  const h = 0.5 / 24; // ±30 minutes
  const before = eclipticOfDate(body, timeFromJd(jd - h)).lon;
  const after = eclipticOfDate(body, timeFromJd(jd + h)).lon;
  let delta = after - before;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const speed = delta / (2 * h);

  return { lon, lat, speed, dec };
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

export function calculateChart(req: ChartRequest): ChartResponse {
  if (req.zodiac === "sidereal") {
    throw new Error("@astra/core v0.1 computes the tropical zodiac only");
  }
  if ((req.house_system ?? "P") !== "P") {
    throw new Error("@astra/core v0.1 implements Placidus houses only");
  }

  const jd = julianDayUtc(req);
  const time = timeFromJd(jd);

  // GAST (hours) → degrees, + east longitude = ARMC; true obliquity of date.
  const armc = norm360(SiderealTime(time) * 15 + req.lng);
  const eps = e_tilt(time).tobl;

  const cusps = placidusCusps(armc, req.lat, eps);
  const asc = ascendant(armc, eps, req.lat);
  const mc = midheaven(armc, eps);
  const angles: Angles = {
    ascendant: round6(asc),
    midheaven: round6(mc),
    descendant: round6(norm360(asc + 180)),
    imum_coeli: round6(norm360(mc + 180)),
    vertex: null,
  };

  const planets: PlanetData[] = [];
  let sunLon: number | null = null;
  let moonLon: number | null = null;
  for (const [name, body, glyph] of PLANET_TABLE) {
    const { lon, lat, speed, dec } = calcBody(jd, body);
    planets.push(buildPlanet(name, glyph, lon, lat, speed, dec, cusps));
    if (name === "Sun") sunLon = lon;
    if (name === "Moon") moonLon = lon;
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
      ephemeris: "astronomy-engine",
      zodiac: req.zodiac ?? "tropical",
      house_system: req.house_system ?? "P",
      julian_day: jd.toFixed(6),
    },
  };
}
