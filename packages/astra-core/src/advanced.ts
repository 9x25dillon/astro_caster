// advanced.ts — specialist techniques (MOBILE_ROADMAP §3.4), a port of
// backend/advanced.py: harmonic charts, midpoint trees (Ebertin 90° dial), and
// fixed-star contacts (self-contained precession-adjusted catalogue). All pure
// arithmetic on natal positions — no ephemeris calls beyond the base chart.
//
// Drift-locked to the backend by parity/advanced.json.

import {
  SIGN_GLYPHS,
  angularSeparation,
  degreeInSign,
  norm360,
  signFor,
} from "./astrology.js";
import { calculateChart } from "./ephemeris.js";
import { circularMidpoint } from "./synastry.js";
import type { ChartRequest } from "./types.js";

// Bodies excluded from these techniques (derived / non-physical points).
const SKIP = new Set(["Descendant", "Imum Coeli", "Part of Fortune", "Lilith", "South Node"]);
const DIAL_BODIES_SKIP = new Set(["Descendant", "Imum Coeli", "Part of Fortune"]);

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
const round3 = (x: number) => Math.round(x * 1e3) / 1e3;
const round2 = (x: number) => Math.round(x * 100) / 100;

// --------------------------------------------------------------------------- //
// Harmonic charts
// --------------------------------------------------------------------------- //

export interface HarmonicPosition {
  id: string;
  glyph: string;
  longitude: number;
  sign: string;
  sign_glyph: string;
  degree: number;
  minute: number;
}

export interface HarmonicChart {
  harmonic: number;
  positions: HarmonicPosition[];
  aspects: { p1: string; p2: string; type: string; orb: number }[];
}

export function harmonicChart(natal: ChartRequest, harmonic: number): HarmonicChart {
  const chart = calculateChart(natal);
  const positions: HarmonicPosition[] = [];
  for (const p of chart.planets) {
    if (SKIP.has(p.id)) continue;
    const lon = norm360(p.longitude * harmonic);
    const [degree, minute] = degreeInSign(lon);
    const sign = signFor(lon);
    positions.push({
      id: p.id,
      glyph: p.glyph,
      longitude: round4(lon),
      sign,
      sign_glyph: SIGN_GLYPHS[sign],
      degree,
      minute,
    });
  }
  // Conjunctions in the harmonic chart (clustering = the resonance).
  const aspects: HarmonicChart["aspects"] = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const sep = angularSeparation(positions[i].longitude, positions[j].longitude);
      if (sep <= 2.0) {
        aspects.push({ p1: positions[i].id, p2: positions[j].id, type: "Conjunction", orb: round2(sep) });
      }
    }
  }
  return { harmonic, positions, aspects };
}

// --------------------------------------------------------------------------- //
// Midpoint trees (90° dial)
// --------------------------------------------------------------------------- //

export interface MidpointContact {
  body: string;
  angle: number; // 0 / 90 / 180 / 270 — position on the dial
  aspect: string; // conjunction | square | opposition
  orb: number;
}

export interface MidpointTreeEntry {
  pair: string; // "Sun/Moon"
  midpoint: number;
  sign: string;
  degree: number;
  contacts: MidpointContact[];
}

const DIAL_ANGLES: [number, string][] = [
  [0, "conjunction"], [90, "square"], [180, "opposition"], [270, "square"],
];

