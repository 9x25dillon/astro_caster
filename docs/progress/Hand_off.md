# Hand_off.md

_Last updated: 2026-08-26 (session 37 — the torus gained sound, and the
soundtrack engine turned out never to have been **importable**. `main` is at
`8e9e808`; production is still `dba3e1b`, now **two feature commits behind**
and unverified from this seat. Operator action items unchanged: dismiss CodeQL
alerts 19/5/4 (deliberate masks), and deploy. Session 36's entry below is
still accurate about everything it claims.)
Re-derive before trusting any of this: `git fetch && git status -sb`._

---

# SESSION 37 — 2026-08-26 (the torus is heard; and a two-session backfill)

## Start here

Two commits' worth of work is documented in this one section, because
**8e9e808 (the Torus tab) shipped with no Hand_off entry and no journal
entry** — session 36's ritual ran before it landed, and the browser session
that built it could not close properly. That gap is filled below.

```
8e9e808  The aspect table becomes one formula...       ON MAIN, CI GREEN, NOT DEPLOYED
<this>   The torus is heard...                          BRANCH → PR
dba3e1b  Security pass                                  DEPLOYED (last verified session 36)
```

## The finding that matters most

**The personal-soundtrack engine was never reachable from the app.** Session
36 recorded it as "dormant — Vite tree-shakes it out because nothing imports
it." That diagnosis was wrong, and the correct one is worse:

`frontend/vite.config.ts` and `frontend/tsconfig.json` both alias
`@astra/core` to **`packages/astra-core/src/browser.ts`**, not to `index.ts`.
The resonarium was exported from `index.ts` only. So `personalSoundtrack` was
not tree-shaken out of the bundle — **it could not be imported at all**, and
any frontend file that tried would have failed to resolve. "Nothing imports
it" was a symptom, not the cause.

The fix is three lines of re-export appended to `browser.ts`. The engine file
itself is untouched and its parity vectors did not move.

**Generalize this before it bites again:** `browser.ts` is a hand-maintained
allowlist, and a symbol exported from `index.ts` is invisible to the frontend
until someone adds it there too. When a module "exists but nothing uses it",
check reachability before concluding disuse:

```
grep -c "<symbol>" packages/astra-core/src/browser.ts    # 0 = unreachable, not unused
```

## The other trap: a stale clone reads as deleted work

This session opened by finding `docs/design/TORUS_GEOMETRY.md`,
`frontend/src/lib/torus.ts` and `TorusPanel.tsx` all **MISSING**, with local
`main` and `origin/main` both at `a668b8d`. Nothing was lost — the clone had
simply never fetched `8e9e808`. `origin/main` is a cached ref, and it is a
*claim about the past*, not a measurement.

Also worth recording: **`git` egress is blocked by the agent tool sandbox on
this machine** (`Recv failure: Connection reset by peer`). Fetch and pull need
the sandbox disabled. That is not a network fault and no amount of retrying
the same call fixes it.

## What the sound is, and what it is forbidden from doing

The full write-up is `docs/design/TORUS_GEOMETRY.md` §5. The one-paragraph
version: the resonarium's bedrock map is `110·2^(λ/180)`, one octave per 180°,
i.e. exactly **20/3 cents per degree** — so the interval between two bodies'
drones is `2^(Δ/180)` and every classical aspect is an exact multiple of **200
cents**. The major-aspect family is the whole-tone scale. That was true the
day 78dfde4 landed; nobody designed it.

Verified before building on it, and pinned in `test/resonance.test.ts`:
100,000 randomized exact-aspect longitude pairs driven through the shipped
formula, worst deviation from the 200¢ grid **< 1e-9**.

The constraints the audio observes, all of which were binding:

- **The seed is identity.** The tab consumes a persisted `SoundtrackSpec` and
  never mints one. `canonicalizeChart` and everything feeding it is untouched.
- **`bedrock_hz` is natal-only**, so it cannot supply a drone for a body at
  time *t* — which is what the time scrub needs. `lib/resonance.droneHz`
  mirrors the engine's per-element map rather than editing a parity-locked
  engine to expose it, and the first test in `resonance.test.ts` drives a real
  chart through both paths demanding **exact** equality. That test is the
  anti-drift lock; if it ever fails, the mirror moved.
- **`bedrock_hz` is COMPACTED, not padded.** Only keys present on the chart
  are emitted. `asc` and `mc` hold indices 10 and 11 despite not being
  selectable bodies, so North Node and Chiron are at **12 and 13** — and every
  index shifts down if an earlier body is absent (Chiron under Moshier). A
  hardcoded index would silently sound the wrong planet. `natalDroneIndex`
  replays the presence filter, and `lib/soundtrackStore.ts` persists the
  seed-chart **key list** next to the spec so a later chart cannot re-pair a
  stored `bedrock_hz` with a different presence set.
- **Lilith sounds, but carries no natal tone.** It has no canonical seed key
  and was not given one. Its transiting drone is as legitimate as any other
  (the map is a property of angles), but there is no natal note to reference,
  and the readout says so in the reader's own words.

## One correction to the brief, recorded because it changed the build

`|f_A − f_B|` collapsing to zero at conjunction is right, but it is **not a
beat at the other aspects** — at opposition it is literally `f_B`, a wide
interval. And only conjunction (1:1) and opposition (2:1) are rational under
this map; the rest are `2^(k/6)`, irrational, with no low-order harmonic
coincidence and therefore no beating signature at all. Hence: bell at every
crossing (pitched at the aspect angle through the same map, two octaves up,
detuned from `mulberry32(seed32)`), and sawtooth-through-a-lowpass drones so
the opposition's 2:1 still locks audibly. Sine drones would have made the
opposition silent-of-signature.

## Persistence, and the intention that is wired to nothing

`lib/soundtrackStore.ts` is new and holds `aae.soundtrack`: the whole spec plus
the seed-chart key list, keyed by the same birth identity fields the store's
`BIRTH_FIELDS` uses (label excluded — renaming a chart must not re-deal it).
Hand_off has said "persist the whole spec" since 78dfde4; nothing did until now.

**`intention` is still not wired.** `SoulProfileModal.tsx` holds one in local
component state and passes it nowhere, so the spec is derived with `""` and the
field is the chart's alone. When it is eventually wired, note that changing an
intention is *meant* to re-deal the field — it is part of the identity, not a
modifier of it — so it needs a deliberate UX, not a text box that silently
re-seeds someone's soundtrack.

## Verification

| gate | before | after |
|---|---|---|
| `frontend` tests | 64 | **79** (+15) |
| `packages/astra-core` tests | 86 | **86** (parity vectors unmoved) |
| `npm run build` (tsc -b && vite) | clean | clean |

Bundle proof — the whole point being that the engine used to be absent. Three
resonarium-only string literals (`outside the cross-substrate domain`, `chart
needs at least`, `must be a finite number or string`) and the bedrock map
itself are **present** in `dist/assets/index-*.js` after, and **absent** from a
clean build of `8e9e808` (built in a throwaway worktree to measure it):

```
main chunk raw : 441,560 -> 452,222   +10,662 B  (+2.42%)
main chunk gzip: 143,013 -> 146,998   + 3,985 B  (+2.79%)
precache total : 6600.96 -> 6611.60 KiB
```

No new dependency; `package.json` is untouched.

## Still open (unchanged by this session)

1. **Production is behind and unverified.** `dba3e1b` live vs `8e9e808` on
   main, plus this PR. The pre-flight over env/compose/docker/nginx was clean
   across the whole delta — no new variable is required. Deploy needs the SSH
   key and `ops/origin.env`, which live only on the operator's machine.
2. **CodeQL alerts 19 / 5 / 4** — deliberate masks, still awaiting the
   operator's dismissal. Permission-blocked from every agent seat so far.
3. **The soundtrack has no player of its own.** The Torus tab sounds a *pair*.
   Nothing yet sounds the full 14-drone natal field, which is what the
   resonarium was actually built for.

---

# SESSION 36 — 2026-08-25 (ran in parallel with session 35's close, then deployed)

## Start here

**Everything is shipped.** `main` = `origin/main`, CI green (5 consecutive
through `dba3e1b`), production HEAD = `dba3e1b`, both containers healthy,
verified from OUTSIDE, plus one real generated reading. Production trails main
only by this close-ritual commit (docs). There is no deploy question pending —
session 35's §THE DEPLOY QUESTION was answered the same day it was written.

```
dba3e1b  Security pass: linear regexes, escaped quotes, CDN proves itself   DEPLOYED
78dfde4  The personal soundtrack gets its engine: one seed, three substrates DEPLOYED
```

