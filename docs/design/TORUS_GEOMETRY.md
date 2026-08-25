# Torus geometry — the chart in polar form

_Status: shipped 2026-08-25 (branch `claude/3d-torus-chart-viz-wqzpn0`) as the
**Torus** tab of chapter V · Depths. `frontend/src/lib/torus.ts` is the math,
`frontend/src/components/TorusPanel.tsx` the renderer,
`localPairTrajectory` in `api/client.ts` the ephemeris sampler. Entirely
on-device; there is no backend endpoint and no parity vector — the torus
CONSUMES `eclipticLonSpeed`, the already-parity-locked primitive, and adds no
second implementation of anything astronomical._

This file is the reformulation the feature is built on: every astrological
formula the app already computes, restated in complex numbers — and what the
restatement buys.

---

## 1 · Longitudes are phases

A zodiacal longitude is an angle, so give it its natural coordinates:

```
z = e^{iλ}     — a planet is a point on the unit circle S¹
```

The wheel we draw in chapter I is exactly this picture. Everything below is
one dictionary, applied repeatedly:

| astrology says            | polar form says                                        |
|---------------------------|--------------------------------------------------------|
| separation of two bodies  | relative phase `w = z₁ · z̄₂ = e^{i(λ₁−λ₂)}`           |
| aspect at angle `k·360/n` | `wⁿ = 1` — `w` is an **n-th root of unity**            |
| orb                       | `δₙ = arg(wⁿ)/n` — signed distance to the nearest root |
| n-th harmonic chart       | the map `z ↦ zⁿ`                                       |
| midpoint of a pair        | `m² = z₁z₂` — the two square roots are the near/far midpoint |
| antiscia about axis σ     | reflection `z ↦ e^{2iσ} z̄` (conjugation = mirror)      |
| progression / transit     | multiplication by a slowly rotating phase              |

Three things in that table are quietly load-bearing:

- **The whole aspect table is one formula.** Conjunction, opposition, trine,
  square, sextile, quintile, semisquare… are not ten separate conditions but
  one condition — `wⁿ = 1` — at n = 1, 2, 3, 4, 6, 5, 8. The residue
  `δₙ = arg(wⁿ)/n` is smooth, signed, zero exactly at the aspect, and immune
  to 0°/360° wrap bugs because `arg` is taken **after** the power. (Compare
  the fmod gymnastics `norm360`/`angularSeparation` do — the float trap in
  Hand_off §36 lives exactly where this formulation has nothing to wrap.)
- **Harmonic charts stop being exotic.** `z ↦ zⁿ` sends every n-th-harmonic
  aspect to a conjunction. The existing chapter-V harmonics feature is this
  map's output; the torus view is its input, seen whole.
- **Midpoints inherit their famous ambiguity honestly.** A square root on the
  circle has two values, ±√(z₁z₂) — the near and far midpoint — which is why
  `circularMidpoint` must choose, and why the 90° dial (which is `z ↦ z⁴`)
  makes the choice irrelevant.

## 2 · A pair of planets lives on a torus

One angle lives on a circle; two angles live on the product of two circles:

```
(λ_A, λ_B)  ∈  T² = S¹ × S¹      — the flat torus
```

- **A natal chart's pair** is a single fixed point on T².
- **The running sky's pair** is a moving point, and over a window of time it
  traces a **curve** — for near-uniform mean motions ω_A, ω_B, a line of
  slope ω_B/ω_A winding around the torus.
- **An aspect** `λ_A − λ_B ≡ ±a (mod 360)` is a fixed **(1,1)-diagonal
  circle** on T². Not a moment: a *place*.

So the sentence "Mars was square Venus on March 4th" translates to: *the
pair's trajectory crossed the square circle there.* Every exact aspect in a
window is a literal intersection point, and the familiar chart quantities
read straight off the geometry:

- **orb** = distance from the current point to the aspect circle;
- **applying/separating** = moving toward/away from it;
- **the three-pass transit** (direct–retrograde–direct) = the trajectory
  weaving across the same circle three times — one loop of the weave, seen
  whole instead of as three table rows;
- **stations** = the cusps of that weave (the curve's velocity in the fast
  coordinate passing through zero).

### Windings, resonances, knots

