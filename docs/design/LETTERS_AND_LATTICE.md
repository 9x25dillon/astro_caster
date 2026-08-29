# Letters and lattice — the alphabet, the fourth dimension, and the 32

_Status: shipped 2026-08-28. `frontend/src/lib/hebrew.ts` is the lexicon,
`lib/torus4.ts` the 4D geometry, `lib/crystal.ts` the crystallography,
`lib/torusLayers.ts` the placement, `TorusPanel.tsx` the renderer. Entirely
on-device and dependency-free: no Three.js, no math.js, no webfont. Unit tests
in `test/hebrew.test.ts`, `test/torus4.test.ts`, `test/crystal.test.ts`;
browser tests in `e2e/torus-hebrew-crystal.spec.ts`._

This extends [TORUS_GEOMETRY.md](TORUS_GEOMETRY.md). Read that first — the
Clifford embedding and the aspect-circle picture are assumed here.

Three additions, and the argument for each is that it was **already true of the
surface** and merely unnamed. Where an idea had to be chosen rather than
derived, this file says so.

---

## 1 · The alphabet is a partition, and it is this one

The Sefer Yetzirah splits its twenty-two letters 3 + 7 + 12: three mothers
(elements), seven doubles (planets), twelve elementals (signs). The torus was
already split the same way, and `torusLayers`' arity rule places each part
without a new idea:

| Part | Astrology | Arity | Shape on T² |
|---|---|---|---|
| 12 elementals | signs | an arc partition | a mark at each 30° arc's **midpoint**, both axes |
| 7 doubles | classical planets | a single longitude | a mark on the **circle** that longitude already draws |
| 3 mothers | elements | not a position at all | **how the surface turns** — see §2 |

The midpoint rather than the cusp: the letter names the whole arc, and a glyph
sitting on a boundary reads as belonging to the boundary, which is the one place
in the sign it means nothing special.

**What gets no letter.** The Nodes, Chiron, Lilith and the angles return `null`
from `letterForBody` and are drawn unlettered. There are seven doubles because
there were seven planets; a lunar node is not an eighth. Uranus, Neptune and
Pluto reach the three mothers only behind an opt-in flag, labelled *modern
attribution* wherever they appear, because that placement is younger than the
planets.

**Two tables ship.** The elementals and mothers agree across traditions; the
seven doubles do not, and they disagree on *every* planet — a test pins that.
`yetzirah` walks the descending Chaldean order (Sun → כ); `golden-dawn` is the
Kircher attribution the tarot trumps follow (Sun → ר). Silently picking one
would tell half the readers they are wrong about their own tradition.

**The 144 tiles.** A point of the surface stands in one sign on each axis, so it
has a two-letter name and a gematria. That number is the only quantity on the
surface invariant under everything §2 and §4 do to it.

---

## 2 · The three mothers are the three plane-pairs of ℝ⁴

A rotation of four-space has no axis — it has a **plane**. There are six
coordinate planes and they fall into exactly three pairs sharing no coordinate:

```
{xy, zw}        {xz, yw}        {xw, yz}
   א Aleph         מ Mem          ש Shin
    Air            Water           Fire
```

Three pairs, three mothers. Turning both planes of a pair at one rate is an
**isoclinic** rotation — the motion with no fixed direction at all.

The load-bearing part: on the Clifford torus `(cos θ, sin θ, cos φ, sin φ)/√2`
the `xy` plane carries body A's longitude and `zw` carries body B's. So Aleph's
isoclinic rotation *is* the Hopf flow this panel has run since chapter V. That
is not an analogy — `test/torus4.test.ts` asserts

```
embed4("clifford", {a,b}, {mother:"Aleph", alpha:h})  ≡  embedClifford(a,b,h)
```

to 1e-12, for every angle tested. Naming the flow after a letter renames
nothing and moves no pixel.

Mem and Shin mix the two bodies' planes, which no rotation in this app had done.
Under them the surface leaves its pose **and passes through the projection
pole** — at 45° and every 90° after, four inside-out passages per turn, verified
by sweep. That singularity is kept, clamped rather than avoided: it is the one
thing four dimensions can do that three cannot.

---

## 3 · T⁴ needs a third and fourth body, not a derived angle

The spec this was built from proposed generating the second pair of angles from
house placement or aspect angle. Both are functions of the longitudes already
plotted — a house position is λ minus a fixed cusp, an aspect angle is
λ_A − λ_B — so either pins the curve to a 2-dimensional diagonal of T⁴. It would
render, and it would be a picture of nothing.

