// synastry.ts — the relational engine (MOBILE_ROADMAP §3.4), a faithful port of
// backend/synastry.py: synastry inter-aspects + house grid, composite (midpoint
// method, with a derived-MC option), Davison (great-circle geographic + temporal
// midpoint, real ephemeris), and the chart-weighted synastry-tarot bond.
//
// Drift-locked to the backend by parity/synastry.json. Restricted to the
// @astra/core supported body set (Sun–Pluto, Asc, MC, Part of Fortune) — the
// same restriction the tarot/forecast vectors use — since astronomy-engine
// lacks the lunar Node / Chiron / Lilith.

import {
  ELEMENTS,
  MODALITIES,
  SIGN_GLYPHS,
  degreeInSign,
  dignityFor,
  norm360,
  signFor,
} from "./astrology.js";
import {
  aspectsBetween,
  calculateAspects,
  calculateChart,
} from "./ephemeris.js";
import {
  ascendant as ascFromArmc,
  houseOf,
  placidusCusps,
} from "./houses.js";
import { detectPatterns } from "./patterns.js";
import {
  MAJOR_IDS,
  PLANET_MAJOR,
  buildLocalSignature,
  cardById,
} from "./tarot.js";
import type {
  Angles,
  Aspect,
  ChartRequest,
  ChartResponse,
  HouseCusp,
  Pattern,
  PlanetData,
} from "./types.js";

// --------------------------------------------------------------------------- //
// Output shapes (mirror backend/synastry.py Pydantic models)
// --------------------------------------------------------------------------- //

export interface HousePlanetOverlay {
  planet_id: string;
  longitude: number;
  host_house: number;
  host_owner: string; // "a" or "b"
}

export interface HouseEmphasis {
  host_owner: string;
  house: number;
  count: number;
  planets: string[];
}

export interface RulerLink {
  host_owner: string;
  house: number;
  cusp_sign: string;
  ruler: string;
  lands_in_other_house: number;
}

export interface SynastryGrid {
  b_in_a: HousePlanetOverlay[];
  a_in_b: HousePlanetOverlay[];
  emphasis: HouseEmphasis[];
  rulers: RulerLink[];
}

export interface CompositeChart {
  planets: PlanetData[];
  houses: HouseCusp[];
  angles: Angles | null;
  aspects: Aspect[];
  patterns: Pattern[];
  elements: Record<string, number>;
  modalities: Record<string, number>;
  meta: Record<string, string>;
}

export interface DavisonChart {
  planets: PlanetData[];
  houses: HouseCusp[];
  angles: Angles;
  aspects: Aspect[];
  elements: Record<string, number>;
  modalities: Record<string, number>;
  meta: Record<string, string>;
}

export interface SynastryResult {
  chart_a: ChartResponse;
  chart_b: ChartResponse;
  inter_aspects: Aspect[];
  grid: SynastryGrid;
}

