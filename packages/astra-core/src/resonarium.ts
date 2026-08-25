// resonarium.ts — the personal tonal field ("personal soundtrack") seed
// engine. Not music: a holistic, suggestive sound effect derived from the
// user's personal inputs — the natal chart's longitudes become a bedrock of
// drone frequencies (110–440 Hz), the ascendant and aspect geometry set a
// binaural carrier/beat pair, and the intention text folds into the seed.
//
// THIRD IMPLEMENTATION of a shared contract. The reference is
// resonarium/natal_seed.py; the browser instrument runs natal_seed.js. All
// three MUST stay compatible in canonical serialization, hashing, PRNG, and
// audio math — any change here requires the same change in both siblings,
// plus regenerated vectors (parity/resonarium-seed.json, written by
// backend/tools/gen_parity_vectors.py from the Python reference;
// test/resonarium.test.ts enforces it). The match is per-layer: seed layer,
// PRNG and binaural are BIT-EXACT (===); bedrockFrequencies agrees within
// abs 1e-9, because 2**x goes through libm pow and transcendentals are not
// bit-identical across substrates — the boundary the reference suite itself
// draws (tests/test_biosentinel.py::test_bedrock_and_modulation_match).
//
// The seed is identity, not a cache key. Derive it once per profile and
// PERSIST the result: re-deriving after an ephemeris or engine change can
// move a longitude's 6th decimal and re-deal the entire tonal field. Store
// the spec (or at least seed_hex) with the chart it came from.
//
// Privacy: the seed is a one-way digest — natal data cannot be reconstructed
// from it. Raw chart data and raw intention text are never logged or stored
// by anything in this module. (Bedrock frequencies, by construction, encode
// the longitudes they were mapped from; treat the spec with the same care as
// the chart itself.)

import { sha256Hex } from "./sha256.js";
import type { ChartResponse } from "./types.js";

export const RESONARIUM_SCHEMA_VERSION = "1.0.0";

// Canonical field order for deterministic serialization. Extra keys are
// appended in code-point order so newer charts stay deterministic.
export const CANONICAL_CHART_KEYS = [
  "sun", "moon", "mercury", "venus", "mars",
  "jupiter", "saturn", "uranus", "neptune", "pluto",
  "asc", "mc", "true_node", "chiron",
  "aspects_sum", "house_cusps_hash",
] as const;

// Longitude-bearing keys used for chart completeness validation and
// bedrock frequency derivation.
const LONGITUDE_KEYS = [
  "sun", "moon", "mercury", "venus", "mars",
  "jupiter", "saturn", "uranus", "neptune", "pluto",
  "asc", "mc", "true_node", "chiron",
] as const;

const MAX_INTENTION_LENGTH = 256;
const MIN_LONGITUDE_FIELDS = 3;

// Above this magnitude toFixed(6) defers to ToString(x) per ECMA-262 and
// emits "1e+21", while Python's ".6f" emits the full decimal expansion —
// two canonical strings, two seeds. Mirrored in natal_seed.{py,js}.
const FORMAT_DOMAIN_LIMIT = 1e21;

// --- Safety limits (mirrored in natal_seed.{py,js}) ---
export const FREQ_MIN_HZ = 20.0;
export const FREQ_MAX_HZ = 18000.0;

/** A canonical seed chart: longitudes plus derived scalar/string fields. */
export type SeedChart = Record<string, number | string>;

export class ChartValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartValidationError";
  }
}

// ------------------------------------------------------------- Seed layer

/**
 * Strip control characters, collapse spaces, enforce the length limit.
 * Mirrors sanitize_intention()/sanitizeIntention() exactly: remove code
 * points < 32 and 127, collapse runs of U+0020, trim, truncate to 256
 * code points.
 */
export function sanitizeIntention(intention?: string | null): string {
  if (!intention) return "";
  let cleaned = "";
  for (const ch of String(intention)) {
    const code = ch.codePointAt(0)!;
    if (code >= 32 && code !== 127) cleaned += ch;
  }
  cleaned = cleaned.replace(/ +/g, " ").replace(/^ +| +$/g, "");
  return Array.from(cleaned).slice(0, MAX_INTENTION_LENGTH).join("");
}

/** Reject empty, incomplete, or malformed charts. Never echoes chart values. */
export function validateChart(chart: SeedChart): void {
  if (typeof chart !== "object" || chart === null || Array.isArray(chart) ||
      Object.keys(chart).length === 0) {
    throw new ChartValidationError("chart is empty or not an object");
  }
  let longitudeCount = 0;
  for (const [key, value] of Object.entries(chart)) {
    if (typeof value === "boolean" || value === null ||
        typeof value === "object") {
      throw new ChartValidationError(
        `chart field '${key}' must be a finite number or string`);
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new ChartValidationError(
          `chart field '${key}' must be a finite number`);
      }
      // Cross-substrate domain bound — see FORMAT_DOMAIN_LIMIT. Finiteness
      // alone does not catch this, because 1e21 is perfectly finite.
      if (Math.abs(value) >= FORMAT_DOMAIN_LIMIT) {
        throw new ChartValidationError(
          `chart field '${key}' is outside the cross-substrate domain ` +
          "(|value| must be < 1e21)");
      }
      if ((LONGITUDE_KEYS as readonly string[]).includes(key)) {
        longitudeCount += 1;
      }
    }
  }
  if (longitudeCount < MIN_LONGITUDE_FIELDS) {
    throw new ChartValidationError(
      `chart needs at least ${MIN_LONGITUDE_FIELDS} planetary/angle ` +
      "longitude fields");
  }
}