Two more bodies genuinely free the other two circles. `localPairTrajectory` takes
optional `bodyC`/`bodyD`; the nested embedding is

```
x = (R₁ + R₂·cos b + R₃·cos c)·cos a
y = (R₁ + R₂·cos b + R₃·cos c)·sin a
z =  R₂·sin b + R₄·cos d
w =  R₃·sin c + R₄·sin d
```

with `R₁, R₂` the donut's own radii. **Set R₃ = R₄ = 0 and this is
`embedDonut(a, b)` coordinate for coordinate** — a test pins it, and that
containment is why the surface is safe to offer.

The third and fourth bodies are not drawn as curves. They choose *which* torus
you are looking at: the wireframe, aspect circles and natal lattice are all drawn
at the current slice, so scrubbing walks the cursor along the pair **and** slides
the surface sideways through the other two circles. The trajectory is exempt — it
is a curve in the full T⁴ and uses each sample's own c and d.

**Projection.** The Clifford route keeps true stereographic projection from
(0,0,0,1); undisturbed, the torus stays 0.29 clear of that pole and Villarceau
circles stay circles. The nested torus uses a perspective divide along w with the
eye at 2.0, clear of its |w| ≤ 0.64. The textbook `x/(1−w)` is the eye-at-1 case
and is *not* safe for a surface whose w is not bounded by 1.

**Phasing.** Opacity follows w on the hyper-torus only. Stereographic projection
of the Clifford torus is invertible — w is recoverable from where the point
landed and is already visible as size — so fading by it there would say the same
thing twice. The nested surface is not on a sphere, its w genuinely does not
survive the divide, and fading is the only way it can be seen.

---

## 4 · The 32, twice — and the theorem that is not a coincidence

There are exactly 32 crystallographic point groups. The Sefer Yetzirah opens by
counting exactly 32 paths of wisdom: ten sefirot and twenty-two letters. The
orderings agree at both ends —

- **Path 1** is Kether, the undifferentiated point. **Point group 1** is the
  identity alone: one operation, no symmetry.
- **Path 32** is Tav, Yesod–Malkuth, manifestation. **m-3m** is the cubic
  holohedry, order 48, the most symmetric arrangement matter may take.

The census even splits where it must: triclinic + monoclinic + orthorhombic +
the two lowest tetragonal groups = 2 + 3 + 3 + 2 = **10**, the sefirot, leaving
**22** for the letters. That cut falls *inside* the tetragonal system rather than
on a system boundary, and `crystal.ts` says so rather than rounding it off.

### The finding

The crystallographic restriction theorem permits rotation axes of order 1, 2, 3,
4 and 6, and no others — no lattice can carry a 5-, 8- or 12-fold axis. The
astrological harmonics are the same numbers:

| Aspect | Angle | Harmonic | System | Lattice? |
|---|---|---|---|---|
| Conjunction | 0° | 1 | triclinic | ✔ |
| Opposition | 180° | 2 | monoclinic, orthorhombic | ✔ |
| Trine | 120° | 3 | trigonal | ✔ |
| Square | 90° | 4 | tetragonal | ✔ |
| Sextile | 60° | 6 | hexagonal | ✔ |
| Quintile | 72° | 5 | — | ✘ |
| Semisquare / sesquiquadrate | 45° / 135° | 8 | — | ✘ |
| Semisextile / quincunx | 30° / 150° | 12 | — | ✘ |