export interface SynastryTarotSpread {
  shared_themes: string[];
  complementary_shadows: string[];
  bond_card: string;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

// --------------------------------------------------------------------------- //
// Circular midpoints
// --------------------------------------------------------------------------- //

/** Short-arc circular midpoint on the ecliptic, in [0, 360). Midpoint of 350°
 *  and 10° is 0°, not 180°. */
export function circularMidpoint(lonA: number, lonB: number): number {
  const a = norm360(lonA);
  const b = norm360(lonB);
  const delta = ((b - a + 540) % 360) - 180; // signed short arc, (-180, 180]
  return norm360(a + delta / 2);
}

// --------------------------------------------------------------------------- //
// House overlay helpers
// --------------------------------------------------------------------------- //

const ANGLE_IDS = new Set(["Ascendant", "Midheaven", "Descendant", "Imum Coeli"]);

function houseCusps(chart: ChartResponse): number[] {
  return chart.houses.map((h) => h.longitude);
}

function planetIndex(chart: ChartResponse): Record<string, PlanetData> {
  const idx: Record<string, PlanetData> = {};
  for (const p of chart.planets) idx[p.id] = p;
  return idx;
}

function buildMidpointPlanet(base: PlanetData, longitude: number, house = 0): PlanetData {
  const sign = signFor(longitude);
  const [degree, minute, second] = degreeInSign(longitude);
  return {
    id: base.id,
    glyph: base.glyph,
    longitude: round6(norm360(longitude)),
    latitude: round6(base.latitude / 2),
    declination: round6(base.declination),
    speed: 0,
    sign,
    sign_glyph: SIGN_GLYPHS[sign],
    degree,
    minute,
    second,
    house,
    retrograde: false,
    dignity: dignityFor(base.id, sign),
    element: ELEMENTS[sign],
    modality: MODALITIES[sign],
  };
}

function tallyElementsModalities(
  planets: PlanetData[]
): { elements: Record<string, number>; modalities: Record<string, number> } {
  const elements: Record<string, number> = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
  const modalities: Record<string, number> = { Cardinal: 0, Fixed: 0, Mutable: 0 };
  const heavy = new Set(["Sun", "Moon", "Ascendant", "Midheaven"]);
  for (const p of planets) {
    // Skip Descendant/Imum Coeli (angle points that aren't Asc/MC).
    if (ANGLE_IDS.has(p.id) && p.id !== "Ascendant" && p.id !== "Midheaven") continue;
    const w = heavy.has(p.id) ? 2 : 1;
    elements[p.element] = (elements[p.element] ?? 0) + w;
    modalities[p.modality] = (modalities[p.modality] ?? 0) + w;
  }
  return { elements, modalities };
}

// --------------------------------------------------------------------------- //
// Composite (midpoint method)
// --------------------------------------------------------------------------- //

export function compositeHouseCusps(a: ChartResponse, b: ChartResponse): HouseCusp[] {
  if (a.houses.length === 0 || b.houses.length === 0) return [];
  const byIndexB = new Map(b.houses.map((h) => [h.index, h]));
  const cusps: HouseCusp[] = [];
  for (const ha of [...a.houses].sort((x, y) => x.index - y.index)) {
    const hb = byIndexB.get(ha.index);
    if (!hb) continue;
    const lon = circularMidpoint(ha.longitude, hb.longitude);
    const [degree, minute] = degreeInSign(lon);
    cusps.push({ index: ha.index, longitude: round6(lon), sign: signFor(lon), degree, minute });
  }
  return cusps;
}

// Mean obliquity of the ecliptic at J2000 (deg) — enough for derived houses.
const OBLIQUITY_J2000 = 23.4392911;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/**
 * Derived-MC composite houses: convert the composite MC to a RAMC, then build a
 * real Placidus framework at the geographic-midpoint latitude. Returns the 12
 * cusps and the geometrically-derived Ascendant. Uses the same placidusCusps as
 * the chart engine (which reproduces Swiss houses_armc for Placidus).
 */
export function derivedCompositeHouses(
  mcLon: number,
  geoLat: number
): { cusps: HouseCusp[]; ascendant: number } {
  const eps = OBLIQUITY_J2000 * D2R;
  const lam = (mcLon % 360) * D2R;
  const armc = norm360(Math.atan2(Math.sin(lam) * Math.cos(eps), Math.cos(lam)) * R2D);
  const raw = placidusCusps(armc, geoLat, OBLIQUITY_J2000);
  const cusps: HouseCusp[] = raw.map((lonRaw, i) => {
    const lon = norm360(lonRaw);
    const [degree, minute] = degreeInSign(lon);
    return { index: i + 1, longitude: round6(lon), sign: signFor(lon), degree, minute };
  });
  return { cusps, ascendant: norm360(ascFromArmc(armc, OBLIQUITY_J2000, geoLat)) };
}

export function compositeMidpoints(
  a: ChartResponse,
  b: ChartResponse,
  houseMethod: "midpoint" | "derived" = "midpoint",
  geoLat: number | null = null
): CompositeChart {
  const idxA = planetIndex(a);
  const idxB = planetIndex(b);
  const sharedIds = Object.keys(idxA)
    .filter((id) => id in idxB && !ANGLE_IDS.has(id))
    .sort();

  const compositePlanets: PlanetData[] = sharedIds.map((pid) =>
    buildMidpointPlanet(idxA[pid], circularMidpoint(idxA[pid].longitude, idxB[pid].longitude), 0)
  );

  let compAngles: Angles | null = null;
  if (a.angles && b.angles) {
    const asc = circularMidpoint(a.angles.ascendant, b.angles.ascendant);
    const mc = circularMidpoint(a.angles.midheaven, b.angles.midheaven);
    compAngles = {
      ascendant: round6(asc),
      midheaven: round6(mc),
      descendant: round6(norm360(asc + 180)),
      imum_coeli: round6(norm360(mc + 180)),
      vertex: null,
    };
  }

  let housesKind = "midpoint_composite";
  let houses: HouseCusp[];
  if (houseMethod === "derived" && compAngles !== null && geoLat !== null) {
    const derived = derivedCompositeHouses(compAngles.midheaven, geoLat);
    houses = derived.cusps;
    housesKind = "derived_mc";
    compAngles = {
      ascendant: round6(derived.ascendant),
      midheaven: compAngles.midheaven,
      descendant: round6(norm360(derived.ascendant + 180)),
      imum_coeli: compAngles.imum_coeli,
      vertex: null,
    };
  } else {
    houses = compositeHouseCusps(a, b);
  }
  if (houses.length > 0) {
    const cuspLons = [...houses].sort((x, y) => x.index - y.index).map((h) => h.longitude);
    for (const p of compositePlanets) p.house = houseOf(p.longitude, cuspLons);
  }

  const compAspects = calculateAspects(compositePlanets);
  const compPatterns = detectPatterns(compositePlanets, compAspects);
  const { elements, modalities } = tallyElementsModalities(compositePlanets);
  return {
    planets: compositePlanets,
    houses,
    angles: compAngles,
    aspects: compAspects,
    patterns: compPatterns,
    elements,
    modalities,
    meta: { method: "composite_midpoints", houses: housesKind },
  };
}

// --------------------------------------------------------------------------- //
// Davison (midpoint in time and space)
// --------------------------------------------------------------------------- //

/** Local birth fields minus tz_offset → UTC epoch milliseconds. */
function chartRequestToUtcMillis(req: ChartRequest): number {
  const localMs = Date.UTC(
    req.year,
    req.month - 1,
    req.day,
    req.hour ?? 0,
    req.minute ?? 0,
    req.second ?? 0
  );
  return localMs - (req.tz_offset ?? 0) * 3600 * 1000;
}

/**
 * Great-circle (spherical) midpoint of two birth coordinates → [lat, lng] in
 * degrees, lng normalised to [-180, 180]. The arithmetic mean is wrong on a
 * sphere and breaks across the antimeridian; this uses the unit-vector method.
 */
export function geographicMidpoint(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number
): { lat: number; lng: number } {
  const [la1, lo1, la2, lo2] = [latA, lngA, latB, lngB].map((d) => d * D2R);
  const dLon = lo2 - lo1;
  const bx = Math.cos(la2) * Math.cos(dLon);
  const by = Math.cos(la2) * Math.sin(dLon);
  const latMid = Math.atan2(
    Math.sin(la1) + Math.sin(la2),
    Math.sqrt((Math.cos(la1) + bx) ** 2 + by ** 2)
  );
  const lonMid = lo1 + Math.atan2(by, Math.cos(la1) + bx);
  const lonDeg = ((lonMid * R2D + 540) % 360) - 180;
  return { lat: round6(latMid * R2D), lng: round6(lonDeg) };
}

export function davisonChart(a: ChartRequest, b: ChartRequest): DavisonChart {
  const tsA = chartRequestToUtcMillis(a);
  const tsB = chartRequestToUtcMillis(b);
  const tsMid = (tsA + tsB) / 2;

  const { lat: latMid, lng: lngMid } = geographicMidpoint(a.lat, a.lng, b.lat, b.lng);

  // UTC civil fields at the midpoint instant (sub-second dropped, matching the
  // backend which reads integer datetime fields).
  const mid = new Date(tsMid);
  const midReq: ChartRequest = {
    year: mid.getUTCFullYear(),
    month: mid.getUTCMonth() + 1,
    day: mid.getUTCDate(),
    hour: mid.getUTCHours(),
    minute: mid.getUTCMinutes(),
    second: mid.getUTCSeconds(),
    lat: latMid,
    lng: lngMid,
    tz_offset: 0,
    house_system: a.house_system ?? "P",
    zodiac: a.zodiac ?? "tropical",
    ayanamsha: a.ayanamsha ?? 1,
  };
  const chart = calculateChart(midReq);
  return {
    planets: chart.planets,
    houses: chart.houses,
    angles: chart.angles,
    aspects: chart.aspects,
    elements: chart.elements,
    modalities: chart.modalities,
    meta: { ...chart.meta, method: "davison", status: "draft" },
  };
}

// --------------------------------------------------------------------------- //
// Synastry inter-aspects and house grid
// --------------------------------------------------------------------------- //

export function synastryAspects(a: ChartResponse, b: ChartResponse): Aspect[] {
  return aspectsBetween(a.planets, b.planets);
}

// Traditional (seven-planet) rulers of each sign.
const SIGN_RULER: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn",
  Pisces: "Jupiter",
};

