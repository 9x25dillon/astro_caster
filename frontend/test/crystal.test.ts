// crystal — the thirty-two, and the theorem that makes the mapping honest.
//
// The claims worth pinning, in the order they matter:
//
//   1. the 32 point groups are the real 32, in the real order, and the path
//      index is that order — a single transposed row would silently renumber
//      every node on the surface;
//   2. the crystallographic restriction theorem and the major/minor aspect
//      split are the SAME split — the five aspects with a lattice are exactly
//      Conjunction, Opposition, Trine, Square, Sextile, and every minor in the
//      app's own table has none;
//   3. the triclinic cell never degenerates, checked by sweeping the whole
//      space of separations rather than by arguing about the bound;
//   4. the deformation is a deformation — invertible, w-preserving, and the
//      identity when the cell is cubic.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ASPECT_DEFS } from "@astra/core";
import { HEBREW_LETTERS } from "../src/lib/hebrew";
import {
  CELL_ANGLE_MAX,
  CELL_ANGLE_MIN,
  CRYSTAL_SYSTEMS,
  POINT_GROUPS,
  PATTERN_GROUPS,
  UNIT_CELL,
  cellFromLongitudes,
  cellVolume,
  crystalForAspect,
  crystalForNode,
  crystalForPattern,
  familyForAspect,
  harmonicOf,
  holohedry,
  isCrystallographic,
  matrixScale,
  pathName,
  pointGroup,
  pointGroupForPath,
  shardOutline,
  systemsForAspect,
  triclinicMatrix,
} from "../src/lib/crystal";
import { deform4, embed4, type Point4 } from "../src/lib/torus4";

// ── 1. The list ─────────────────────────────────────────────────────────────

test("there are exactly 32 point groups, split across the 7 systems correctly", () => {
  assert.equal(POINT_GROUPS.length, 32);
  const count = (s: string) => POINT_GROUPS.filter((g) => g.system === s).length;
  // the standard census — these seven numbers are the reason 32 is 32
  assert.equal(count("triclinic"), 2);
  assert.equal(count("monoclinic"), 3);
  assert.equal(count("orthorhombic"), 3);
  assert.equal(count("tetragonal"), 7);
  assert.equal(count("trigonal"), 5);
  assert.equal(count("hexagonal"), 7);
  assert.equal(count("cubic"), 5);
  assert.equal(CRYSTAL_SYSTEMS.reduce((n, s) => n + count(s), 0), 32);
  assert.equal(new Set(POINT_GROUPS.map((g) => g.hm)).size, 32);
  assert.equal(new Set(POINT_GROUPS.map((g) => g.schoenflies)).size, 32);
});

test("the path index IS the position in the list, and the ends are the point and the world", () => {
  POINT_GROUPS.forEach((g, i) => assert.equal(g.path, i + 1));
  // path 1: Kether, and the group whose only operation is the identity
  assert.equal(pointGroupForPath(1).hm, "1");
  assert.equal(pointGroupForPath(1).order, 1);
  assert.equal(pathName(1), "Kether");
  // path 32: Tav, Yesod–Malkuth, and the cubic holohedry
  assert.equal(pointGroupForPath(32).hm, "m-3m");
  assert.equal(pointGroupForPath(32).order, 48);
  assert.equal(pathName(32), "ת Tav");
  // 10 sefirot + 22 letters = 32 paths, and the letters start at 11
  assert.equal(HEBREW_LETTERS.length, 22);
  assert.equal(pathName(11), "א Aleph");
  assert.equal(pathName(10), "Malkuth");
  // …and the sefirot's ten groups stop partway through tetragonal, which is a
  // fact about the census rather than a tidy boundary. Say it out loud.
  assert.equal(pointGroupForPath(10).hm, "-4");
  assert.equal(pointGroupForPath(10).system, "tetragonal");
  assert.equal(pointGroupForPath(11).system, "tetragonal");
});

test("every letter's path resolves to a group, and no two letters share one", () => {
  const groups = HEBREW_LETTERS.map((l) => pointGroupForPath(l.path).hm);
  assert.equal(new Set(groups).size, 22);
  assert.equal(pointGroupForPath(HEBREW_LETTERS[0].path).hm, "4/m"); // Aleph, path 11
});

