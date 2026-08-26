# The natal field — the whole chart as one sound, and its bridge to SPINE

_Status: shipped session 37 as the **Field** tab of chapter V · Depths.
`frontend/src/lib/natalField.ts` is the voicing and the bridge,
`lib/fieldAudio.ts` the instrument, `components/FieldPanel.tsx` the surface,
`test/natalField.test.ts` the lock. Entirely on-device; no backend, no new
dependency, and no new seed — the field CONSUMES the persisted
`SoundtrackSpec`._

The Torus tab sounds a **pair**, and its interval is the aspect
(`TORUS_GEOMETRY.md` §5). This is the other half: all fourteen canonical bodies
at once — what the resonarium engine was built to produce, and what nothing had
played, because until session 37 the engine was not even importable from the
frontend (`browser.ts` re-exported nothing from it).

---

## 1 · Why "play all fourteen" is the wrong implementation

The bedrock map is exponential:

```
f(λ) = 110 · 2^(λ/180)  Hz          λ ∈ [0, 360) ⇒ f ∈ [110, 440)
```

Equal spacing in longitude is therefore equal spacing in **cents**, not in Hz —
so the bottom of the range is *always* the crowded end. On the golden fixture,
six of fourteen drones land inside 111–136 Hz while the top four spread across
an octave:

```
mercury  111.3 → saturn   111.8      7c   beat  0.4 Hz   ← a 2.5-second pulse
saturn   111.8 → venus    117.4     85c   beat  5.6 Hz
chiron   126.1 → neptune  127.3     16c   beat  1.1 Hz
uranus   197.0 → moon     293.1    688c   beat 96.2 Hz
mars     345.1 → node     352.9     39c   beat  7.8 Hz
```

At equal gain that is not a field. It is bass mud with a few tones floating
above it. And the compression is **structural, not chart-specific** — it follows
from the map, so every chart has it somewhere.

The consequence worth stating plainly, because it is the whole aesthetic:

> **The low register is where conjunctions are heard as BEATING.
> The high register is where they are heard as PITCH.**

One map, two perceptual regimes, split by where in the zodiac a body sits. An
8 Hz beat means bodies 18.2° apart at λ = 0°, but only 4.7° apart at λ = 359°.

## 2 · Crowd-aware voicing

The fix is **not** a fixed EQ tilt. A tilt would make a body loud or quiet purely
for sitting high or low in the zodiac — arbitrary, and it fights the data.

Instead each drone's gain depends on how crowded its neighbourhood is:

```
crowd_i = #{ j ≠ i : |cents(f_i, f_j)| ≤ 100 }
gain_i  = 1 / √(1 + crowd_i)
```

A hundred cents — a semitone — is the width inside which two drones are heard as
one thickened tone rather than two pitches. The `1/√(1+n)` law makes a cluster of
*n* voices carry the same total energy as a lone tone. **What the chart crowds,
the mix thins.**

Two properties this deliberately keeps:

- **Nothing is ever silenced.** Even a maximal fourteen-on-one pile-up leaves
  every voice audible; the gain floor is `1/√14 ≈ 0.27`, not zero.
- **The beating survives.** Crowd-gain lowers both members of a close pair
  *together*; it never detunes one or drops one. Mercury and Saturn seven cents
  apart still beat at 0.4 Hz — a two-and-a-half-second breath, which is the
  audible signature of a low-register conjunction and the best thing in the
  whole field.

## 3 · Synthesis: sine here, sawtooth there

`torusAudio` uses sawtooth-through-a-lowpass **so that** an opposition's exact
2:1 has a harmonic to lock onto — with only two voices, harmonics are what make
the interval legible.

`fieldAudio` uses **pure sines**. Fourteen sawtooths would stack ~42 partials
into two octaves and smear into noise, and the thing worth hearing here is the
beating between *fundamentals*, which harmonics only obscure.

Voices also arrive **staggered**, one every 0.28 s. Fourteen tones arriving
together is a chord; arriving one at a time is a field assembling, and it lets a
listener place each voice before the next lands. Soloing (tap a body) is the
other half of that — a mass is not navigable without it.

## 4 · The SPINE bridge — `resonarium.state.v2`

[beatmI/SPINE](https://github.com/9x25dillon/beatmI) already reads Resonarium
states (`twin/analyze.py --resonarium`), so the export invents **no new contract
at either end**:

| this repo | the wire | beatmI reads it as |
|---|---|---|
| each drone | `singles: [{on, f, lvl}]` | a carrier — collapses to a pitch class, votes on key |
| `spec.binaural` | `bins: [{on, carrier, beat, lvl}]` | carrier votes on key; **`beat` is a TEMPO** |
| `spec.seed32` | `natalSeed` | the generator seed (`twinRng`) |

**A binaural beat rate is a tempo.** `beat_hz · 60`, doubled while under 70 and
halved while over 190. The engine's `beat_hz = 4 + (|aspects_sum| mod 8)` lives
in `[4, 12)`, which folds to **[70, 190] BPM** — the whole musical range, and
never outside it (pinned in the test suite across that interval).

`lvl` carries the **same crowd-aware gain the player uses**, so the chroma
beatmI votes with is weighted exactly as the field sounds: what you hear is what
it analyses. (The analyzer floors `lvl` at 0.05, so a crowded voice still votes
rather than dropping out of the key estimate.)

Verified end to end against the real analyzer, not assumed — chart → export →
`analyze.py` returns 137.2 BPM, 15 carriers, seed intact, against the app's own
137.25.

## 5 · What this settles about `intention`

`personalSoundtrack(chart, intention)` passes the intention to `deriveNatalSeed`
**only**. `bedrockFrequencies(sc)` and `binauralConfig(sc)` take the seed *chart*
and never see it. So:

```
three different intentions, same chart:
  tempo    137.2 BPM   137.2 BPM   137.2 BPM     ← identical
  carriers 54622b16…   54622b16…   54622b16…     ← identical
  seed32   408670715   2261766442  3917634430    ← the only thing that moves
```

**Your chart fixes the tones and the tempo; your intention fixes which take you
get.** An intention is not a modifier of the field — it cannot move a drone —
it is the seed of what is generated *from* the field. That is why a plain text
box is safe here, and it is the honest sentence to put next to one.

## 6 · What this does NOT do

- **No new seed.** The Field tab reads the persisted `SoundtrackSpec` through
  `lib/soundtrackStore` and never calls `personalSoundtrack` itself.
- **No engine edit.** `resonarium.ts` is untouched; its parity vectors against
  `natal_seed.py` are unmoved.
- **No key claim.** The analyzer reports key confidence around 0.07–0.10 on a
  natal chart, and that is correct rather than a failure: `pitch class =
  (9 + λ/15) mod 12`, so **15° of zodiac is one semitone** and bodies scattered
  round a circle scatter across all twelve classes. A chart does not imply a
  key. The tempo claim is strong; the key claim is not, and the surface says so
  by not saying it.
- **No network, no backend, no new dependency.** Web Audio and a Blob download.

## 7 · Where this could go next (not built)

- **Transit field** — the same fourteen voices at today's longitudes, so the
  natal field and the transiting field beat against each other. Every transit
  becomes an audible detuning.
- **Per-drone dignity weighting** as a second gain lever alongside crowding.
- **Round-trip** — read a `resonarium.state.v2` back in, so a state edited in
  SPINE can be heard here.