function houseEmphasis(overlays: HousePlanetOverlay[], hostOwner: string): HouseEmphasis[] {
  const buckets = new Map<number, string[]>();
  for (const o of overlays) {
    if (!buckets.has(o.host_house)) buckets.set(o.host_house, []);
    buckets.get(o.host_house)!.push(o.planet_id);
  }
  const out: HouseEmphasis[] = [...buckets.entries()].map(([house, planets]) => ({
    host_owner: hostOwner,
    house,
    count: planets.length,
    planets,
  }));
  out.sort((e, f) => f.count - e.count || e.house - f.house);
  return out;
}

function rulerLinks(
  host: ChartResponse,
  otherCusps: number[],
  hostOwner: string
): RulerLink[] {
  const hostPlanets = planetIndex(host);
  const links: RulerLink[] = [];
  for (const h of [...host.houses].sort((x, y) => x.index - y.index)) {
    const ruler = SIGN_RULER[h.sign];
    const rp = ruler ? hostPlanets[ruler] : undefined;
    if (!rp) continue;
    links.push({
      host_owner: hostOwner,
      house: h.index,
      cusp_sign: h.sign,
      ruler,
      lands_in_other_house: houseOf(rp.longitude, otherCusps),
    });
  }
  return links;
}

export function synastryGrid(a: ChartResponse, b: ChartResponse): SynastryGrid {
  const cuspsA = houseCusps(a);
  const cuspsB = houseCusps(b);

  const bInA: HousePlanetOverlay[] = b.planets
    .filter((p) => !ANGLE_IDS.has(p.id))
    .map((p) => ({
      planet_id: p.id,
      longitude: p.longitude,
      host_house: houseOf(p.longitude, cuspsA),
      host_owner: "a",
    }));

  const aInB: HousePlanetOverlay[] = a.planets
    .filter((p) => !ANGLE_IDS.has(p.id))
    .map((p) => ({
      planet_id: p.id,
      longitude: p.longitude,
      host_house: houseOf(p.longitude, cuspsB),
      host_owner: "b",
    }));

  const emphasis = [...houseEmphasis(bInA, "a"), ...houseEmphasis(aInB, "b")];
  const rulers = [...rulerLinks(a, cuspsB, "a"), ...rulerLinks(b, cuspsA, "b")];
  return { b_in_a: bInA, a_in_b: aInB, emphasis, rulers };
}