export function midpointTree(natal: ChartRequest, orb = 1.0): MidpointTreeEntry[] {
  const chart = calculateChart(natal);
  const bodies = chart.planets.filter((p) => !DIAL_BODIES_SKIP.has(p.id));
  const entries: MidpointTreeEntry[] = [];

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const mid = circularMidpoint(a.longitude, b.longitude);
      const contacts: MidpointContact[] = [];
      for (const c of bodies) {
        if (c.id === a.id || c.id === b.id) continue;
        const sep = angularSeparation(c.longitude, mid); // 0..180
        for (const [ang, name] of DIAL_ANGLES) {
          const target = ang <= 180 ? ang : 360 - ang; // 270 -> 90 in 0..180 space
          if (Math.abs(sep - target) <= orb) {
            contacts.push({ body: c.id, angle: ang, aspect: name, orb: round2(Math.abs(sep - target)) });
            break;
          }
        }
      }
      if (contacts.length > 0) {
        const [degree] = degreeInSign(mid);
        contacts.sort((x, y) => x.orb - y.orb);
        entries.push({ pair: `${a.id}/${b.id}`, midpoint: round3(mid), sign: signFor(mid), degree, contacts });
      }
    }
  }
  entries.sort((e, f) => (e.contacts[0]?.orb ?? 99) - (f.contacts[0]?.orb ?? 99));
  return entries;
}

// --------------------------------------------------------------------------- //
// Fixed stars — precession-adjusted catalogue (J2000 ecliptic longitudes)
// lon at year = lon2000 + 50.29"/yr * (year - 2000). 50.29" = 0.0139694°.
// --------------------------------------------------------------------------- //

const PRECESSION_PER_YEAR = 0.0139694;

// name → [J2000 ecliptic longitude, short Ptolemaic nature]
const FIXED_STARS: Record<string, [number, string]> = {
  Algol: [56.167, "intensity, the unflinching gaze; passion that must be owned"],
  Pleiades: [60.0, "vision and grief; 'something to weep about', sight beyond sight"],
  Aldebaran: [69.783, "the Watcher of the East; integrity, courage, honour-through-trial"],
  Rigel: [76.833, "teaching, ascent, the bringer of knowledge"],
  Bellatrix: [80.767, "swift success, the warrior-woman; quick wit"],
  Capella: [81.85, "curiosity, freedom, an inquisitive mind"],
  Betelgeuse: [88.75, "martial honour, enduring fortune"],
  Sirius: [104.083, "the brilliant one; ambition, the sacred fire, renown"],
  Castor: [110.15, "the mind sharpened; sudden fame or sudden loss"],
  Pollux: [113.217, "the artful, competitive spirit; martial intensity"],
  Procyon: [115.783, "rapid rise then fall; act, don't drift"],
  Regulus: [149.833, "the Heart of the Lion; royalty, success that pride can undo"],
  Spica: [203.833, "the gift; brilliance, blessing, protected talent"],
  Arcturus: [204.233, "the guardian; new paths, pathfinding prosperity"],
  Antares: [249.767, "the Watcher of the West; obsessive intensity, all-or-nothing"],
  Vega: [285.317, "charisma and artistry; the magical, fleeting gift"],
  Fomalhaut: [333.867, "the visionary; idealism that can purify or intoxicate"],
  Markab: [353.483, "steadiness under pressure; the return, things made firm"],
};

export interface FixedStarHit {
  star: string;
  star_longitude: number;
  sign: string;
  degree: number;
  nature: string;
  natal_body: string;
  orb: number;
}

function starLongitude(lon2000: number, year: number): number {
  return norm360(lon2000 + PRECESSION_PER_YEAR * (year - 2000));
}

export function fixedStarHits(natal: ChartRequest, orb = 1.5): FixedStarHit[] {
  const chart = calculateChart(natal);
  const year = natal.year;
  const hits: FixedStarHit[] = [];
  for (const [star, [lon2000, nature]] of Object.entries(FIXED_STARS)) {
    const starLon = starLongitude(lon2000, year);
    const [degree] = degreeInSign(starLon);
    const sign = signFor(starLon);
    for (const p of chart.planets) {
      if (SKIP.has(p.id)) continue;
      const sep = angularSeparation(p.longitude, starLon);
      if (sep <= orb) {
        hits.push({
          star, star_longitude: round3(starLon), sign, degree, nature,
          natal_body: p.id, orb: round2(sep),
        });
      }
    }
  }
  hits.sort((a, b) => a.orb - b.orb);
  return hits;
}