The trajectory's **winding vector** (how many times each body laps its
circle) classifies the curve. When the ratio is near-rational the curve
nearly closes into a **(p,q) torus knot/link**, and the classical "sacred
geometry" of the tradition falls out as knot theory:

| pair            | near-resonance | closed figure                                  |
|-----------------|----------------|------------------------------------------------|
| Venus–Earth     | 13 : 8         | the pentagram (five-petaled rose) — a (13,8) winding |
| Jupiter–Saturn  | ~5 : 2         | Kepler's trigon — great conjunctions advancing ~120° |
| Moon–Sun        | ~13.4 : 1      | the synodic weave — 12.37 lunations/year       |

The UI surfaces this as "the curve winds ☉ 1.0 × ☽ 13.4 turns."

## 3 · Two embeddings, one honest and one beautiful

T² is flat; ℝ³ has no room for a flat torus (Nash notwithstanding), so every
picture is a choice of distortion:

1. **The donut** `(θ, φ) ↦ ((R + r cos φ) cos θ, (R + r cos φ) sin θ, r sin φ)`
   — instantly readable, metrically dishonest (the inner equator is shorter
   than the outer). The θ grid lines are drawn every 30°, so the wireframe's
   meridians **are the sign cusps** of the ring body.

2. **The Clifford torus** — T² sitting *flat* (zero intrinsic curvature,
   both circle families congruent) inside the 3-sphere in ℝ⁴ ≅ ℂ²:

   ```
   (θ, φ)  ↦  (e^{iθ}, e^{iφ}) / √2   ∈  S³ ⊂ ℂ²
   ```

   brought to ℝ³ by stereographic projection from a pole the torus never
   touches. This is the "4D Clifford torus, visualized as 3D" of the
   original idea, and it pays for itself twice:

   - **Aspect circles become true circles.** The (1,1)-diagonals of T² are
     **Hopf fibers** of S³, and stereographic projection (being conformal,
     sending circles to circles) lands each one as a perfect round circle in
     space — a **Villarceau circle** of the projected torus. On the donut an
     aspect is an awkward diagonal; on the Clifford torus it is geometry's
     own circle. A unit test pins this (`torus.test.ts`, the Villarceau
     test): sixty projected points of an aspect circle are equidistant from
     one center and coplanar to 1e-9.
   - **Any two aspect circles are linked** — Hopf linking number 1. Aspects
     are not parallel lines on a cylinder; they are pairwise-interlocked
     rings. (A pretty theorem hiding in plain sight: "the square and the
     trine cannot be pulled apart.")

   The **Hopf flow** button animates the isoclinic rotation
   `(θ, φ) ↦ (θ+α, φ+α)` — the 4D rotation whose orbits are exactly the
   aspect circles, so the surface slides along its own aspects. That is what
   "rotation" means one dimension up, and it is the only honest way to show
   a 4D motion on a screen.

## 4 · What the visualization is contractually allowed to claim

- **Same numbers, new eyes.** Longitudes come from `eclipticLonSpeed` in the
  chart's own zodiac frame (tropical or sidereal + ayanamsha), the same
  primitive the forecast scanner uses and the parity vectors lock. The torus
  introduces **no second ephemeris**; intersections are located by
  inverse-linear interpolation between samples (≥ 4/day for Moon pairs), so
  event instants are display-precision (minutes), not ephemeris-precision —
  the event list says *when*, the Timing chapter remains the instrument that
  says *exactly when*.
- **The natal point is data, not decoration.** Its distances to the aspect
  circles are the natal orbs; the readout under the canvas states the
  nearest circle and the distance, which must agree with the wheel's aspect
  table within the sampling story above.
- **Voice canon applies.** The torus shows pattern, not sentence: a crossing
  is a fact about angles, and the copy in the margin glass keeps to the
  reflective register.

## 5 · Where this could go next (not built, deliberately)

- **The full chart as a point on T¹³** with the pairwise tori as its 2D
  shadows — a grand tour of projections.
- **Latitude as a second angle**: (λ, β) puts each single body on its own
  torus; declination contacts (parallels) become crossings there.
- **A time–longitude torus** (λ vs. year-phase) turns solar returns and
  birthdays into vertical circles — returns as intersections, again.
- **Sound**: the resonarium already maps longitudes to drones; a pair's
  winding numbers are a just-intonation interval (13:8 is a neutral sixth).
  The torus and the soundtrack are the same object heard and seen.
