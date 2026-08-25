// torus — the phase/torus math under the chapter-V visualization.
//
// What is worth pinning: the crossing detector against an analytic sky (a
// synthetic Sun–Moon whose synodic period is known in closed form), the wrap
// seam at 0°/360° (where naive difference code always breaks), and the two
// embeddings' geometric contracts — the donut's tube radius, and the claim the
// whole feature leans on visually: an aspect circle mapped through the
// Clifford embedding + stereographic projection is a TRUE circle in 3-space
// (a Villarceau circle), not merely a closed curve.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  aspectCirclePath,
  aspectTargets,
  DONUT_R,
  DONUT_r,
  embedClifford,
  embedDonut,
  findAspectEvents,
  harmonicResidue,
  jdToDate,
  nearestAspect,
  norm360,
  project,
  windings,
  wrap180,
  type TorusSample,
  type Vec3,
} from "../src/lib/torus";

// ── Angle plumbing ──────────────────────────────────────────────────────────

test("wrap180 lands in (−180, 180] and honors the seam", () => {
  assert.equal(wrap180(180), 180);
  assert.equal(wrap180(-180), 180);
  assert.equal(wrap180(540), 180);
  assert.equal(wrap180(360), 0);
  assert.ok(Math.abs(wrap180(359) - -1) < 1e-12);
  assert.ok(Math.abs(norm360(-0.25) - 359.75) < 1e-12);
});

test("harmonic residue is zero exactly on the harmonic and signed off it", () => {
  assert.equal(harmonicResidue(240, 3), 0); // trine, the 3rd harmonic
  assert.ok(Math.abs(harmonicResidue(120.5, 3) - 0.5) < 1e-12);
  assert.ok(Math.abs(harmonicResidue(89.25, 4) - -0.75) < 1e-12);
});

test("nearestAspect recovers the wheel's judgement from a separation", () => {
  const defs = [
    { name: "Conjunction", angle: 0 },
    { name: "Square", angle: 90 },
    { name: "Trine", angle: 120 },
  ];
  const hit = nearestAspect(91.4, defs)!;
  assert.equal(hit.def.name, "Square");
  assert.ok(Math.abs(hit.orb - 1.4) < 1e-12);
  // separations are unsigned: −91.4 judges identically
  assert.equal(nearestAspect(-91.4, defs)!.def.name, "Square");
});

test("aspect targets: 0 and 180 are their own mirror, the rest come in pairs", () => {
  assert.deepEqual(aspectTargets(0), [0]);
  assert.deepEqual(aspectTargets(180), [180]);
  assert.deepEqual(aspectTargets(120), [120, -120]);
});

// ── The crossing detector vs. an analytic sky ───────────────────────────────

/** A synthetic Sun–Moon: uniform mean motions, closed-form synodic period. */
function syntheticPair(days: number, perDay: number): TorusSample[] {
  const wA = 0.9856; // deg/day, Sun-ish
  const wB = 13.1764; // Moon-ish
  const out: TorusSample[] = [];
  for (let i = 0; i <= days * perDay; i++) {
    const t = i / perDay;
    out.push({ jd: 2460000 + t, lonA: norm360(10 + wA * t), lonB: norm360(wB * t) });
  }
  return out;
}

test("conjunctions of a synthetic Sun–Moon recur at the synodic period", () => {
  const samples = syntheticPair(365, 8);
  const events = findAspectEvents(samples, [{ name: "Conjunction", angle: 0 }]);
  const synodic = 360 / (13.1764 - 0.9856); // ≈ 29.53 days
  assert.equal(events.length, Math.floor((365 - 0.8203) / synodic) + 1); // 13
  for (let i = 1; i < events.length; i++) {
    const gap = events[i].jd - events[i - 1].jd;
    assert.ok(Math.abs(gap - synodic) < 0.02, `gap ${gap} vs synodic ${synodic}`);
  }
  // interpolation puts each event where the analytic difference is ≡ 0 (mod 360)
  for (const e of events) {
    const t = e.jd - 2460000;
    const delta = wrap180(10 + 0.9856 * t - 13.1764 * t);
    assert.ok(Math.abs(delta) < 0.05, `residual ${delta}° at jd ${e.jd}`);
    assert.ok(e.relSpeed < 0); // the Moon runs ahead: Δ = λA − λB decreasing
  }
});

test("a 90° aspect owns two diagonals and fires twice per synodic lap", () => {
  const samples = syntheticPair(365, 8);
  const events = findAspectEvents(samples, [{ name: "Square", angle: 90 }]);
  // Δ sweeps ~12.36 full laps; each lap crosses +90 once and −90 once.
  assert.ok(events.length >= 24 && events.length <= 26, `got ${events.length}`);
  for (const e of events) {
    assert.ok(Math.abs(Math.abs(wrap180(e.lonA - e.lonB)) - 90) < 0.05);
  }
});