The verification that backed the deploy, so the next session can re-run it:
pre-flight diff `a8c2b34..HEAD` over env/compose/docker/nginx was EMPTY (no new
vars, gotcha #3 moot); ff-only pull + rebuild; then externally: health
`ok/swiss-files/llm`, bundle `index-CUMyqnHz.js` (was `index-BhuUU9_T.js`),
spread Literal 12, replay handler answers, apex byte-identical to
`landing/index.html`, and `/api/ai-ask` returned live Haiku prose for the
operator's chart (Sun 228.9365° Scorpio/9th). `bash ops/production_report.sh`
re-derives most of this in 40 seconds.

## The engine (`78dfde4`)

The "personal soundtrack" is NOT music — the operator's framing: a holistic,
tonal, suggestive sound effect from the user's personal inputs. Chart
longitudes → bedrock drones (110–440 Hz), asc + aspect geometry → binaural
carrier/beat, intention folds into the seed.

- `packages/astra-core/src/resonarium.ts` — third implementation of the
  `natal_seed.{py,js}` contract: port + `seedChartFromResponse()` adapter +
  `personalSoundtrack()` composite. Locked by `parity/resonarium-seed.json`
  (generated from natal_seed.py — the reference — by `gen_parity_vectors.py`,
  guarded by `--check`, enforced by `test/resonarium.test.ts`).
- **Adapter contract** (changing any of this re-deals every seed): canonical
  bodies only — South Node, Lilith, PoF excluded; North Node IS the true node
  (`ephemeris.py:135`); `aspects_sum` = explicit-loop sum of separations in
  engine order; `house_cusps_hash` = sha256 of 6-dp cusps, first 16 hex.
- **Persist the whole SoundtrackSpec with the profile.** The seed is identity;
  re-derivation under a changed engine re-deals the field, and bedrock
  re-derived on another substrate can move in its last bits.
- Deliberately NOT ported: sentinel overlay, ghost placement, trace/redact —
  instrument-only until a UI needs them. **No player UI exists.** The engine is
  exported from @astra/core but nothing imports it yet, so Vite tree-shakes it
  out of the served bundle — wiring the UI is what makes it audible.

## Three float traps, all measured (full detail in `78dfde4`'s message)

1. CPython ≥3.12 `sum()` is Neumaier-compensated — diverges from JS `reduce`
   in the last bits. Parity contracts must pin an explicit accumulation loop.
2. `((x % 360) + 360) % 360` loses a ulp on in-range values (even the demo
   chart's 215.92). Python `%` is exact there; both JS implementations now use
   fmod-plus-conditional-add.
3. libm `pow` is not bit-identical across substrates → bedrock compares within
   abs 1e-9 (the boundary tests/test_biosentinel.py already drew); everything
   built from `+ * / %` compares `===`. The vector file's `match` block is the
   per-layer contract in machine-readable form.

## Security (`dba3e1b` + repo settings)

Code, now live: `tts.py` speakable() regexes linear (were polynomial behind a
25k cap — seconds of CPU per hostile request; also fixed a latent
heading-eats-next-line bug); `deckPress.ts` `esc()` escapes quotes (attribute
breakout XSS in the print window); cymatic HTML three.js tag carries SRI
(hash byte-identical to the vendored copy; serve.py rewrite unaffected);
`SECURITY.md` at root.

Settings, applied via API and verified: branch protection on `main`
(force-push + deletion blocked, NO gates on direct pushes), private
vulnerability reporting ON. Already on: secret scanning + push protection,
Dependabot ×3, CodeQL, gitleaks, read-only workflow token.

- **Plan-gated, do not retry**: `secret_scanning_validity_checks` and
  `secret_scanning_non_provider_patterns` — the PATCH returns 200 and silently
  keeps them disabled (paid Secret Protection add-on).
- **OPERATOR ACTION**: CodeQL alerts 19/5/4 (clear-text-logging) are false
  positives — each prints a deliberate `first6…last4` mask. Dismissal via API
  was permission-blocked from this seat:
  `gh api -X PATCH repos/9x25dillon/astro_caster/code-scanning/alerts/{19,5,4} -f state=dismissed -f dismissed_reason="false positive"`

## Fresh gotchas (session 36)

1. Cloudflare 403s `Python-urllib` on BOTH hostnames — documented in
   m5_preflight.py and it still bit. Any scripted probe needs a User-Agent.
2. The chart route is `/api/generate-chart`, not `/api/chart` — the 404 body
   saved as a "chart" reads back as `{"detail":"Not Found"}` and fails ai-ask
   with a confusing 422. Grep `@app.post` before probing.
3. `AAE_DEV_TOKEN`'s entitlement resolves to FREE tier — a dev-token reading
   proves the LLM path but exercises Haiku only. An oracle-tier deploy proof
   needs an oracle-entitled token (see `dev.py unlock | token`).
4. Two sessions shared this working tree today. Commits landed under session
   36 mid-flight (that is why handoff files "vanished" from `git status`).
   Protocol: `git fetch && git status -sb && git log --oneline -3` before every
   commit, and treat a file disappearing from status as a signal someone else
   committed it, not as noise.

## Open threads / next candidates

1. **Soundtrack player UI** — the engine is dormant until something calls
   `personalSoundtrack()` and sounds it (Web Audio; roadmap §4.4 constraints:
   audio-session handling, keep-awake, no background audio, photosensitivity
   gate carries over). Design the persistence first: the spec is identity.
2. **Eval finding 4** (design before re-recording): cassettes need an
   accepted-findings third state. Then finding 3 stays a correctly-caught
   model error, and the 8 stale cassettes get re-recorded (~$1.50).
3. **CodeQL dismissals** — operator, one command (above).
4. Carried: cancel→refund ordering, APK import flow, optional wallet.
5. `NEXT_SESSION.md` §2/§3 are superseded (CI is green; production is NOT
   behind) — its §0/§1/§5/§6 orientation remains the right first read.

---

# SESSION 35 — 2026-08-25

## Start here

**`main` is at `dba3e1b`, pushed, CI green. Production is at `a8c2b34` and
healthy — 11 commits behind, and the delta now carries TWO SECURITY FIXES.
Read §THE DEPLOY QUESTION before anything else.**

CI is green on `origin/main` for the first time since `fccd6be` on 2026-08-19.
Four consecutive successes: `49f01d7`, `9e35ab6`, `3f93960`, `dba3e1b`.

```
dba3e1b  Security pass: linear regexes, escaped quotes, a CDN that proves itself  ] session 36,
78dfde4  The personal soundtrack gets its engine: one seed, three substrates      ] in parallel
3f93960  A run still in flight is not a failing run
9e35ab6  Hand_off + journal, session 35
93c244e  The Studio can paint the whole deck, not just the trumps your chart carries
49f01d7  A report that names which layer is green, and the opener that explains why
9bdebfa  Let the Celtic Cross assertion follow the breakpoint, not the project name
42a2301  Hand_off: the remote is one branch ...                <- session 33's last
a8c2b34  Hand_off + journal, session 32                        <- WHAT PRODUCTION RUNS
```

Green, and this time say which layer: **local** 660 backend / 73 core / e2e on
both Playwright projects / `tsc -b && vite build` clean, **CI** green on
`origin/main` (`dba3e1b`), **production** answering `/api/health` with
`swiss-files` and `ai.mode=llm` — but running none of the above. Local dev
servers are DOWN. OpenRouter balance unspent by session 35; no model was called.

### Read in this order

1. `git fetch && git status -sb`, then `bash ops/production_report.sh` — it
   answers most of this section in ~40 seconds and it now reports an in-flight
   CI run as a NOTE rather than a failure (`3f93960`).
2. `docs/progress/NEXT_SESSION.md` — session 34's orientation doc, updated at
   the close of session 35. §1 (the three truths) and §5 (the eight gotchas)
   are the load-bearing parts.
3. §THE DEPLOY QUESTION below.

### ⚠️ Two sessions ran on 2026-08-25, in parallel

Session 35 (this section) did the CI fix, the Studio picker and the ops tooling.
**Session 36 ran concurrently** and landed `78dfde4` + `dba3e1b` — the
resonarium soundtrack engine and a CodeQL security pass. Its work appeared in
this session's working tree mid-flight as uncommitted files, which is exactly
what a parallel session looks like from the inside: **files you did not write,
in a tree you thought was yours.** Session 35 left them alone and said so;
session 36 committed them cleanly. As of this writing session 36 had written no
Hand_off section and no journal entry — check whether that has since landed
before assuming its context is lost, and see `[[resonarium-soundtrack-engine]]`.

**If you see unexplained edits in the working tree, do not stage them.** `git
add -A` in a parallel-session world is how one session's half-finished work
ships under another session's commit message.

---

## What was actually wrong, and why nobody saw it

CI had been red on `origin/main` for **15 consecutive runs**, since `983c0f5`
(2026-08-20T05:44Z). One job, one test, deterministic:

```
E2E — Playwright:  arcana-offline.spec.ts:79  [mobile-chromium only]
expect(new Set(areas).size).toBe(10)      Expected: 10   Received: 1
```

`theme.css:2304` collapses the Celtic Cross to one column below 720px on
purpose — *"ten panels across four columns on a phone is four unreadable
ones"* — and `mobile-chromium` is a 412px Pixel 7. The assertion was
unsatisfiable there **by construction**, from the moment `1c18a1e` landed. The
CSS was right; the test was wrong.

The fix asks the browser the same question the CSS asks:

```ts
const stacked = await page.evaluate(() => matchMedia("(max-width: 720px)").matches);
```

**Not the project name.** Pinning an assertion to `mobile-chromium` would have
gone stale the day a project is renamed or a third viewport is added; reading
the breakpoint keeps the test and the stylesheet arguing about the same number.
Neither branch is weakened — desktop still demands ten distinct areas and no
implicit placement, mobile asserts the honest single-column stack, so a card
that keeps a tableau area on a phone (the override missing a panel) still
fails. The original bug this catches — a card dropping into the implicit grid
with no error, symptom a crooked spread — is caught on both sides now.

**The fix already existed.** Session 34 wrote it, verified it, wrote a whole
orientation document about how CI-red-while-reporting-green happens — and
closed without `git commit`. Five more days of red. See §SESSION 34.

---

## The Studio picks from the whole deck now (`93c244e`)

The ask: render the trumps alongside the Major Arcana in the Studio. The probe
said the engine was already there and only the surface disagreed:

| layer | before |
|---|---|
| `tarot_models.py:206` | *"One card id (major or minor)"* |
| `deck_art.build_card_prompt` | resolves against all 78 in `CARD_BY_ID` |
| `plate_art` | delegates to the same function — no major-only branch |
| `GalleryPanel.tsx:56` | already counts *"N of 78 cards collected"* |
| `ArcanaModal.tsx:1216` | offered `sig.links` — the ~12 trumps the chart carries |

So the Gallery had always been counting toward a deck the picker could not
reach. Three notes for whoever touches this next:

- **`FULL_DECK_IDS` is now exported from `@astra/core`.** It is the same list
  `weightedDraw` deals from, so the picker and the draw cannot drift apart.
  Do not build a second card list anywhere.
- **`deckCatalog()` in `client.ts` is a bare `import("@astra/core")`, not
  `core()`.** `core()` awaits `initSwisseph`; a list of card names has no
  business booting a WASM ephemeris. Same module, same chunk, no WASM. It
  rejects silently — the signature group alone is still a working picker.
- **Signature trumps are excluded from the Major Arcana group** so no id is
  offered twice; they sit above, labelled by the body that carries them.

Known and deliberate: a minor gets **no `Personal resonance:` line**, because
`_natal_context` looks the card up in the signature links and minors are never
there. The brief is still chart-conditioned — the seed carries the signature
and the palette carries the querent's dominant element — but if the minors
should say something natal, that is a design decision, not a bug to patch.

---

## THE DEPLOY QUESTION — the answer changed today, twice

Sessions 33 and 34 both said *"production is behind `main` on purpose, do not
deploy to catch up."* **That advice expired with `93c244e`, and `dba3e1b` made
it urgent.** The delta:

```
a8c2b34..dba3e1b   11 commits

  SECURITY (session 36, dba3e1b) — the reason this is no longer optional:
    frontend/src/lib/deckPress.ts   esc() escaped & < > but NOT quotes while
                                    feeding double-quoted attributes — an
                                    attribute-breakout XSS in the print window
    backend/tts.py                  both speakable() regexes polynomial on
                                    whitespace runs; seconds of CPU per request
                                    at the 25k cap
  FEATURE (session 35, 93c244e)   the Studio's 78-card picker
                                    frontend/src/{api/client.ts,components/ArcanaModal.tsx}
                                    packages/astra-core/src/{tarot,browser,index}.ts
  ENGINE  (session 36, 78dfde4)   packages/astra-core/src/resonarium.ts — no UI
                                    reaches it yet; inert in production
  the rest: docs, evals, tests, ops tooling, parity vectors, SECURITY.md
```

**Pre-flight is already run and clean** — nothing in `.env.example`,
`docker-compose.yml`, `frontend/nginx.conf` or either Dockerfile changed across
all eleven commits, so `[[compose-env-passthrough-trap]]` does not apply and no
new variable is required. Re-run it anyway; it costs one command:

```bash
git diff a8c2b34..HEAD -- .env.example docker-compose.yml \
    frontend/nginx.conf frontend/Dockerfile backend/Dockerfile
```

Then §7 of `NEXT_SESSION.md`: `git pull --ff-only` + `docker compose up -d
--build`, `set -e` so a failed fast-forward aborts before the rebuild. Verify
from outside afterward (§6), then **buy one real oracle reading** — a deployed
commit is not a working product, and ten cents is the only probe that proves a
subscriber gets what they paid for.

It was not deployed by session 35 because shipping is the operator's call, not
the session's. **Ask, then do it.**

---

## Open work, in the order I would take it

1. **Deploy** (above) — two security fixes are sitting on `main`.
2. **Eval finding 4**, the design work: the suite has nowhere to put a *true*
   finding, so a cassette carrying one genuine model error cannot be committed
   at all. It needs a third state — accepted findings, recorded with a reason,
   not fatal but visible in the report. `evals/regressions/` is the same
   discipline pointed the other way. **Design it before re-recording.** Finding
   3 is a real model error and will not be "fixed". See §SESSION 33.
3. **The eight stale cassettes** (~$1.50), only after 2. Check the balance the
   right way — `/api/v1/credits`, never `/api/v1/key`
   (`[[openrouter-credit-vs-key-limit]]`). Production and `backend/.env` share
   the key, so recording draws down the balance that serves paying readers.
4. **Optional, from session 35's Studio work:** a minor-arcana brief has no
   `Personal resonance:` line, because `_natal_context` looks the card up in the
   natal signature and minors are never in it. The brief is still
   chart-conditioned (the seed carries the signature, the palette carries the
   dominant element). Whether a minor should say something natal — and what — is
   a design question for the operator, not a gap to patch.

---

## Standing instructions this session learned the hard way

- **Name the layer.** "Green" alone is the failure mode
  `NEXT_SESSION.md` exists to prevent. Local, CI, and production drift
  independently; say which one you measured.
- **The working tree is not the repo.** Session 34's fix was correct, complete,
  and invisible to everyone for five days because it was never committed. Close
  the ritual: `Hand_off.md` + a narrative `WORK_JOURNAL.md` entry, **both
  committed and pushed to `main`**, dev servers down.
- **Never `git add -A` blind.** Sessions run in parallel here (see §Start here).
  Stage paths you touched.
- **Read the breakpoint, not the project name.** When a test and a stylesheet
  disagree, make them argue about the same number. Pinning an assertion to
  `mobile-chromium` passes today and lies the day a viewport is added.
- **Probe before designing.** The Studio ask looked like a feature and was a
  dropdown: the request model already documented `card_id` as *"major or
  minor"*, the prompt builder already resolved all 78, and the Gallery was
  already counting toward 78. Three greps decided the shape of the work.

---

# SESSION 34 — 2026-08-20 (reconstructed on 2026-08-25 from what it left behind)

**This section was not written by session 34.** It closed without the ritual:
no Hand_off entry, no journal entry, nothing committed. What it did is
recoverable only because three artifacts were left in the working tree, and
they are good ones:

- `docs/progress/NEXT_SESSION.md` — the session opener. The three-layer
  local/CI/production table in §1 is the most useful thing written about this
  project's workflow; §5's eight gotchas are each a session someone already
  paid for. **Read it.**
- `ops/production_report.sh` — runs every gate CI enforces, probes production
  from outside, diffs the deployed SHA against `main` and flags any non-docs
  file in the delta. `bash ops/production_report.sh [--e2e] [--ssh]`.
- the fix to `frontend/e2e/arcana-offline.spec.ts` — correct, complete, and
  uncommitted.

It found the CI failure that four sessions had been reporting as "green", named
the exact mechanism (the three truths drift apart independently), built the tool
that measures all three at once, fixed the test — and then none of it existed
anywhere but one laptop.

**The lesson is the same one session 33 wrote down, one turn further along.**
Session 33: *the repo is not the product.* Session 34: *the working tree is not
the repo.* A fix that is not committed is indistinguishable, from every other
vantage point in the world, from a fix that was never written. The close ritual
— `Hand_off.md` + a narrative `WORK_JOURNAL.md` entry, **both committed to
`main`** — is not paperwork; it is the step that makes the work exist.

---

# SESSION 33 — 2026-08-20

## Start here

**`main` is at `5efca9d`, pushed. Production is at `a8c2b34` and healthy.**
**`origin` now has exactly one branch.**

```
5efca9d  Salvage session 26's Android findings before the branch is deleted
e9cadef  Hand_off + journal, session 33
de3cbd8  Three ways the checker called a correct reading a liar
a8c2b34  Hand_off + journal, session 32                     <- WHAT PRODUCTION RUNS
```

**Production is three commits behind `main` ON PURPOSE — all three are
docs and eval-only, nothing a reader touches.** Do not deploy to "catch up";
deploy when there is product code to ship. Re-read §THE DEPLOY below first.

Green: **659 backend**, **11/11 evals on replay**, ruff clean. Local dev servers
are DOWN (`./run.sh` to raise them); the production stack is UP.

OpenRouter balance **$9.50** (one oracle verification reading, $0.0995).
Production and `backend/.env` share the key — see the warning at the end.

### The five-minute orientation, in order

1. `git fetch && git status -sb` — trust nothing above this line until you have.
2. `curl -s https://app.astra-arcana.com/api/health | jq` — is the product alive.
3. Read §THE DEPLOY for how to date what is actually running, then §THE ONE
   THING TO PICK UP for the work.

---

## THE DEPLOY — what was actually wrong, and how it was measured

The origin was at **`bbd9422`, 2026-08-15** — one commit *older* than session
29's own handoff. Everything sessions 30, 31 and 32 built had been sitting on
`main` unshipped. In production that meant, for five days:

- every chart reading truncated (`finish_reason` was never read),
- every arcana reading cut short at a spread-blind ceiling,
- 83% of a supporter's token budget spent on reasoning nobody sees,
- and the fallback to offline prose was **silent**, because the build that says
  so is exactly the one that wasn't deployed.

**The deployment was dated from OUTSIDE, before touching the box**, and the
technique is worth keeping — the API tells you its own version if you ask it the
right question:

```bash
# the SpreadType Literal, read out of a 422
curl -sS -X POST https://app.astra-arcana.com/api/tarot-reading \
  -H 'Content-Type: application/json' -d @req.json | jq -r '.detail[0].msg'
# -> "Input should be 'daily', 'three_card', ..."   <- 9 members = pre-session-31

# a route that does not exist yet answers differently from one that does
curl -sS https://app.astra-arcana.com/api/replay/anykey
# {"detail":"Not Found"}                  <- FastAPI router: route absent
# {"detail":"Replay sync needs a key..."} <- the handler: route present
```

That distinction is the whole trick. A 404 from the router and a 404 from a
handler look identical in the status code and nowhere else. Frontend dating is
the same idea against the bundle: fetch `/assets/index-*.js` and grep for a
string a known commit introduced (`celtic_cross`, `preferOffline`,
`Sync remembered readings`), and `tz-warning` in the CSS. **Grep the CSS class,
not the TS identifier** — `offsetWarning` is minified away, the class name
survives.

### Pre-flight, which is the part that made it a non-event

```
git diff 0b718a5..HEAD -- .env.example docker-compose.yml \
    frontend/nginx.conf frontend/Dockerfile backend/Dockerfile
```

**Empty except dependency bumps.** No new required env var, so
`[[compose-env-passthrough-trap]]` did not apply. The four vars session 30
introduced (`AAE_REPLAY_DB`, `AAE_REPLAY_TTL_DAYS`, `AAE_REPLAY_MAX_CHARS`,
`AAE_REASONING_EFFORT`) all default in code, and `replay.db` self-creates with
`CREATE TABLE IF NOT EXISTS` on `backend-data:/app/data`, which is the persisted
volume. Do this diff first every time; it is the difference between a pull and
an outage.

### The deploy itself

```bash
ssh -i ~/.ssh/astra_hetzner astra@$ORIGIN_IP \
  'set -e; cd /home/astra/astro-aae; git pull --ff-only origin main;
   docker compose up -d --build; docker compose ps'
```

`set -e` matters: a failed fast-forward must abort *before* the rebuild, or you
serve a half-updated stack. Repo path on the box is **`/home/astra/astro-aae`**,
tree clean, both containers healthy. The frontend publishes **80 and 443**, so
the TLS-to-origin question in `DEPLOY.md` §3.3 was resolved with a real 443
listener at some point — that section is stale and reads as unresolved.

### Verified after, from outside

| probe | before | after |
|---|---|---|
| `celtic_cross` / `tree_of_life` / `horseshoe` | 422 | **200 — 10 / 10 / 7 cards** |
| `/api/replay/{key}` | router 404 | **401, handler message** |
| bundle | `index-C5esyc0B.js` | **`index-BhuUU9_T.js`** |
| apex landing | identical to repo | **still identical** |

The apex staying byte-identical is not cosmetic — the signed APK's
`PURCHASE_URL` is the immutable string `https://astra-arcana.com/#support`.

### The proof that mattered: a real paid reading

Oracle tier, live API, the operator's own chart (1987-11-11 13:09, UTC-8,
34.0591/-117.9124 — Aquarius rising, Scorpio Sun 9th, Leo Moon 6th):

```
1,203 words   all five oracle sections   ends on a finished sentence
source=llm   model=anthropic/claude-opus-5   offline_reason=None
run through all six eval checks -> ZERO findings
```

**A deployed commit is not a working product.** Everything above the last line
proves the code shipped; only the reading proves a subscriber gets what they
paid for. Spend the ten cents.

⚠️ **`~/Downloads` holds charts at three different offsets** — `+7`, `-7` and
`-8` — and two different times (10:23 AM in the older files, 1:09 PM in the
newer). The operator confirmed **1:09 PM** and the correct offset is **-8**
(November 1987 is past DST end). The older readings describe a different sky.
TZ-3 is live now and will reject `+7` outright, so this stops accumulating.

---

## What was fixed in the checker (findings 1 and 2, `de3cbd8`)

`_RISES_IN` allowed thirty characters of anything between "rising" and a sign,
so it bound the word to a sign owned by someone else. The gap is now the words
that actually bind — "in", "into", "sign is", "sign," — plus two ownership
guards: a body within twelve characters *in front of* the verb owns it, and a
sign followed immediately by a body belongs to that body.

**The guards are safe because nothing goes unjudged.** "Pluto rising in Scorpio"
is still judged by `_IN_SIGN` against Pluto; "your Capricorn Saturn" by
`_SIGN_FIRST` against Saturn. A test puts Pluto in the wrong sign and asserts
the finding comes back, against Pluto.

`check_aspect_grounding` treated an empty aspect table as a fabricated aspect.
`ephemeris.NON_ASPECTING` (now public) excludes the derived points on purpose —
the South Node mirrors the North exactly — so the chart holds no entry for ANY
South Node pair. Such a pair is now UNJUDGEABLE and silent. The set is asked of
the engine, never transcribed.

**And the gap that let both live:** `tests/test_evals.py` built its cases
WITHOUT aspects while `runner.main()` passed them, so `check_aspect_grounding`
ran on the operator's machine and **never in CI**. Both entry points now demand
the same things of a cassette.

---

## The remote was reconciled down to one branch

Five branches existed. **Four were pure ancestors** — 0 commits ahead of `main`,
identical trees — leftovers from merges that rebased them to new hashes, which is
the shape `[[stacked-pr-orphan-trap]]` describes. Deleting them removed labels
and nothing else.

The fifth, `session-26-handoff`, held two real commits. Its journal entry was
already in `main` byte-identical; its Hand_off section was 150 lines against
main's 78. Those extra lines split cleanly: durable Android technique (now §6 of
the release section, `5efca9d`) and a v1.0.3-era "Start here" that would have
pointed the next reader at a superseded release. Rebasing it would have replayed
a 2026-08-12 handoff onto a 2026-08-20 one in the same region of the same file.

**Nothing was destroyed.** Before deletion it was tagged and the tag pushed:

```bash
git checkout archive/session-26-handoff     # the whole branch, still on GitHub
# tip 2efae4a, parent 6708e29, forked from dc2e3d5
```

**The order is the lesson: salvage → verify the salvage is on `origin/main` →
archive → delete.** Verify *after* pushing, not before. Deleting on the strength
of a check made three commits ago is how the trap gets sprung.

---

## THE ONE THING TO PICK UP (unchanged from session 32, minus the two fixed)

**Findings 3 and 4 are still open, and 4 is the design work.**

- **Finding 3** — *"With Mars square your Ascendant"* where the chart has an
  Opposition at 3.82° is a REAL model error, and the check catches it. It will
  not be "fixed".
- **Finding 4** — the suite has nowhere to put a true finding. `evals/runner.
  evaluate` requires every cassette to pass, so a recording containing one
  genuine model error cannot be committed at all. The only moves are re-rolling
  until the model happens not to err — which converts a quality gate into a slot
  machine — or blunting the check. **Neither is acceptable.** The suite needs a
  third state: a cassette may carry *accepted findings*, recorded with a reason,
  that do not fail the build but stay visible. `evals/regressions/` is the same
  discipline pointed the other way. **Design this before re-recording.**

Then re-record the eight stale cassettes (~$1.50). Check the balance the RIGHT
way first — `/api/v1/credits`, never `/api/v1/key`; see
`[[openrouter-credit-vs-key-limit]]`.

⚠️ **Production and `backend/.env` share the OpenRouter key** (`sk-or-…f973`).
Cassette recording draws down the same balance that serves paying readers, and
at zero the paid tiers fall back to offline prose.

---

# SESSION 32 — 2026-08-20

## Start here

**`main` is at `847f419`, pushed, clean, all suites green. Nothing is in flight.**

```
847f419  Stop extended thinking from eating the ceiling the reader paid for
9386618  Rank the ask path's aspects the way the arcana path does
```

Green: **644 backend**, **11/11 evals on replay**, 69 astra-core, 50 frontend,
106 desktop e2e (6 skipped), ruff clean. **Servers are DOWN** (`./run.sh`).

OpenRouter balance **$9.94** at close (topped up during the session).

---

## THE ONE THING TO PICK UP

**Eight eval cassettes are still stale** — they predate
`reasoning: {"effort": "medium"}`. Re-recording was ATTEMPTED and then reverted,
because three of the first three recordings failed. Do NOT simply re-run
`--record` until the four items below are settled: you will get the same
failures, and re-rolling until green is how a suite stops meaning anything.

**The reasoning fix itself is confirmed working.** `supporter:whole-chart`
recorded at **3,294 tokens / 886 words / finish=stop**, against **6,320** for
the same case before. That is the fix doing exactly what was measured.

### Finding 1 — `_RISES_IN` binds "rising" to a sign belonging to someone else

`evals/checks.py`. Two live false positives:

- *"**Pluto** rising in Scorpio, trine to Sun and Mercury…"* → reported as
  "Ascendant in Scorpio". Pluto **is** in Scorpio; the Ascendant is Libra.
- *"…rising, the locked wisdom of your **Capricorn** [Saturn]…"* → reported as
  "Ascendant in Capricorn".

The regex takes any "rising"/"rises" within range of a sign name and attributes
it to the Ascendant. `_binds` guards the body-in-sign matcher against exactly
this and `_RISES_IN` has no equivalent guard. Note the fix is NOT "require no
other body between" — in case one the body (`Pluto`) sits *before* "rising",
which is the same backwards-pointing shape as the appositive bug fixed
yesterday (`_is_referent`).

### Finding 2 — the aspect map inherits the engine's pair coverage

*"the Leo South Node conjunct Midheaven"* → reported as "no major aspect between
them". **They are 3.80° apart** (South Node 127.484°, Midheaven 123.686°), well
inside the 8° conjunction orb. The reading is right; `chart.aspects` simply
contains no entry for that pair.

**Establish first whether the engine excludes node×angle pairs deliberately**
(`astrology.py` / `ephemeris.py` aspect generation) before touching the check. If
the exclusion is intentional, `check_aspect_grounding` must treat a pair the
engine never considers as UNJUDGEABLE — silent — rather than as fabricated.
Absence of evidence is being read as evidence of absence.

### Finding 3 — one REAL model error, and the check caught it

*"With Mars square your Ascendant…"* — the chart has **Opposition, orb 3.82°**
(separation 176.18°). Right pair, wrong aspect. This is `check_aspect_grounding`
working precisely as intended, on the subtle half it was built for.

### Finding 4 — the suite has no way to accept a known-bad generation

Findings 1 and 2 are checker bugs and will be fixed. Finding 3 will not: models
occasionally get an aspect wrong, and `evals/runner.evaluate` requires **every**
cassette to pass. So a recording containing one genuine error cannot be
committed at all, and the only ways out are to re-roll until the model happens
not to err — which quietly converts the suite into a slot machine — or to
weaken the check.

Neither is acceptable. The suite needs a third state: a cassette may carry
**accepted findings**, recorded explicitly with a reason, that do not fail the
build but stay visible in the report. `evals/regressions/` already holds the
inverse idea (fixtures asserted to FAIL); this is the same discipline pointed
the other way. **Design this before the next re-record.**

---

## How to re-record, once the above is settled

```bash
cd backend
.venv/bin/python -m evals.runner --record            # all 11, ~$1.50
# or one at a time while iterating:
.venv/bin/python -m evals.runner --record --case supporter:angles
```

The three `free__*` cassettes are ALREADY accurate — haiku is deliberately sent
no reasoning parameter — so only these eight need it: `supporter:whole-chart`,
`supporter:angles`, `supporter:pluto-8th`, `oracle:whole-chart`,
`oracle:angles`, `oracle:pluto-8th`, `supporter:celtic-cross`,
`oracle:twelve-house`.

**Check the balance the right way before starting** — a 402 mid-run leaves the
recording half-done:

```bash
K=$(grep -E '^AAE_AI_API_KEY=' backend/.env | cut -d= -f2-)
curl -s https://openrouter.ai/api/v1/credits -H "Authorization: Bearer $K"
```

`/api/v1/key` is the WRONG endpoint: it reported $9.94 remaining on the key's
own $20 limit while the account balance was −$0.06 and every call was 402ing.

---

## Standing traps, shortest form

