// natalField.ts — the whole chart as one sounding field.
//
// The Torus sounds a PAIR: two drones whose interval is the aspect. This is the
// other half — all fourteen canonical bodies at once, which is what the
// resonarium engine was actually built to produce and what nothing had yet
// played.
//
// THE PROBLEM THE VOICING SOLVES. The bedrock map f(λ) = 110·2^(λ/180) is
// exponential, so equal spacing in longitude is equal spacing in CENTS, not in
// Hz — and the bottom of the range is therefore always compressed. On a real
// chart six of fourteen drones can land inside 111–136 Hz while the top four
// spread over an octave. Played at equal gain that is not a field, it is bass
// mud with a few tones floating above it.
//
// The fix is not a fixed EQ tilt (which would make a body loud or quiet purely
// for sitting high or low in the zodiac — arbitrary, and it would fight the
// data). It is CROWD-AWARE: a drone with close neighbours steps back in
// proportion to how crowded its neighbourhood is, so a cluster reads as one
// textured mass at the same weight as a lone tone. What the chart crowds, the
// mix thins.
//
// Crucially this KEEPS the beating. Two bodies 7 cents apart at 111 Hz beat at
// 0.4 Hz — a two-and-a-half-second breath — and that slow pulse is the whole
// signature of a conjunction in the low register. Crowd-gain lowers both voices
// together; it never detunes or removes one.
//
//   The low register is where conjunctions are heard as BEATING.
//   The high register is where they are heard as PITCH.
//
// One map, two perceptual regimes, split by where in the zodiac a body sits.
//
// THE EXPORT. `resonariumState` emits the `resonarium.state.v2` shape that
// beatmI/SPINE's `twin/analyze.py --resonarium` already reads, so a chart can
// generate a beat with no new contract invented at either end:
//
//   · every drone becomes a `singles` entry — static tones, not sweeps;
//   · the binaural bed becomes one `bins` entry, and its BEAT RATE is read as a
//     TEMPO (9.15 Hz → 549 → 274.5 → 137.25 BPM after folding into range);
//   · `natalSeed` is spec.seed32, which seeds that generator — so the chart
//     fixes the tones and the tempo, and the INTENTION (the only input that
//     moves seed32, since bedrock_hz and binaural are chart-only) fixes which
//     take you get.
//
// Verified end to end against the real analyzer, not assumed — see
// test/natalField.test.ts.
//
// Pure: no DOM, no audio, no engine import.

import { droneHz } from "./resonance";

/** Canonical longitude keys, in the order bedrock_hz is emitted. */
export const FIELD_KEYS = [
  "sun", "moon", "mercury", "venus", "mars",
  "jupiter", "saturn", "uranus", "neptune", "pluto",
  "asc", "mc", "true_node", "chiron",
] as const;

/** Display names. `asc`/`mc` carry drones but are not selectable on the torus,
 *  and `true_node` is the node the whole seed contract means by "North Node". */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  sun: "Sun", moon: "Moon", mercury: "Mercury", venus: "Venus", mars: "Mars",
  jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune",
  pluto: "Pluto", asc: "Ascendant", mc: "Midheaven",
  true_node: "North Node", chiron: "Chiron",
};

export const FIELD_GLYPHS: Readonly<Record<string, string>> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂", jupiter: "♃",
  saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇",
  asc: "Asc", mc: "MC", true_node: "☊", chiron: "⚷",
};

/** Neighbourhood width for crowding, in cents. A semitone: inside this, two
 *  drones are heard as one thickened tone rather than two pitches. */
export const CROWD_CENTS = 100;

/** Below this, |fA − fB| is a perceptible beat rather than a second pitch. */
export const BEAT_AUDIBLE_HZ = 8;

export interface FieldVoice {
  /** Canonical seed key — `sun`, `asc`, `true_node`, … */
  key: string;
  label: string;
  glyph: string;
  /** The drone, straight from the persisted spec's bedrock_hz. */
  hz: number;
  /** How many other drones sit within CROWD_CENTS. */
  crowd: number;
  /** Mix weight in (0, 1]: 1 for a lone tone, lower inside a cluster. */
  gain: number;
}

function cents(a: number, b: number): number {
  return Math.abs(1200 * Math.log2(a / b));
}

/**
 * Voice the field: pair each drone with its body and a crowd-aware gain.
 *
 * `present` must be the seed chart's key set, because bedrock_hz is COMPACTED
 * (only keys the chart actually had are emitted), so position i means a body
 * only after replaying that same filter.
 */