**The five aspects that crystallize are exactly the five this app already calls
major** (`TorusPanel`'s `MAJORS` set). The traditional major/minor split —
inherited without a stated reason — is the restriction theorem. A test derives
the set from `ASPECT_DEFS` and asserts equality rather than restating it.

A 5-fold arrangement of matter is a quasicrystal: real, and not believed
possible until 1982. The quintile is the aspect with no repeating cell.

### Orb is symmetry breaking

An exact aspect carries its system's **holohedry**. As the orb widens the group
steps down through its family, which is what strain does to a real crystal:
operations stop being satisfied one at a time and the symbol shortens. At the
edge of orb only the bare rotation axis is left. Monotone, and tested.

### Standing nodes take their path's group

A standing node is a transiting body arriving on a natal degree — the instant two
drones lock and the beat falls to zero, which is what a standing wave's node *is*.
Each grows the **habit** of its path: the orbit of a small asymmetric motif under
that group, so the shape names the group before any symbol does. A splinter is
`1`; a splinter with a partner through the centre is `-1`; a twelve-fold rosette
is `6/mmm`.

A node on an unlettered body falls to triclinic — and to which of its two groups
by the one thing the node itself knows: **an opposition is an inversion**
(λ → λ+180 is the inversion of the circle), so an opposition node gets `-1` and a
conjunction node gets `1`. A body the alphabet has no letter for has no symmetry
to claim, and `1` is the group of having none.

### Cubic, and the one interpretive table

No single aspect reaches cubic — it is the only system with more than one
high-order axis, and a configuration is the only thing in a chart with more than
one axis. The five cubic groups map onto the app's patterns:

| Pattern | Group | Argument |
|---|---|---|
| Stellium | `23` (T) | piled in one place, nothing articulated: bare rotations |
| Grand Trine | `-43m` (Td) | three bodies in a plane (a mirror), no opposition (no centre) |
| Kite | `m-3` (Th) | the grand trine with an inversion added by its opposition |
| T-Square | `432` (O) | a 4-fold axis with one arm missing, so not centrosymmetric |
| Grand Cross | `m-3m` (Oh) | the arm arrives, the centre returns: the holohedry, path 32 |
| Yod | *none* | built from quincunxes — 12-fold, which no lattice permits |

Five groups, used once each, and a sixth pattern that correctly has none. **This
table is the one place in the feature that is a reading rather than a
derivation** — each row is an argument about a configuration's symmetry, and a
different reading would order them differently. Everything above it is forced.

---

## 5 · The triclinic lattice

Triclinic is the system with no symmetry: `a ≠ b ≠ c`, no angle a right angle.
Its cell becomes a deformation applied to the 4D vertices before projection —
the standard crystallographic orientation matrix, extended to 4D with **w
untouched**, because w is the coordinate the projection spends and skewing it
would make the fade and the shape argue about the same axis.

Nothing about the cell is invented. Its three interaxial angles **are** three
pairwise separations of three real longitudes (the two transiting bodies, and
either the third circle or body A's own natal degree); its three axis lengths are
those longitudes. So the crystal is triclinic exactly when the chart is, and
visibly straightens as bodies come into aspect — a conjunction collapses two axes
to equal length, which is the symmetry rising, correctly.

**The legal band.** A cell exists only where its normalised volume is real:

```
V² = 1 − cos²α − cos²β − cos²γ + 2·cosα·cosβ·cosγ  >  0
```

and V² is exactly zero when all three angles are 60° or all three are 120° — the
flat degeneracies where the matrix stops being invertible. Separations run the
full 0–180°, so they are mapped into **[65°, 115°]**, which keeps V² above ~0.31.
Verified by sweeping the whole space of separations, not by argument.

A cubic cell is the identity matrix, so the switch has an honest off.

---

## 6 · Why no WebGL

The source spec called for Three.js, `InstancedMesh`, and vertex-shader
billboarding. This renderer is hand-rolled canvas-2D with painter's-algorithm
depth sorting and no rendering dependency at all, and the spec's own goal is
better served by keeping it:

- **Billboarding is the default.** `fillText` and screen-space shard outlines
  already draw at a projected point without warping. In WebGL this is a vertex
  shader; here it is free.
- **Cost.** 24 sign glyphs + up to 28 body glyphs + ≤ 12 shards is one sort and
  one loop per frame, against ~600 KB of new bundle for a panel that computes
  offline and ships in a signed APK.
- **The 4×4 matrices are 16 multiplies.** `math.js` would be a dependency to
  avoid writing `deform4`, which is four lines.

The glyph pass draws **after** the depth-sorted geometry, deliberately: letters
are labels, and a label that disappears behind a wireframe line is a label the
reader cannot use. Among themselves the glyphs still sort by depth. Each is
stroked with a dark halo before its fill — without it a letter crossing a bright
aspect circle loses its counters and stops being a letter, and several of these
differ by one stroke.

---

## 7 · The wheel, redesigned

_Shipped 2026-08-28 alongside the above. `components/ChartHologram.tsx` is the
underlay, `lib/hologram.ts` the treatment, `ChartWheel.tsx` the host. There is no
toggle: this is what a cast chart looks like now._

Three layers in one box — the torus underlay on canvas, the wheel's SVG over it,
an inert HUD film on top.

### The alignment is the whole argument

The wheel places a longitude at screen angle `180° − (λ − Asc)` and reads it
through `polar()`, which is `(cos, sin)` with SVG's y pointing down. The torus
places its θ at `(cos θ, −sin θ)` after projection, for the same reason
inverted. So

```
θ(λ) = ((λ − Asc) mod 360) − 180
```

makes the two land on the same screen angle for **every** longitude. A natal
body's meridian points out of the wheel's centre at exactly the degree the wheel
marks it. `test/hologram.test.ts` pins this against `lonToAngle` rather than
trusting the derivation — two sign conventions in one line is two chances to be
wrong.

**Which is why the camera never yaws.** A slow turn would look better and would
cost the only thing worth having: yaw slides θ off the wheel's angle and the
correspondence stops being visible. The idle motion is carried by the HUD
instead. The camera *does* pitch (−24°), which compresses the ring vertically —
but a pitch about x cannot move points on `y = 0`, so the **Asc/Desc axis stays
exactly aligned at any tilt**. The chart's most important axis is the one the
tilt cannot touch. Also tested.

### The letters

- **12 elementals** on the zodiac ring, at each 30° arc's midpoint, sharing the
  band with the sign glyph (glyph outer half, letter inner).
- **7 doubles** on the central seal — and that ring was *already* the doubles.
  `SEAL_ORDER` (`lib/alchemy.ts`) is the seven classical metals in descending
  Chaldean order, which is exactly the order the Sefer Yetzirah walks its seven
  doubles in, so the letter for the metal at index *i* is simply `DOUBLES[i]`.
  Nobody had said so. A test asserts the two orders agree index-for-index.
- **3 mothers** appear nowhere on the wheel, because they are not positions.

### "Holographic", made to mean something

A hologram records an **interference pattern**. This app has computed
interference since session 37: two drones beat at `|f_A − f_B|`, zero exactly
when longitudes meet. So the chromatic split between the cyan and magenta
channels *is* a beat rate — each body's against its nearest neighbour — and it
**closes to nothing at a conjunction**. The parts of the chart that are most
exact are the parts that resolve; the fringes gather on bodies standing alone.

The rest of the idiom — scanlines, sweep, bloom, edge glow — is the requested
look rather than a derivation, and `lib/hologram.ts` says so in as many words.

### The flicker is bounded in code, not in taste

Photosensitive-epilepsy guidance (WCAG 2.3.1 / Harding) puts the danger above
**three general flashes per second** at more than about **10% of maximum
luminance**. This runs at **2.4 Hz** with a **6% swing** — measured, not
declared: the test samples sixty seconds of the actual waveform at 1 kHz, counts
its zero crossings, and asserts both bounds. The scan sweep is 0.125 Hz, a factor
of twenty-four inside the limit.

Under `prefers-reduced-motion` every animation is **removed, not slowed** — a
reader who asked for no motion has not asked for less — and `flicker()` returns a
flat 1. Tested by reading `animationName` off all four pseudo-elements.

Scanlines **lighten** rather than darken. A CRT scanline works by taking light
away, which needs light to take; over a near-black instrument the darkening
version was mathematically present and visually absent.

### Three bugs a type checker could not see

1. **Conditional hooks.** The underlay's two `useMemo` calls went in just above
   `return (`, which sits *below* `if (!chart) return`. Hooks run in call order,
   so they were called zero times on the empty render and twice once a chart
   arrived — React counts that as a different component and throws. The wheel
   simply stopped rendering. They now sit above the early return, with a comment
   saying why that placement is load-bearing.
2. **The opaque backdrop.** The wheel painted `discGrad` at full opacity over the
   canvas, hiding the entire underlay. It is now `fillOpacity 0.55`: still a
   ground for the rings, no longer an eraser.
3. **The underlay fought the glyphs.** At `FILL = 0.72` the lattice ran through
   the planet ring. Pulled to `0.62`, inside `rPlanet`, with a radial mask so it
   dissolves at the rim instead of ending on a hard circle.

All three were found by taking a screenshot and looking at it.

### Cost

The canvas redraws on change — chart, ascendant, focus, size — not on a clock.
The shimmer is CSS on the compositor, so the ~2700-stroke lattice is not repainted
per frame. Both new layers are `pointer-events: none`; an e2e test clicks a planet
*through* them, because a single missing declaration would turn the most-used
surface in the app into a picture.