function formatValue(value: number | string): string {
  if (typeof value === "number") {
    // The domain check lives HERE as well as in validateChart, because
    // canonicalizeChart() is public and callable without validating — and it
    // is the canonical STRING, not the seed, that has to be
    // substrate-identical.
    if (Math.abs(value) >= FORMAT_DOMAIN_LIMIT) {
      throw new ChartValidationError(
        "value is outside the cross-substrate domain (|value| must be < 1e21)");
    }
    // + 0 normalizes -0; fixed 6 decimals matches Python's ".6f"
    return (value + 0).toFixed(6);
  }
  return String(value);
}

/**
 * Compare two strings by Unicode code point, reproducing Python's sorted()
 * on str. The default Array.prototype.sort compares UTF-16 code UNITS, which
 * disagrees with code-point order outside the BMP — different key order,
 * different canonical string, different seed.
 */
function compareCodePoints(a: string, b: string): number {
  const A = [...a];
  const B = [...b];
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const d = A[i].codePointAt(0)! - B[i].codePointAt(0)!;
    if (d !== 0) return d;
  }
  return A.length - B.length;
}

/** Deterministic ordered serialization; mirrors both reference siblings. */
export function canonicalizeChart(chart: SeedChart): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const key of CANONICAL_CHART_KEYS) {
    if (key in chart) {
      parts.push(`${key}:${formatValue(chart[key])}`);
      seen.add(key);
    }
  }
  const extras = Object.keys(chart)
    .filter((k) => !seen.has(k))
    .sort(compareCodePoints);
  for (const key of extras) parts.push(`${key}:${formatValue(chart[key])}`);
  return parts.join("|");
}

/**
 * Deterministic unsigned 64-bit seed as BigInt: SHA-256 over the canonical
 * UTF-8 string of `chart | intention`, first 8 bytes big-endian.
 */
export function deriveNatalSeed(chart: SeedChart, intention = ""): bigint {
  validateChart(chart);
  let raw = canonicalizeChart(chart);
  const cleaned = sanitizeIntention(intention);
  if (cleaned) raw += `|intention:${cleaned}`;
  // First 16 hex chars of the digest ARE the first 8 bytes, big-endian.
  return BigInt("0x" + sha256Hex(raw).slice(0, 16));
}

export function seedToHex(seed: bigint): string {
  return seed.toString(16).padStart(16, "0");
}

/** The 32-bit PRNG seed: lower 32 bits of the 64-bit seed. */
export function seedLower32(seed: bigint): number {
  return Number(seed & 0xffffffffn);
}

// ------------------------------------------------------------------ PRNG

/** mulberry32 — all resonarium overlay randomness flows through this. */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------------------------------------------------------------- Safety

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Python's `x % 360.0`, bit-exact: fmod (which JS `%` is), plus the modulus
 * when the sign disagrees — ONE rounding step, and none at all for values
 * already in [0, 360). The idiom `((x % 360) + 360) % 360` is NOT that: the
 * `+ 360` rounds the intermediate onto a coarser grid before the second mod
 * subtracts it back, losing the low bits of in-range values. The reference
 * (natal_seed.py) uses Python `%`, so this port must too.
 */
function pymod360(x: number): number {
  const m = x % 360;
  return m < 0 ? m + 360 : m;
}

/** Hard audio-safety clamp; every emitted frequency passes through it. */
export function clampFrequency(hz: number): number {
  return clamp(hz, FREQ_MIN_HZ, FREQ_MAX_HZ);
}

// -------------------------------------------------------- Tonal field

/**
 * Immutable natal bedrock frequencies (110–440 Hz) from longitudes, in
 * canonical body order. The baseline the instrument drones on — callers
 * must never mutate oscillators built from it.
 */
export function bedrockFrequencies(chart: SeedChart): readonly number[] {
  validateChart(chart);
  const freqs: number[] = [];
  for (const key of LONGITUDE_KEYS) {
    if (key in chart && typeof chart[key] === "number") {
      const lon = pymod360(chart[key] as number);
      freqs.push(clampFrequency(110.0 * Math.pow(2.0, lon / 180.0)));
    }
  }
  return Object.freeze(freqs);
}

