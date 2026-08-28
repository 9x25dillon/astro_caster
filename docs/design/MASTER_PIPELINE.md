# The Master Audio-Visual Pipeline — production rail scaffold

_Status: **scaffold for operator review**, written 2026-08-28 from the
operator's pipeline brief. No commitments. Its job is to say which parts of
that brief already exist, which are genuinely new, and — the important part —
which of them **cannot be built on the rail the product currently runs on**._

Related: `PHYSICAL_TOME_PRODUCT.md` (the physical artifact and its privacy
tension), `TORUS_GEOMETRY.md` §5 and `NATAL_FIELD.md` (the sound engine),
`ASTRO_ARCANA_PERSONAL_REPORT_DESIGN.md` (the deluxe edition).

---

## 0. The finding that governs everything else

**The pipeline described is a batch job. The product is a synchronous web
request. That gap is the whole project.**

Every stage of the brief is minutes of compute per customer: a 24k-token
manuscript, a 45-minute audio bed, a full-manuscript narration, an image pass.
Today every paid generation in this product is one HTTP request that must
complete before the reader's browser gives up. This session spent its entire
length on exactly that boundary, twice:

| route | measured | what happened |
|---|---|---|
| `/api/v1/course` | 125.5s | Cloudflare 524 — composed, billed, thrown away |
| `/api/v1/tts` | 113s, then 90s×3 | 524, then 502 |

Cloudflare gives an origin **100 seconds** to produce a complete response.
Streaming buys headroom — bytes in flight reset the clock — and that is why the
Course works now. **Streaming does not scale to this product.** A 45-minute
audio render has no partial output to stream, and a customer paying $150–$1000
cannot be asked to hold a browser tab open for the duration, or to lose the
artifact when their laptop sleeps.

So the first thing to build is not a feature from the brief. It is the rail:
**a job queue, an artifact store, and a claim-based delivery path.** Every
stage below assumes it.

---

## 1. Stage inventory — what exists, honestly

Read this column-by-column before planning any work. Roughly two thirds of the
brief is already built and parity-locked; the missing third is not evenly
distributed.

| Brief stage | State | Where it lives |
|---|---|---|
| **1 · Core data seed** | **BUILT** | `@astra/core` (WASM Swiss), `canonicalizeChart`, `natal_seed.{py,js}` + `resonarium.ts` — three parity-locked implementations |
| 1 · 1-year transit progression | **BUILT** | `predictive.py`, `/api/forecast`, `/api/progressed-chart`, `/api/arcana-forecast` |
| **2 · Manuscript (Fable 5)** | **BUILT** | `oracle_report.py`, `course.py`, `personal_report.py` — 16k/24k/32k token budgets, continuation loop, completion guarantee |
| **2 · Sound engine — the spec** | **BUILT** | `resonarium.ts` → `SoundtrackSpec`: `bedrock_hz` per body, binaural carrier/beat, seed. Parity-locked by `parity/resonarium-seed.json` |
| **2 · Sound engine — the render** | **MISSING** | `fieldAudio.ts` plays the field LIVE in Web Audio. Nothing renders it to a FILE. |
| **2 · Character forge** | **PARTIAL** | The game is real and shipped: `landing/tapblade/` (1,863 lines, 4 characters, full stat schema). The chart→stats mapping does not exist. |
| **3 · Voice synthesis** | **BUILT** | `tts.py` already takes an arbitrary `voice_id` — a Professional Voice Clone **is** a voice id. No new integration; a config value. |
| **3 · Text pre-processing** | **BUILT** | `tts.speakable()` — strips markdown, linear regexes, sentence-boundary chunking |
| **3 · Audio mastering (blend)** | **MISSING** | No mixdown anywhere. Needs ffmpeg — a new system dependency in the backend image. |
| **4 · Delivery package** | **MISSING** | No artifact store, no job model, no download rail. |
| **4 · Easter-egg handoff** | **BLOCKED** | See §4 — it cannot work as described, for an architectural reason. |

### Two corrections to the brief, both load-bearing

1. **The text models are Anthropic, not OpenAI.** The manuscript path is Fable
   5 with an Opus 4.8 server-side fallback (`oracle_report.py`). Any margin
   arithmetic must use those prices, not OpenAI's.
