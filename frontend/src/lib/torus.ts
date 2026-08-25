// torus.ts — the chart as rotation.
//
// A zodiacal longitude λ is an angle, and the natural home of an angle is the
// unit circle in the complex plane: z = e^{iλ}. Everything the wheel says in
// degrees, this module says in phases:
//
//   · one planet        →  a point on S¹              (z = e^{iλ})
//   · a pair of planets →  a point on the torus T² = S¹ × S¹   (θ = λ_A, φ = λ_B)
//   · the pair through  →  a CURVE winding around T² — near-uniform motions
//     time                 trace a (p,q) torus winding; resonant pairs close
//                          into torus knots (Venus–Earth ≈ 13:8, the pentagram)
//   · an aspect λ_A − λ_B ≡ ±a  →  a fixed diagonal (1,1)-circle on T²
//
// So "Mars squares Venus on March 4th" stops being a table lookup and becomes
// geometry: the pair's trajectory CROSSES the square circle at that instant.
// Every exact aspect in a time window is an intersection point you can see.
//
// The aspect family itself compresses to one formula. An n-th-harmonic aspect
// holds when the relative phase w = z_A · conj(z_B) satisfies w^n = 1, i.e. w
// is an n-th root of unity (n=1 conjunction, n=2 opposition, n=3 trine, n=4
// square, n=6 sextile, n=5 the quintiles…). The signed orb is
//
//     δ_n(w) = arg(w^n) / n        — zero exactly at the aspect,
//
// smooth through it, and free of 0°/360° wrap headaches because arg is taken
// AFTER the power. The existing harmonic chart is the same idea one floor up:
// it is the map z ↦ z^n, under which n-th-harmonic aspects become conjunctions.
//
// Two embeddings of T² into view:
//   · the donut — instantly readable, metrically dishonest;
//   · the CLIFFORD torus — T² sitting flat inside the 3-sphere in ℝ⁴ as
//     (e^{iθ}, e^{iφ})/√2, brought to ℝ³ by stereographic projection. Under
//     that projection every aspect circle lands as a perfect round circle in
//     space (a Villarceau circle — the (1,1)-diagonals are Hopf fibers of S³),
//     and any two aspect circles are LINKED, once. The "Hopf flow" — the
//     isoclinic rotation (θ, φ) ↦ (θ+α, φ+α) — slides the torus along its own
//     aspect circles, which is what a 4D rotation looks like from here.
//
// Pure math only: no DOM, no ephemeris, no imports. The ephemeris hands in
// sampled longitudes (api/client.localPairTrajectory); the component draws.
// wrap180/norm360 are re-derived here rather than imported from @astra/core so
// this stays in the main bundle without dragging the WASM engine along.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One ephemeris sample of a planet pair: absolute time + both longitudes. */
export interface TorusSample {
  jd: number; // Julian Day (UT)
  lonA: number; // degrees, [0, 360)
  lonB: number;
}

/** An aspect angle to intersect with — shaped to accept @astra/core AspectDef. */
export interface AspectAngleDef {
  name: string;
  angle: number; // 0..180
  color?: string;
}

/** An exact aspect: the trajectory crossing an aspect circle. */
export interface AspectEvent {
  jd: number;
  name: string;
  angle: number; // the unsigned aspect angle
  target: number; // the signed diagonal it crossed: +a or −a (wrap180 convention)
  lonA: number; // longitudes at the crossing, [0, 360)
  lonB: number;
  /** d(λ_A − λ_B)/dt at the crossing, deg/day — sign says which way the pair
   *  swept through exactness; magnitude says how briskly (a slow crossing is
   *  a long-lived aspect). */
  relSpeed: number;
}

// ---------------------------------------------------------------------------
// Angles and phases
// ---------------------------------------------------------------------------

/** Non-negative remainder mod 360 (Python's %, not JS's). */
export function norm360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Wrap into (−180, 180] — the signed angular difference convention. */
export function wrap180(deg: number): number {
  const r = norm360(deg);
  return r > 180 ? r - 360 : r;
}