1. **`SE_EPHE_PATH` unset ⇒ Moshier ⇒ no Chiron.** Any script outside pytest
   must set it. Tell: `chart.meta["ephemeris"]`.
2. **The reasoning parameter is an ALLOW-LIST.** On haiku it TURNS THINKING ON
   (0 → 1,127 reasoning tokens, 990 → 234 words).
3. **Verify what a sentence SAYS, not just whether its numbers are right.** Two
   "confirmed hallucinations" this week were the model being careful and the
   checker reading past a possessive or an appositive.
4. **Probe main for CONTENT before merging.** See the four merge shapes in
   `[[stacked-pr-orphan-trap]]`.

---

# SESSION 31 — 2026-08-19

## Start here

**Merged to `main`.** Three commits of new work, plus session 30's handoff and
TZ-3, which had never reached `main`.

```
b5d25bc  The reading can finally see the aspects, and the four bodies nobody mentioned
7f23b34  Every arcana reading was being cut short, not just the big spreads
1c18a1e  The Celtic Cross gets a cross, and three spreads come out of hiding
d6c0e43  TZ-3: the offset box now checks itself against the longitude below it
96f7da8  Hand_off, session 30
```

Green at close: **613 backend**, **11/11 evals on replay**, **69 astra-core**,
**50 frontend**, **106 desktop e2e** (6 skipped by design), ruff clean, frontend
build clean. **Servers are DOWN** — `./run.sh` to bring them back.

Live-provider spend this session: **~$2.85** (two budget measurement rounds,
one question probe, three cassette recordings).

---

## ⚠️ The merge trap this session walked into — read before you merge anything

`origin/main` had **session 30's five commits already on it, at different
hashes**, rebased by a PR merge. Local `main` was stale and knew nothing about
it. The branch and `origin/main` therefore contained the same work twice over,
from git's point of view.

A plain `git merge origin/main` **conflicted** in `test_evals.py` (add/add) and
`theme.css` — not because the two sides disagreed about session 30, but because
this branch's LATER commits had edited the same regions. Hand-resolving those
is how a merge silently applies the same change twice.

**Probe for CONTENT, never for hashes:**

```bash
git diff origin/main <the-last-shared-commit> --stat   # empty => same tree
git merge-base --is-ancestor <that-commit> HEAD        # => it's already in here
```

Both held, which proves the branch already contained every line on `origin/main`.
The correct resolution was then `git merge -s ours origin/main` — keep this
tree exactly, record main as an ancestor so it can fast-forward — followed by
re-checking that the tree was byte-identical afterwards. It was.

---

## The bug that mattered most today

**Every arcana (tarot) reading the product has ever served was cut short**, and
not only the large spreads the operator reported.

`_ARCANA_BUDGET` was one flat number per tier — `{oracle: 2600, supporter:
1600}` — with no idea how many cards were on the cloth. A one-card daily draw
and a twelve-card house spread got the identical ceiling. Session 30 had left it
explicitly unmeasured, with a comment saying so.

Measured against the OLD prompt, cap lifted to 9,000:

| tier | spread | natural need | old cap | |
|---|---|---|---|---|
| supporter | daily (1) | 1,989 | 1,600 | cut |
| oracle | daily (1) | 3,199 | 2,600 | cut |

The smallest possible draw already overran. The continuation loop from session
30 hid it — three round-trips, whole prompt resent each time, remainder trimmed
at a sentence boundary. Quiet, expensive, permanent.

**Both halves were needed.** The prompt asks for a length that follows the
SPREAD (`tarot_prompts._LENGTH_BRIEF`, 220 + 90/card supporter, 320 + 130/card
oracle) and names one passage per position; the ceiling is fitted to token
observations with 1.30 headroom.

---

## What is in the branch

1. **Three traditional spreads** — `celtic_cross` (10), `horseshoe` (7),
   `tree_of_life` (10) — plus `planetary_seven`, `relationship` and
   `transit_pressure`, which had worked end-to-end in the backend for months and
   were never in the picker. All twelve now appear, grouped.

2. **Tableau geometry** (`frontend/src/lib/spreadLayout.ts`). Cross-and-staff
   for the Celtic Cross, three pillars for the Tree. Keyed by INDEX, never by
   label — the labels live in two engines and are re-wordable; the ORDER is
   pinned by the parity vectors. Below 720px it falls back to one column.

3. **The arcana completion guarantee** (`ai._arcana_budget`,
   `tarot_prompts.arcana_target_words`). Measured, fitted, pinned by
   `tests/test_arcana_budget.py` against 15 observations.

4. **Aspect-aware readings** (`tarot.aspect_prompt_lines`,
   `tarot.unsigned_body_lines`). The chart's aspects and the four bodies the
   signature omits, fed to the PROMPT only.

5. **`evals.check_aspect_grounding`** — catches an aspect the chart does not
   contain, and the subtler case of a real pair with the wrong aspect.

---

## Gotchas learned today

1. **A spread is declared in four places and only one fails loudly.**
   `weighted_draw` falls back to `three_card` for an unknown spread, so a
   `SpreadType` member with no positions deals three cards under a ten-card name
   — in BOTH engines. Two tests in `test_tarot.py` now assert the Literal
   matches `SPREAD_POSITIONS`, and that the TS engine's position COUNTS match
   Python's (parsed from the real file, so it cannot pass by being skipped).

2. **`SE_EPHE_PATH` unset falls back to Moshier, silently, and Moshier has no
   asteroids.** A standalone probe script does not load `.env`, so it computed
   charts with **no Chiron at all** and I reported a body count that was wrong.
   `conftest.py` pins this for pytest; anything run outside pytest must set it.
   Check `chart.meta["ephemeris"]` — it says `moshier` or `swiss-files`.

3. **Never rank aspects by raw orb.** A conjunction is allowed 8° and a
   semisextile 2°, so raw orb ranks a half-degree semisextile above a
   half-degree conjunction. Over 120 charts raw orb fills the eighteen sent with
   45% major aspects; orb ÷ that aspect's allowed orb gives 70%, same cost.
   **`ai._build_context` still uses raw orb on the ask path** — same argument
   applies, left alone because changing it invalidates nine cassettes.

4. **Tokens per word is a property of the RUN, not the tier.** One recorded
   reading wrote 1,939 words for 6,186 tokens where another wrote 1,937 for
   4,712 — same reading, more markdown. Fit ceilings to TOKEN observations;
   never infer one from a word target.

5. **A validation test can quietly stop testing validation.**
   `test_tarot_reading_rejects_bad_spread_and_date` used `"celtic_cross"` as its
   example of an unsupported spread. It is one now.

6. **The Sun and The Moon are trumps as well as bodies.** A Celtic Cross has
   positions that sit opposite one another, so "The Moon opposite The Sun" is
   two cards on a cloth, and the first cut of `check_aspect_grounding` reported
   it as a fabricated aspect. Both sides in card form is exempt; one side is
   still judged.

---

## Addendum — the ask path's aspect ranking (done, and what it uncovered)

`ai._build_context` now ranks by `astrology.relative_orb` too. The rule moved to
`astrology.py` beside `ASPECT_DEFS`; `tarot._relative_tightness` delegates to it,
so there is one rule and two callers. On the eval chart the eighteen sent went
from **6/18 to 13/18 major aspects**, swapping in Sun–Mercury, Sun–Pluto,
Mars–Saturn and Jupiter–Saturn for a handful of Lilith minors.

Re-recording the nine chart cassettes turned up **three defects that had nothing
to do with the ranking**, and all three were checks accusing correct readings:

1. **The eval suite graded cassettes against the wrong chart.** `runner.main()`
   loads `.env` when `--record`, so a recording used `swiss-files` — 17 bodies,
   40 major aspects. A REPLAY loaded nothing, fell back to **Moshier**, and got
   16 bodies and 33 aspects with **no Chiron at all**. Cassettes were being
   checked against a chart they had not been generated from, and CI ran the
   replay side. It surfaced as a false *"Jupiter conjunct Chiron — chart has no
   major aspect between them"* against a reading quoting the aspect list it had
   been handed. `runner.py` now pins `SE_EPHE_PATH` forced, as `conftest.py`
   does, and two tests assert `meta["ephemeris"] == "swiss-files"` and that
   Chiron is present. **Verified to bite.**

2. **`check_aspect_grounding` read past a possessive.** *"Lilith conjunct
   Pluto's SIGN"* is a claim about a sign — the model was being careful, writing
   "nearly kissing Pluto's sign" in the same paragraph — and the check called it
   a fabricated aspect. Lilith and Pluto are 12.02° apart AND both in Scorpio;
   every word was true. A trailing `'s` on the second body now exempts the match.

3. **`check_grounding` bound a sign to an appositive.** *"the unaspected Venus,
   ruler of your Ascendant, floating alone in Gemini"* places **Venus**, which
   is in Gemini. `_binds` already guarded the mirror case — a sign belonging to
   a LATER body — and this is the same error pointing backwards. A body that is
   the object of "of" is now treated as a referent, not a subject.

**I called the first of these a true positive before reading the sentence.** The
astronomy checked out (12.02° apart, genuinely not conjunct) so it looked
confirmed; the claim was about something else entirely. Verify what the sentence
SAYS, not only whether the numbers in it are right.

---

## ⚠️ Reasoning tokens are eating the chart-reading budget

Measured 2026-08-19 on `anthropic/claude-sonnet-5` via OpenRouter, supporter
whole-chart, `max_tokens=6600`:

```
completion_tokens          4,951
  reasoning_tokens         2,729     <-- 55%, never shown to the reader
  visible                 ~2,222     for 1,035 words
message keys: content, reasoning, reasoning_details, refusal, role
```

**`reasoning_tokens` count against `max_tokens`.** One re-recording spent the
whole 6,600 and returned **484 words**, `finish_reason="length"` — 13.6
tokens/word, which is not prose. Reasoning had eaten the ceiling.

This is pre-existing and NOT caused by anything in this session; session 30's
budgets were fitted to `completion_tokens`, which silently conflates reasoning
with visible output, so they happen to accommodate a typical reasoning spend and
not a large one. In production `_chat_openai_compat` continues past `"length"`
so the reader still gets a whole reading — at the cost of another full reasoning
pass. **`evals/runner.record_case` calls the provider directly and does NOT use
the continuation loop, so the eval is stricter than the product.**

If this is picked up: measure `usage.completion_tokens_details.reasoning_tokens`
separately, and either budget visible output plus a reasoning allowance, or make
`record_case` go through `_chat_openai_compat` so cassettes record what a reader
actually receives. Do not simply raise the ceiling — that funds more thinking.

---

## Addendum 2 — the reasoning-token fix (done)

`reasoning: {"effort": "medium"}` now goes to the thinking models on both the
streaming and non-streaming OpenAI-compatible paths, and to `record_case`, which
builds its own request and had to be mirrored.

Measured, supporter whole-chart at `max_tokens=6600`, one call per variant:

| variant | finish | total | reasoning | words | cost |
|---|---|---|---|---|---|
| **no parameter (what shipped)** | **length** | 6,600 | 5,498 (83%) | **482** | $0.0720 |
| `effort: low` | stop | 1,560 | 0 | 633 | $0.0216 |
| **`effort: medium`** | stop | 3,751 | 1,757 (47%) | 979 | $0.0435 |
| `enabled: false` | stop | 1,916 | 0 | 860 | $0.0251 |
| `exclude: true` | stop | 5,502 | 3,379 (61%) | 987 | $0.0610 |
| `max_tokens: 1024` | stop | 4,964 | 2,734 (55%) | 992 | $0.0556 |

Two of those knobs are traps. **`exclude` only hides reasoning** — 3,379 tokens
were still generated and billed. **`max_tokens` was ignored entirely**;
Anthropic removed `budget_tokens` on this family, so the gateway has nothing to
translate it into. `low` finished but at 633 words, under the 700 the prompt
asks for. Thinking is lowered rather than disabled because disabling it on Opus
5 is documented to leak reasoning tags into the visible answer.

**IT IS AN ALLOW-LIST AND THAT DIRECTION IS LOAD-BEARING.** On
`claude-haiku-4-5` reasoning is OFF by default and the parameter TURNS IT ON:
the free tier's own call went from 0 reasoning tokens / 990 words to 1,127
reasoning tokens / **234 words**. The fix for the paid tiers is a regression for
the free one. Anything not in `_EFFORT_CAPABLE` is sent nothing.

After, through the shipped policy — every path finishing with real headroom:

| case | ceiling | total | reasoning | words | headroom |
|---|---|---|---|---|---|
| chart/free (haiku) | 1,600 | 1,441 | 0 | 856 | 1.11× |
| chart/supporter | 6,600 | 3,006 | 881 | 939 | 2.20× |
| chart/oracle | 8,000 | 3,292 | 925 | 1,088 | 2.43× |
| arcana/celtic-cross | 5,000 | 1,987 | 41 | 917 | 2.52× |
| arcana/twelve-house | 8,000 | 4,179 | 399 | 1,981 | 1.91× |

A supporter reading went from a truncated 482 words at $0.072 to a complete 939
at $0.036. **The ceilings are deliberately NOT lowered to match** — the whole
defect was reasoning variance, and that headroom is what absorbs it.

---

## ⚠️ THE OPENROUTER ACCOUNT IS OUT OF CREDIT

`/api/v1/credits`: total_credits **10**, total_usage **10.06**, balance
**−$0.06**. Recording stopped mid-way with `402 Payment Required`.

**Check the account, not the key.** `/api/v1/key` cheerfully reported $9.94
remaining of that key's own $20 limit at the same moment — a per-key limit is
not a balance, and reading it is how you conclude the rail is fine while every
call 402s.

Consequence: **eight of eleven cassettes predate the reasoning parameter** and
must be re-recorded when credit is topped up (`python -m evals.runner --record`).
They still pass every check; they simply record a request shape the product no
longer sends. The three `free__*` ones ARE accurate, because haiku is
deliberately sent nothing. Written up in `evals/README.md` too.

---

## Open items, in the order I would take them

1. **Re-record the eight stale cassettes** once the account has credit.

2. **The print path has no tableau.** `printReport.ts` renders the new spreads
   as a plain card grid. A printed Celtic Cross looks like a printed list.

3. **The Crossing card is adjacent, not overlapping.** On a real table card 2
   lies bodily across card 1. These are text panels of variable height, so it
   sits directly beneath The Heart, landscape, with the crossing rule. The
   literal overlap needs a compact tableau with the full readings below —
   which is how `printReport.ts` already splits plates from readings.

4. **`_MAX_CONTINUATIONS` is still 2** and the arcana path now rarely needs it.
   Worth checking whether it ever fires post-refit before assuming it does.

5. **The global-cap exposure from session 30** is unchanged: one subscriber can
   still walk the $100 global cap down alone.

---

# SESSION 30 — 2026-08-17

## Start here

**`main` is untouched. All of today's work is on `reading-completion-guarantee`,
pushed to origin, 5 commits, NOT merged and no PR opened.** Merging is the
operator's call as usual.

```
89c202f  The replay guardrail: the same question keeps its answer
17ef199  Price the cap by the model that answers; stop rationing subscribers
c8a143a  Offline becomes a mode you choose, and says so when it wasn't
1f2d5a6  An eval suite, because 488 mocked tests watched the truncation and passed
93e857c  Every supporter reading ended mid-sentence, and nothing read finish_reason
```

Green at close: **565 backend**, **100 desktop e2e** (6 skipped by design),
ruff clean, eval suite 9/9 on replay, frontend build clean. **Servers are
DOWN** — `./run.sh` to bring them back.

PR link: https://github.com/9x25dillon/astro_caster/pull/new/reading-completion-guarantee

---

## The bug that mattered most today

**Every supporter reading had been ending mid-sentence for the product's entire
history, and nothing detected it.** The operator pasted a reading that stopped
at `- Profound psychological insight an`.

`finish_reason` was read **nowhere** in `ai.py`. Measured against a real chart
with the cap lifted to 9000:

| tier | model | natural need | old budget | verdict |
|---|---|---|---|---|
| free | claude-haiku-4-5 | 1,138–1,257 | 700 | cut ~44% short |
| supporter | claude-sonnet-5 | 4,367–4,911 | 3,000 | cut ~39%, **every time** |
| oracle | claude-opus-5 | 3,886–4,521 | 6,000 | fit |

Supporter shares `ORACLE_EXTENSION` with oracle ("800–1200 words", five
sections) but had half the room that brief costs. **Supporter needs MORE than
oracle** — sonnet-5 spends 4.2–5.0 tokens/word against opus-5's 3.4–3.8 — so
the old "strictly tiered budget" comment was ranking a quantity the models do
not honour.

**Diagnose this class of thing with a wire probe, never by reading the code:**

```bash
# from backend/, in the venv — prints finish_reason per tier
.venv/bin/python /path/to/probe.py   # pattern: call the provider directly,
                                     # print choices[0].finish_reason + usage
```

---

## What is in the branch

1. **Completion guarantee** (`ai.py`). `finish_reason` read on both the
   streaming and non-streaming paths; on `"length"` the partial is fed back as
   an assistant turn and the model resumes, bounded at 2 continuations; if that
   bound is hit the text is trimmed to its last complete sentence. Budgets
   floored by measurement (free 700→1600, supporter 3000→6600, oracle
   6000→8000, ollama 520→1200). The `free < supporter < oracle` ladder is
   KEPT — an existing test asserts it as a deliberate product decision.

2. **Eval suite** (`backend/evals/`). Checks what the model WROTE:
   completeness, structure, grounding, length, voice. Replay by default from
   committed cassettes (free, deterministic, wired into the backend CI job);
   `--record` re-records from the live provider. `evals/regressions/` holds
   known-bad readings that the tests assert are REJECTED — water down
   `check_completeness` and those go green while `test_evals.py` goes red.

3. **Offline as a chosen mode** (`prefer_offline` + `offline_reason`).
   Responses now say WHY they are offline: chosen / capped / degraded /
   unconfigured. A capped subscriber is told rather than silently downgraded.

4. **Cap priced by model** (`budget.py`). The `kind == "ask"` × 0.2 multiplier
   is gone; a per-model table at Anthropic list rates (fable-5 $50, opus-5 $25,
   sonnet-5 $15, haiku-4.5 $5 per MTok out) matched on the bare name so an
   OpenRouter route prefix resolves the same. **Subscribers are exempt from the
   per-user cap** — spend still RECORDED, only the refusal removed.

5. **Replay guardrail** (`frontend/src/lib/replay.ts`, `backend/replay.py`).
   Same question + same chart + same tier → same reading. Local by default
   (bookshelf DB **v5**, new `replay` store); server sync is opt-in behind a
   required `consent: true`, owner-scoped, TTL'd, deletable.

---

## Gotchas learned today — read these before touching e2e

1. **Kill :5173 and :8787 before any full Playwright run.** The suite's
   `reuseExistingServer` will adopt a dev stack you left running. If that stack
   is in **personal mode**, everyone is oracle tier and 7 specs fail
   confusingly (`app-shell` expects a free-tier `.support-pill`). This cost a
   full debug cycle today and it is already in memory — heed it.

2. **Route globs must omit the version segment.** The API is served under
   `/api/v1/…`, so `page.route("**/api/ai-ask-stream")` matches **nothing** and
   every ask sails through to the real provider. That presents as a broken test,
   not a broken stub. Use `**/ai-ask-stream*`.

3. **Never wait on "the reading is non-empty".** `.interp` still holds the
   PREVIOUS reading, so the poll passes instantly and you read stale text. Wait
   on something specific — a numbered generation from the stub, or the
   `.engine-note--replayed` marker.

4. **sonnet-5 can return `content: null` at the ceiling.** Observed live while
   recording eval fixtures: `finish_reason="length"`, whole 3,000-token budget
   spent, no text. `None.strip()` was a 500 on a call already paid for. Both the
   old code and the first cut of the fix crashed on it.