export interface BinauralConfig {
  readonly carrier_hz: number; // 180–300 Hz, from the ascendant
  readonly beat_hz: number;    // 4–12 Hz, from the aspect geometry
}

/** Deterministic binaural carrier/beat from the chart. */
export function binauralConfig(chart: SeedChart): BinauralConfig {
  validateChart(chart);
  const ascRaw = "asc" in chart ? chart.asc : ((chart.sun as number) || 0);
  const asc = pymod360(Number(ascRaw));
  const aspects = Number(chart.aspects_sum || 0);
  return Object.freeze({
    carrier_hz: clampFrequency(180.0 + (asc / 360.0) * 120.0),
    beat_hz: 4.0 + (Math.abs(aspects) % 8.0),
  });
}

// ------------------------------------------------------------- Adapter

/**
 * The engine fields the tonal derivation consumes — a structural subset of
 * ChartResponse, so the app passes its chart straight in and the parity test
 * feeds the slim recorded fixture.
 */
export interface SoundtrackSource {
  planets: ReadonlyArray<{ id: string; longitude: number }>;
  angles: { ascendant: number; midheaven: number };
  aspects: ReadonlyArray<{ separation: number }>;
  houses: ReadonlyArray<{ index: number; longitude: number }>;
}

// Seed-key mapping from the engine's planet ids. Only the canonical
// natal_seed keys participate — South Node, Lilith and Part of Fortune are
// derived/auxiliary points outside the canonical chart contract, and adding
// them would change every seed. Mirrors SEED_KEY_BY_PLANET in
// backend/tools/gen_parity_vectors.py.
const SEED_KEY_BY_PLANET: Record<string, string> = {
  "Sun": "sun", "Moon": "moon", "Mercury": "mercury", "Venus": "venus",
  "Mars": "mars", "Jupiter": "jupiter", "Saturn": "saturn",
  "Uranus": "uranus", "Neptune": "neptune", "Pluto": "pluto",
  "North Node": "true_node", // the engine's node IS the true node
  "Chiron": "chiron",
};

/**
 * Engine ChartResponse -> canonical seed chart. Order sensitivity is part of
 * the contract: aspects_sum is a plain left-to-right sequential float
 * accumulation in engine order — the Python reference uses an explicit loop,
 * NOT builtins.sum(), which since CPython 3.12 compensates (Neumaier) and
 * diverges from a naive reduce() in the last bits. house_cusps_hash consumes
 * the cusps sorted by house index at 6 dp (`+ 0` normalizes -0). Mirrors
 * _seed_chart_from_response() in backend/tools/gen_parity_vectors.py — any
 * change requires both.
 */
export function seedChartFromResponse(chart: SoundtrackSource): SeedChart {
  const sc: SeedChart = {};
  for (const p of chart.planets) {
    const key = SEED_KEY_BY_PLANET[p.id];
    if (key !== undefined) sc[key] = p.longitude;
  }
  sc.asc = chart.angles.ascendant;
  sc.mc = chart.angles.midheaven;
  sc.aspects_sum = chart.aspects.reduce((s, a) => s + a.separation, 0);
  const cusps = [...chart.houses]
    .sort((a, b) => a.index - b.index)
    .map((h) => (h.longitude + 0).toFixed(6))
    .join(",");
  sc.house_cusps_hash = sha256Hex(cusps).slice(0, 16);
  return sc;
}

// ---------------------------------------------------- Personal soundtrack

/**
 * Everything a player needs to sound the personal tonal field. Persist the
 * WHOLE spec alongside the profile — the seed is identity, re-deriving it
 * under a changed engine can re-deal the field, and bedrock_hz re-derived on
 * a different substrate can move in its last bits (libm pow). The persisted
 * values are the field; derivation is how they are born, not how they are
 * looked up.
 */
export interface SoundtrackSpec {
  readonly schema_version: string;
  /** One-way 64-bit digest of chart + intention, as 16 hex chars. */
  readonly seed_hex: string;
  /** Lower 32 bits of the seed — feed to mulberry32 for overlay entropy. */
  readonly seed32: number;
  /** Drone frequencies in canonical body order, 110–440 Hz. */
  readonly bedrock_hz: readonly number[];
  readonly binaural: BinauralConfig;
}

/**
 * Derive the complete tonal-field spec from the user's personal inputs: the
 * app's computed chart and an optional intention. Pure and deterministic —
 * same chart + same intention => same field, here, in the Python reference,
 * and in the browser instrument.
 */
export function personalSoundtrack(
  chart: ChartResponse | SoundtrackSource,
  intention = "",
): SoundtrackSpec {
  const sc = seedChartFromResponse(chart);
  const seed = deriveNatalSeed(sc, intention);
  return Object.freeze({
    schema_version: RESONARIUM_SCHEMA_VERSION,
    seed_hex: seedToHex(seed),
    seed32: seedLower32(seed),
    bedrock_hz: bedrockFrequencies(sc),
    binaural: binauralConfig(sc),
  });
}