test("each system's holohedry is its highest-order group", () => {
  const expected: Record<string, string> = {
    triclinic: "-1", monoclinic: "2/m", orthorhombic: "mmm", tetragonal: "4/mmm",
    trigonal: "-3m", hexagonal: "6/mmm", cubic: "m-3m",
  };
  for (const s of CRYSTAL_SYSTEMS) assert.equal(holohedry(s).hm, expected[s], s);
});

// ── 2. The restriction theorem IS the major/minor split ─────────────────────

test("harmonicOf reads the aspect table the way the algebra does", () => {
  assert.equal(harmonicOf(0), 1);    // conjunction
  assert.equal(harmonicOf(180), 2);  // opposition
  assert.equal(harmonicOf(120), 3);  // trine
  assert.equal(harmonicOf(90), 4);   // square
  assert.equal(harmonicOf(60), 6);   // sextile
  assert.equal(harmonicOf(72), 5);   // quintile
  assert.equal(harmonicOf(45), 8);   // semisquare
  assert.equal(harmonicOf(135), 8);  // sesquiquadrate
  assert.equal(harmonicOf(30), 12);  // semisextile
  assert.equal(harmonicOf(150), 12); // quincunx
});

test("the aspects that crystallize are EXACTLY the five the app calls major", () => {
  // the app's own set, from TorusPanel — not restated, re-derived
  const MAJORS = new Set(["Conjunction", "Opposition", "Trine", "Square", "Sextile"]);
  const crystalline = ASPECT_DEFS
    .filter((d) => systemsForAspect(d.angle) !== null)
    .map((d) => d.name);
  assert.deepEqual(new Set(crystalline), MAJORS);

  // and every minor in the table is non-crystallographic, one by one
  for (const d of ASPECT_DEFS) {
    const n = harmonicOf(d.angle);
    assert.equal(
      isCrystallographic(n), MAJORS.has(d.name),
      `${d.name} (${d.angle}°, ${n}-fold) sits on the wrong side of the theorem`,
    );
  }
  // the restriction theorem's own statement, checked rather than assumed
  for (let n = 1; n <= 24; n++) {
    assert.equal(isCrystallographic(n), [1, 2, 3, 4, 6].includes(n), `${n}-fold`);
  }
});

test("an aspect's family is its system's groups, and the five families cover 27", () => {
  assert.deepEqual(systemsForAspect(0), ["triclinic"]);
  assert.deepEqual(systemsForAspect(180), ["monoclinic", "orthorhombic"]);
  assert.deepEqual(systemsForAspect(120), ["trigonal"]);
  assert.deepEqual(systemsForAspect(90), ["tetragonal"]);
  assert.deepEqual(systemsForAspect(60), ["hexagonal"]);
  assert.equal(systemsForAspect(72), null); // the quintile has no lattice

  const covered = new Set(
    [0, 180, 120, 90, 60].flatMap((a) => familyForAspect(a).map((g) => g.hm)),
  );
  assert.equal(covered.size, 27);
  // the five left over are exactly the cubic ones — no single aspect reaches
  // them, because cubic is the only system with more than one high-order axis
  const cubic = POINT_GROUPS.filter((g) => g.system === "cubic").map((g) => g.hm);
  for (const hm of cubic) assert.ok(!covered.has(hm), `${hm} should need a pattern`);
  assert.equal(covered.size + cubic.length, 32);
});

test("orb breaks symmetry: exact gives the holohedry, the edge of orb the bare axis", () => {
  const exact = crystalForAspect(90, 0, 6)!;
  assert.equal(exact.group.hm, "4/mmm");  // tetragonal holohedry, order 16
  assert.equal(exact.retained, 1);
  assert.equal(exact.harmonic, 4);

  const wide = crystalForAspect(90, 6, 6)!;
  assert.ok(wide.group.order < exact.group.order, "a wide orb must lose operations");
  assert.equal(wide.retained, 0);

  // monotone: symmetry never comes back as the orb grows
  let last = Infinity;
  for (let orb = 0; orb <= 6; orb += 0.25) {
    const c = crystalForAspect(90, orb, 6)!;
    assert.ok(c.group.order <= last, `order rose at orb ${orb}`);
    last = c.group.order;
  }
  assert.equal(crystalForAspect(72, 0, 2), null); // no lattice, no crystal
});