5. **A TRAILING assistant turn is a prefill and 400s** on Fable 5 / Opus 5 /
   Sonnet 5 / the 4.6–4.8 family. An assistant turn FOLLOWED BY a user turn is
   ordinary history and is fine — that is the continuation shape both
   `_chat_openai_compat` and `_call_fable` use. In `_call_fable`, `msg.content`
   is echoed back VERBATIM (thinking blocks included, even with empty text
   under the default display) because editing them breaks the turn.

6. **Load the `claude-api` skill for any model pricing / API-shape question.**
   Today's price table came from it, not from memory. Memory had fable-5 and
   opus-4-8 but not opus-5 / sonnet-5 / haiku-4.5.

---

## Open items, in the order I would take them

1. **`_NOMINAL_CHARS["ask"]` is 3000** (`budget.py:81`) and now under-estimates
   — readings run 5–24k chars. Only the PRE-FLIGHT guess is low; `record()`
   uses real output, so the cap is crossed slightly late rather than never.
   Measure before tuning.

2. **`_ARCANA_BUDGET`** (`ai.py`) is `{oracle: 2600, supporter: 1600, free:
   900}` and was never measured the way the reading budgets were. The
   continuation loop backstops it, so a tight number costs an extra round-trip
   rather than a truncated reading. Measure, then tune.

3. **The global-cap exposure introduced deliberately today.** One subscriber
   can now walk the $100 global cap down alone, degrading everyone. Remaining
   controls: the global ceiling, the 80% alarm, `ratelimit.py`'s 20/60s window.
   If it ever happens, the answer is a **high per-subscriber sanity ceiling that
   ALARMS rather than degrades** — not a return to the per-user cap.

4. **Replay sync UI is gated on `isSupporter`.** Free-tier readers get the local
   guardrail (which is the whole product benefit) but never see the section.
   That is intentional — without an entitlement there is no owner — but worth a
   look if free-tier readers ask where their readings went after clearing a
   browser.

5. **Re-record the eval cassettes** whenever a prompt, model, or budget changes:
   `cd backend && .venv/bin/python -m evals.runner --record` (costs real money).
   The cassette diff is then a readable before/after of the product itself.

---

## The astrology thread (resolved — no action needed)

The session opened with "the readings are wrong — I'm a Scorpio rising but it
says Pisces." **The engine was right the whole time.**

- Measured against JPL Horizons anchors: **median 0.137″**, worst 1.297″,
  39/40 under 1″. All 70 anchor tests pass.
- The operator's real birth time is **13:11 local, 1987-11-11, Barstow CA,
  PST (UTC−8)** → **Ascendant 1°09′ Pisces**. Verified two ways: the backend
  returns 280.73→331.16°, and an independent spherical-trig computation (no
  ephemeris library) agrees to 9 arcsec.
- The "Scorpio" belief has no provenance. The chart is Scorpio-HEAVY — Sun
  18°56′, Pluto 10°16′, Part of Fortune 12°26′, all in Scorpio, Pluto in the
  8th — which very plausibly became "Scorpio rising" somewhere along the way.
- **Two cusp warnings for this chart:** the Ascendant is **3.2 minutes** of
  clock from Aquarius (Pisces starts 13:08), and the Moon is **0°12′ Leo**,
  ~24 minutes past the Cancer boundary. If precision ever matters here, pull
  the birth certificate time rather than the remembered one.
- The wrong readings came from hand-typed TZ values (`-5.7`, then `+7`).
  **`resolveOffset` (`packages/astra-core/src/timezone.ts:210`) is correct and
  handles 1987 DST properly** — it only runs when a city is picked on the map.
  The bare "TZ ±h" box had no cross-check against the longitude sitting in the
  next field. **BUILT: TZ-3, `checkOffsetAgainstLongitude`** — see below.


## TZ-3 — the typed-offset guard (built at the end of the session)

`checkOffsetAgainstLongitude(hours, lng)` in
`packages/astra-core/src/timezone.ts`, surfaced in **both** places an offset can
be typed (`CeremonyModal`, `Controls`). Two independent checks, because neither
alone catches both of the operator's bad values:

1. **Is it a civil offset at all** — every zone that has ever existed is a
   multiple of 15 minutes within UTC−12..+14. Catches `-5.7` outright, with no
   reference to longitude and no false positives.
2. **Is it plausible here** — compared against `lng / 15`, tolerance **3 hours**.
   Catches `+7` (9.2h out). The tolerance is 3h and not 2h because Xinjiang runs
   UTC+8 at a solar +5, the widest legitimate gap on Earth; Galicia on summer
   time is ~2.6h.

Compared **modulo 24**, or the date line reads as a 24-hour error (Kiritimati is
UTC+14 at a solar −10.5 — half an hour apart, not 24.5).

**`-7` deliberately passes.** PDT is genuinely used at that longitude; it is only
the wrong offset for a *November* birth, which a longitude guard cannot know.
`resolveOffset` is what knows the date. Flagging it would cry wolf half the year.

**Advisory, never blocking** — the manual field is the escape hatch for
pre-standard-time local mean time, war time, and certificates written in the
wrong convention. 10 core tests, 5 e2e.

---

# SESSION 29 — 2026-08-15

## Start here

`main` is at `bbd9422`, working tree clean, both suites green (backend 475,
astra-core 60, frontend 43 + 18 e2e). **v1.0.5 is published and live.**

**⚠️ THE RAIL IS LIVE AND TAKES REAL MONEY.** `card_available: true`,
`mode: subscription`, webhook probe returns `400`. This is no longer a staging
system: a mistake here charges a real card. There is no "closed" state to fall
back on unless you deliberately re-park the keys (§6 of `M5_GOLIVE.md`).

## The bug that mattered most today, and how to find it again in one command

The operator reported "the payment rail isn't working". It was half-configured
in the worst possible way: `AAE_STRIPE_SECRET_KEY` was on the box, so the rail
**opened and could charge a card**, but `AAE_STRIPE_WEBHOOK_SECRET` had never
been added, so every `checkout.session.completed` was answered `503` and
**dropped**. Money in, no entitlement out, and every surface reporting itself
healthy.

Registering the endpoint in the Stripe dashboard and putting the `whsec_` on
the server are **two separate steps**. Only the first had been done.

**Diagnose it with a probe, never by reading `.env`:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://app.astra-arcana.com/api/stripe/webhook \
  -H "Content-Type: application/json" -d '{}'
# 503 = secret absent, every event dropped.  400 = secret loaded, working.
```

`backend/tools/m5_preflight.py` catches the same thing and is read-only; it now
reports 10 pass / 1 warn / 0 FAIL. The remaining warn is informational.

## What shipped

| What | Where |
|---|---|
| Crypto/treasury vars finally reach the container | `50758e6` + merge `50ac45d` |
| The compose fix that would have crash-looped the backend | `cee91e5` |
| Eclipse anchors acquired (8) + runner on both engines | `12c6ced`, `8994edc`, merge `92c23cf` |
| Annular + hybrid + partial anchors — every nature branch pinned | `a6903ac` |
| Key EXPORT in Library chapter VIII | `dc41e93` |
| v1.0.5 cut and published | `37614bb`, `bbd9422` |

Release: [`v1.0.5`](https://github.com/9x25dillon/astro_caster/releases/tag/v1.0.5),
`astra-1.0.5-reader.apk`, 7,523,335 B, sha256
`fdf61fa328395860ba9a952031cbc361016c539509e403e2755f68e8d1fdaa19`, signing
cert unchanged (`c568d41d…2b0a82e`). Checksum verified against the
**downloaded** file; the advertised link was resolved (HTTP 200) before the
page shipped.

## ⚠️ Three traps that are now in the repo, and will bite again

**1. A var absent from `docker-compose.yml`'s `environment:` list never reaches
the container.** This was the THIRD occurrence (AI keys, Stripe keys, now the
whole treasury/crypto block). Setting a wallet in `.env` was a silent no-op.
Every instance has the same shape: the feature degrades *honestly*, reports
itself unavailable, logs nothing — which is exactly what makes it invisible.

**2. Fixing (1) can crash-loop the backend.** `${VAR:-}` does not leave a
variable unset, it SETS it empty, and `os.environ.get(k, default)` only falls
back when the key is ABSENT. `int("")` then raises at import. Caught before
deploying by running the module under the environment compose actually
produces. Guards: `entitlements._i`, `treasury._s`, `stripe_rail._f`,
`budget._f`. Pinned by `backend/tests/test_env_empty_passthrough.py`, whose
`COMPOSE_EMPTIES` list must be kept in step with the compose block.

**3. "Same size as the last build" does NOT mean the build failed.** v1.0.5 came
out at exactly 7,523,335 bytes, byte-identical in SIZE to v1.0.4, with a
different sha256. Session 27 told the next person to stop on that signal — there
it meant missing data files. Here it was zip compression on a small text delta.
**Check the content:** extract the APK and grep `assets/public/assets/` for a
string you know is new.

## The eclipse anchors — what to read before touching them

`parity/anchors/eclipses.json`: 11 anchors, 1919–2023, 7 solar + 4 lunar.
Every branch of `predictive._eclipse_nature` is pinned. Two things encode
comparisons that look obvious and are wrong:

- **Magnitude is `attr[8]`, never `attr[0]` or `attr[1]`.** The catalog's column
  is the Moon/Sun *diameter ratio* for total/annular/hybrid but the *obscured
  diameter fraction* for a partial; `attr[8]` is the field that switches.
  Hardcoding `attr[0]` fails 6/7 solar anchors, `attr[1]` fails 1/7.
- **Never convert with the catalog's own ΔT column.** It is an extrapolation
  after the canon's 2006 publication (70 s printed vs 68.85 s observed at 2017).
  Anchors are stored in TD; the test converts the *engine's* UT answer with the
  *engine's* `deltat()`.

Anchors now support a `measurements` map as well as the flat form —
`_measurements()` in `test_anchors.py` normalises both. Any non-Markdown change
under `parity/anchors/` needs an `ANCHOR-CHANGE:` commit trailer or CI fails.

**Verified to bite:** worst assertion sits at 54% of tolerance; a 120 s timing
bias fails 11/11. **Honest gap, written down rather than implied:** converting
with the catalog's predicted ΔT is NOT caught — it lands at 95% of tolerance on
`lunar-2018-07-27`.

## Known and accepted

- **The APK export half is on v1.0.5 only.** The operator's personal phone runs
  the *purchased* subscription and shows Supporter chrome; the Pixel
  (`5C091JEA325346`) is a TEST device with no key, so its masthead correctly
  reads "Support / Unlock". **That is not a bug** — the export block renders
  only when a key is present.
- **`assetlinks.json` is not served.** `app.astra-arcana.com/.well-known/assetlinks.json`
  returns the SPA fallback HTML with a 200, so Android App Links are NOT
  configured. Stripe therefore returns a payer to a *browser*, not the app.
  Irrelevant while keys move by copy-paste; the first thing to fix if in-app
  purchase or automatic post-checkout unlock is ever wanted.
- **The APK remains a READER by deliberate design** (`readerMode.ts`,
  `capacitor.config.ts`) — no purchase UI, no billing SDK, which is what lets
  one artifact serve Play, F-Droid and direct download. The operator confirmed
  this stands. Note the honest limit already recorded there: checkout *bytes*
  are still in the bundle; the guarantee is "no purchase UI is reachable".

## Open threads

1. **The customer portal is unverified in LIVE.** Test and live configure
   separately; without it the in-app cancel fails. `--expect-live` checks it and
   needs the live key. **Cancel before refund, always** — the mint stores
   `sub_…`, `charge.refunded` carries `py_…`, so a refund never revokes a
   subscription.
2. **The precession term.** Unchanged: ~0.5″ at 1800 decaying to ~0.05″ by 2000,
   a body-independent offset — the path from A3's 2″ `engine_allowance` to
   ACQUISITION.md's 1″.
3. **`check_tolerance_ratchet.py` does not cover per-vector tolerances.** Real
   gap, still unchanged.
4. **ΔT at 1900 and 2050** — the last deferred anchors (`ACQUISITION.md` §2).
5. **LAN key pairing**, discussed and deliberately not built. If revisited: the
   secret must be a short-lived single-use code, with same-IP as a *secondary*
   check only. Same public IP is not identity — CGNAT and public wifi put
   thousands of strangers behind one address.

---

# SESSION 28 — 2026-08-15

## Start here

`main` is at `744aa76`, CI green, working tree clean, **0 open PRs**.
**v1.0.4 is published** (pre-release, APK attached, checksum verified against
the *downloaded* file) and installed on the Pixel.

**The one thing not done: `landing/index.html` is merged but not deployed.**
Until the origin box pulls, astra-arcana.com advertises 1.0.3 with a checksum
that matches a file the page no longer links to. The download URL on the live
page still resolves, so it is stale rather than broken.

```bash
ssh -i ~/.ssh/astra_hetzner astra@178.104.120.219
cd ~/astro-aae && git pull && docker compose up -d --build
# then, from OFF the box:
curl -s https://astra-arcana.com | grep -oE "Astra 1\.0\.[0-9]+ · reader build"
```

The API needs nothing: it is already on `swiss-files` and was untouched today.

## What shipped

| PR | What |
|---|---|
| #187 | v1.0.4 — the version bump, the reprint fix, and the comment that misstated its own case |
| #188 | the landing page → v1.0.4 (**merged, NOT deployed**) |

Release: [`v1.0.4`](https://github.com/9x25dillon/astro_caster/releases/tag/v1.0.4),
`astra-1.0.4-reader.apk`, 7,523,335 B, sha256
`f7f29a81f1562a249ae8378fd2ca6078cf29ff9c7d434b31350210baaaacf340`, signing
cert unchanged (`c568d41d…2b0a82e`).

## ⚠️ The number in a comment was wrong by 9×, and it was load-bearing

Session 27 wrote: *changing the ephemeris moves 3.4% of charts (17/500) to a
different tarot seed*. That figure appeared twice — in this file, and in
`swisseph.ts` as the justification for loading all three data files.

Measured against the change actually shipping (planets from Moshier vs from
Swiss files, backend engine both sides, 500 charts over 1930–2010):
**144/500 — 28.8%.** An independent grid of 1,152 birth moments said 29.9%.

3.4% is about the **per-body** rate. The seed reads **seventeen** bodies, so
what matters is the union of seventeen chances to cross a 0.01° bucket edge.
Any figure of this shape wants to be re-derived, not quoted.

**Why it mattered.** `printSessionTome` re-casts the chart on-device and
re-dealt the spread from a seed **re-derived** from that fresh cast, while
printing the **stored** report text — so a diverged reprint is one document
contradicting itself: plates that name cards the text does not. Fixed by
passing the session's stored seed (`buildLocalReading` now takes one, mirroring
the backend's `TarotReadingRequest.seed`). Replaying the stored seed reproduced
the original draw on **500/500**. That repairs already-shelved readings too,
which is why **no migration note was needed** in the release.

Pinned by `packages/astra-core/test/reprint-seed.test.ts`, including the
negative — that re-deriving *would* have dealt differently — so a refactor that
drops the override fails loudly instead of quietly re-opening it.

## How the on-device Swiss load was actually proved

A wheel screenshot cannot show it: Moshier and Swiss differ by ~1″, and the UI
rounds far coarser. What proves it is the **failure mode**:
`initSwisseph` is a `Promise.all` over all three `.se1` files, the
astronomy-engine fallback is retired, and `calculateChart` **throws** when the
engine is absent. So:

> with wifi and mobile data off, a cold start cast a chart for birth data with
> no cache, and the wheel came back labelled **"swiss-wasm ephemeris"** with the
> full 17-body set.

A chart that casts offline at all ⇒ all three files loaded. The chart's daily
card on the phone also matched what the backend draws for the same birth data
under the full Swiss files — agreement on every body at 0.01°.

**Two device facts worth keeping:** `webContentsDebuggingEnabled: false` in
`capacitor.config.ts` means there is no CDP socket on a release build, so you
cannot evaluate JS in the shipped app — drive it with `adb shell input tap` and
screenshots, or change nothing. And `adb install -r` over the installed release
works and keeps charts, journal and entitlement; `versionCode 4` is what makes
it an update rather than a refusal.

## Known and accepted in this build

- **The daily-notification queue is precomputed 60 days ahead.** After the
  update, a notification queued by v1.0.3 can name a different card than the app
  shows, until `dailySync` rebuilds the queue on the next launch. One morning,
  ~29% of charts, self-healing. Stated in the release notes; not fixed, because
  the fix is a launch the reader is about to do anyway.
- The APK came out **byte-identical across two builds of the same tree** — the
  checksum did not change on rebuild, contrary to the note carried since
  session 23. Do not lean on that: it was true for two v2/v3-signed builds of an
  identical zip, and the rule (publish the checksum of the *uploaded* file) costs
  nothing and stays correct either way.

## Open threads, unchanged in priority

1. **The precession term.** Residual vs JPL is a near-uniform ~0.5″ at 1800
   decaying to ~0.05″ by 2000 — a body-independent offset scaling with distance
   from J2000, i.e. a precession-model signature (Horizons states IAU76/80,
   Swiss defaults newer). This is the path from A3's 2″ `engine_allowance` to
   ACQUISITION.md's 1″.
2. **`check_tolerance_ratchet.py` does not cover per-vector tolerances** — it
   guards `parity/tolerance.contract.json` only. Real gap, unchanged.
3. **Eclipse anchors** — the last unacquired item in `ACQUISITION.md` §3. Its
   egress blocker is stale; test before deferring.
4. **M5 is still non-code**: LLC, confirm prices, live keys, one real purchase,
   cancel → `tier: free` → refund, in that order.

---

# SESSION 27 — 2026-08-14

## Start here: cut v1.0.4

`main` is at `e0b2a33`, CI green, working tree clean, **0 open PRs**. The
origin box is deployed and verified. The only thing lagging is the binary.

### 1. What the new APK gains, and why it is worth cutting

The reader engine inside the APK has been computing planetary positions from
**Moshier's analytic series** for the whole life of the product. The vendored
ephemeris carried only `seas_18.se1` (asteroids — that is where Chiron comes
from), and Swiss silently answers any class it cannot find from Moshier. This
build is the first one whose on-device engine reads real Swiss data.

| | v1.0.3 (on phones) | v1.0.4 (to build) |
|---|---|---|
| planetary source | Moshier analytic | **Swiss data files** |
| worst error vs JPL | 3.13″ (Pluto 1800) | **0.138″** (measured on prod) |
| forecast orb rounding | `Math.round` (half-up) | **`pyRound`** (half-even, matches backend) |

Neither is visible in a reading — both are far inside the ~1 arcmin that moves
a body across a sign or cusp. Cut the build anyway: the device is the only
surface still running the old engine, and leaving it there means the phone and
the website disagree about the sky.

### 2. The two things that make this build different from a routine one

**(a) It is ~1.75 MB bigger, and that is expected.** `sepl_18.se1` (484,061 B)
and `semo_18.se1` (1,304,771 B) are now committed under
`packages/astra-core/src/vendor/swisseph/` and land in `frontend/dist/assets/`
as fingerprinted, precached assets. `npm run build` reports **precache 33
entries / 6573 KiB**. The v1.0.3 artifact was **5,860,185 bytes**; expect
roughly +1.7 MB before APK compression. If the artifact comes out the same
size as v1.0.3, the data files did not make it in — stop and check `dist`.

**(b) ⚠️ VERIFY BEFORE SHIPPING: saved readings may not reproduce.** The tarot
seed is built from longitudes rounded to 0.01° (`backend/tarot.py:396`).
Changing the ephemeris moved some longitudes across a rounding boundary:
**measured 3.4% of charts (17/500) get a different seed string**, and a
different seed is a different spread. Reprints re-deal from
chart+spread+question+date rather than from the stored seed, so a reader who
reprints a shelved reading cast on v1.0.3 **may get different cards than the
copy they already have**. This was measured but its effect on the Bookshelf
and Journal was NOT traced. Before publishing, cast a chart, shelve a reading,
and reprint it — and decide deliberately whether that needs a migration note
in the release text. It is a one-time step across an ephemeris change, not an
ongoing bug.

### 3. Bump the version first

`frontend/android/app/build.gradle` is still `versionCode 3` / `versionName
"1.0.3"`. Both move: **`versionCode 4`, `versionName "1.0.4"`**. `versionCode`
is the upgrade path — an unchanged one will not install over the existing app.

### 4. Then follow the runbook that already exists

Do not improvise the build. `docs/progress/RELEASE_v1.0.3.md` is the
release-shaped wrapper (order of operations, artifact verification) and
`docs/progress/APK_A0_FINDINGS.md` §"To build it" is the exact recipe. The
essentials, so you know what you are looking at:

```bash
export JAVA_HOME=$HOME/.jdks/jdk-21.0.12+8      # 21. Not 17, not 26.
cd frontend
VITE_READER_MODE=1 \
  VITE_API_BASE=https://app.astra-arcana.com/api/v1 \
  npm run build                                  # the flag IS the reader guarantee
