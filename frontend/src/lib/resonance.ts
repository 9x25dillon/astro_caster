// resonance.ts — the torus, heard.
//
// The resonarium's bedrock map (packages/astra-core/src/resonarium.ts) sends a
// longitude to a drone:
//
//     f(λ) = 110 · 2^(λ/180)  Hz          λ ∈ [0, 360) ⇒ f ∈ [110, 440)
//
// One octave per 180°, i.e. exactly 1200/180 = 20/3 cents per degree. So the
// interval between two bodies' drones is 2^(Δ/180), and every classical aspect
// lands on an exact multiple of 200 cents:
//
//     conjunction   0° → 1.000   unison        trine       120° →  800c  m6
//     semisextile  30° →  200c   whole tone    quincunx    150° → 1000c  m7
//     sextile      60° →  400c   M3            opposition  180° → 2.000  octave
//     square       90° →  600c   tritone
//
// The major-aspect family IS the whole-tone scale under the map that already
// shipped. The torus and the soundtrack are therefore the same object: the
// torus shows relative phase as geometry, this module sounds it as interval.
// (Verified empirically as well as algebraically — see test/resonance.test.ts,
// which drives 100k randomized exact-aspect pairs through droneHz.)
//
// Because 360° is 2400c, the map is periodic over TWO octaves, not one. That
// is a robustness bonus rather than a caveat: measuring a trine the long way
// (240° instead of 120°) gives 1600c, the same interval class inverted
// (minor sixth ↔ major third). The claim survives either measurement.
//
// THE SEED IS IDENTITY. Nothing here derives, re-derives or influences a seed.
// droneHz is the resonarium's per-element map applied to a TRANSITING
// longitude — which spec.bedrock_hz cannot supply, being natal-only — and
// test/resonance.test.ts pins it to reproduce bedrock_hz element-for-element on
// a real chart, so the two cannot drift apart. The engine is untouched and its
// parity vectors are unmoved.
//
// Pure math: no DOM, no audio, no ephemeris, no imports.

/** The resonarium's bedrock base pitch, at λ = 0°. */
export const DRONE_BASE_HZ = 110.0;
/** Degrees per octave of the bedrock map — one octave per half-circle. */
export const DEGREES_PER_OCTAVE = 180.0;
/** Exactly 20/3. The whole claim in one number. */
export const CENTS_PER_DEGREE = 1200 / DEGREES_PER_OCTAVE;

// Audio-safety bounds, mirrored from resonarium.ts. Over a zodiacal longitude
// the map spans [110, 440) and never approaches either, but the clamp is part
// of the contract being mirrored, so it is mirrored.
export const FREQ_MIN_HZ = 20.0;
export const FREQ_MAX_HZ = 18000.0;

/** Python's `x % 360.0`, bit-exact — one rounding step, none for in-range
 *  values. The idiom ((x%360)+360)%360 is NOT this and loses a ulp; the engine
 *  documents why at length, and this mirror must agree with it. */
function pymod360(x: number): number {
  const m = x % 360;
  return m < 0 ? m + 360 : m;
}

/**
 * One longitude → one drone. The per-element body of resonarium's
 * bedrockFrequencies(), liberated from its natal-chart argument so it can be
 * applied to a body's position at any instant along a trajectory.
 */
export function droneHz(lonDeg: number): number {
  const hz = DRONE_BASE_HZ * Math.pow(2.0, pymod360(lonDeg) / DEGREES_PER_OCTAVE);
  return Math.max(FREQ_MIN_HZ, Math.min(FREQ_MAX_HZ, hz));
}

/**
 * The sounding interval between two bodies, in cents — signed, A relative to B.
 * Equal to (λ_A − λ_B) · 20/3 on the normalized longitudes, which is why an
 * exact aspect always lands on a multiple of 200.
 */
export function centsBetween(lonADeg: number, lonBDeg: number): number {
  return (pymod360(lonADeg) - pymod360(lonBDeg)) * CENTS_PER_DEGREE;
}

/**
 * The acoustic beat between two drones. Collapses to zero at conjunction —
 * the audible signature of the trajectory crossing the conjunction circle.
 *
 * Honest about its own range: this is a perceptible BEAT only near
 * conjunction, and how near depends on where in the zodiac the pair sits,
 * because the map is exponential. At λ_B = 0° (f = 110 Hz) an 8 Hz beat is
 * still 18.2° away; at λ_B = 359° (f ≈ 440 Hz) it is 4.7°. Away from
 * conjunction |f_A − f_B| is not a beat at all but a wide interval — at
 * opposition it is literally f_B. Only conjunction (1:1) and opposition (2:1)
 * are rational under this map; every other aspect is irrational (√2, 2^⅔, …)
 * and has no low-order harmonic lock, which is why crossings are marked with a
 * bell rather than left to beating alone.
 */
