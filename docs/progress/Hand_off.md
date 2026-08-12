# Hand_off.md

_Last updated: 2026-08-12 (session 25 — the ratified work order is **MERGED to
`main`** as `c656a66`: the entitlement paste field and the interactive tarot
widget. Track A (generative parity + external anchors) is on
`claude/astro-caster-launch-kdx6yz`, PR #170. The bundle is APK-ready; the
rebuild / re-sign / release (v1.0.2, versionCode 3) needs the operator's
machine — the signing keystore lives outside every repo by design.)
Re-derive before trusting any of this: `git fetch && git status -sb`._

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

## What the NEXT session (or the operator) does with this

- **One APK cycle**: rebuild the bundle → sync → build → sign (JDK 21,
  recipe in `APK_A0_FINDINGS.md`) → **v1.0.2 / versionCode 3** → new
  checksum → landing page edit → release. The service-worker retirement
  (merged in session 24, still unpublished) rides the same build. **The
  sidereal whole-sign fix now rides it too** — installed 1.0/1.0.1 builds
  compute those charts wrong on device until a new APK ships.
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
| release | **v1.0.1**, pre-release, APK attached, checksum verified live |
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