npx cap sync android
cd android && ./gradlew assembleRelease
# sign — keystore at ~/.astra-signing/, NEVER in the tree
```

Carry these forward, all learned the hard way:

- **`--ks-pass env:` for both password args, not `file:`** — `apksigner` reads
  one line per file reference, so the second read hits EOF.
- **The landing page is edited AFTER the APK is signed, never before.** Signing
  embeds timestamps, so every rebuild changes the sha256. A checksum written
  from a previous build is worse than none: it teaches readers that verifying
  is noise. There are five references to the version on that page and they all
  move together.
- **Never rebuild to re-publish.** The hash changes and the published checksum
  becomes a lie.
- **Debug builds carry `applicationIdSuffix ".dev"`**, so they install beside a
  release-signed Astra instead of demanding an uninstall that would destroy the
  reader's charts, journal and entitlement. `adb shell pm list packages | grep
  astra` showing two is fine; the `.dev` one is disposable.
- The signing key is the app's permanent identity. Lose it and no future build
  can ever update an installed Astra.

### 5. After the release is published

`landing/index.html` gets the new version, pinned download URL, `sha256sum`
filename and checksum — then the origin box needs
`git pull && docker compose up -d --build` or the site keeps advertising
v1.0.3. That deploy loop is exercised and reliable; see §"Deploying" below.

### 6. Inspecting a running Android build — session 26's slow-way findings

_Salvaged 2026-08-20 from the `session-26-handoff` branch (`2efae4a`), which was
never merged. Everything above it on that branch was v1.0.3-era ordering and is
superseded; this part is technique and does not go stale. `webview_devtools_remote`
and `aapt2 dump resources` appeared nowhere else in this repository._

**Drive the WebView, not the pixels.** Tapping screen coordinates parsed out of
screenshots is slow and it lies — a tap lands mid-animation, a system dialog eats
it, the shade opens instead. Capacitor debug builds have WebView debugging on, so
drive the running app directly:

```bash
PID=$(adb shell pidof com.astraarcana.observatory.dev)
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
curl -s http://localhost:9222/json/list        # -> webSocketDebuggerUrl
# then Runtime.evaluate over that socket; node 22+ has a global WebSocket.
```

That is how the notification was tested end-to-end: read the real prefs, schedule
a probe 45 s out, watch it fire. Reach for it the moment you need more than one
interaction.

**Reading what actually shipped.** Release builds shorten resource paths, so
`unzip -l | grep ic_launcher` finds nothing and proves nothing. Use the resource
table:

```bash
$BT/aapt2 dump resources app-release.apk | grep -A8 "mipmap/ic_launcher\b"
# -> (xxxhdpi) (file) res/o-.png    then unzip -p that path
```

**Verifying a notification without waiting for morning.** `dumpsys alarm | grep
-A2 <package>` shows `origWhen` and the delivery `window`. `dumpsys notification
--noredact | grep -A80 "id=<id>"` shows the posted `android.title` and
`android.text` — which is how the content was checked rather than squinting at a
screenshot.

**Signing is a script, not a command line.** Beyond the `--ks-pass env:` rule
above: writing the whole invocation to a `.sh` and running it under `bash` also
sidesteps this shell's quoting, which mangles inline `$VAR` and command
substitution.

---

## What shipped to production this session

All six merged and deployed; box at `e0b2a33`, rollback point `0915353`.

| PR | What |
|---|---|
| #180 | landing page → v1.0.3 (deployed; the site had been advertising v1.0.1 with a dead checksum) |
| #182 | **the frontend healthcheck had never once passed** — `wget` probed `http://localhost/`, BusyBox resolves that to `[::1]` and nginx listens on IPv4 only. `FailingStreak` was 11527, every probe since boot, while serving 200 |
| #183 | Track A3 — Lahiri ayanamsa anchored at J2000 (mean) and the 1956 vernal equinox (true) |
| #184 | Track A3 — 40 JPL Horizons planetary longitudes, 10 bodies × 4 epochs |
| #185 | `/api/health` described a folder, not an ephemeris |
| #186 | the full Swiss data files, to both engines |

## Deploying (exercised four times today, reliable)

```bash
ssh -i ~/.ssh/astra_hetzner astra@178.104.120.219
cd ~/astro-aae && git pull && docker compose up -d --build
```

- **SSH port 22 is firewalled to the operator's IP, which rotates.** A deploy
  that opens with `ssh: connect ... timed out` while the site serves 200 is
  this, not an outage. Check `curl https://api.ipify.org` and repoint the
  `astra-edge` firewall (id `11451407`) in the Hetzner console —
  `~/.hetzner-token` is still invalid (401), so the API cannot do it.
- **Verify from OUTSIDE the box, and check the fields that matter**: not just
  `status: ok` but `ephemeris` (**now legitimately `swiss-files`**),
  `personal_mode: false`, `ai.configured: true`, and `/api/generate-chart`
  returning **17 bodies including Chiron**. `ChartRequest` takes **`lat`/`lng`**,
  not `latitude`/`longitude` — the wrong names give a 422 that reads like an
  outage.
- A 000 on one surface immediately after a rebuild is the restart window.
  Retry before believing it.
- `gh run list` returned stale and empty results repeatedly today. `gh api
  repos/OWNER/REPO/actions/runs --jq ...` was reliable when it was not.

## Open threads, in the order they are worth taking

1. **Cut v1.0.4** — above.
2. **The precession term.** The residual against JPL is not random: a
   near-uniform **~0.5″ across every body at 1800**, decaying to ~0.24″ at 1900
   and ~0.05″ by 2000. A body-independent offset that scales with distance from
   J2000 is a precession-model signature, not ephemeris error — Horizons states
   IAU76/80 ecliptic-of-date and Swiss defaults to a newer model. Resolving it
   is the path from A3's 2″ `engine_allowance` to ACQUISITION.md's 1″. Uranus
   at 1800 carries ~0.8″ beyond the common offset, plausibly real DE431-vs-DE44x
   disagreement.
3. **`check_tolerance_ratchet.py` does not cover per-vector tolerances.** It
   guards `parity/tolerance.contract.json`; `parity/forecast.json`'s
   `orb_tolerance_deg` was widened this session (1e-6 → 0.002, justified in the
   generator) and the ratchet had nothing to say. Real gap.
4. **Eclipse anchors** — the last unacquired item in `ACQUISITION.md` (§3).
   Note that its egress blocker is **stale**: JPL Horizons and NASA GSFC answer
   fine from the operator's machine. Test before deferring.

## Things that are true now and were not this morning

- `parity/anchors/` covers the clock (ΔT), the sidereal frame (ayanamsa) and
  **positions** (JPL longitudes). Both engines assert against all of it
  independently. It found two real defects on its first outing.
- The two engines are **bit-identical** with the new data files: measured
  5.7e-14° worst-case on raw unrounded longitudes, 0/60 tarot seed strings
  differing. Bit-identity was the reason the Moshier-only config existed; it
  survived the change.
- `.gitignore` no longer swallows the vendored ephemeris. `*.se1` is still a
  blanket rule — the three vendored files are named as individual exceptions,
  so adding one stays a deliberate act with a size cost somebody has to see.

---

# SESSION 26 — 2026-08-12

## Start here

1. **The release is out; the site is not.** v1.0.3 is published and its
   checksum was verified against the *downloaded* artifact, not the local
   build. `landing/index.html` is updated on PR #180 but **nothing is live
   until `git pull && docker compose up -d --build` runs on the origin box.**
   Until then astra-arcana.com advertises v1.0.1 with a checksum that no
   longer matches anything you can download from the pinned URL — that URL
   still resolves, so the page is stale rather than broken.
2. **The version is 1.0.3, not the 1.0.2 every earlier doc predicted.** The
   cycle was scoped as five fixes; the session-26 features merged to `main`
   before the build was cut, so the name follows the artifact. `versionCode`
   was already 3 and did not move.
3. **A `.dev` build may still be on the test phone.** Debug builds now carry
   `applicationIdSuffix ".dev"` so they install *beside* a release-signed
   Astra instead of demanding an uninstall that would destroy the reader's
   charts, journal and entitlement. If `adb shell pm list packages | grep
   astra` shows two, the `.dev` one is disposable.

## What shipped

Six defects off devices (full table in `RELEASE_v1.0.3.md`), of which two were
wrong answers rather than wrong behaviour: **sidereal whole-sign houses** (~1
body in 3 in the wrong house on every such chart) and the **half-up vs
half-even rounding** mismatch. Plus the entitlement paste field and its
malformed-link fix, the service-worker retirement, and **Astra's own app icon
— every build before this shipped the stock Capacitor logo as the app's face.**

New: today's card on the Reading chapter, an opt-in daily notification, and a
home-screen widget showing the chart wheel with the day's card beneath it.

## The three things a device found that CI could not

All of these passed in a browser and in the full CI matrix:

1. **`registerPlugin` returns a PROXY.** Resolving any promise with it makes
   the runtime probe for `.then`, which the proxy forwards to native as a
   method call literally named "then" — `"AstraWidget.then()" is not
   implemented on android`. The handle must live in a module variable and
   never be a promise's resolution value.
2. **The global `input {width:100%}` (theme.css:415) applies to checkboxes.**
   The daily toggle claimed its whole row and pushed its own label off the
   screen edge. Flex basis of `auto` IS that width, so flex alone cannot fix
   it — the box needs an explicit size.
3. **A VectorDrawable can compile, package, and still fail to inflate.** The
   app icon as a vector dropped the entire adaptive icon to Android's robot
   placeholder with *nothing in logcat naming it*. Two-arc circles instead of
   a degenerate single arc did not help. Shipped as PNG; the dead end is
   recorded in #176 so it is not rediscovered.

## Accepted limitations, so they are met as decisions

- **The daily notification fires within a ONE-HOUR window** (`dumpsys alarm`:
  `window=+1h0m0s0ms`). Android grants exact alarms only to holders of
  `USE_EXACT_ALARM`, which Play restricts to alarm-clock and calendar apps —
  Astra would not qualify and should not ask. The time-picker copy still
  implies to-the-minute precision and should be softened.
- **The widget only redraws while the app runs.** `updatePeriodMillis` is 0 on
  purpose: the wheel can only change when the app rasterises it.

## What the NEXT session does

1. **Merge #180 and deploy the landing page.** This is the only thing standing
   between the release and the people it is for.
2. Soften the notification time copy (see above).
3. M5 is unchanged and still non-code: LLC, confirm prices, live keys, one
   real purchase, cancel → `tier: free` → refund, in that order.
4. Track A3's remaining anchors are now reachable — **network egress works
   from this environment**, contrary to the session-25 note. JPL Horizons
   returns data; Mars at J2000 agrees with the engine to **0.076 arcsec**.
   The Sun (`COMMAND='10'`) returns a header with no ephemeris and needs a
   workaround. `parity/anchors/ACQUISITION.md` has the exact queries.

---

# SESSION 25 — 2026-08-12

## What landed (the ratified both-in-one-bundle order, done)

1. **The entitlement paste field** — the missing last mile. The Library's
   Vault (chapter VIII) now carries "⚿ Bring your key": paste the bare token
   OR the whole unlock link (the `?entitlement=` URL — the token is extracted
   from it), whitespace from wrapped pastes stripped, verified via
   `GET /api/entitlement` BEFORE storing. A bad paste stores nothing and says
   why; offline says it couldn't verify and stores nothing. Store action:
   `importEntitlement` in `useStore.ts`; UI in `LibraryVault.tsx`; five e2e
   cases in `entitlement-import.spec.ts` (invalid, offline, bare token, full
   link, wrapped whitespace).
2. **The interactive tarot widget** — `TarotCard.tsx`. A dealt spread lands
   face-down (engraved inline-SVG back, no asset fetch); tap turns the card —
   one 3D flip per intent, instant under `prefers-reduced-motion`; the same
   tap publishes the card to the margin glass, so no second tap is owed.
   Gyroscope tilt parallax on revealed cards (±4°, damped, never on reduced
   motion, never prompts on iOS — no permission request, so it simply stays
   still there). A fresh deal resets every card face-down. Presentation ONLY:
   the deal is the untouched parity-locked seeded draw.
3. **Reconciliation Report** against the operator's ASTRA work order:
   `RECONCILIATION_2026-08-12.md`. Headline: the order assumes pre-launch;
   Astra launched 2026-08-11. Track A (generative parity + external anchors)
   is the strongest genuinely-open work; C1 (retire MT19937), D2's verify
   posture, and B1's local-first inversion would reverse ratified decisions
   and are escalated, not implemented.

## Verified

- backend **374 passed** · astra-core **48 passed** (parity green — the drawn
  cards are still bit-identical to the backend draw) · frontend unit **25
  passed** · **full e2e suite green including `no-external.spec.ts` and
  `arcana-offline.spec.ts`** (the widget works offline; zero new off-origin
  requests).
- Spec updates that ride along: `arcana-offline.spec.ts` and
  `journal.spec.ts` now drive the face-down → turn interaction; the journal
  spec scopes to the card's own pad (the turn publishes to the margin, which
  adds a second pen — same disambiguation the margin's arrival forced before).

## Then Track A was started, and it found something (session 25b)

**A1 — the generative parity harness is live.** `backend/tools/parity_property.py`
draws 2000 seeded, stratified cases per CI run and compares the backend
against `@astra/core` through a long-lived bridge process
(`packages/astra-core/tools/case-bridge.mjs`). New CI job `property-parity`,
seeded from `github.run_id`, so any red build replays locally with one
command.

**⚠️ It found a live bug on its first run — sidereal whole-sign charts were
wrong on device.** `@astra/core` computed whole-sign cusps by shifting the
*tropical* sign boundaries into the sidereal frame, so all twelve cusps sat
~5° mid-sign (the ayanamsha mod 30) instead of snapping to sidereal
boundaries the way `swe_houses_ex` does. About **one body in three landed in
the wrong house** on every sidereal whole-sign chart. Fixed in
`packages/astra-core/src/ephemeris.ts`; pinned by
`packages/astra-core/test/sidereal-houses.test.ts`. The nine golden vectors
never covered sidereal whole-sign, so nothing was red — which is exactly the
gap the work order predicted.

Verify the harness has teeth in ~30 s:
```bash
cd backend
PARITY_INJECT_BIAS_DEG=0.0167 .venv/bin/python tools/parity_property.py --n 5 --seed 7
# -> 0/5 cases agree   (a 1-arcminute bias must turn it red)
```

**`--case` does not echo its input, on purpose.** CodeQL flagged the harness
for clear-text logging on PR #170 and was right: generated cases are synthetic
and safe to print, but `--case` takes arbitrary JSON and the reason to reach
for it is to reproduce ONE chart that misbehaved — i.e. exactly when the input
is a real person's birth moment. Supplied cases now report which quantities
diverged as a closed set of category labels — not redacted values, but a fixed
vocabulary nothing derived from the input can escape. If you are debugging a
user report, you
already hold the input; the tool will not put it in a CI log for you.

**A3 — anchors: infrastructure done, data partial and deliberately so.**
`parity/anchors/` now has the provenance contract, a CI `anchors-guard`
(any anchor diff without an `ANCHOR-CHANGE:` trailer fails the PR), and two
runners that assert each engine independently. **ΔT at both ends of 2000 is
checked in** from the NASA GSFC / Espenak-Meeus tables; the backend matches.
Everything else — planetary longitudes from JPL Horizons, four eclipses,
Lahiri ayanamsa — is **blocked on network egress**: Horizons, GSFC, USNO,
IERS and Wikipedia are all 403 from this environment. The exact queries and
schemas are written down in `parity/anchors/ACQUISITION.md` and both test
runners pick up each file the moment it appears. **This is ~20 minutes of
work for anyone on an unrestricted network**, and the ayanamsa anchor is the
one to do first — A1 just demonstrated the sidereal frame is where the real
bugs are.

## Then A2 — and the suite that passed while testing nothing (session 25c)

**A2 is done: the tolerance contract, the boundary-adversarial suite, and the
ratchet.** `parity/tolerance.contract.json` states, per quantity, the unit,
the bound, the product justification, and **the categorical decision the bound
protects**. `backend/tools/parity_boundary.py` constructs 253 cases at
measured distances from real boundaries — sign, house cusp, aspect orb cutoff,
retrograde station — and asserts the two engines make the same DECISION.
`check_tolerance_ratchet.py` fails any PR that widens a bound without an ADR.

**⚠️ Two ways this suite was silently useless before it was any good. Both are
worth carrying forward, because both looked green.**

1. **It passed clean under a 1-arcminute injected bias** — the exact
   acceptance criterion. Cause: the falsification knob
   (`PARITY_INJECT_BIAS_DEG` in the bridge) perturbs the TS engine's *reported
   longitude* AFTER that engine has already assigned sign, house and aspects.
   That correctly falsifies A1, which compares longitudes, and is invisible to
   A2, which compares classifications. The fix was to inject **upstream of
   every decision** (`--inject-bias-deg` monkeypatches the backend's
   `swe.calc_ut`). **A falsification hook is only valid for the specific
   comparison it sits upstream of.**
2. **Its probes were landing ~15° from the boundaries they claimed to test.**
   The root-finder searched for "signed distance to the *nearest* 30°
   multiple", which jumps +15° → −15° at every sign midpoint; the bisector
   converged onto those discontinuities. Probe counts looked healthy. The fix
   targets one specific boundary at a time (continuous through the crossing)
   and **discards any probe that did not land where it was aimed** — keeping
   and measuring them is what turned a broken generator into a silent one.

Also: sensitivity is set by the smallest probe distance *outside* the band. A
probe at distance d only flips under a bias b when b > d, so with multiples
jumping 1.0 → 2.0 the floor was 0.02° — above the 0.0167° it had to catch.
`BAND_MULTIPLES` now includes 1.1 and 1.5.

Verify all of it in ~2 minutes:
```bash
cd backend
.venv/bin/python tools/parity_boundary.py                          # 253/253 green
.venv/bin/python tools/parity_boundary.py --kind sign --inject-bias-deg 0.0167
# -> must exit 1 with "engines DISAGREE ... outside the 0.01 band"
```
CI runs the injection as a step that **fails the build if the suite survives
it**, so "has teeth" is checked rather than trusted.

Two smaller things found on the way: dignity is a pure function of sign (so it
has no boundary of its own), and at an exact station both engines report
`retrograde=true` beside a displayed speed of `0.000000` — the flag comes from
the full-precision value (`ephemeris.py:200`), the display is rounded to 6dp
(`:195`). Odd-looking, not wrong, noted in the suite.

## The rounding-mode divergence A1 caught in CI (session 25c)

**A1 went red on PR #171 with a fresh CI seed and found a real cross-engine
bug.** `meta.julian_day` differed by exactly 1e-6 on one case in 2000.

**Cause:** `Math.round` is round-half-**UP**; Python's `round()` is
round-half-to-**EVEN**. TS's `round6` was `Math.round(x*1e6)/1e6`, so **every**
rounded field — longitude, latitude, declination, speed, angles, cusps —
carried the mismatch. It was invisible because a tie costs 1e-6, far inside
the 0.01° those fields are held to. `meta.julian_day` is the one field
compared at 1e-6 (an equality check), so it was the only one strict enough to
expose it. On negatives the two even disagree in *direction*:
`Math.round(-1.5)` is −1, Python gives −2.