export function computeSynastry(reqA: ChartRequest, reqB: ChartRequest): SynastryResult {
  const chartA = calculateChart(reqA);
  const chartB = calculateChart(reqB);
  return {
    chart_a: chartA,
    chart_b: chartB,
    inter_aspects: synastryAspects(chartA, chartB),
    grid: synastryGrid(chartA, chartB),
  };
}

// --------------------------------------------------------------------------- //
// Synastry tarot (deterministic sketch — no RNG)
// --------------------------------------------------------------------------- //

type LocalSignature = ReturnType<typeof buildLocalSignature>;

function bondWeights(
  sigA: LocalSignature,
  sigB: LocalSignature,
  interAspects: Aspect[]
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const [cid, w] of Object.entries(sigA.major_weights)) weights[cid] = (weights[cid] ?? 0) + w;
  for (const [cid, w] of Object.entries(sigB.major_weights)) weights[cid] = (weights[cid] ?? 0) + w;

  const touches: Record<string, number> = {};
  for (const asp of interAspects) {
    for (const pid of [asp.p1, asp.p2]) {
      const name = pid.startsWith("t:") ? pid.slice(2) : pid; // strip synastry tag
      touches[name] = (touches[name] ?? 0) + 1;
    }
  }
  for (const [planet, cid] of Object.entries(PLANET_MAJOR)) {
    if (planet in touches) weights[cid] = (weights[cid] ?? 0) + 0.5 * touches[planet];
  }
  return weights;
}

export function synastryTarot(
  a: ChartResponse,
  b: ChartResponse
): { spread: SynastryTarotSpread } {
  const sigA = buildLocalSignature(a);
  const sigB = buildLocalSignature(b);

  const themesB = new Set(sigB.themes);
  const shared = [...new Set(sigA.themes.filter((t) => themesB.has(t)))].sort();

  const compShadowsSet = new Set<string>();
  for (const sa of sigA.shadows) {
    for (const sb of sigB.shadows) {
      if (sa !== sb) compShadowsSet.add(`${sa} ↔ ${sb}`);
    }
  }
  const compShadows = [...compShadowsSet].sort();

  // Bond card: highest-weighted trump (combined emphasis + synastry contact),
  // preferring a shared theme when present. Deterministic; ties break by card id.
  const weights = bondWeights(sigA, sigB, synastryAspects(a, b));
  const sharedIds = new Set(MAJOR_IDS.filter((cid) => shared.includes(cardById(cid)?.name ?? "")));
  const pool = sharedIds.size > 0 ? [...sharedIds] : Object.keys(weights);
  let bondId = "";
  let best: [number, string] | null = null;
  for (const cid of pool) {
    const key: [number, string] = [weights[cid] ?? 0, cid];
    if (best === null || key[0] > best[0] || (key[0] === best[0] && key[1] > best[1])) {
      best = key;
      bondId = cid;
    }
  }
  const bondCard = bondId ? cardById(bondId)?.name ?? "" : "";

  return {
    spread: {
      shared_themes: shared,
      complementary_shadows: compShadows.slice(0, 6),
      bond_card: bondCard,
    },
  };
}
