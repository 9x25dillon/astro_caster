// Deterministic natal-tarot draw — port of the draw-relevant core of
// backend/tarot.py. The chart maps to a weighted "signature"; a sha256-seeded
// Mersenne Twister (see mt19937.ts) then draws a spread reproducibly. Prose,
// lessons and learning paths are static lookups deferred to a later step;
// this module is the part whose determinism must match the backend exactly.

import { MT19937 } from "./mt19937.js";
import { sha256Hex } from "./sha256.js";
import DECK from "./tarot-data.json" with { type: "json" };
import CARDS from "./tarot-cards.json" with { type: "json" };
import type { ChartResponse } from "./types.js";

export interface TarotCard {
  id: string;
  name: string;
  arcana: "major" | "minor";
  number: number | null;
  suit: string | null;
  keywords: string[];
  element: string | null;
  astrology: string[];
  upright: string | null;
  reversed_meaning: string | null;
}
const CARD_BY_ID = CARDS as Record<string, TarotCard>;
const SUIT_ELEMENTS: Record<string, string> = {
  wands: "Fire", cups: "Water", swords: "Air", pentacles: "Earth",
};

export const DISCLAIMER =
  "Astra Arcana is a symbolic mirror for reflection and creative alignment, " +
  "not a deterministic prediction engine. It does not foretell fixed events and " +
  "does not replace professional medical, legal, financial, or mental-health support.";

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

export interface ArcanaLink {
  body: string;
  card_id: string;
  sign: string | null;
  house: number | null;
  note: string;
}

export interface NatalArcanaSignature {
  suit_bias: Record<string, number>;
  major_weights: Record<string, number>;
  dominant_element: string;
  dominant_modality: string;
  links: ArcanaLink[];
}

// House → life-domain phrase for natal-link notes (port of tarot_data.HOUSE_THEMES).
const HOUSE_THEMES: Record<string, string> = {
  "1": "identity and embodiment",
  "2": "value, money, body, and voice",
  "3": "language, learning, and the near world",
  "4": "home, ancestry, and the inner root",
  "5": "creativity, romance, and play",
  "6": "health, craft, devotion, and service",
  "7": "partnership and the mirror of the Other",
  "8": "shadow, intimacy, death, and shared power",
  "9": "belief, travel, and philosophy",
  "10": "calling, visibility, and public role",
  "11": "community, future, and networks",
  "12": "dreams, isolation, spirit, and the unconscious",
};

function cardForBody(bodyId: string, sign: string | undefined): string | undefined {
  if (bodyId in D.planet_major) return D.planet_major[bodyId];
  if (sign && sign in D.sign_major) return D.sign_major[sign];
  return undefined;
}

export function buildNatalArcanaSignature(chart: ChartResponse): NatalArcanaSignature {
  const planets = new Map(chart.planets.map((p) => [p.id, p]));
  const majorWeights: Record<string, number> = {};
  const links: ArcanaLink[] = [];

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
    const theme = HOUSE_THEMES[String((p as any).house)] ?? "an important domain of life";
    const name = CARD_BY_ID[cardId]?.name ?? cardId;
    links.push({
      body,
      card_id: cardId,
      sign: p.sign ?? null,
      house: (p as any).house ?? null,
      note: `${body} in ${p.sign} (house ${(p as any).house}) — ${name} working through ${theme}.`,
    });
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
    links,
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

// Sign → element, for the shadow (weakest-element trumps) computation.
const SIGN_ELEMENT: Record<string, string> = {
  Aries: "Fire", Leo: "Fire", Sagittarius: "Fire",
  Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth",
  Gemini: "Air", Libra: "Air", Aquarius: "Air",
  Cancer: "Water", Scorpio: "Water", Pisces: "Water",
};

/** Full frontend-shaped natal signature (links with card objects, themes,
 *  shadows, disclaimer) — the on-device equivalent of /api/natal-arcana. */
export function buildLocalSignature(chart: ChartResponse) {
  const sig = buildNatalArcanaSignature(chart);

  const links = sig.links.map((l) => ({
    body: l.body,
    sign: l.sign,
    house: l.house,
    card: CARD_BY_ID[l.card_id],
    note: l.note,
  }));

  const themes = Object.entries(sig.major_weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => CARD_BY_ID[id]?.name)
    .filter(Boolean) as string[];

  // Shadows: trumps of the weakest element's signs (port of build_natal_arcana_signature).
  const elements = chart.elements ?? {};
  const weakestEl =
    Object.keys(elements).length > 0
      ? Object.entries(elements).reduce((a, b) => (b[1] < a[1] ? b : a))[0]
      : "Earth";
  const shadowSet = new Set<string>();
  for (const [sign, el] of Object.entries(SIGN_ELEMENT)) {
    if (el !== weakestEl) continue;
    const cardId = D.sign_major[sign];
    if (cardId) shadowSet.add(CARD_BY_ID[cardId]?.name ?? cardId);
  }
  const shadows = [...shadowSet].sort();

  return {
    links,
    dominant_element: sig.dominant_element,
    dominant_modality: sig.dominant_modality,
    suit_bias: sig.suit_bias,
    major_weights: sig.major_weights,
    themes,
    shadows,
    disclaimer: DISCLAIMER,
  };
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

// --------------------------------------------------------------------------- #
// Offline reading — ports the deterministic half of backend build_reading_core
// so a reading works with the backend absent. The seed and draw match the
// backend's OFFLINE mode exactly (same cards); per-card meaning uses the same
// template. AI interpretation and the lesson/activity generators are backend
// enrichment, left null offline (the card meanings carry the substance).
// --------------------------------------------------------------------------- #

const DEFAULT_SOURCE = "golden_dawn";

export function cardById(id: string): TarotCard | undefined {
  return CARD_BY_ID[id];
}

/** Port of tarot._default_seed — identical string, so the offline draw
 *  reproduces the backend's offline draw for the same inputs. */
export function defaultSeed(
  chart: ChartResponse,
  spread: string,
  question: string,
  localDate?: string | null,
  source: string = DEFAULT_SOURCE
): string {
  const bodies = [...chart.planets]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) => `${p.id}:${round2(p.longitude)}`)
    .join("|");
  const day = spread === "daily" ? `#${localDate ?? isoToday()}` : "";
  const src = !source || source === DEFAULT_SOURCE ? "" : `#src:${source}`;
  return `${bodies}#${spread}#${question.trim().toLowerCase()}${day}${src}`;
}

