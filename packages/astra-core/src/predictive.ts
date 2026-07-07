// predictive.ts — time-based techniques (MOBILE_ROADMAP §3.4), a port of the
// chart-deriving half of backend/predictive.py:
//   • Secondary progressions ("a day for a year")
//   • Solar return (the chart for the Sun's annual return to its natal longitude)
//
// Eclipse timelines are NOT ported here: the backend uses Swiss Ephemeris'
// eclipse-search (sol_eclipse_when_glob / lun_eclipse_when) and its total/
// annular/partial classification, which astronomy-engine reproduces by a
// different algorithm — matching dates + nature cross-engine is the "hard 20%"
// deferred with the Node/Chiron gap (WASM-Swiss escalation, roadmap §3).
//
// Drift-locked to the backend by parity/predictive.json.

import { calculateChart, aspectsBetween, eclipticLonSpeed, julianDay } from "./ephemeris.js";
import type { Angles, Aspect, ChartRequest, HouseCusp, PlanetData } from "./types.js";

const TROPICAL_YEAR = 365.24219; // mean tropical year, days
const SUN_DEG_PER_DAY = 0.9856473;
const MS_PER_DAY = 86_400_000;
const JD_UNIX_EPOCH = 2440587.5;

const round2 = (x: number) => Math.round(x * 100) / 100;

export interface ProgressedChart {
  age_years: number;
  progressed_iso: string;
  planets: PlanetData[];
  aspects_to_natal: Aspect[];
  meta: Record<string, string>;
}

export interface SolarReturnChart {
  year: number;
  return_iso: string;
  planets: PlanetData[];
  houses: HouseCusp[];
  angles: Angles;
  aspects: Aspect[];
  elements: Record<string, number>;
  modalities: Record<string, number>;
  meta: Record<string, string>;
}

// --------------------------------------------------------------------------- //
// Time helpers (UTC throughout)
// --------------------------------------------------------------------------- //

/** Local birth fields minus tz_offset → UTC epoch milliseconds. */
function natalUtcMillis(req: ChartRequest): number {
  const localMs = Date.UTC(
    req.year, req.month - 1, req.day,
    req.hour ?? 0, req.minute ?? 0, req.second ?? 0
  );
  return localMs - (req.tz_offset ?? 0) * 3600 * 1000;
}

/** ISO-8601 → epoch ms, treating a tz-less string as UTC (backend _parse_iso). */
function parseIsoUtc(s: string): number {
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s.trim());
  return Date.parse(hasTz ? s : `${s}Z`);
}

/** UTC instant → whole-second ISO with a +00:00 suffix (Python isoformat, µs=0). */
function isoUtcSeconds(d: Date): string {
  return `${d.toISOString().slice(0, 19)}+00:00`;
}

function utcToRequest(
  d: Date, lat: number, lng: number, base: ChartRequest
): ChartRequest {
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    lat,
    lng,
    tz_offset: 0,
    house_system: base.house_system ?? "P",
    zodiac: base.zodiac ?? "tropical",
    ayanamsha: base.ayanamsha ?? 1,
  };
}

/** Signed shortest angular distance target-current in (-180, 180]. */
function signedDelta(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
}

// --------------------------------------------------------------------------- //
// Secondary progressions
// --------------------------------------------------------------------------- //

export function progressedChart(natal: ChartRequest, targetIso: string): ProgressedChart {
  const natalMs = natalUtcMillis(natal);
  const targetMs = parseIsoUtc(targetIso);
  const ageYears = (targetMs - natalMs) / (TROPICAL_YEAR * MS_PER_DAY);

  // One day of ephemeris time per year of life.
  const progressedMs = natalMs + ageYears * MS_PER_DAY;
  const progD = new Date(progressedMs);
  const prog = calculateChart(utcToRequest(progD, natal.lat, natal.lng, natal));
  const natalChart = calculateChart(natal);

  return {
    age_years: round2(ageYears),
    progressed_iso: isoUtcSeconds(progD),
    planets: prog.planets,
    aspects_to_natal: aspectsBetween(natalChart.planets, prog.planets),
    meta: {
      method: "secondary_progression",
      ephem_iso: progD.toISOString().slice(0, 10),
    },
  };
}

// --------------------------------------------------------------------------- //
// Solar return
// --------------------------------------------------------------------------- //

/** JD nearest the birthday in `year` when the Sun is back at `natalSunLon`. */
export function solarReturnJd(
  natalSunLon: number, year: number, month: number, day: number
): number {
  let jd = julianDay(year, month, day, 12.0);
  for (let i = 0; i < 10; i++) {
    const sun = eclipticLonSpeed(jd, "Sun");
    if (!sun) break;
    const delta = signedDelta(natalSunLon, sun.lon);
    jd += delta / SUN_DEG_PER_DAY;
    if (Math.abs(delta) < 1e-7) break;
  }
  return jd;
}

function jdToUtcDate(jd: number): Date {
  // Round to the nearest whole second (backend _jd_to_utc rounds, not floors).
  return new Date(Math.round((jd - JD_UNIX_EPOCH) * MS_PER_DAY / 1000) * 1000);
}

export function solarReturn(
  natal: ChartRequest, year: number, lat?: number, lng?: number
): SolarReturnChart {
  const natalChart = calculateChart(natal);
  const natalSun = natalChart.planets.find((p) => p.id === "Sun");
  if (!natalSun) throw new Error("natal chart has no Sun");
  const jd = solarReturnJd(natalSun.longitude, year, natal.month, natal.day);
  const retD = jdToUtcDate(jd);
  const req = utcToRequest(retD, lat ?? natal.lat, lng ?? natal.lng, natal);
  const chart = calculateChart(req);
  return {
    year,
    return_iso: isoUtcSeconds(retD),
    planets: chart.planets,
    houses: chart.houses,
    angles: chart.angles,
    aspects: chart.aspects,
    elements: chart.elements,
    modalities: chart.modalities,
    meta: {
      method: "solar_return",
      relocated: String(lat !== undefined || lng !== undefined),
    },
  };
}