/** Signed orb from the nearest n-th-harmonic aspect: arg((e^{iΔ})^n)/n.
 *  Zero exactly when Δ is a multiple of 360/n; range (−180/n, 180/n]. */
export function harmonicResidue(deltaDeg: number, n: number): number {
  return wrap180(deltaDeg * n) / n;
}

/** The nearest aspect in `defs` to a separation, with its unsigned orb.
 *  Judges the SEPARATION |wrap180(Δ)| ∈ [0, 180], as the wheel does. */
export function nearestAspect<T extends AspectAngleDef>(
  deltaDeg: number,
  defs: T[]
): { def: T; orb: number } | null {
  const s = Math.abs(wrap180(deltaDeg));
  let best: { def: T; orb: number } | null = null;
  for (const def of defs) {
    const orb = Math.abs(s - def.angle);
    if (!best || orb < best.orb) best = { def, orb };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Aspect events — trajectory ∩ aspect circles
// ---------------------------------------------------------------------------

/** The signed diagonal targets an unsigned aspect angle owns on the torus.
 *  0° and 180° are their own mirror (one circle each); everything else is a
 *  pair of circles, +a and −a (A ahead of B, B ahead of A). */
export function aspectTargets(angle: number): number[] {
  if (angle === 0 || angle === 180) return [wrap180(angle)];
  return [angle, -angle];
}

/**
 * Find every exact aspect in a sampled trajectory.
 *
 * Sampling contract: between consecutive samples the RELATIVE motion
 * |Δ(λ_A − λ_B)| must stay well under 180° (in practice: ≥ 4 samples/day for
 * any Moon pair, daily for the rest — localPairTrajectory enforces this).
 * Each crossing is located by inverse-linear interpolation on the residue,
 * which for those rates lands within minutes of the true instant — display
 * precision, not ephemeris precision.
 */
export function findAspectEvents(
  samples: TorusSample[],
  aspects: AspectAngleDef[]
): AspectEvent[] {
  const events: AspectEvent[] = [];
  for (const def of aspects) {
    for (const target of aspectTargets(def.angle)) {
      for (let i = 1; i < samples.length; i++) {
        const s1 = samples[i - 1];
        const s2 = samples[i];
        const stepA = wrap180(s2.lonA - s1.lonA);
        const stepB = wrap180(s2.lonB - s1.lonB);
        const u1 = wrap180(s1.lonA - s1.lonB - target);
        const u2 = u1 + (stepA - stepB); // local unwrap: continuous across 0
        if (!((u1 <= 0 && u2 > 0) || (u1 >= 0 && u2 < 0))) continue;
        const frac = u1 / (u1 - u2);
        const dt = s2.jd - s1.jd;
        events.push({
          jd: s1.jd + frac * dt,
          name: def.name,
          angle: def.angle,
          target,
          lonA: norm360(s1.lonA + stepA * frac),
          lonB: norm360(s1.lonB + stepB * frac),
          relSpeed: dt > 0 ? (stepA - stepB) / dt : 0,
        });
      }
    }
  }
  events.sort((a, b) => a.jd - b.jd);
  return events;
}

/** Total signed revolutions each body makes across the samples — the winding
 *  vector of the curve. A pair near a p:q resonance reads e.g. Venus 13.0 ×
 *  Earth 8.0 and the curve closes into a (p,q) torus knot. */
export function windings(samples: TorusSample[]): { turnsA: number; turnsB: number } {
  let a = 0;
  let b = 0;
  for (let i = 1; i < samples.length; i++) {
    a += wrap180(samples[i].lonA - samples[i - 1].lonA);
    b += wrap180(samples[i].lonB - samples[i - 1].lonB);
  }
  return { turnsA: a / 360, turnsB: b / 360 };
}

// ---------------------------------------------------------------------------
// Embeddings of T²
// ---------------------------------------------------------------------------

export const DONUT_R = 1.5; // the θ (planet A) circle
export const DONUT_r = 0.72; // the φ (planet B) tube

const DEG = Math.PI / 180;

/** The donut: θ around the hole (planet A), φ around the tube (planet B). */
export function embedDonut(thetaDeg: number, phiDeg: number): Vec3 {
  const t = thetaDeg * DEG;
  const p = phiDeg * DEG;
  const w = DONUT_R + DONUT_r * Math.cos(p);
  return { x: w * Math.cos(t), y: w * Math.sin(t), z: DONUT_r * Math.sin(p) };
}

// The projected Clifford torus spans radius √((1+w)/(1−w)), w = sinφ'/√2 —
// [≈0.414, ≈2.414]. This factor sits its bulk at the donut's scale.
const CLIFFORD_SCALE = 0.95;
const INV_SQRT2 = Math.SQRT1_2;

/**
 * The Clifford torus, seen from ℝ⁴: (e^{iθ}, e^{iφ})/√2 lives on the unit
 * 3-sphere; stereographic projection from (0,0,0,1) — a point the torus never
 * touches — brings it to ℝ³. `hopfDeg` applies the isoclinic rotation
 * (θ, φ) ↦ (θ+α, φ+α) first: the 4D rotation whose orbits ARE the (1,1)
 * aspect circles, so animating it slides the surface along its own aspects.
 */
export function embedClifford(thetaDeg: number, phiDeg: number, hopfDeg = 0): Vec3 {
  const t = (thetaDeg + hopfDeg) * DEG;
  const p = (phiDeg + hopfDeg) * DEG;
  const x1 = Math.cos(t) * INV_SQRT2;
  const y1 = Math.sin(t) * INV_SQRT2;
  const x2 = Math.cos(p) * INV_SQRT2;
  const y2 = Math.sin(p) * INV_SQRT2;
  const k = CLIFFORD_SCALE / (1 - y2); // 1−y2 ∈ [1−1/√2, 1+1/√2]: never 0
  return { x: x1 * k, y: y1 * k, z: x2 * k };
}

export type Embedding = "donut" | "clifford";

export function embed(
  kind: Embedding,
  thetaDeg: number,
  phiDeg: number,
  hopfDeg = 0
): Vec3 {
  return kind === "donut"
    ? embedDonut(thetaDeg, phiDeg)
    : embedClifford(thetaDeg, phiDeg, hopfDeg);
}

/** The aspect circle λ_A − λ_B ≡ target, sampled as (θ, φ) pairs. On the
 *  donut it is a diagonal; on the projected Clifford torus, a true round
 *  circle in space (a Villarceau circle / Hopf fiber). */
export function aspectCirclePath(target: number, points = 96): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * 360;
    out.push([t, t - target]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Camera — rotate, then perspective-project (pure; the component rasterizes)
// ---------------------------------------------------------------------------

export interface Camera {
  rotXDeg: number; // pitch, applied after yaw
  rotYDeg: number; // yaw
  dist: number; // eye distance along +z after rotation
  scale: number; // world→screen pixels at depth 0
}

export interface Projected {
  x: number; // screen offset from centre (y grows DOWN, canvas convention)
  y: number;
  depth: number; // rotated z: larger = nearer the eye
}

export function project(p: Vec3, cam: Camera): Projected {
  const ry = cam.rotYDeg * DEG;
  const rx = cam.rotXDeg * DEG;
  // yaw about y
  const x1 = p.x * Math.cos(ry) + p.z * Math.sin(ry);
  const z1 = -p.x * Math.sin(ry) + p.z * Math.cos(ry);
  // pitch about x
  const y2 = p.y * Math.cos(rx) - z1 * Math.sin(rx);
  const z2 = p.y * Math.sin(rx) + z1 * Math.cos(rx);
  const f = cam.dist / (cam.dist - z2);
  return { x: x1 * f * cam.scale, y: -y2 * f * cam.scale, depth: z2 };
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Julian Day → JS Date (UT). Unix epoch is JD 2440587.5. */
export function jdToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}