export function beatHz(freqA: number, freqB: number): number {
  return Math.abs(freqA - freqB);
}

// ---------------------------------------------------------------------------
// Body ↔ seed-key mapping
// ---------------------------------------------------------------------------

/** The canonical longitude keys, in the order bedrock_hz is emitted.
 *  Mirrors LONGITUDE_KEYS in resonarium.ts. */
export const CANONICAL_LONGITUDE_KEYS = [
  "sun", "moon", "mercury", "venus", "mars",
  "jupiter", "saturn", "uranus", "neptune", "pluto",
  "asc", "mc", "true_node", "chiron",
] as const;

/**
 * TORUS_BODIES → canonical seed key. Three things this table records that are
 * easy to get wrong:
 *
 *  · the torus's "North Node" IS the seed's true_node;
 *  · `asc` and `mc` carry drones at bedrock indices 10 and 11 but are not
 *    selectable bodies, so North Node and Chiron sit at 12 and 13 — NOT at
 *    10 and 11 as a naive zip of the two lists would have it;
 *  · Lilith has no canonical key at all. It is deliberately absent here
 *    rather than mapped to something convenient: adding it to the seed would
 *    re-deal every existing field. See natalDroneIndex.
 */
export const SEED_KEY_BY_TORUS_BODY: Readonly<Record<string, string>> = {
  Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars",
  Jupiter: "jupiter", Saturn: "saturn", Uranus: "uranus", Neptune: "neptune",
  Pluto: "pluto",
  "North Node": "true_node",
  Chiron: "chiron",
  // Lilith: intentionally unmapped — outside the canonical chart contract.
};

/** True when the body participates in the natal seed field. Lilith does not. */
export function participatesInSeed(body: string): boolean {
  return SEED_KEY_BY_TORUS_BODY[body] !== undefined;
}

/**
 * Where a body's natal drone lives in spec.bedrock_hz — or null if it has none.
 *
 * bedrock_hz is COMPACTED, not padded: bedrockFrequencies pushes only the keys
 * actually present on the chart, so a chart without Chiron (Moshier, per
 * client.localPairTrajectory's own warning) emits 13 values, and a chart
 * missing any EARLIER key shifts every later index down. Hardcoding 12 for the
 * node is therefore a latent bug that would silently sound the wrong planet.
 * This replays the same presence filter instead.
 *
 * @param present the seed chart's key set (Object.keys of seedChartFromResponse)
 */
export function natalDroneIndex(
  body: string,
  present: ReadonlySet<string>
): number | null {
  const key = SEED_KEY_BY_TORUS_BODY[body];
  if (key === undefined || !present.has(key)) return null;
  let i = 0;
  for (const k of CANONICAL_LONGITUDE_KEYS) {
    if (k === key) return i;
    if (present.has(k)) i += 1;
  }
  return null; // unreachable: key ∈ CANONICAL_LONGITUDE_KEYS and is present
}

/** A body's natal drone from the persisted spec, or null if it has none. */
export function natalDroneHz(
  body: string,
  bedrockHz: readonly number[],
  present: ReadonlySet<string>
): number | null {
  const i = natalDroneIndex(body, present);
  if (i === null || i >= bedrockHz.length) return null;
  return bedrockHz[i];
}

// ---------------------------------------------------------------------------
// Aspects as harmonics
// ---------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * The harmonic number n of an aspect: the n for which the relative phase
 * w = z_A·z̄_B satisfies wⁿ = 1 — the single condition lib/torus.ts collapses
 * the whole aspect table into. n = 360/gcd(360, angle): conjunction 1,
 * opposition 2, trine 3, square 4, quintile 5, sextile 6, semisquare 8,
 * semisextile 12.
 */
export function harmonicFor(angleDeg: number): number {
  const a = Math.round(pymod360(angleDeg));
  const g = gcd(360, a);
  return g === 0 ? 1 : 360 / g;
}

/**
 * The pitch a crossing rings at: the aspect ANGLE run through the same bedrock
 * map, raised two octaves to sit clear of the drones it is announcing. So the
 * bell is not a sample and not an arbitrary choice of note — it is the aspect's
 * own place on the circle, sounded. Conjunction rings at 440 Hz, square at
 * 622.3, trine at 698.5, opposition at 880.
 */
export function bellHz(aspectAngleDeg: number): number {
  return droneHz(aspectAngleDeg) * 4;
}

/**
 * How long a crossing rings, in seconds. Scaled by the harmonic number, so the
 * loud structural aspects (conjunction, opposition) toll and the fine-grained
 * minors tick.
 */
export function bellDecaySeconds(aspectAngleDeg: number): number {
  const n = harmonicFor(aspectAngleDeg);
  return Math.max(0.25, Math.min(2.0, 1.8 / Math.sqrt(n)));
}
