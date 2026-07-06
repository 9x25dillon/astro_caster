// Deterministic natal-tarot draw — port of the draw-relevant core of
// backend/tarot.py. The chart maps to a weighted "signature"; a sha256-seeded
// Mersenne Twister (see mt19937.ts) then draws a spread reproducibly. Prose,
// lessons and learning paths are static lookups deferred to a later step;
// this module is the part whose determinism must match the backend exactly.

import { MT19937 } from "./mt19937.js";
import { sha256Hex } from "./sha256.js";
import DECK from "./tarot-data.json" with { type: "json" };
import type { ChartResponse } from "./types.js";

interface TarotData {
  major_ids: string[];
  minor: { id: string; suit: string }[];
  planet_major: Record<string, string>;
  sign_major: Record<string, string>;
  element_suit: Record<string, string>;
}
const D = DECK as TarotData;
const FULL_DECK_IDS = [...D.major_ids, ...D.minor.map((c) => c.id)];

const SIGNATURE_ORDER = [
  "Sun", "Moon", "Ascendant", "Mercury", "Venus", "Mars", "Jupiter",
  "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "Midheaven",
];
const BODY_WEIGHT: Record<string, number> = {
  Sun: 3.0, Moon: 3.0, Ascendant: 2.5, Mercury: 1.5, Venus: 1.5,
  Mars: 1.5, Jupiter: 1.2, Saturn: 1.2, Midheaven: 1.5,
};
const DEFAULT_BODY_WEIGHT = 1.0;
const REVERSED_PROB = 0.28;

export const SPREAD_POSITIONS: Record<string, string[]> = {
  daily: ["Today"],
  three_card: ["Self", "Mirror", "Shadow"],
  elemental_balance: ["Fire", "Water", "Air", "Earth", "Spirit"],
  planetary_seven: ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"],
  twelve_house: Array.from({ length: 12 }, (_, i) => `House ${i + 1}`),
  relationship: ["You", "The Other", "The Bond", "The Lesson", "The Becoming"],
  transit_pressure: ["The Pressure", "What It Asks", "The Resource", "The Release"],
  shadow_integration: ["The Mask", "The Shadow", "The Gift", "The Integration"],
  creative_expression: ["The Spark", "The Form", "The Block", "The Offering"],
};

/** Python's round(x, ndigits): round half to EVEN. The backend rounds weights
 *  to 3 dp before they feed the draw, so a naive round would drift the RNG
 *  comparison and flip cards at boundaries. */
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

export interface NatalArcanaSignature {
  suit_bias: Record<string, number>;
  major_weights: Record<string, number>;
  dominant_element: string;
  dominant_modality: string;
}

function cardForBody(bodyId: string, sign: string | undefined): string | undefined {
  if (bodyId in D.planet_major) return D.planet_major[bodyId];
  if (sign && sign in D.sign_major) return D.sign_major[sign];
  return undefined;
}

export function buildNatalArcanaSignature(chart: ChartResponse): NatalArcanaSignature {
  const planets = new Map(chart.planets.map((p) => [p.id, p]));
  const majorWeights: Record<string, number> = {};

  for (const body of SIGNATURE_ORDER) {
    const p = planets.get(body);
    if (!p) continue;
    const cardId = cardForBody(body, p.sign);
    if (!cardId) continue;
    const w = BODY_WEIGHT[body] ?? DEFAULT_BODY_WEIGHT;
    majorWeights[cardId] = (majorWeights[cardId] ?? 0) + w;
    const signCard = D.sign_major[p.sign];
    if (signCard && signCard !== cardId) {
      majorWeights[signCard] = (majorWeights[signCard] ?? 0) + w * 0.4;
    }
  }

  const elements = chart.elements ?? {};
  const totalEl = Object.values(elements).reduce((a, b) => a + b, 0) || 1;
  const suitBias: Record<string, number> = {};
  for (const el of ["Fire", "Water", "Air", "Earth"]) {
    suitBias[D.element_suit[el]] = pyRound((elements[el] ?? 0) / totalEl, 3);
  }

  const dominantElement =
    Object.keys(elements).length > 0 ? argmax(elements) : "Fire";
  const modalities = chart.modalities ?? {};
  const dominantModality =
    Object.keys(modalities).length > 0 ? argmax(modalities) : "Cardinal";

  const rounded: Record<string, number> = {};
  for (const [k, v] of Object.entries(majorWeights)) rounded[k] = pyRound(v, 3);

  return {
    suit_bias: suitBias,
    major_weights: rounded,
    dominant_element: dominantElement,
    dominant_modality: dominantModality,
  };
}

// Python's `max(d, key=d.get)` returns the FIRST key of the max value in
// insertion order; JS object key order preserves insertion for string keys.
function argmax(d: Record<string, number>): string {
  let best: string | null = null;
  let bestV = -Infinity;
  for (const [k, v] of Object.entries(d)) {
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best!;
}

function drawWeights(sig: NatalArcanaSignature): Record<string, number> {
  const w: Record<string, number> = { ...sig.major_weights };
  for (const c of D.minor) w[c.id] = (sig.suit_bias[c.suit] ?? 0) * 3.0;
  return w;
}

function weightedSampleWithoutReplacement(
  rng: MT19937,
  items: string[],
  weights: Record<string, number>,
  k: number
): string[] {
  const pool = [...items];
  const chosen: string[] = [];
  k = Math.min(k, pool.length);
  for (let n = 0; n < k; n++) {
    const wts = pool.map((c) => Math.max(0.0001, 1.0 + (weights[c] ?? 0)));
    const total = wts.reduce((a, b) => a + b, 0);
    const r = rng.random() * total;
    let upto = 0;
    let pick = pool[pool.length - 1];
    for (let idx = 0; idx < pool.length; idx++) {
      upto += wts[idx];
      if (upto >= r) {
        pick = pool[idx];
        break;
      }
    }
    chosen.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return chosen;
}

export interface DrawnCard {
  card: string;
  reversed: boolean;
  position: string;
}

// The backend joins seed parts with a literal U+0001 (SOH) separator — it
// renders invisibly between the quotes in tarot.py's `"\x01".join(parts)`, so
// the string must be reproduced exactly or every draw diverges.
const SEED_SEP = "\u0001";

function seedRng(...parts: string[]): MT19937 {
  return new MT19937(sha256Hex(parts.join(SEED_SEP)));
}

export function weightedDraw(
  signature: NatalArcanaSignature,
  spread: string,
  seed: string,
  majorsOnly = false
): DrawnCard[] {
  const positions = SPREAD_POSITIONS[spread] ?? SPREAD_POSITIONS.three_card;
  const rng = seedRng(seed, spread);
  const deck = majorsOnly ? [...D.major_ids] : FULL_DECK_IDS;
  const weights = majorsOnly ? signature.major_weights : drawWeights(signature);
  const drawn = weightedSampleWithoutReplacement(rng, deck, weights, positions.length);
  return drawn.map((card, i) => ({
    card,
    reversed: rng.random() < REVERSED_PROB,
    position: positions[i],
  }));
}