test("crossings are found across the 0°/360° seam", () => {
  const samples: TorusSample[] = [
    { jd: 0, lonA: 359.5, lonB: 358.0 },
    { jd: 1, lonA: 359.5, lonB: 1.0 }, // B walks over the seam, past A
  ];
  const events = findAspectEvents(samples, [{ name: "Conjunction", angle: 0 }]);
  assert.equal(events.length, 1);
  assert.ok(Math.abs(events[0].lonB - 359.5) < 1e-9);
  assert.ok(Math.abs(events[0].jd - 0.5) < 1e-9);
});

test("an exact hit on a sample instant is reported once, not twice", () => {
  const samples: TorusSample[] = [
    { jd: 0, lonA: 10, lonB: 8 },
    { jd: 1, lonA: 10, lonB: 10 }, // exact at the shared boundary sample
    { jd: 2, lonA: 10, lonB: 12 },
  ];
  const events = findAspectEvents(samples, [{ name: "Conjunction", angle: 0 }]);
  assert.equal(events.length, 1);
  assert.ok(Math.abs(events[0].jd - 1) < 1e-9);
});

test("windings count signed revolutions of each body", () => {
  const samples = syntheticPair(365, 8);
  const w = windings(samples);
  assert.ok(Math.abs(w.turnsA - (0.9856 * 365) / 360) < 1e-9);
  assert.ok(Math.abs(w.turnsB - (13.1764 * 365) / 360) < 1e-9);
});

// ── Embeddings ──────────────────────────────────────────────────────────────

test("the donut keeps every point at tube radius r from its core circle", () => {
  for (const [th, ph] of [[0, 0], [37, 122], [271, 355], [180, 90]] as const) {
    const p = embedDonut(th, ph);
    const ringDist = Math.hypot(Math.hypot(p.x, p.y) - DONUT_R, p.z);
    assert.ok(Math.abs(ringDist - DONUT_r) < 1e-12);
  }
});

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Circumcenter of three points in ℝ³. */
function circumcenter(p0: Vec3, p1: Vec3, p2: Vec3): Vec3 {
  const a = sub(p1, p0);
  const b = sub(p2, p0);
  const n = cross(a, b);
  const num = cross(
    {
      x: dot(a, a) * b.x - dot(b, b) * a.x,
      y: dot(a, a) * b.y - dot(b, b) * a.y,
      z: dot(a, a) * b.z - dot(b, b) * a.z,
    },
    n
  );
  const k = 1 / (2 * dot(n, n));
  return { x: p0.x + num.x * k, y: p0.y + num.y * k, z: p0.z + num.z * k };
}

test("an aspect circle through the Clifford embedding is a true circle in ℝ³ (Villarceau)", () => {
  for (const target of [0, 90, -120]) {
    const pts = aspectCirclePath(target, 60).map(([th, ph]) => embedClifford(th, ph));
    const c = circumcenter(pts[0], pts[20], pts[40]);
    const r0 = Math.hypot(pts[0].x - c.x, pts[0].y - c.y, pts[0].z - c.z);
    const n = cross(sub(pts[20], pts[0]), sub(pts[40], pts[0]));
    for (const p of pts) {
      const r = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
      assert.ok(Math.abs(r - r0) < 1e-9, `radius drift ${Math.abs(r - r0)} on target ${target}`);
      assert.ok(Math.abs(dot(sub(p, pts[0]), n)) < 1e-9 * dot(n, n) + 1e-9, "coplanarity");
    }
  }
});

test("a MERIDIAN through the Clifford embedding is bounded (the pole is off-torus)", () => {
  // φ sweeps the stereographic pole's worst neighborhood; nothing blows up.
  for (let i = 0; i < 360; i += 5) {
    const p = embedClifford(123, i);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    assert.ok(Math.hypot(p.x, p.y, p.z) < 3.0);
  }
});

// ── Camera and time ─────────────────────────────────────────────────────────

test("project: identity rotation maps +y up (negative canvas y), origin to centre", () => {
  const cam = { rotXDeg: 0, rotYDeg: 0, dist: 7, scale: 100 };
  const o = project({ x: 0, y: 0, z: 0 }, cam);
  assert.ok(Math.abs(o.x) < 1e-12);
  assert.ok(Math.abs(o.y) < 1e-12); // −0 is centred too

  const up = project({ x: 0, y: 1, z: 0 }, cam);
  assert.ok(Math.abs(up.y + 100) < 1e-9);
  // nearer points project larger
  const near = project({ x: 1, y: 0, z: 2 }, cam);
  const far = project({ x: 1, y: 0, z: -2 }, cam);
  assert.ok(near.x > far.x);
  assert.ok(near.depth > far.depth);
});

test("jdToDate: the Unix epoch is JD 2440587.5", () => {
  assert.equal(jdToDate(2440587.5).getTime(), 0);
  assert.equal(jdToDate(2460000).toISOString().slice(0, 10), "2023-02-24");
});