RESONARIUM_PARITY.md Constraint 1 had already recorded this exact dependency
for orbs. It was a known bug shape sitting unfixed in a different field.

**⚠️ The first fix made it worse — 1 divergence became 5.** Scaling by 1e6
before rounding *manufactures ties that do not exist*:
`2451710.5140625000931` is a double sitting just **above** a tie, so both
engines correctly round it up — but `× 1e6` rounds the product to exactly
`…0625e6`, creating a tie and sending it down. **Never do tie detection with
arithmetic on the scaled value.** The correct rule keeps the platform's
exact-value rounding (`toFixed`, specified against the real value like
Python's `format`) and overrides *only* on a genuine tie, detected by reading
the decimal expansion:

```
packages/astra-core/src/ephemeris.ts → fixedHalfEven()
```

Both cases are pinned in `packages/astra-core/test/rounding-mode.test.ts` —
the genuine tie AND the near-tie — because a refactor back to `Math.round`
looks like a harmless simplification. The parity vectors were untouched: the
fix moved TS toward Python, which generated them.

**Verify:** `.venv/bin/python tools/parity_property.py --n 2000 --seed 31559911369`
→ was 1999/2000, then 1995/2000, now **2000/2000**.

## What the NEXT session (or the operator) does with this

- ✅ **DONE in session 26 — the APK cycle shipped as v1.0.3, not v1.0.2.**
  Built, signed (cert unchanged), published, and verified by updating over an
  installed v1.0.1 on the Pixel. The service-worker retirement and the
  sidereal whole-sign fix both rode it, as predicted here. The one part still
  open is the landing-page deploy — see the session 26 section at the top.
- The app-link (`VIEW` intent-filter + `assetlinks.json`) remains the
  refinement path; the paste field removes the urgency.
- M5 is unchanged and still non-code: LLC, confirm prices, live keys, one
  real purchase, cancel → `tier: free` → refund, in that order.

---

# SESSION 24 — 2026-08-11

## Start here: the three things most likely to bite you

1. **`/api/health` returning `ok` proves almost nothing.** It said `ok` while
   the container had no ephemeris and **Chiron was missing from every chart**
   (16 bodies, not 17; every other position bit-identical; nothing logged).
   Always check `ephemeris` = `swiss-files`, `personal_mode` = `false`,
   `ai.configured` = `true`.
2. **The published APK (v1.0.1) does NOT contain the service-worker change.**
   That merged after the build. The next APK build picks it up — and until one
   ships, an installed app can still serve a stale bundle after an update.
3. **Stripe test keys are PARKED, not deleted** — commented in the server
   `.env` as `# M0-parked AAE_STRIPE_*`, backup at `.env.bak.stripe-m0`. They
   were pulled because **test keys on a public instance let anyone mint a real
   365-day entitlement with card 4242**. The rail mints on a completed session
   regardless of key mode.

## Where everything is

| | |
|---|---|
| landing | https://astra-arcana.com (+ `www`) — apex |
| app + API | https://app.astra-arcana.com |
| origin | Hetzner cpx22, Nuremberg. IP in `ops/origin.env` (gitignored) |
| ssh | `ssh -i ~/.ssh/astra_hetzner astra@$ORIGIN_IP` |
| deploy | on the box: `git pull && docker compose up -d --build` |
| TLS | Cloudflare `strict` + Origin CA cert (2041); nginx listens 443 |
| release | **v1.0.3**, pre-release, APK attached, checksum verified against the DOWNLOADED file |
| test device | **Pixel 10a**, Android 17 / SDK 37, USB-authorised, `adb devices` |

`ops/provision_hetzner.sh` and `ops/cloudflare_dns.sh` reproduce the infra. Both
preflight by default and change nothing without `--create` / `--apply`.

## ✅ THE NEXT SESSION — RATIFIED WORK ORDER (operator, 2026-08-11)

**Build both, in one APK cycle: the entitlement paste field, and the
interactive tarot widget.** Not a proposal — this is decided. Detail below.

Sequencing that matters: land BOTH in the bundle before rebuilding the APK.
Every Android change costs a rebuild, a re-sign, a fresh checksum, a landing
page edit and a release — doing them separately pays that four times. The
service-worker retirement (already merged, not yet in a published build) rides
along in the same rebuild, which will be **v1.0.2 / versionCode 3**.



### ⚠️ A paying customer cannot get their key into the Android app

A1's third check ("import an entitlement") was never closed, and investigating
it found there is **no import path at all** on Android:

- the only mechanism is `?entitlement=<token>` in the URL (`useStore.ts:198`)
- the APK has **no address bar**
- `AndroidManifest.xml` declares **only a LAUNCHER intent-filter** — no `VIEW`
  action, no deep link, no app link
- there is **no paste-a-token field** anywhere (`SupportModal`'s only input
  takes a crypto tx hash)

So the entire reader-mode premise — "subscribe on the web, bring the key back"
— has no last mile. The APK signposts people to a purchase they then cannot
use. **Fix this in the same update as anything else that touches the APK**, so
it is one rebuild, one re-sign, one checksum change, one release.

Two candidate mechanisms, cheapest first:
1. **A paste field** in the Library (chapter VIII) next to the vault restore.
   No manifest change, no rebuild risk beyond the bundle. Validate by calling
   `GET /api/entitlement` with the pasted token before storing it.
2. **An app link** (`VIEW` intent-filter for `astra-arcana.com`), so the
   post-purchase link opens the app directly. Nicer, but needs
   `assetlinks.json` served from the apex and a manifest change.

Do (1) first; (2) is a refinement.

### The interactive tarot widget (operator's request)

Almost all the substrate already exists — this is a presentation layer, not an
engine:

- **full 78-card data** in `packages/astra-core` (`tarot-cards.json`, generated
  from the Python source, so it cannot drift)
- **deterministic draws** — `mt19937.ts` is CPython-compatible and bit-exact
  with the backend; `parity/tarot-draw.json` locks it
- **offline readings** already work (`buildLocalReading`)
- **deck-art plates** already render (`plate_art.py`, oracle-gated)

Suggested shape, consistent with the existing design language:
- a `TarotCard` component: face-down, **tap to flip** (3D transform), showing
  the engraved plate
- **tilt parallax** — the phone has a gyroscope and the project already invests
  in touch (pinch-zoom on the wheel, long-press `data-pop`)
- honour the **motion budget** in the Track R material pass, and
  `prefers-reduced-motion` — one motion per intent
- it belongs in chapter VI/VII (Arcana → Draw)

**Acceptance:** a drawn card is still bit-identical to the backend draw
(parity vectors must stay green), the widget works offline, and no new
off-origin request appears (`no-external.spec.ts` must stay green).

## What M5 needs, and none of it is code

- **the LLC** — your roadmap draws the line at the first *live* payment. It is
  now also the cheaper Play route: **organisation accounts skip the 12-tester /
  14-day closed-testing requirement** that new personal accounts must complete.
- **confirm prices** — $3.25 / $9.99 / $5.50 are still flagged as placeholders
- then: live keys into the host secret store only, one real purchase,
  **cancel → verify `tier: free` → refund** (in that order — see below)

## Hard-won specifics

- **Refund does NOT revoke a subscription.** Mint stores
  `ref = payment_intent OR subscription OR session_id` (`sub_…`);
  `charge.refunded` gives `py_…`. Different namespaces. Correct for one-time
  purchases. **Cancel is the revoke trigger.**
- **`${VAR:-}` sets a variable to EMPTY, not absent.** `os.environ.get(k,
  default)` only falls back when a key is *absent*, so `float("")` raised at
  import and crash-looped the entire API. `budget._f()` is the idiom to copy.
- **A price list is not a stock list.** Hetzner quotes machines it cannot
  place; only `/v1/datacenters[].server_types.available` knows. Prices are USD.
- **Android `env(safe-area-inset-*)` reflects display cutouts, not the status
  bar.** It resolves to 0. Insets must be consumed natively (`MainActivity`).
- **`git cherry` cannot see through a squash.** Probe `main` for a branch's
  distinctive *lines*. Merging is now **rebase-only** at the repo level, with
  branches auto-deleting, so this should not recur.
- **Never paste a secret on the same line as `cat > file`** — it becomes part
  of the filename. Type the command, press Enter FIRST, then paste, then Ctrl-D.
- **Cloudflare's Browser Cache TTL is a floor, not a default** — it raised
  `no-cache` on both service workers to 4h. Zone now respects origin headers.
- **APK signing:** JDK **21** (`~/.jdks/jdk-21.0.12+8`). `--ks-pass file:`
  reads one line per reference, so the second read hits EOF — use `env:` for
  both, with `--ks-key-alias astra`. Recipe in `APK_A0_FINDINGS.md`.

## Credential state

| | |
|---|---|
| `~/.cloudflare-token` | **works** — zone-scoped (DNS / settings / SSL / read) |
| `~/.hetzner-token` | **INVALID** — rotated, and the whole "Token created" page was pasted instead of the value. Only needed to change the firewall/server. |
| `~/.stripe-test` | works, `sk_test`, livemode false |
| `~/.astra-signing/` | the keystore. **Outside every repo; nothing can regenerate it.** Confirm it is backed up somewhere that survives this disk. |

## Still open, none of it blocking

- v1.0.1 is a **pre-release** — verified on one phone, not a matrix. Promote
  with `gh release edit v1.0.1 --prerelease=false`.
- Play Store needs an **AAB**, not an APK; signing is currently post-build via
  `apksigner`, which does not carry over to bundles.
- 27 stale branches were content-probed and deleted; tips are in the
  session-24 PR bodies and recoverable by SHA.

---

# SESSION 23 — 2026-08-08

## TL;DR

Asked to finish the landing page and APK; both are done. Then, following a
question about what happens when the API calls fail, found three cost controls
that were present, plausible, and doing nothing.

1. **The APK exists and is signed.** #150 said no APK could be built here; the
   SDK is installed now. `astra-1.0-reader.apk`, 5.3 MB, v2+v3 signed, RSA 4096.
   Reader mode verified **inside the signed artifact**, not in the source.
2. **The free tier was never gated.** `/api/ai-ask`, the streamed ask and tarot
   never called `budget.allow_call`. The global cap did not cap the one path
   with no revenue against it.
3. **Every anonymous visitor shared one budget bucket** (`user_key(None)` →
   `"anon"`), so one abuser starved every free user.
4. **The "per-IP" rate limiter was keyed on the proxy's IP** in production —
   one shared window for the whole internet.
5. **Chart payload trimmed**: free-tier chart block −73%, a free premium reading
   −24%.
6. Landing page written and claim-checked; `uuid` advisory fixed.

## ⚠️ 1. There is no open PR for 6 commits — do this first

PR #152 was **squash-merged mid-work** (2026-08-08 06:33Z) while three more
commits were already on the branch. `main` got the APK/landing work and the
metrics counter; it did **not** get the budget gating, the chart-payload work,
the `uuid` override, or the merge commit.

```
git fetch && git rev-list --left-right --count origin/main...landing-page-and-apk
# -> 0   6      (main has nothing we lack; we have 6 main lacks)
```

**Those 6 commits are pushed and reviewed by nobody.** This is exactly the
orphan trap in [[stacked-pr-orphan-trap]]. Open a PR for them.

`git cherry` reported all 5 original commits as `+` (absent from main) even
though main demonstrably had two of them — **a squash changes the patch-id, so
`git cherry` cannot see through one.** What actually answered the question was
grepping main for symbols: `git show origin/main:backend/metrics.py | grep
observe_ai_fallback`. Use content probes, not patch-ids, against a squashed main.

## The APK

| | |
|---|---|
| path | `frontend/android/app/build/outputs/apk/release/astra-1.0-reader.apk` |
| sha256 | `b462f85e649a1a87b707f7ebea8fa5ab9b923b1f2ca2a7d638c7e9555d30eacd` |
| cert sha256 | `c568d41d45af616f034819320640f1a7368dbdaeb04346bda72ab203b2d0a82e` |
| build | `JAVA_HOME=$HOME/.jdks/jdk-21.0.12+8` — **21. Not 17, not 26.** |

**JDK 17 fails** (`invalid source release: 21`). **JDK 26 fails later and more
misleadingly**, inside AGP's `JdkImageTransform` running `jlink` — the error
names `jlink`, so it reads as a corrupt SDK rather than a too-new JDK. Full
recipe and the `apksigner --ks-pass file:` EOF gotcha in `APK_A0_FINDINGS.md`.

**The APK is not reproducible byte-for-byte** — signing embeds timestamps, so
the checksum changes on every rebuild. Publish the checksum of the *uploaded*
file. The web bundle underneath IS reproducible (`index-CYz-p5vB.js` reproduced
across three builds hours apart), which is what makes the `var ml=!0` check mean
anything.

## 🔑 The signing key — the one unrecoverable thing here

`~/.astra-signing/` — keystore, password file, and `BACKUP-README.txt`.
**Outside every git repo, by design. It will NOT survive a fresh clone or this
disk dying, and nothing in the project can regenerate it.** Lose it and no
future build can ever update an installed Astra. Operator was asked to back it
up on 2026-08-07; **confirm that actually happened before shipping anything.**

`frontend/android/.gitignore` ships Capacitor's `*.jks`/`*.keystore` rules
commented out — uncommented here, since the remote is public.

## Cost controls — READ BEFORE GOING LIVE

The operator has **$300 total** for the rest of the build. Defaults are wrong
for that: `AAE_GLOBAL_DAILY_USD` defaults to **$100/day**, so three busy days
spend everything. Set in `.env` (documented in `.env.example`):

```bash
AAE_GLOBAL_DAILY_USD=3.00
AAE_USER_DAILY_USD=0.25
AAE_TRUST_PROXY=1      # ONLY while the backend is expose:, never ports:
```

**`AAE_TRUST_PROXY` is load-bearing in both directions.** Unset behind a proxy →
every visitor resolves to the proxy and both the rate limiter and the per-IP
budget collapse into one shared bucket. Set while directly reachable → anyone
forges a header and gets unlimited buckets, which is worse because it looks like
it works.

**How to tell a dead balance from a quiet day:** `GET /api/admin/stats` →
`ai_fallbacks`, keyed by reason. `degraded` = go top up. `capped` = the guard
working. `unconfigured` = nothing wrong. Before this session a dead provider
just made `aae_ai_calls_total` go flat, which is indistinguishable from nobody
showing up — the worst possible ambiguity right after an ad push.

## Blocked on the operator

1. **`astra-arcana.com` does not resolve** (checked: no DNS). It is baked into
   the signed APK's "subscribe here" signpost. **Register it before the APK is
   distributed** — the URL is immutable in a shipped binary.
2. **No GitHub release exists**, so the landing page's download button points at
   an empty releases page. Publishing it is what makes that section true.
3. **Three device checks close A1**: install, cast in airplane mode, import an
   entitlement. `adb devices` was empty. Command in `APK_A0_FINDINGS.md`.
4. **Deploy layout unresolved (M4).** `landing/index.html` assumes it sits at `/`
   with the app at `/app/`; `nginx.conf` serves the app at `/`. The four
   `/legal/*` links are already correct; `/app/` is broken in every layout until
   nginx gains a location. Changing nginx → re-check `test_edge_headers.py`.
5. **LLC** — discussed, not decided. The line is the first *live* payment (M5),
   not launch. State choice dominates recurring cost (CA $800/yr vs ~$50
   elsewhere), which matters against a $300 budget.
6. **Dependabot #9** (`uuid`) is fixed on the branch; it closes when the branch
   merges. `main` never had the vulnerable dep — it arrived with `@capacitor/cli`.

## Docs corrected this session — don't re-trust the old numbers

- **`PRICING_MODEL.md` §1**: the "5,646 tokens" chart figure measured
  `parity/natal-chart.json`, the **full** chart. `_build_context` discards 72%
  before serialising. Overstated ~3×, and "~87% of a free-tier prompt" with it.
- **`PRICING_MODEL.md` §6**: predicted trimming would take a free reading "to
  well under a cent". **Arithmetically impossible** — 700 output tokens cost
  $0.0105 alone. Real: $0.0189 → $0.0142 (−24%). $100 buys ~5,300 → ~7,000
  readings, a +32% extension, not 5×. **Input is no longer the lever; output
  budget and readings-per-device are.**
- **`APK_A0_FINDINGS.md`**: "no APK was produced" is superseded, marked in place.

## Gotchas learned today (each cost real time)

- **Never call a symbol unused until you have grepped for it.** `PURCHASE_URL`
  pointed at `#support` with no such anchor on the landing page — it looked
  dead, was "fixed" to `#pricing`, and rebuilt and re-signed twice before
  `App.tsx:101` turned up, routing `#support` to the Support panel. Cost two
  full build-and-sign cycles. Resolution: `#support` now works under **both**
  deploy layouts, so a signed binary does not depend on an unmade decision.
- **Measure the string the model receives, not the file it came from.** Cost a
  wasted benchmark, and it is the same error `PRICING_MODEL` §1 had made.
- **A cost control is verified by finding its call site, not by reading the
  module that implements it.** `budget.py` defined `"ask"` and `"tarot"` in
  `_NOMINAL_CHARS` and nothing ever called it — a price list mistaken for wiring.
- **On a conflict, "accept both" is a real hazard, not a safe default.** Three
  of today's six would have kept two copies of `BUDGET.record(...)`, charging
  every paid call twice and silently halving the cap.
- **`pkill -f` still kills its own shell** (hit again, exit 144). Kill by port:
  `ss -Htlnp 'sport = :PORT' | grep -oP 'pid=\K[0-9]+'`.

## Verify the session-23 claims in ~90 seconds

```bash
cd backend && .venv/bin/pytest -q                      # -> 366 passed
cd ../frontend && npm test && npm audit                # -> 25 pass / 0 vulns
unzip -p android/app/build/outputs/apk/release/astra-1.0-reader.apk \
  assets/public/assets/index-CYz-p5vB.js | grep -ao "var ml=![01]"   # -> var ml=!0
~/Android/Sdk/build-tools/35.0.0/apksigner verify \
  android/app/build/outputs/apk/release/astra-1.0-reader.apk         # -> Verifies
cd .. && git rev-list --left-right --count origin/main...HEAD        # -> 0  6
```

---

# SESSION 22 — 2026-08-07

**Read this section first.** The session-19 LAUNCH work order below is still
live, but **M1 is done** — see "Where production actually sits".

## TL;DR

Asked for housekeeping; found `main` unbuildable and shipped the privacy fix
the repo had been promising.

1. **`main` was pushed — and was 48 commits BEHIND, not just 3 ahead.** The
   session-21 note said "ahead 3, unpushed"; true when written, stale by the
   time it was read. Merged `origin/main` (clean, no conflicts), pushed as
   `95a5f1a`. The globbed `backend/.env*` ignore rule is now on the public repo,
   verified: `.env`, `.env.public`, `.env.bak.*` all ignored, `.env.example`
   still trackable, `git add -A` stages 0.
2. **`main` had rendered a BLANK PAGE for ~30 commits** (#144). `App.tsx` used
   `isCurrentSky` and `birth` while declaring neither → `ReferenceError` on
   first render. PR #107 added them on its branch; the merge kept the usages and
   dropped the declarations. **No commit removed them**, so `git log -S` finds
   only the one that introduced them — bisect the *state*, not the diff.
3. **The birthplace no longer leaves the device** (#145, GAZ-1..GAZ-5). Nominatim
   geocoding and CARTO tiles are gone, replaced by a vendored 69,577-city
   GeoNames extract + a Natural Earth outline. `no-external.spec.ts` flipped red
   → green **with no edit to its assertion**; its host ledger is empty.
4. **The whole e2e suite is green: 138/138.** No red-on-purpose left.
5. Stale duplicate instrument removed (#143); discrepancy record + APK/i18n
   roadmap written (#146); `substrate-comm` pushed; PR #133 closed by operator.

## ⚠️ Red no longer hides red — keep it that way

The deliberately-failing `no-external` test was correct practice and worked. But
it sat red for weeks, so the CI badge was red for weeks, and **the genuinely
broken frontend build (#144) was indistinguishable from the accepted noise.**

**Rule going forward:** a test expected to fail must not fail the *build*. Use
`test.fail()` (Playwright inverts it — it goes red the moment the fix lands) or
skip with a tracking issue. Intentional red is a fine TDD device for one commit
and a broken smoke alarm after a week.

## Repo state

| where | state |
|---|---|
| `astro-aae` @ `main` | `d8e392a`, **synced with origin**, clean, `git add -A` stages 0 |
| open PRs | **none** |
| suites | backend **346** · frontend unit **12** · e2e **138/138** · build clean |
| tripwires | `gen_parity_vectors.py --check` and `gen_gazetteer.py --check` both green |
| `backend/.env` | Edition P: `AAE_PERSONAL_MODE=1`, Stripe commented — unchanged |
| Stripe keys locally | **all `sk_test`/`whsec`.** The live key exists only in the Stripe dashboard, not this machine |
| servers | ALL DOWN (8787/5173/8791 verified free) |
| `~/substrate-comm` @ `consolidation` | **pushed**; 41 tests green. `data/raw_measurements.json` left dirty on purpose — see below |

**`substrate-comm` dirty file:** the change is provenance-only (`git_rev`,
`generated_utc`) plus a key reorder. **Zero measurement values differ** —
verified structurally, and the three `nan -> nan` "differences" are Python's
NaN inequality, not real. Left uncommitted because re-stamping provenance onto a
commit that changed no data would claim a regeneration that did not happen.
`git checkout data/raw_measurements.json` to clear it.

## New this session, worth knowing

- **`frontend/` now has unit tests**: `npm test` (tsx + `node:test`, matching the
  `@astra/core` precedent). 12 gazetteer tests. Wired into the frontend CI job.
- **`backend/tools/gen_gazetteer.py`** — two-tier `--check`. Offline (what CI
  runs) re-derives invariants + a SHA-256 content digest from the artifact
  itself; `--source <cities5000.txt>` adds the full regeneration compare. CI
  deliberately does NOT download from GeoNames.
- **Precache grew 1.77 MB → 4.78 MB.** `maximumFileSizeToCacheInBytes` is raised
  to 5 MiB because `cities.json` (3.14 MB) exceeds workbox's 2 MiB default and
  would otherwise be **silently dropped** — an app that looks fine until offline.
- **`d3` and `@types/d3` were removed**: declared but imported nowhere, no chunk
  ever emitted. `d3-geo` is now a direct dependency. `npm audit`: **0**.
- **`docs/audits/DATA_DISCREPANCIES.md`** — ten recorded-vs-true gaps with the
  check that would have caught each. Read it before trusting a summary in here.

## Open decisions for the operator

1. **Production is blocked on you, not on code** — domain + VPS. See below.
2. **GAZ-5's sibling work** (`TZ-1..TZ-5`, historical timezone resolution) is now
   unblocked: `COMPREHENSIVE_TASK_SCHEDULE` §6.6 notes TZ is a hard dependent of
   GAZ-1, and GAZ-1 shipped with the IANA zone name per city. `CeremonyModal`
   still defaults `tz_offset` to `-5` and sets it from *today's* DST on
   geolocate — a real latent correctness bug for historical births.
3. **APK + translation** — both tracks scoped in `APK_I18N_ROADMAP.md`, both
   still PROPOSED and parked. `A0` (F-Droid build-from-source for the 404 KB
   `swisseph.wasm`) is the blocker and is small.

## Where production actually sits

Against `LAUNCH_ENGINEERING_ROADMAP.md`:

| | milestone | state |
|---|---|---|
| **M0** | validate rail in test mode | ⚠️ **the human click-through is still unverified** |
| **M1** | Track E-3 purchase UI + pricing | ✅ **DONE** (shipped before this session; verified here — 16/16 checkout e2e) |
| **M2** | Track E-1/E-2 threshold + depth | ✅ largely landed (E-1a/E-1b/E-2a merged) |
| **M3** | policies & copy | ✅ `/legal` shipped: privacy, terms, refunds, pricing + tests. Privacy updated this session to match GAZ |
| **M4** | deploy to VPS + live webhook | ⛔ **BLOCKED — needs your domain + box** |
| **M5** | go live (test→live keys) | ⛔ gated on M4 |

Phase 3.5 (backups) is also done — `backend/tools/backup.py` plus a **restore
drill actually performed 2026-07-20**, logged in `DEPLOY.md` §7.

**The honest read: the software is production-ready and the deployment is not
started, because it cannot be.** The single external dependency is the one you
named — a domain and a machine. Everything M4 needs is written down (compose
stack, Cloudflare TLS, secrets on the host, webhook endpoint, the two deferred
edge checks: securityheaders.com scan + Prometheus alert rules).

**When the box exists, the remaining path is short:** M0's click-through (~30
min, test mode, needs `stripe listen`), then M4, then M5. No further feature
work is required to take money.

---

# SESSION 21 — 2026-08-06

**Read this section first. The session-19 handoff below is still the live work
order for the LAUNCH path — it was not touched today and remains valid.**

## TL;DR

Today was not launch work. It was three things the operator asked for directly:
make the personal edition actually run, make the Resonarium suite runnable, and
keep both off GitHub.

1. **Edition P was dead and nobody knew.** `./run.sh --personal` had been
   *refusing to boot* — six live `AAE_STRIPE_*` keys in `backend/.env` tripped
   the fail-closed interlock in `entitlements.assert_safe_boot()`. The
   session-19 handoff (below) documents this toggle as reversible and says
   "reverse the toggle after"; a later session exercised it and never did. The
   operator's experience was *"my personal app still makes me pay"* — because
   the unrestricted build wouldn't start, so he fell back to the gated one on
   his own machine. **Fixed:** Stripe block moved to `backend/.env.public`
   (loaded by nothing), `AAE_PERSONAL_MODE=1` uncommented, timestamped backup
   at `backend/.env.bak.*`. Verified: an anonymous request with no token now
   resolves to tier `oracle`, verified, all premium features, rate limiter off,
   telemetry suppressed. `/api/health` → `personal_mode: true`. **346 backend
   tests pass.**

2. **Resonarium runs offline now.** 24 HTML files are **16 distinct
   instruments**; **11 of them loaded three.js / p5.js / Tone.js from cdnjs and
   fonts from Google**, so they did not open without a network and announced
   the operator's IP to Cloudflare + Google on every launch. Libraries and 18
   woff2 files are vendored into `resonarium/vendor/`, and
   **`resonarium/serve.py` rewrites the CDN references in flight** — the HTML
   files on disk are never modified. Verified in a real browser: `THREE.REVISION
   === 134` and `Tone.version === 14.8.49` resolving locally, canvas rendering,
   **zero off-host requests**. 38 resonarium tests pass.

3. **Two secret-exposure holes closed** (see "Security" below). One of them I
   created and caught; the other predates the session and is large.

## Security — read before any `git add -A`

- **`.gitignore` had `backend/.env` as a LITERAL path.** It matched that one
  filename and nothing else, so `backend/.env.public` (Stripe keys) and
  `.env.bak.*` were fully visible to git. Fixed by globbing `backend/.env*` +
  `!backend/.env.example` — **merged to `main`** (`dc7f3b7`, fast-forward).
- **`.gitignore` is per-branch content**, so that fix protects only branches
  that contain it. It is on `main` now, but **not on `tz-resolver-parked`,
  `gaz5-external-guardrail`, `privacy-third-parties`, or
  `resonarium-substrate-parity`** until each merges main. Covered on all of
  them meanwhile by `.git/info/exclude`, which is branch-independent — do not
  remove that block until every live branch carries the rule.
- **`AURIC_OCTITRICE/` is 84 GB containing 18 embedded git repositories**
  (`numbskull`, `bigLIMp`, `qwen-code`, model weights, …) and `services/` is
  354 MB — both were untracked in a working tree whose remote is **public**. A
  single `git add -A` would have tried to sweep them in, creating broken
  gitlinks for every embedded repo. Both are now in `.git/info/exclude`.
- **Current state: `git add -A` stages 0 paths on every branch.** If that ever
  changes, stop and look at why.

## Local-only posture (`.git/info/exclude`, NOT `.gitignore`)

The operator's instruction was *"this one should exist only on this machine."*
A `.gitignore` rule is itself a committed file and would travel to
`github.com/9x25dillon/astro_caster`, which is public — so the exclusions live
in `.git/info/exclude`, which never leaves the machine. Excluded:

`resonarium/vendor/` · `resonarium/serve.py` · `resonarium/LOCAL.md` ·
the downloaded instrument variants · `resonarium/resonarium/` ·
`AURIC_OCTITRICE/` · `services/` · secret env siblings.

**Consequence for the next session: `resonarium/serve.py` and `vendor/` are
invisible to git and will NOT survive a fresh clone.** They exist only here.
`resonarium/README.md` was deliberately reverted so the public repo does not
document a tool it does not contain; the instructions live in
`resonarium/LOCAL.md` (also local-only).

## Repo state

> ⛔ **SUPERSEDED — this table is a historical record of 2026-08-06, not current
> state.** Both "unpushed" rows are now false: `main` was pushed and
> `substrate-comm` was pushed on 2026-08-07. Use session 22's table above.
>
> Kept rather than corrected in place, because reading a stale state table as
> current is exactly the failure this document keeps producing — see
> `docs/audits/DATA_DISCREPANCIES.md` §E1. **Re-derive with `git fetch && git
> status -sb` regardless of which table you are reading.**

| where | state (as of 2026-08-06) |
|---|---|
| `astro-aae` @ `main` | clean; **ahead of `origin/main`, unpushed** (`git log origin/main..main`) |
| branch `gitignore-env-glob` | merged to main; safe to delete |
| branch `tz-resolver-parked` | 2 parked WIP tz commits; predates the ignore fix |
| `backend/.env` | Edition P: `AAE_PERSONAL_MODE=1`, Stripe commented |
| `backend/.env.public` | the 6 Stripe keys, gitignored, loaded by nothing |
| servers | ALL DOWN (8777/8787/5173 verified free). Restart the suite with `cd resonarium && python3 serve.py` |
| `~/substrate-comm` @ `consolidation` | 3 commits, **unpushed**, 41 tests green |

## Open decisions for the operator

1. ~~**Push `main`**~~ — **DONE 2026-08-07.** `main` was 3 ahead / **48 behind**
   (the operator merged heavily after session 21 closed). Merged `origin/main`
   in — clean, no conflicts — and pushed as `95a5f1a`. The public repo now
   carries the globbed `backend/.env*` rule; verified `backend/.env`,
   `.env.public` and `.env.bak.*` all resolve as ignored while
   `.env.example` stays trackable, and `git add -A` still stages 0 paths.
2. ~~**Two duplicate instruments are already public**~~ — **RESOLVED
   2026-08-07.** Removed `resonarium/resonarium_hologram enhanced.html`; kept
   `resonarium_hologram_cymatic_nodal_4D.html`. The removed file was the stale
   one on every axis: a space in the filename, a name claiming "enhanced" while
   its own `<title>` reads *Resonarium • Cymatic Nodal 4D*, and a single
   web-UI `Create …` commit — whereas the survivor arrived through a
   deliberate `Update and rename rhe.html to …`. Byte-identity was confirmed by
   md5 (`1f59baee…`) **before** deleting, so no content was lost.
3. ~~**Pre-existing bug:** `biosentinel-field.html` scoring readout~~ —
   **FIXED 2026-08-07.** The diagnosis in the original note was half right: the
   ids *do* exist, but they are **hyphenated** in the markup (`g-correct`,
   `g-total`, `g-streak`) while `updateScore()` referenced **underscored** bare
   identifiers (`g_correct`, …). A hyphenated id is not a valid JS identifier,
   so the named-element-global shorthand can never resolve it. Rewritten to the
   `document.getElementById(...)` form the rest of the file already uses.
   Proven fail-before/pass-after in a real browser: the old body still raises
   `ReferenceError: g_correct is not defined`, the new one drives
   guess → reveal → counter 0 → 1 with zero console errors.
   **Note: this file is local-only** (`.git/info/exclude`), so the repair lives
   on this machine and is NOT in any PR — it will not survive a fresh clone.
4. **`substrate-comm`** — push `consolidation` + open a PR, or leave local.
   *(Still open.)*

## Gotchas learned today (all cost real time)

- **`pkill -f "serve.py --port 8777"` kills its own shell** — the pattern
  matches the `bash -c` wrapper's cmdline. This repo already recorded the
  `pgrep -f` version of this trap; it applies to `pkill` identically. Kill by
  port instead: `ss -Htlnp 'sport = :8777' | grep -oP 'pid=\K[0-9]+'`.
- **Anything that inspects code must parse it, not grep it.** A grep-based
  "does this repo reach the network" audit flagged its own docstring (the
  sentence *"no code path that opens a socket"* contains the word `socket`).
  Rewrote as an AST walk over import statements — prose cannot trigger it.
- **Auditing the file on disk answers the wrong question** when something
  rewrites at serve time. The first `--check` reported 8 instruments as
  "unresolved remote" by scanning the originals rather than the served bytes,
  i.e. it flagged exactly the references the rewrite exists to remove.
- **Diagnose before you tune.** ~5 parameter sweeps were spent on a decoder
  before one diagnostic print showed detection was near-perfect (121–123 of 123
  events) and the *clustering* was the failure. See `substrate-comm`
  `CountTopology.decode` — the fix was to cluster in log space, because the
  design invariant is a ratio and a ratio is a distance only after a log.

## Verify the session-21 claims in ~60 seconds

```bash
cd backend && ./.venv/bin/python -c "
from dotenv import load_dotenv; load_dotenv('.env')
import entitlements as E
print('conflicts:', E._personal_mode_conflicts() or 'clean')
print('anon tier:', E.entitlement_status(None)['tier'])"      # -> clean / oracle

cd resonarium && python3 serve.py --check                      # -> exit 0
python3 -m unittest discover -s tests                          # -> 38 OK
cd .. && git add -A --dry-run | wc -l                          # -> 0
```

---

# SESSION 19 — 2026-07-24 (still the live LAUNCH work order)

_Last updated: 2026-07-24 (session 19 CLOSED — main @ b300c7b; #104 + #105
MERGED, servers down, .env back in personal mode, working tree clean)_

> **Correction from session 21:** the line above says ".env back in personal
> mode". That was true on 2026-07-24 but was **not** true by 2026-08-06 — a
> later session ran the live-test toggle documented below and did not reverse
> it, which silently disabled Edition P. If you use that toggle, reverse it in
> the same session, and verify with `E._personal_mode_conflicts()`.

## TL;DR for next session

**Phase 4 monetization is now FULLY on main and complete.** This session first
discovered that session 18's handoff was WRONG: #100 (Stripe rail) + #101 (cost
controls) showed MERGED on GitHub but had squash-merged onto a dead *stacked*
base branch, never reaching main (`stripe_rail.py`/`budget.py` were missing).
See [[stacked-pr-orphan-trap]] + WORK_JOURNAL session 19. Recovered both via
clean cherry-picks (suite returned to exactly 319, proving fidelity), THEN
added **4.3 deluxe purchase** (deluxe report on the Stripe rail, bound to one
Oracle session by the seed HASH — raw seed never reaches Stripe) and
**subscription self-service** (cancel/stop-auto-renew/update-card via Stripe's
Customer Portal, `POST /api/billing/portal` + a "Manage or cancel subscription"
button in the Support panel; cancellation → webhook revoke at period end) + a
partial-SSRF fix (allowlist `session_id` before it hits a Stripe URL). All in
PR **#104** (MERGED — landed on main first-parent-clean, trap did not recur).
Dependabot high (`brace-expansion` ReDoS) fixed in **#105** (MERGED). main @
b300c7b, 0 open PRs, **339 backend tests**. PUBLIC_LAUNCH_SCHEDULE.md Phase 4:
4.1/4.2/4.3/4.4 ✅ + subscription self-service ✅.

**Stripe is set up but the live click-through is NOT yet verified.** Operator
has enabled the Customer Portal (cancel + email notifications) in the dashboard
AND finished account verification + business review (live payments unlocked
next). The **Stripe CLI is installed** (`~/.local/bin/stripe`, v1.44.0). The
test key is saved **commented** in `backend/.env` (any active `AAE_STRIPE_*`
trips the personal-mode interlock — Stripe = Edition Q, exclusive with personal
mode). **LIVE-TEST TOGGLE** (reversible; exercised + reverted this session): in
`.env` comment `AAE_PERSONAL_MODE` and uncomment the `AAE_ENV`/`AAE_STRIPE_*`
block → `stripe listen --forward-to http://127.0.0.1:8787/api/stripe/webhook`
(fresh `whsec_` each run → into `.env`) → `bash run.sh` → `POST /api/checkout`
returns a hosted URL. The unfinished bit is the human click-through: pay test
card `4242 4242 4242 4242`, then Cancel via the portal, and watch mint→revoke.
Reverse the toggle after (already done — `.env` is back in personal mode).
**Token to roll:** the `sk_test_` key was pasted in chat once; when the operator
rolls it, re-place the new value into `.env` with the edit tool (never echo it).

**The resonarium (the other direction fork) is still specified-not-started** —
`docs/design/RESONARIUM_PARITY.md`: (1) printed 2-dp seed is lossy →
display-quantize before arithmetic + keep a full-precision parity vector;
(2) parity covers the deterministic substrate ONLY, never LLM statistics.

## WORK ORDER for next session (in this order)

**0. Preconditions.** `git fetch` + `gh pr list --state all` FIRST (the
operator merges FAST, sometimes mid-work AND same-session — session 18
merged #99–#103 while other work was still in flight; sessions 13/17 also
hit this). Working tree should be clean on main @ 08f4c33+.

**0.5. Direction — DECIDED (session 19): the revenue-bearing public app.**
The operator finished Stripe account verification + business review and wants
to monetize (asked to use a live key — held; not time yet, see below). The
resonarium fork is parked. **The intricate plan is
`docs/progress/LAUNCH_ENGINEERING_ROADMAP.md`** (authored session 19) — read
it; it supersedes the generic ordering below for the revenue path. Critical
path: M0 validate rail in test mode → **M1 Track E-3 (purchase UI + pricing
surface) = the next session** → M2 E-1/E-2 UX → M3 Phase 5 policies → M4 deploy
(D4 VPS) → M5 go-live (test→live keys). **The hard blocker is that the Stripe
rail has NO purchase UI and NO `?checkout=`/`?report_checkout=` redirect-return
handler** — M1 builds exactly that. A live key must NOT be used until M5 (no
public deploy, no buy UI, no policies yet); it was correctly held this session.

**1. Phase 4.3 — DONE (session 19), plus subscription self-service.** The
remaining monetization gap is now the **BUY UI (Track E, E-3 pricing surface)**:
the Stripe tier checkout (#100) AND the deluxe checkout (4.3) both shipped
backend-first with only client.ts wiring (`reportCheckout`/`claimReportCheckout`
/`openBillingPortal`). The Support panel has the CANCEL button, but there is
still no BUY flow — button → `/api/checkout` (or `/api/personal-report/checkout`)
→ redirect → handle `?checkout=` / `?report_checkout=` on return. That's Track
E's job. Also finish the live Stripe click-through verification (TL;DR toggle).

**2. Then 3.5 — backups + restore drill.** Scheduled encrypted backup of
`backend/data/*.db` + `backend/.env` (operator's machine = source of
truth; a `backend/tools/backup.py` with tar+age or openssl enc, cron/
systemd-timer instructions in DEPLOY.md), and — the exit criterion — a
RESTORE DRILL actually performed once: back up, blow away a COPY, restore
it, run `dev.py smoke` against the restored state, log the drill in
DEPLOY.md like the §6 rotation drill.

**3. Then 3.6 — staging deploy (BLOCKED on operator).** Needs the D4 VPS
(decision ratified: single VPS + docker-compose behind Cloudflare) —
operator provisions the box + DNS; the session then: compose prod stack
up, TLS via Cloudflare, run the smoke matrix + full e2e against staging,
AND the two deferred verifications that need a live edge: external header
scan (securityheaders.com — Phase 2.5's last open box) and Prometheus
alert rules (error-rate, AI-spend, uptime) in the scraper config.

**4. Riding alongside (any session, cap permitting):**
   - **Aug 1: Anthropic cap returns** — live-verify a Fable Oracle run
     (`dev.py ai check`, then one real report; the offline compilers have
     been serving honestly meanwhile).
   - P3 plate live-verify pattern is proven (one Death plate rendered
     2026-07-19, gpt-image-1, quality=low) — nothing pending unless the
     operator wants more plates.
   - PB1 book compiler (Typst evaluation) waits on the Phase-0 tome
     verdict, which waits on the operator's Lulu order.
   - D1 repo cut: operator-level decision, do NOT execute mid-session.

## Session-17 technical facts you will need

- **API is versioned now**: `API_BASE = "/api/v1"` in client.ts (exported
  — AdminPanel imports it); backend `_VersionPrefixRewrite` (pure ASGI)
  serves every route under both /api/v1/* and bare /api/* (skew
  tolerance for cached PWA shells); /api/v2 404s. e2e specs may NOT use
  exact-path globs like `**/api/oracle-report` — the five that did were
  converted to `url.pathname.endsWith(...)` predicates; write new specs
  that way.
- **Logging (#84)**: `logsetup.py` + `_RequestContext` middleware.
  JSON lines when AAE_ENV=production or AAE_LOG_JSON=1 (\"0\" forces off).
  Request id: contextvar, X-Request-ID echoed, well-formed inbound ids
  honored. **uvicorn's access log is silenced ON PURPOSE** — measured:
  it logs from outside the request's async context so the contextvar is
  invisible to it; OUR access line (logger `aae.access`) carries rid,
  method, path (QUERY STRING STRIPPED — `?entitlement=` must never reach
  logs), status, dur_ms. Privacy is a test:
  `test_structured_logging.py::test_no_birth_data_reaches_the_log_stream`.
- **TTS (#81)**: ElevenLabs transport blips retry once then serve the
  cached voice list; `voice_id` is allowlist-validated (base62 8-64) +
  URL-quoted — CodeQL flagged the unvalidated URL interpolation as
  partial-SSRF the moment the diff touched those lines. Bad ids → 400.
- **CodeQL is a live PR gate now**: it diffs alerts against main, so
  touching a line with a pre-existing taint makes it YOUR alert. Repo
  has 4 open alerts left, all deliberate (2 masked-fingerprint prints in
  operator CLIs, 2 CDN scripts in resonarium art files) — operator may
  dismiss in the Security tab.
- **Boot guard reminder** (bit us live this session): `AAE_ENV` unset =
  production = refuses AAE_DEV_TOKEN. Throwaway uvicorn instances need
  `AAE_ENV=development` explicitly.
- **The current dev token / unlock link**: rotated 2026-07-20 (drill).
  `backend/tools/unlock.py` prints it. Any token memorized before that
  date is dead.
- Dev servers were left RUNNING at close this time (operator was using
  the app: bare `bash run.sh`, NOT personal mode — telemetry on). Kill
  :5173/:8787 before running e2e if they're stale (memory gotcha: e2e
  `reuseExistingServer` + stale vite = local-fallback answers and cache
  specs fail).
- Suite sizes at close: **265 backend / 80 e2e (×2 projects) / 30 core**
  (256 after #84 logging; +9 for #85 metrics).

---
---

_(Previous entry — session 16 close):_

**Session 16 in one line:** the public-launch schedule was ratified and
Phases 1 (Edition P) and 2 (security hardening) both landed whole.

**What Phase 2 actually closed:**
- `AAE_PERSONAL_MODE=1` grants the whole instance oracle tier with no
  tokens/limits/telemetry; `assert_safe_boot` refuses to start if personal
  mode coexists with ANY public-facing signal (prod env, any
  `AAE_TREASURY_*` chain — matched by prefix now, not a hand-enumerated
  list — `AAE_ETH_RPC`, any `AAE_STRIPE_*` key, payment thresholds).
- Prompt quarantine (`backend/promptsafe.py`), CORS pinned to `AAE_CORS`,
  nginx security headers (drift-locked across their 3 duplicated blocks
  by `test_edge_headers.py` — nginx's `add_header` inheritance breaks the
  moment a location sets its own), request size cap, CodeQL in CI.
- `/security-review` ran over the whole Phase 2 range and found one real
  gap (the treasury-signal list above, pre-fix) — fixed and regression
  tested. Everything else came back clean.
- **Secret rotation drill actually performed** (not just documented):
  `AAE_SECRET` + `AAE_DEV_TOKEN` rotated, old dev token verified dead
  against a live server, new one verified live, smoke 24/24 green. If you
  need the current unlock link: `backend/tools/unlock.py` prints it fresh
  (the one memorized from earlier sessions is now dead by design).
- D1 (git-history birth-data decision) — **working-tree half done**: 4
  files that the original Phase-1.2 purge missed (a test fixture, a tool
  docstring, two audit-doc citations) got scrubbed. **Git history itself
  still carries the real values — the actual D1 execution (fresh public
  repo cut, ratified as option (b)) is still an open operator decision,**
  not something to do mid-session.

**Known state worth carrying:**
- Both `AAE_OPENAI_API_KEY` and `AAE_ANTHROPIC_API_KEY` are now SET in
  `backend/.env` (the OpenAI key was the one still missing as of session
  15's close). **Neither was live-verified this session** — P3 plate
  live-verify and a fresh Fable run are both still open threads.
- **Anthropic usage cap was exhausted until 2026-08-01** as of session 15
  — check whether that's lifted before assuming Fable calls will 400.
- Dev servers were shut down at session close — `./run.sh` to relight.
- **Gotcha for next time a branch is merged mid-work:** if you open a
  follow-on PR on the same branch and it conflicts with main, that's
  almost always the mid-work-squash pattern (main got only part of the
  branch's commits) rather than a real logical conflict — `git merge
  origin/main`, resolve by keeping the branch's newer text, done. Don't
  reach for a rebase here; merge is the simpler read on this shape.

**Next candidates:** Phase 3 (API versioning, structured logging, metrics,
backups, staging deploy on the D4 VPS target — this is where a live header
scanner finally has a host to point at) is the natural next arc per the
schedule. Standing threads that ride alongside, unaffected by the Q-track
work: PB1 book compiler, P3 plate live-verify, the operator's Phase-0 tome
order (still his hands — see the previous entry below), Phase 1 gifts only
after that object passes in hand.

---
---

_(Previous entry — session 15 close, still accurate for the tome/Track-R
state it describes):_

_(Previous entry — R-4, merged as #70):_ **The material pass. TRACK R COMPLETE.**
Four commits on `track-r-material`: (1) void glass — panels/surfaces become
translucent instrument glass over the starfield (backdrop blur + scanline),
phosphor-gold section rules, gradient border-fields (amethyst esoteric /
gold working) — all as a late-override block at the END of theme.css.
(2) The ion trace (--ion #7fe7dc), rationed to live computation ONLY:
on-device badges, streaming caret/spinner/margin-foot, Oracle/deluxe/
Course/plate mid-flight (`.is-live`), forecast events landing today
(`.fc-event--today`). (3) Constellation path — ConstellationPath.tsx
replaces the classroom's numbered list; stars publish lessons to the margin;
a star stays LIT when its journal reflection exists (seed
`path:${anchor}→${growth_edge}`, position `${order} · ${name}`); chapter
bloom = ONE 240ms clip-path radial wipe on the keyed .chapter-host, surface
entrances retired inside chapters. (4) The seven per-module `.arc-disclaimer`
renders collapsed into the chapter refrain footer (backend still sends the
field; frontend stopped rendering it). e2e/material.spec.ts drives
star→margin→reflection→lit-star end-to-end.

**After Track R:** next candidates from the roadmap — tome Phase 0 (dogfood
ONE printed POD copy, dark-cover test), PB1 book compiler (corpus →
press-ready book-trim PDF; tomeCompile.ts is its seed), P3 plate art
live-verify (operator adds AAE_OPENAI_API_KEY first), Anthropic usage cap
returns 2026-08-01 (live Course/Oracle runs possible again).

_(Previous entry — R-3, merged as #69):_ **R-3, the Library.** Built same-session right after
#68 merged. Four commits: (1) LibraryVault joins the shelf in chapter VIII —
vault export/restore moved from the profile bar, support & unlock live
there; masthead pill = identity, walks to the Library; the voice-canon
refrain runs at the foot of every chapter. (2) ✦ Generate My Tome:
lib/tomeCompile.ts maps the corpus onto the dial's eight chapters (chart→I,
sessions→II with deluxe preferred whole, courses→VI, journal→VIII;
III/IV/V/VII honestly wait), TomeMeter renders the spine (gilt segments
widen with material) + compile via the print-CSS path, refrain as colophon.
(3) Oracle + Soul fold into chapter II beneath the Arcana; Controls
launchers deep-scroll to them; remaining overlays = Support/Ceremony/Admin/
Glossary exactly. (4) **Layout truth found by driving: `.app` was
height:100vh so tall chapters overflowed their grid tracks and the sticky
margin glass vanished on deep scroll — grid is now height:auto/min-height:
100vh and the margin stays pinned everywhere.** 76 e2e green (38×2; new
library.spec.ts incl. tome-compile popup asserted to the colophon;
vault.spec drives the Library now).

**Then R-4 — the material pass, the last Track R PR:** void glass, phosphor
gold structure, amethyst fields, the ION trace (only live computation),
constellation-drawn learning path, motion budget (2.5°/min dial drift, one
240ms bloom, reduced-motion). Wireframes artifact §"The material system":
https://claude.ai/code/artifact/b42a9765-4e12-42fb-93fb-a4472c4d8102
Also worth folding into R-4: sweep the five scattered `disclaimer` render
sites now that the refrain runs as chapter footer (dedupe, don't double).

_(Previous entry — R-2, merged as #68):_ **R-2, the margin glass.** Built to the artifact's
build sheet (§"R-2 mockup", fig. 5), four commits: (1) the six chapter
components unwrapped — no .modal-overlay/✕/own-Escape; ForecastPanel's prop
renamed `onHome` (jump/Ask genuinely navigate to chapter I); the
.chapter-host neutralization CSS deleted; surfaces lost their modal-era
max-height caps (the host is the only scroll container). (2) `MarginNote` +
`marginContent` store slot; ten publish sites (natal links, drawn cards,
transit days, path steps, forecast events, eclipses, inter-aspects,
midpoints, star hits, shelf sessions) wear `.mg-sel`; DetailPanel renders
notes generically, chart detail is chapter I's fallback; leaving a chapter
clears the note. (3) DetailPanel = three-zone margin glass, Ask pinned at
the foot in every chapter, `/` focuses it; sticky + viewport-capped on
desktop (the stage's rows outgrow 100vh — measured, not assumed), stacks
under 1100px. (4) JournalPad in zone 2 keyed to the selection (explicit
session keys where they exist → prompted/overwrite-in-place with existing
text restored; derived freeform key otherwise; chart selections too).
**Found by driving:** the mini dial rail's viewport corner now belongs to
the Ask foot on wide screens → the rail pins to the STAGE's bottom-right
(`@media (min-width:1101px)` in theme.css). 68 e2e green (34 × 2 projects;
new margin publish/clear test; journal.spec scoped to the shelf's own pad
since the margin adds a second pen).

**Then R-3 (the Library):** Shelf/journal/vault as chapter VIII proper +
✦ Generate My Tome with the spine meter; fold Oracle/Soul overlays into
chapter II. **R-4 (material pass) stays LAST.** Wireframes artifact:
https://claude.ai/code/artifact/b42a9765-4e12-42fb-93fb-a4472c4d8102

**Session-14 facts you need:**
- **Anthropic usage cap EXHAUSTED until 2026-08-01** — Fable calls 400;
  offline compilers serve honestly meanwhile (course verified live that way).
- **The operator's image key is an OPENAI key** — plumbing shipped in #65
  (`/api/deck-art-image`, Studio "◈ render plate"). **Key still NOT in
  backend/.env** — operator adds `AAE_OPENAI_API_KEY=sk-...`, then live-verify
  ONE plate.
- **Voice canon (operator, verbatim): "nothing Astra produces is a life
  sentence, it is a life poem."** Governs all copy; R-2+ should collapse the
  five DISCLAIMER variants into this refrain as a chapter running-footer;
  it's the tome colophon. Copy test: does the line open a door or close one?
- The Course: backend/course.py + POST /api/course (oracle tier) + Classroom
  composer; 4.1 learning-path inversion FIXED (path departs anchor, descends
  when needed). Plates: backend/plate_art.py, oracle tier, honest 503 sans key.
- Dial (R-1): ChapterDial.tsx — nodes at fixed compass positions and they
  NEVER move (the drift lives on a decorative dashed ring; a drifting node
  broke both Playwright stability and the ergonomic law). e2e enters chapters
  via helpers.openChapter().
- Issue #54: every accepted item merged; close-out comment posted; operator
  may close it.

---
---

### (previous TL;DR, still accurate below)

**Direction: personal instrument** (operator decision — build what the owner
wants, close gaps; no store/ship pressure). Everything through **PR #44 is
merged**. The three big 2026-07-08 landings:

1. **Premium AI is live.** `AAE_ANTHROPIC_API_KEY` is set and verified
   (`dev.py ai check`); the in-depth Oracle Report and deluxe Personal Report
   compile on **Claude Fable 5** (with the Opus 4.8 server-side fallback), not
   the offline compiler. First real run produced a 13k-char Oracle report and
   a 47k-char Personal Report against the owner's chart.
2. **Full on-device body set** (PR #43): North/South Node, Chiron and Lilith
   compute in the browser via a vendored WASM Swiss Ephemeris
   (`packages/astra-core/src/vendor/swisseph/`). Parity vectors are pinned to
   the same committed seas-only ephemeris config on both stacks; the drift
   lock now spans all 17 bodies. No remaining §3 gaps — the on-device engine
   is body-for-body identical to the backend.
3. **H1 exit gate recorded** (PR #44): wheel touch pass (pinch-zoom,
   long-press popover, responsive svg), lazy leaflet, Lighthouse
   accessibility 100. **One manual item remains: the owner's literal
   airplane-mode phone test** (roadmap §6 checkbox).

## How to run / test

```bash
./run.sh                                    # backend :8787 + frontend :5173
backend/.venv/bin/python backend/tools/dev.py   # unified dev CLI:
#   unlock | token | smoke | parity | test | ai set/check/status
cd backend && .venv/bin/pytest -q           # 173 tests
cd packages/astra-core && npm test          # 30 parity/unit tests
cd frontend && npm run build                # typecheck + build
cd frontend && npx playwright test          # 46 e2e (23 × desktop/Pixel-7)
cd backend && .venv/bin/python tools/gen_parity_vectors.py --check  # tripwire
```

## Environment reality

- **Premium key is SET** in `backend/.env` — Oracle/Personal reports bill real
  Fable 5 tokens (~$0.80/$1.60 worst-case per report). `dev.py ai status` to
  confirm; `ai check` live-verifies (also catches the ZDR-retention 400).
- Parity vectors and the backend **test session** run against the *vendored*
  seas-only ephemeris (`SE_EPHE_PATH` forced in `tools/gen_parity_vectors.py`
  and `tests/conftest.py`) — committed, so CI reproduces byte-identically.
  Production (`run.sh`/.env) still uses the full `backend/ephe/` file set.
- Tests isolate their receipts ledger (`AAE_RECEIPTS_DB` → temp dir in
  conftest). The real ledger at `backend/data/receipts.db` contains whatever
  fixture txs leaked before 2026-07-08; harmless, but don't be surprised by it.
- Trust mode still OFF by default; `AAE_TRUST_MODE=1 ./run.sh` to exercise the
  purchase rail in the UI.
- **Backups (B3):** server-side state lives in `backend/.env` (secrets — dev
  token, AAE_SECRET, the Anthropic key) and `backend/data/*.db` (receipts +
  telemetry). Copy both when backing up the machine; the browser side is
  covered by the Vault export (⇓ Vault in the profile bar).

## Open threads / next candidates

- **☐ Airplane-mode phone test** (the last H1 checkbox, owner-only): install
  the PWA, toggle airplane mode, open → last cast renders, tarot draw +
  forecast work.
- **H2 (Capacitor wrapper / store distribution): parked** under the
  personal-instrument direction. The roadmap keeps the plan if the direction
  ever changes.
- **Hardening backlog parked** (same reason): Docker (R5), Prometheus (R4),
  prompt-injection hardening (R3), API versioning (F1), structured logging
  (F2), tarot-data externalization (old F5), aspect/ephemeris caching (F3/F4).
  R6 (client error telemetry) and the R2 remainder (deluxe purchases in admin
  stats) closed 2026-07-08.
- Before any public deploy (not currently planned): set `AAE_ETH_RPC`,
  `AAE_ORACLE_MIN_WEI`, `AAE_REPORT_MIN_WEI`; revisit the git-history
  birth-data decision (`docs/audits/AUDIT_REGRESSION.md` §5.1, operator chose
  LEAVE 2026-07-01).
- Ideas shelf: **EMPTY as of 2026-07-08** — all-bodies WASM Swiss (tolerances
  collapsed, astronomy-engine retired), sidereal on-device, and the tome's
  tarot plate grid (PDF-1 follow-on) all landed the same day.

## Known gotchas (carried forward)

- **After the operator merges dependabot PRs: `npm ci` BEFORE trusting local
  tsc/build** — stale node_modules masked the TypeScript 7 breakage (TS7
  hard-errors TS2882 on side-effect CSS imports; fixed by the once-missing
  `frontend/src/vite-env.d.ts`).
- **IndexedDB in e2e: readers open versionless** (`indexedDB.open(name)`) —
  an explicit lower version than the live DB throws VersionError and reads
  resolve null forever (bit the B2 spec when the journal bumped the DB to v2).
  Writers/seeders pin the current schema version.
- The bookshelf DB is `astra-bookshelf` v2: `sessions` (keyed by seed) +
  `journal` (keyed by id, seed-indexed). Vault format `astra-vault@3`
  (localStorage + bookshelf + journal); restore accepts @1–@3.

- **Base-URL bug:** `AAE_AI_BASE_URL` must NOT include `/v1` (code appends it).
- **Oracle token budget:** 2500+ tokens or readings truncate mid-sentence.
- Shell here is **fish** — use `bash -c '...'` for loops/conditionals.
- The raw oracle seed is a signature STRING (ends with the question); display
  uses `short_seed`, binding/minting uses the raw value.
- `npx playwright test` MUST run from `frontend/` (repo root has no config and
  collides with the astra-core node:test files).
- **New e2e specs import `test`/`expect` from `./helpers`**, not
  `@playwright/test` — helpers skips the first-run ceremony overlay, which
  otherwise intercepts real clicks (synthetic `dispatchEvent`s bypass
  hit-testing and mask the problem).
- Tokens copied from a wrapped terminal line break silently — use the
  `.replace(/\s+/g,"")` console snippet or `dev.py token`.
- `*.pdf` and `oracle_report_*.txt` are gitignored (print/report artifacts
  carry personal data; never commit them).

## Working-style notes

- Acceptance criteria up front ("done = tests green, committed, PR open") let
  work land in one pass.
- Bug reports travel fastest as a minimal reproduction: exact click path or
  verbatim console/error text.
- Multi-part asks are welcome as short numbered lists; each item gets verified
  independently.
- Merges are the operator's: open the PR, leave the button alone.