// Python round(x, 2) — banker's rounding, to match the seed string byte-for-byte.
function round2(x: number): number {
  return pyRound(x, 2);
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function offlineMeaning(
  cardId: string,
  reversed: boolean,
  position: string,
  linkNote: string | null
): string {
  const d = CARD_BY_ID[cardId];
  const face = reversed ? d.reversed_meaning : d.upright;
  const orient = reversed ? "reversed" : "upright";
  const kind = d.arcana === "minor" ? "card" : "archetype";
  let base =
    `**${d.name}** (${orient}) in the *${position}* position speaks of ${face}. ` +
    `Its keywords — ${d.keywords.slice(0, 4).join(", ")} — color how this ${kind} ` +
    `is moving for you now.`;
  if (linkNote) base += ` In your chart, this trump already lives here: ${linkNote}`;
  return base;
}

export interface WeightSource {
  label: string;
  weight: number;
}

function cardWeightSources(cardId: string, sig: NatalArcanaSignature): WeightSource[] {
  const d = CARD_BY_ID[cardId];
  if (d.arcana === "minor") {
    const suit = d.suit ?? "";
    const element = SUIT_ELEMENTS[suit] ?? "";
    const bias = sig.suit_bias[suit] ?? 0;
    return [{
      label: `${suit[0]?.toUpperCase()}${suit.slice(1)} weighted by ${element} balance ` +
             `(${Math.round(bias * 100)}% of the chart)`,
      weight: pyRound(bias, 3),
    }];
  }
  const w = sig.major_weights[cardId];
  if (w) return [{ label: `Natal emphasis on ${d.name}`, weight: pyRound(w, 3) }];
  return [{ label: "Neutral draw — no natal emphasis on this trump", weight: 0.0 }];
}

export interface ReadingDrawnCard {
  position: string;
  card: TarotCard & { reversed_meaning: string | null };
  reversed: boolean;
  natal_link: string | null;
  meaning: string;
  activity: string | null;
  journal_prompt: string | null;
  weight_sources: WeightSource[];
}

export interface LocalReading {
  spread: string;
  source: string;
  question: string;
  seed: string;
  signature: NatalArcanaSignature & {
    links: unknown[];
    themes: string[];
    shadows: string[];
    disclaimer: string;
  };
  cards: ReadingDrawnCard[];
  interpretation: string;
  ai_source: "offline";
  lessons: unknown[];
  activities: unknown[];
  disclaimer: string;
}

/** A complete offline reading, shaped to the backend's TarotReadingResponse. */
export function buildLocalReading(
  chart: ChartResponse,
  spread: string,
  question: string,
  opts: { date?: string | null; source?: string } = {}
): LocalReading {
  const source = opts.source ?? DEFAULT_SOURCE;
  const sig = buildNatalArcanaSignature(chart);
  const seed = defaultSeed(chart, spread, question, opts.date ?? null, source);
  const draw = weightedDraw(sig, spread, seed);

  // First (Sun-first order) natal link per trump, so meanings/natal_link attach
  // to the primary body — matches the backend's link_by_card.setdefault.
  const linkByCard = new Map<string, ArcanaLink>();
  for (const l of sig.links) if (!linkByCard.has(l.card_id)) linkByCard.set(l.card_id, l);

  // Top-weighted trumps make the display "themes"; the draw doesn't use them.
  const themes = Object.entries(sig.major_weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => CARD_BY_ID[id]?.name)
    .filter(Boolean) as string[];

  const cards: ReadingDrawnCard[] = draw.map((dc) => {
    const link = linkByCard.get(dc.card) ?? null;
    return {
      position: dc.position,
      card: CARD_BY_ID[dc.card],
      reversed: dc.reversed,
      natal_link: link ? link.body : null,
      meaning: offlineMeaning(dc.card, dc.reversed, dc.position, link ? link.note : null),
      activity: null,
      journal_prompt: null,
      weight_sources: cardWeightSources(dc.card, sig),
    };
  });

  const names = cards.map((c) => `${c.card.name} (${c.position})`).join(", ");
  const interpretation =
    `Your ${spread.replace(/_/g, " ")} draw — ${names}. ` +
    `Read on your device with the backend offline; the cards are the same the ` +
    `server would deal for this question and chart.`;

  return {
    spread, source, question, seed,
    signature: { ...sig, links: [], themes, shadows: [], disclaimer: DISCLAIMER },
    cards,
    interpretation,
    ai_source: "offline",
    lessons: [],
    activities: [],
    disclaimer: DISCLAIMER,
  };
}
