// torus4 — the 4D geometry the Hebrew layer turns in.
//
// Three claims carry the whole thing, and each is checkable:
//
//   1. the new surface CONTAINS the old one — kill the second pair of radii and
//      the hyper-torus is torus.embedDonut coordinate for coordinate;
//   2. the Hopf flow already shipped IS Aleph's isoclinic rotation, so naming
//      it after a letter renames nothing and moves no pixel;
//   3. Mem and Shin are genuinely different motions — they leave the Clifford
//      torus's pose, they reach the projection pole exactly, and the clamp
//      that catches them is load-bearing rather than defensive decoration.
//
// Everything else here is the arithmetic those three lean on: rotations are
// rotations (norm preserved), a mother's two planes commute, and the phasing
// curve stays inside the alpha range the canvas can actually draw.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { embedClifford, embedDonut, DONUT_R, DONUT_r } from "../src/lib/torus";
import {
  HYPER_RADII,
  cliffordPoint,
  embed4,
  embedHyper,
  motherRotation,
  perspective3,
  phaseAlpha,
  rotate4,
  stereo3,
  type Mother,
  type Point4,
} from "../src/lib/torus4";

const norm = (p: Point4) => Math.hypot(p.x, p.y, p.z, p.w);
const near = (a: number, b: number, eps = 1e-12) =>
  assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b} (Δ ${Math.abs(a - b)})`);

const ANGLES: Array<[number, number]> = [
  [0, 0], [37, 111], [90, 270], [180, 180], [359.5, 0.5], [-45, 400],
];

// ── 1. The hyper-torus contains the donut ───────────────────────────────────

test("with the second pair of radii at zero, the hyper-torus IS the donut", () => {
  const flat = { ...HYPER_RADII, R3: 0, R4: 0 };
  for (const [a, b] of ANGLES) {
    for (const [c, d] of [[0, 0], [123, 47], [-300, 999]]) {
      const p = embedHyper(a, b, c, d, flat);
      const q = embedDonut(a, b);
      near(p.x, q.x);
      near(p.y, q.y);
      near(p.z, q.z);
      // the fourth dimension is not merely small, it is gone
      assert.equal(p.w, 0);
    }
  }
});

test("the donut surface routes through the same code and lands in the same place", () => {
  for (const [a, b] of ANGLES) {
    const p = embed4("donut", { a, b, c: 200, d: 300 }, { mother: "Shin", alpha: 90 });
    const q = embedDonut(a, b);
    near(p.x, q.x);
    near(p.y, q.y);
    near(p.z, q.z);
    assert.equal(p.w, 0); // a spin cannot reach a surface with no 4th dimension
  }
});

test("the hyper radii keep the donut's own R and r, so the shapes are one family", () => {
  assert.equal(HYPER_RADII.R1, DONUT_R);
  assert.equal(HYPER_RADII.R2, DONUT_r);
  // and the new pair modulates rather than dominates
  assert.ok(HYPER_RADII.R3 < DONUT_r / 2);
  assert.ok(HYPER_RADII.R4 < DONUT_r / 2);
});

// ── 2. The Hopf flow is Aleph ───────────────────────────────────────────────

test("Aleph's isoclinic rotation of the Clifford point is the Hopf flow, exactly", () => {
  for (const hopf of [0, 17.5, 90, 231, -44]) {
    for (const [a, b] of ANGLES) {
      // rotating the R4 point == advancing both longitudes: the identification
      const turned = motherRotation(cliffordPoint(a, b), "Aleph", hopf, hopf);
      const shifted = cliffordPoint(a + hopf, b + hopf);
      near(turned.x, shifted.x);
      near(turned.y, shifted.y);
      near(turned.z, shifted.z);
      near(turned.w, shifted.w);

      // …and therefore the projected pixel is the one torus.ts already drew
      const mine = embed4("clifford", { a, b }, { mother: "Aleph", alpha: hopf });
      const theirs = embedClifford(a, b, hopf);
      near(mine.x, theirs.x);
      near(mine.y, theirs.y);
      near(mine.z, theirs.z);
    }
  }
});

test("Aleph keeps the Clifford torus where it found it; Mem and Shin do not", () => {
  const p = cliffordPoint(50, 200);
  // on the Clifford torus each plane's pair of coordinates has norm 1/√2
  const planeA = (q: Point4) => Math.hypot(q.x, q.y);
  const planeB = (q: Point4) => Math.hypot(q.z, q.w);
  near(planeA(p), Math.SQRT1_2);
  near(planeB(p), Math.SQRT1_2);

  const aleph = motherRotation(p, "Aleph", 63, 63);
  near(planeA(aleph), Math.SQRT1_2);
  near(planeB(aleph), Math.SQRT1_2);

  for (const m of ["Mem", "Shin"] as Mother[]) {
    const q = motherRotation(p, m, 63, 63);
    assert.ok(Math.abs(planeA(q) - Math.SQRT1_2) > 1e-3, `${m} left the pose unchanged`);
  }
});

// ── 3. Rotations are rotations ──────────────────────────────────────────────

test("every plane rotation preserves the norm, and 360° is the identity", () => {
  const p: Point4 = { x: 0.3, y: -0.7, z: 1.1, w: 0.05 };
  const n = norm(p);
  for (const plane of ["xy", "xz", "xw", "yz", "yw", "zw"] as const) {
    for (const deg of [13, 90, 187, -260]) near(norm(rotate4(p, plane, deg)), n);
    const round = rotate4(p, plane, 360);
    near(round.x, p.x, 1e-14);
    near(round.y, p.y, 1e-14);
    near(round.z, p.z, 1e-14);
    near(round.w, p.w, 1e-14);
  }
});

test("a mother's two planes commute — the pair is one motion, not a sequence", () => {
  const p: Point4 = { x: 0.3, y: -0.7, z: 1.1, w: 0.05 };
  const pairs: Record<Mother, [string, string]> = {
    Aleph: ["xy", "zw"], Mem: ["xz", "yw"], Shin: ["xw", "yz"],
  };
  for (const m of Object.keys(pairs) as Mother[]) {
    const [f, s] = pairs[m] as ["xy", "zw"];
    const forward = rotate4(rotate4(p, f, 41), s, 77);
    const backward = rotate4(rotate4(p, s, 77), f, 41);
    near(forward.x, backward.x, 1e-14);
    near(forward.y, backward.y, 1e-14);
    near(forward.z, backward.z, 1e-14);
    near(forward.w, backward.w, 1e-14);
    near(norm(motherRotation(p, m, 41, 77)), norm(p));
  }
});

// ── The pole, and the clamp that is not decoration ──────────────────────────

test("at rest the Clifford torus never nears the pole, so the projection is exact", () => {
  let worst = 1;
  for (let a = 0; a < 360; a += 7) {
    for (let b = 0; b < 360; b += 7) {
      worst = Math.min(worst, 1 - cliffordPoint(a, b).w);
    }
  }
  // 1 − 1/√2 ≈ 0.2929: comfortably clear of the 0.1 floor, so nothing clamps
  assert.ok(worst > 0.29, `closest approach to the pole was ${worst}`);
});

test("Mem reaches the pole exactly, and the projection stays finite through it", () => {
  // w' = (sin θ·sin β + sin φ·cos β)/√2 → 1 at θ = φ = 90°, β = 45°
  const hit = motherRotation(cliffordPoint(90, 90), "Mem", 0, 45);
  near(hit.w, 1, 1e-12);

  const s = stereo3(hit);
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z));
  assert.ok(Math.abs(s.x) < 100 && Math.abs(s.z) < 100, "the clamp must bound the blowup");

  // …and it is a sweep, not one unlucky sample. Under Shin at angle α the
  // surface's highest w is (|sin α| + |cos α|)/√2, so the pole is touched at
  // 45° and every 90° after — four inside-out passages per full turn, and
  // nothing at all at 0° or 90°, where the surface is back inside the sphere.
  const reach = (m: Mother, alpha: number) => {
    let maxW = -Infinity;
    for (let a = 0; a < 360; a += 3) {
      for (let b = 0; b < 360; b += 3) {
        maxW = Math.max(maxW, motherRotation(cliffordPoint(a, b), m, alpha, alpha).w);
      }
    }
    return maxW;
  };
  for (const m of ["Mem", "Shin"] as Mother[]) {
    for (const alpha of [45, 135, 225, 315]) {
      assert.ok(reach(m, alpha) > 0.9995,
        `${m}@${alpha}° only reached w = ${reach(m, alpha)}; the inside-out turn is missing`);
    }
    // and at the quarter turns it is nowhere near — the passage is an event
    assert.ok(reach(m, 90) < 0.71, `${m}@90° should be back inside the sphere`);
  }
});

test("no surface, at any spin, ever projects to NaN", () => {
  for (const surface of ["donut", "clifford", "hyper"] as const) {
    for (const mother of ["Aleph", "Mem", "Shin"] as Mother[]) {
      for (const alpha of [0, 45, 90, 135, 180, 270]) {
        for (const [a, b] of ANGLES) {
          const p = embed4(surface, { a, b, c: a * 2, d: b * 3 }, { mother, alpha });
          assert.ok(
            Number.isFinite(p.x) && Number.isFinite(p.y) &&
            Number.isFinite(p.z) && Number.isFinite(p.w),
            `${surface}/${mother}@${alpha} at ${a},${b}`,
          );
        }
      }
    }
  }
});

test("the hyper-torus sits clear of its own eye at rest", () => {
  const lim = HYPER_RADII.R3 + HYPER_RADII.R4;
  for (let c = 0; c < 360; c += 11) {
    for (let d = 0; d < 360; d += 11) {
      const p = embedHyper(30, 60, c, d);
      assert.ok(Math.abs(p.w) <= lim + 1e-12, `w = ${p.w} exceeded R3 + R4`);
    }
  }
  // the eye is beyond the surface's reach, so nothing clamps until a mother turns
  assert.ok(Number.isFinite(perspective3({ x: 1, y: 0, z: 0, w: lim }).x));
});

// ── Phasing ─────────────────────────────────────────────────────────────────

test("phaseAlpha is monotone, bounded, and never fully hides a glyph", () => {
  const lim = HYPER_RADII.R3 + HYPER_RADII.R4;
  let prev = -Infinity;
  for (let w = -lim; w <= lim; w += lim / 16) {
    const a = phaseAlpha(w);
    assert.ok(a >= 0.28 - 1e-12 && a <= 1 + 1e-12, `alpha ${a} out of range`);
    assert.ok(a >= prev, "phasing must not fold back on itself");
    prev = a;
  }
  near(phaseAlpha(lim), 1);
  near(phaseAlpha(-lim), 0.28);
  near(phaseAlpha(0), 0.64);
  // clamped outside the range rather than running past it
  near(phaseAlpha(lim * 10), 1);
  assert.equal(phaseAlpha(5, 0), 1); // a surface with no hyper-depth phases nothing
});