export function fieldVoices(
  bedrockHz: readonly number[],
  present: ReadonlySet<string>
): FieldVoice[] {
  const keys = FIELD_KEYS.filter((k) => present.has(k)).slice(0, bedrockHz.length);
  const hzs = keys.map((_, i) => bedrockHz[i]);
  return keys.map((key, i) => {
    let crowd = 0;
    for (let j = 0; j < hzs.length; j++) {
      if (j !== i && cents(hzs[i], hzs[j]) <= CROWD_CENTS) crowd += 1;
    }
    return {
      key,
      label: FIELD_LABELS[key] ?? key,
      glyph: FIELD_GLYPHS[key] ?? "",
      hz: hzs[i],
      crowd,
      // 1/sqrt(1+n): two voices in a cluster each drop ~3 dB, so the cluster's
      // total energy matches a lone tone's. Never zero — nothing is silenced.
      gain: 1 / Math.sqrt(1 + crowd),
    };
  });
}

export interface BeatingPair {
  a: FieldVoice;
  b: FieldVoice;
  /** |fA − fB| in Hz — the pulse rate you actually hear. */
  beatHz: number;
  /** Seconds per pulse. */
  periodS: number;
}

/** Adjacent drone pairs close enough that the ear hears a pulse, not a chord. */
export function beatingPairs(voices: readonly FieldVoice[]): BeatingPair[] {
  const sorted = [...voices].sort((x, y) => x.hz - y.hz);
  const out: BeatingPair[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const beatHz = sorted[i].hz - sorted[i - 1].hz;
    if (beatHz > 0 && beatHz <= BEAT_AUDIBLE_HZ) {
      out.push({ a: sorted[i - 1], b: sorted[i], beatHz, periodS: 1 / beatHz });
    }
  }
  return out.sort((p, q) => p.beatHz - q.beatHz);
}

/**
 * The pitch class a longitude lands on, 0 = C.
 *
 * f = 110·2^(λ/180) and 110 Hz is A2, so
 *   pitch class = (9 + λ/15) mod 12
 * — i.e. **15° of zodiac is exactly one semitone**, and one sign (30°) is one
 * whole tone. Which is the same fact the aspect table's 200¢ grid records, seen
 * from the absolute side instead of the interval side.
 */
export function pitchClassOf(lonDeg: number): number {
  const c = ((9 + lonDeg / 15) % 12 + 12) % 12;
  return Math.round(c) % 12;
}

export const PITCH_NAMES = [
  "C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B",
] as const;

// ---------------------------------------------------------------------------
// The beatmI / SPINE bridge
// ---------------------------------------------------------------------------

/** Beat rate (Hz) folded into a musical tempo — beatmI's own arithmetic,
 *  mirrored so the app can SHOW the tempo it is about to export. */
export function beatHzToBpm(beatHz: number): number {
  let bpm = beatHz * 60;
  if (!(bpm > 0) || !Number.isFinite(bpm)) return 0;
  while (bpm < 70) bpm *= 2;
  while (bpm > 190) bpm /= 2;
  return bpm;
}

export interface ResonariumState {
  schema: "resonarium.state.v2";
  natalSeed: number;
  singles: { on: boolean; f: number; lvl: number; note: string }[];
  bins: { on: boolean; carrier: number; beat: number; lvl: number }[];
  sweeps: never[];
}

/**
 * The exported state. `lvl` carries the SAME crowd-aware gain the player uses,
 * so the chroma beatmI votes with is weighted exactly as the field sounds —
 * what you hear is what it analyses.
 *
 * Note the analyzer floors `lvl` at 0.05, so a heavily crowded voice still
 * votes; nothing drops out of the key estimate by being quiet.
 */
export function resonariumState(
  seed32: number,
  binaural: { carrier_hz: number; beat_hz: number },
  voices: readonly FieldVoice[]
): ResonariumState {
  return {
    schema: "resonarium.state.v2",
    natalSeed: seed32,
    singles: voices.map((v) => ({
      on: true, f: v.hz, lvl: Number(v.gain.toFixed(4)), note: v.key,
    })),
    bins: [{
      on: true, carrier: binaural.carrier_hz, beat: binaural.beat_hz, lvl: 0.3,
    }],
    sweeps: [],
  };
}

/** A drone for a longitude — re-exported so the panel need not import both. */
export { droneHz };