test("the five cubic groups are reached by the patterns, and the Yod by none", () => {
  const used = Object.values(PATTERN_GROUPS).filter(Boolean) as string[];
  assert.equal(new Set(used).size, 5);
  for (const hm of used) assert.equal(pointGroup(hm).system, "cubic", hm);

  // the arguments, checked as symmetry rather than taken on trust
  assert.equal(crystalForPattern("Grand Trine")!.inversion, false); // no opposition in it
  assert.equal(crystalForPattern("Kite")!.inversion, true);         // its opposition is a centre
  assert.equal(crystalForPattern("T-Square")!.inversion, false);    // the missing arm
  assert.equal(crystalForPattern("Grand Cross")!.inversion, true);  // the arm arrives
  assert.equal(crystalForPattern("Grand Cross")!.order, 48);        // and it is the holohedry
  // the Yod is built from quincunxes, which are 12-fold, which no lattice allows
  assert.equal(crystalForPattern("Yod"), null);
  assert.equal(isCrystallographic(harmonicOf(150)), false);
});

// ── Standing nodes ──────────────────────────────────────────────────────────

test("a lettered node takes its letter's path; an unlettered one falls to triclinic", () => {
  const sun = crystalForNode("Sun", false, "yetzirah");
  assert.equal(sun.lettered, true);
  assert.equal(sun.letter!.name, "Kaf");        // Sun → כ under Sefer Yetzirah
  assert.equal(sun.path, 21);
  assert.equal(sun.group.hm, pointGroupForPath(21).hm);

  // the same body, the other table, a different path — and so a different crystal
  const sunGd = crystalForNode("Sun", false, "golden-dawn");
  assert.equal(sunGd.letter!.name, "Resh");
  assert.notEqual(sunGd.path, sun.path);

  // no letter: identity for a conjunction, inversion for an opposition, and
  // those are exactly the two triclinic groups
  for (const body of ["North Node", "Chiron", "Lilith", "Ascendant"]) {
    const conj = crystalForNode(body, false);
    const opp = crystalForNode(body, true);
    assert.equal(conj.lettered, false, body);
    assert.equal(conj.group.hm, "1", body);
    assert.equal(conj.group.order, 1, body);
    assert.equal(opp.group.hm, "-1", body);
    assert.equal(opp.group.inversion, true, body);
    assert.equal(conj.group.system, "triclinic", body);
    assert.equal(opp.group.system, "triclinic", body);
  }
});

test("a shard shows its group: 1 is a splinter, -1 is that splinter twice over", () => {
  const one = shardOutline(pointGroup("1"));
  assert.equal(one.length, 3); // the bare motif, no symmetry applied

  const inv = shardOutline(pointGroup("-1"));
  assert.equal(inv.length, 6);
  // every vertex has a partner through the origin — visibly centrosymmetric
  for (const [x, y] of inv) {
    assert.ok(
      inv.some(([u, v]) => Math.abs(u + x) < 1e-9 && Math.abs(v + y) < 1e-9),
      `no inversion partner for ${x},${y}`,
    );
  }

  // higher axes make bigger rosettes, and every outline is angle-sorted so it
  // draws as a ring rather than a scribble
  assert.ok(shardOutline(pointGroup("6/mmm")).length > shardOutline(pointGroup("3")).length);
  for (const g of POINT_GROUPS) {
    const pts = shardOutline(g);
    assert.ok(pts.length >= 3, g.hm);
    const angles = pts.map(([x, y]) => Math.atan2(y, x));
    for (let i = 1; i < angles.length; i++) {
      assert.ok(angles[i] >= angles[i - 1] - 1e-12, `${g.hm} unsorted at ${i}`);
    }
    for (const [x, y] of pts) assert.ok(Number.isFinite(x) && Number.isFinite(y), g.hm);
  }
});

// ── 3. The cell never degenerates ───────────────────────────────────────────

test("no triclinic cell built from real separations collapses — swept, not argued", () => {
  let worst = Infinity;
  for (let a = 0; a < 360; a += 9) {
    for (let b = 0; b < 360; b += 9) {
      for (let c = 0; c < 360; c += 15) {
        const cell = cellFromLongitudes(a, b, c);
        assert.ok(cell.alpha >= CELL_ANGLE_MIN - 1e-9 && cell.alpha <= CELL_ANGLE_MAX + 1e-9);
        assert.ok(cell.beta >= CELL_ANGLE_MIN - 1e-9 && cell.beta <= CELL_ANGLE_MAX + 1e-9);
        assert.ok(cell.gamma >= CELL_ANGLE_MIN - 1e-9 && cell.gamma <= CELL_ANGLE_MAX + 1e-9);
        worst = Math.min(worst, cellVolume(cell));
      }
    }
  }
  // V = 0 is the flat cell, where the matrix stops being invertible
  assert.ok(worst > 0.5, `the cell came within ${worst} of collapsing`);
});