2. **The 78-card deck art is per-card and already paid-per-render** (~$0.03–0.25
   each, `plate_art.py`). A full 78-card deck is therefore **$2.34–$19.50 of
   image generation per customer** before printing — that number belongs in the
   Collector's tier margin, and it is the single largest variable cost in the
   ladder.

---

## 2. The rail (build this first)

Three pieces, in this order. Nothing from §3 is safely buildable without them.

### 2.1 Job model

A paid generation becomes a row, not a request:

```
job:  id · sku · seed · state · created · updated · artifacts[] · error
state: queued → running → complete | failed | expired
```

The seed is the job's identity, exactly as it is the session's identity today
(`[[seed-is-the-session]]`). Re-deriving a seed re-deals the reading; a job
keyed by anything else would let a customer pay twice for one artifact, or
receive somebody else's.

**Idempotency is not optional here.** At $150–$1000 a double-charge or a
double-render is a refund and a support conversation. `POST /api/v1/jobs` with
the same (seed, sku) must return the existing job, never start a second.

### 2.2 Artifact store

Files, not JSON: a 45-minute MP3 is ~40 MB, a mastered narration far more.
`replay.db` and the Gallery (IndexedDB) are both wrong homes.

**This collides with the privacy posture and the collision must be resolved
before a byte is stored.** `PHYSICAL_TOME_PRODUCT.md` §3 already worked through
the same tension for the printed book and reached a usable answer: the artifact
is compiled, delivered, and **deleted after fulfilment + N days**, documented,
no account required. Adopt that rule verbatim rather than inventing a second
one. A retention window is a promise; write it down before it is code.

### 2.3 Delivery / claim

The precedent exists and is good: **PDF-2's per-session report token**
(`/api/personal-report/purchase`, `reportTokens.ts`) — a claim bound to one
seed, minted on payment, checked on read. Extend it; do not invent a parallel
rail. Reuse means the refund→revoke ordering already learned in M0 keeps
applying (`[[launch-infra-state]]`: cancel, verify free, *then* refund).

---

## 3. The two genuinely new engines

### 3.1 The sound render (`resonarium` → file)

The spec exists and is parity-locked; what is missing is turning it into
audio without a listener present. Two honest options:

- **Client-side `OfflineAudioContext`.** Renders faster than realtime in the
  browser that already owns `fieldAudio.ts`. Zero new server cost, zero new
  dependency, and the bytes never leave the device — which is *on-brand* and
  sidesteps §2.2 entirely for this artifact. Cost: the customer's tab must stay
  open for the render, and mastering (§3.3) then has to happen client-side too.
- **Server-side synth.** Reliable, resumable, mixable — and a new audio
  dependency plus real CPU on a 2-vCPU box.

**Recommendation: client-side render, server-side mastering only if the voice
track must be blended.** Try to keep the ambient bed on-device.

**Invariant, inherited and non-negotiable:** the render must consume the
**persisted** `SoundtrackSpec` (`aae.soundtrack`), never re-derive it. Re-deriving
across an engine change re-deals the field — measured at 28.8% divergence. And
`bedrock_hz` is **compacted, not padded**: North Node and Chiron sit at indices
12/13 only when every earlier body is present. Replay the presence filter
(`natalDroneIndex`); a hardcoded index sounds the wrong planet.

### 3.2 The character forge (chart → Tap Blade)

The smallest, cheapest, most self-contained piece in the whole brief: pure
deterministic math over data that already exists, no API cost, no new
dependency. `CHARS` in `tapblade.js` already defines the exact stat surface a
forge would write to:

```
hp · speed · dmg · arc · range · cd · swingTime · ranged · homing
dashes · dashCost · jump · flap · flapCost · glideFall · glideBoost · pound
special · pal{} · trail
```

Map it from the same signature the rest of the product already computes —
dominant element, modality, and the heavy placements (Mars, Saturn) the brief
names. Two rules make it a good feature rather than a gimmick:

- **Modifiers, never replacements.** Emit a delta over a base character. A
  chart that produces an unplayable build (0 dashes, 1 hp) is a bug, and
  clamping ranges is the guard. The game must stay winnable for every birth.