test("60° and 120° really are the degeneracies the band is dodging", () => {
  assert.ok(cellVolume({ ...UNIT_CELL, alpha: 60, beta: 60, gamma: 60 }) > 0.7);
  // V² is analytically zero here, but cos(120°) lands at -0.4999999999999998 and
  // V is the SQUARE ROOT of that residue — so the epsilon comes back as its own
  // square root, ~3e-8 rather than ~1e-15. Testing V against 1e-9 fails on
  // arithmetic that is behaving correctly; the tolerance belongs on V², or here.
  const flat = cellVolume({ ...UNIT_CELL, alpha: 120, beta: 120, gamma: 120 });
  assert.ok(flat < 1e-6, `all-120° should be flat, got V = ${flat}`);
  assert.ok(flat * flat < 1e-12, "V² is the quantity that is actually zero");
  assert.equal(cellVolume(UNIT_CELL), 1); // cubic: unit volume
});

test("the cell is triclinic when the chart is, and straightens as bodies conjoin", () => {
  const skew = cellFromLongitudes(10, 137, 268);
  assert.notEqual(skew.a, skew.b);
  assert.notEqual(skew.b, skew.c);
  assert.notEqual(skew.alpha, skew.beta);

  // three bodies in the same degree: the axes coincide and the angles go to the
  // low end together — the symmetry rising, which is the correct reading
  const piled = cellFromLongitudes(45, 45, 45);
  assert.equal(piled.a, piled.b);
  assert.equal(piled.b, piled.c);
  assert.equal(piled.alpha, CELL_ANGLE_MIN);
  assert.equal(piled.beta, CELL_ANGLE_MIN);
  assert.equal(piled.gamma, CELL_ANGLE_MIN);
});

// ── 4. The deformation deforms ──────────────────────────────────────────────

test("the matrix is upper-triangular in 3D and the identity on w", () => {
  const m = triclinicMatrix(cellFromLongitudes(23, 191, 300));
  assert.equal(m[1][0], 0);
  assert.equal(m[2][0], 0);
  assert.equal(m[2][1], 0);
  // the fourth row and column: w in, w out, untouched by the lattice
  assert.deepEqual([...m[3]], [0, 0, 0, 1]);
  for (const row of m) assert.equal(row[3], row === m[3] ? 1 : 0);
  const p: Point4 = { x: 0.3, y: -0.6, z: 1.2, w: 0.44 };
  assert.equal(deform4(p, m).w, p.w);
});

test("a cubic cell is the identity, so the crystal switch has an honest off", () => {
  const m = triclinicMatrix(UNIT_CELL);
  const p: Point4 = { x: 0.31, y: -0.62, z: 1.17, w: 0.4 };
  const d = deform4(p, m);
  for (const k of ["x", "y", "z", "w"] as const) {
    assert.ok(Math.abs(d[k] - p[k]) < 1e-12, `${k}: ${d[k]} !≈ ${p[k]}`);
  }
  assert.ok(Math.abs(matrixScale(m) - 1) < 1e-12);
});

test("a lattice skews every surface without resizing it, and never yields NaN", () => {
  const m = triclinicMatrix(cellFromLongitudes(77, 201, 318));
  for (const surface of ["donut", "clifford", "hyper"] as const) {
    let moved = false;
    for (let a = 0; a < 360; a += 23) {
      for (let b = 0; b < 360; b += 29) {
        const plain = embed4(surface, { a, b, c: a / 2, d: b / 3 });
        const bent = embed4(surface, { a, b, c: a / 2, d: b / 3 },
                            { mother: "Mem", alpha: 30 }, undefined, m);
        for (const k of ["x", "y", "z", "w"] as const) {
          assert.ok(Number.isFinite(bent[k]), `${surface} ${k} at ${a},${b}`);
        }
        if (Math.hypot(bent.x - plain.x, bent.y - plain.y, bent.z - plain.z) > 1e-6) {
          moved = true;
        }
        // skewed, not scaled: nothing should fly off the canvas
        assert.ok(Math.hypot(bent.x, bent.y, bent.z) < 12, `${surface} blew up at ${a},${b}`);
      }
    }
    assert.ok(moved, `${surface} ignored the lattice entirely`);
  }
});