- **Deterministic from the seed**, like everything else here — the same chart
  must forge the same warrior, forever.

### 3.3 Mastering

Blend narration over the bed. Needs ffmpeg in the backend image if done
server-side. **Defer until §3.1's location is decided** — the choice of where
the bed renders decides where the mix happens, and building the mixer first
means building it twice.

---

## 4. The easter-egg handoff is blocked, and this is why

> "the system writes their unique character stats to local storage. When they
> open Tap Blade… their custom astrological warrior drops onto the screen"

**It cannot, as described.** The deployment is deliberately **two origins**
(`[[launch-infra-state]]`, `DEPLOY.md` §3.1):

```
astra-arcana.com       → the landing page — and TAP BLADE lives here
app.astra-arcana.com   → the PWA — and the chart lives here
```

`localStorage` is partitioned per origin. The app **cannot** write a key the
game can read; the game **cannot** read a key the app wrote. This is not a bug
to fix in passing — the split is load-bearing (the app's service worker claims
scope `/`, and `frontend/dist` doubles as the APK's `webDir`, so the `/app/`
path layout was rejected for reasons that still hold).

Three ways out, in the order I would consider them:

1. **Serve a copy of Tap Blade on the app origin** at `app.astra-arcana.com/tapblade/`.
   Same static files, same-origin storage, handoff becomes trivial. The landing
   copy stays where it is as the offline-error game. Cheapest and safest.
2. **Pass the build in the URL fragment** when the app links to the game
   (`#build=<base64>`). No storage crossing, works today, survives the origin
   split — but it is a link-only path: opening the game directly gets nothing.
3. Cross-origin `postMessage` through a hidden iframe. Works, adds a
   third-party-storage dependency browsers keep tightening. Not recommended.

**Recommendation: (1), with (2) as the deep-link.** Whichever is chosen, note
that the APK is a third origin again — a Capacitor `file://`/localhost context —
so the forged build must also ride in the app's own vault export if it is
meant to survive there.

---

## 5. The ladder, as code

The brief's tiers are now data, not prose: **`backend/product_catalog.py`**,
one source of truth for what each SKU costs and what it unlocks. Prices follow
`stripe_rail.py`'s existing convention — env-overridable, with the **intended**
price as the default, so a deploy that forgets a variable can never charge more
than was decided.

| SKU | default | fulfilment | what it unlocks |
|---|---|---|---|
| `digital` | $175 | none | manuscript, 1-year forecast, narration, sound bed, forged character |
| `artifact` | $625 | physical | digital + printed book + pop-up chart |
| `collector` | $1,200 | physical | artifact + the 78-card printed deck |

Two things the catalog encodes that prose cannot:

- **Every SKU is a superset of the one below it.** `unlocks` is checked as a
  set, and a test asserts the containment holds — so a tier can never
  accidentally offer less than a cheaper one.
- **Fulfilment class is explicit** (`none` / `physical`), because the refund
  and retention rules differ once an object has shipped.

The existing `supporter` / `oracle` subscription tiers are untouched and remain
the access ladder for the observatory itself. This catalog sits *above* them:
these are one-time bespoke commissions, not access.

---

## 6. Build order

1. **The rail** (§2) — job model, artifact store + retention decision, claim
   delivery. Nothing else is safe first.
2. **The forge** (§3.2) — smallest, cheapest, fully deterministic, no API
   spend, and it exercises the rail end-to-end with a trivial artifact.
3. **The handoff** (§4) — decide the origin question; it gates the forge's
   whole point.
4. **The sound render** (§3.1) — decide client vs server first.
5. **Mastering** (§3.3) — only after 4.
6. **Physical fulfilment** — already scoped in `PHYSICAL_TOME_PRODUCT.md` §6.

## 7. Open decisions — operator only

1. **Retention window** for stored artifacts (§2.2). Blocks the rail.
2. **Where the sound bed renders** (§3.1). Blocks mastering.
3. **Which origin fix** for the game handoff (§4).
4. **Whether the 78-card deck is fully pre-rendered** for the Collector tier or
   rendered on demand — $2.34–$19.50 of image generation per customer, and the
   answer changes that tier's margin more than anything else in the ladder.
5. **Prices** — §5's defaults are the brief's midpoints, not a decision.
