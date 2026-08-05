<h1 align="center">🔮 Astra — the Celestial Observatory</h1>

<p align="center"><i>Read the sky. Draw the cards. Know your timing.</i></p>

<p align="center">A modern fortune-telling app that actually does the math — natal astrology, tarot, and predictive timing, computed to arc-second precision. Your birth details draw the chart and are then let go — <b>never written to a database, never written to a log</b>.</p>

<p align="center"><a href="https://github.com/9x25dillon/astro_caster/actions/workflows/ci.yml"><img src="https://github.com/9x25dillon/astro_caster/actions/workflows/ci.yml/badge.svg" alt="CI"></a></p>

---

## What you can do

Astra is a divination workbench built on real ephemeris math — the same celestial mechanics professional astrologers use, wrapped in an interface you can actually enjoy.

- **🌟 Cast your birth chart** — a living D3 wheel of every planet, house, angle, and aspect at the moment you were born. Hover anything for what it means.
- **🃏 Draw your tarot** — spreads dealt from *your* chart, not a shuffle: every card is weighted by your placements and reproducible from a seed, with a plain-language "why this card" for each draw.
- **🌙 Forecast your sky** — day-by-day transits over any window, station-accurate, exportable to your calendar. Click an event and the wheel flies to that date.
- **🌑 Time the eclipses** — upcoming solar & lunar eclipses and exactly which of *your* natal points they light up.
- **⚭ Read relationships** — synastry, composite, and Davison charts for two people, plus a relationship-bond tarot spread.
- **◷ Look ahead** — secondary progressions, solar returns, harmonic charts, midpoint trees, and fixed-star contacts.
- **✦ Ask the Oracle** — an optional AI guide (Claude) that weaves your chart and cards into a long-form reading — always grounded in the deterministic math beneath it.
- **📓 Keep the work** — a private, on-device **library**: every reading, course, and journal reflection is saved (IndexedDB), exportable as an encrypted **Vault**, and bindable into a printable **tome**.
- **🎓 Compose a course & render plates** — a Fable-designed learning curriculum from your chart (Classroom) and AI-rendered deck-art plates (Studio).

> Astrology and tarot here are **mirrors for reflection, not fixed predictions of the future.** Astra tells your fortune the honest way: it shows you the pattern and hands you the pen. *(Nothing Astra produces is a life sentence — it is a life poem.)*

---

## What makes it different

Most horoscope apps fake it — canned text keyed off your sun sign. Astra computes everything from scratch, and it does three things almost nothing else does:

- **🔒 Private by construction.** Your birth data — the most personal number you have — is never *retained*. By default the chart is computed **on the server**, so your details do travel there over an encrypted connection; they are held in memory for that computation and discarded. The promise is not that they never move — it is that **nothing is kept**: no database row, no log line, and a test (`test_no_birth_data_reaches_the_log_stream`) fails the build if that stops being true. Question text is not retained either, and telemetry stores only anonymous counters.
- **📴 Works fully offline.** No signal, no backend, no problem: charts, tarot, forecasts, relationship math, predictive timing, and eclipses all compute locally. Astra is an installable PWA.
- **🎯 Provably correct.** The on-device TypeScript engine (`@astra/core`) is **drift-locked to the Python/Swiss-Ephemeris backend** by golden-vector parity tests that run on every commit — so the fast local math and the reference math can never silently disagree.

Zero API keys required. The AI Oracle and card payments are the only parts that ever touch the network, and both are optional.

---

## Architecture

```
        ┌──────────────────────────────────────────────┐
        │  React 19 · TypeScript · Vite 8 (PWA)         │
        │  Zustand · ChartWheel (D3 SVG) · chapter dial │
        │                                               │
        │  @astra/core  ── the deterministic engine,    │
        │    ON-DEVICE: chart · tarot · forecast ·      │
        │    synastry/composite/davison · progressions ·│
        │    returns · eclipses · harmonics · midpoints ·│
        │    fixed stars   (pure TS, astronomy-engine)  │
        └───────────────┬──────────────────────────────┘
                        │  /api/v1/*  — AI Oracle, payments,
                        │              first-load reference
        ┌───────────────▼──────────────────────────────┐
        │  FastAPI · Python 3.12                        │
        │  ephemeris.py → pyswisseph (Swiss / Moshier)  │
        │  forecast · tarot · synastry · predictive ·   │
        │    advanced · course · plate_art              │
        │  ai.py → multi-provider LLM (Claude & friends)│
        │  entitlements + receipts + stripe_rail +      │
        │    budget → signed tokens · payments · caps   │
        └───────────────┬──────────────────────────────┘
                        │  golden vectors
        ┌───────────────▼──────────────────────────────┐
        │  parity/*.json  — the drift lock: the backend │
        │  generates them, @astra/core must reproduce   │
        │  them in CI, forever. 9 vectors, every commit.│
        └───────────────────────────────────────────────┘
```

**The philosophy — mathematics first, visualization second, reflection always:**

1. **Mathematics first** — `ephemeris.py` wraps Swiss Ephemeris (Moshier fallback): UTC-correct Julian Day, retrograde speed, declination, tropical *and* sidereal zodiacs, house systems, angles, Nodes, Lilith, Part of Fortune — verified against independently-known astronomy. `@astra/core` reproduces it in the browser via `astronomy-engine`, proven equivalent by parity CI.
2. **Visualization second** — `ChartWheel.tsx` renders composable SVG layers (zodiac · houses · aspects · planets · transit bi-wheel) with anti-collision glyph spreading, retrograde pulse, chord highlighting, and a unified hover popover. The UI is organized as a **chapter dial** (Track R): eight fixed compass nodes orbiting the wheel, each a chapter, with a shared "margin glass" detail panel.
3. **Reflection always** — the interpretive layer (AI Oracle + tarot) is Socratic and archetype-driven, provider-agnostic and tier-routed, with chart-grounded offline fallbacks so it works with zero credentials.

---

## How the project is organized

Astra is developed as a long-running, single-owner project with a deliberate work structure. If you're picking it up, read this first.

### Repository layout

```
backend/          FastAPI app (main.py), the deterministic engines, AI,
                  entitlements/receipts/stripe_rail/budget, tools/ (dev CLI)
frontend/         React 19 / Vite 8 PWA — components, store, api/client.ts, e2e/
packages/         astra-core/ — the on-device TypeScript engine (+ its parity tests)
parity/           the golden vectors: the contract between the two engines
resonarium/       a standalone Py/JS instrument (bit-exact natal-seed parity + safety)
docs/             progress · design · audits · prompts · archive · screenshots
run.sh            one command to launch backend + frontend for local dev
docker-compose*   dev (Vite HMR) and prod (nginx) stacks · DEPLOY.md is the runbook
```

### Two editions, one codebase

The same code serves two builds, kept apart by a **fail-closed interlock**:

- **Edition P — the operator's personal observatory.** `AAE_PERSONAL_MODE=1` runs the whole instance at oracle tier with no tokens, gates, rate limits, or telemetry. It **refuses to boot** if any public-facing signal is present (production env, a treasury address, or any Stripe/payment key) — so the unrestricted build can never accidentally serve the public.
- **Edition Q — the hardened public product.** Tiered access, real payments, rate limits, structured logging, metrics. Any `AAE_STRIPE_*` key marks the deployment as Edition Q (and therefore off-limits to personal mode).

### The parity discipline (the load-bearing idea)

Every deterministic technique exists **twice** — once in Python (the reference), once in `@astra/core` (on-device TypeScript) — and the two are held identical by **golden vectors**. `backend/tools/gen_parity_vectors.py` writes the backend's own output to `parity/*.json`; `@astra/core` must reproduce those nine vectors within a versioned tolerance contract on **every commit**. Divergence is a red build, not a bug report. Bit-exact where the math is arithmetic (the tarot RNG reproduces CPython's Mersenne Twister); tolerance-bounded where it's astronomical (`astronomy-engine` vs Swiss). This is what lets the app keep its privacy and offline promises without shipping a Python runtime to your phone.

### The plan, and where it lives

Work is organized as **phases** toward a public launch, tracked in living documents under `docs/progress/`:

| Phase | What | Status |
|---|---|---|
| **1 — Edition P** | the unrestricted personal build + the interlock | ✅ |
| **2 — Security** | prompt quarantine, CORS/headers, secret-rotation drill, CodeQL gate | ✅ |
| **3 — Productionization** | API versioning (`/api/v1`), structured logging, Prometheus metrics, encrypted backups, staging deploy | mostly ✅ (staging pending a host) |
| **4 — Monetization** | entitlement lifecycle · **Stripe rail** · deluxe purchase · AI cost controls · **subscription self-service** | ✅ |
| **Track E — engagement redesign** | the public-facing purchase/onboarding UX (esoteric by invitation) | planned |
| **5 — Policy & copy** | privacy policy, terms, refund policy, pricing page | planned |
| **6 — Launch** | load test, soft launch, soak | planned |

The authoritative documents:

- **`docs/progress/Hand_off.md`** — the **live work order**: current state, what's next, the gotchas the next session needs. Read this first.
- **`docs/progress/WORK_JOURNAL.md`** — a **narrative log**, newest-first: the story behind each session (the mechanics live in the PRs; this is the why).
- **`docs/progress/PUBLIC_LAUNCH_SCHEDULE.md`** — the ratified phase plan + the load-bearing decisions (payment rail, license, hosting).
- **`docs/progress/MOBILE_ROADMAP.md`** — the offline-first / on-device engine roadmap.
- **`docs/design/`** — design contracts: the physical-tome product, the report design, `RESONARIUM_PARITY.md`.

### How a change lands

Work proceeds in **sessions**, each a coherent chunk. Each feature is its own branch → PR → merge (squash), with the invariant *"done = tests green, committed, PR open."* Sessions close with a `Hand_off.md` update and a `WORK_JOURNAL.md` entry, both to `main`. CI (backend pytest + boot smoke · `@astra/core` parity · frontend tsc/build · Playwright e2e · Gitleaks · CodeQL) gates every PR.

---

## Quick start

Prereqs: Python 3.11+ and Node 20+. (`uv` recommended but optional.)

```bash
./run.sh                # installs deps, starts backend :8787 + frontend :5173
./run.sh --personal     # Edition P: everything unlocked, nothing tracked
```

Open **http://localhost:5173**. A default chart loads so the observatory is never empty. API docs at **http://localhost:8787/docs**. For containers, see [`DEPLOY.md`](DEPLOY.md) (dev + prod compose stacks).

### Manual setup

```bash
# Backend
cd backend
uv venv --python 3.12 .venv && VIRTUAL_ENV=.venv uv pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8787

# Frontend  (run `npm ci` in packages/astra-core once so the build resolves @astra/core)
cd frontend && npm install
npm run dev             # http://localhost:5173
npm run build           # production PWA bundle → dist/
```

---

## Configuration

Create `backend/.env` (gitignored). **Every variable is optional — the app runs with none of them** (offline AI, browser voice, honour-system unlocks).

| Variable | Default | Purpose |
|---|---|---|
| `AAE_ENV` | *(unset → production)* | Deployment environment. Non-prod: `development`/`dev`/`local`/`test`. **Fail-closed:** unset ⇒ production, which refuses to boot with a default `AAE_SECRET` or trust mode on. `run.sh` sets `development`. |
| `AAE_PERSONAL_MODE` | *(unset → off)* | **Edition P.** Whole instance unlocked, no tokens/gates/limits/telemetry. Interlock refuses to boot alongside any public-facing signal. `./run.sh --personal`. |
| `AAE_SECRET` | `aae-dev-secret-change-me` | HMAC secret for entitlement tokens. **Set a strong random value.** Production refuses the default. |
| `AAE_DEV_TOKEN` | *(unset)* | Raw string granting **oracle tier, no expiry** — for using your own hosted copy for free. |
| `SE_EPHE_PATH` | *(unset)* | Path to Swiss `.se1` files. Unset → Moshier (no files, ~arc-second accurate). |
| `AAE_AI_API_KEY` / `AAE_AI_BASE_URL` | *(unset)* / OpenRouter | Cloud LLM via any OpenAI-compatible gateway (base URL **without** `/v1`). Unset → local/offline AI. |
| `AAE_ANTHROPIC_API_KEY` | *(unset)* | Enables the premium **Fable 5** Oracle / Personal Report / Course. Unset → deterministic offline compilers. |
| `AAE_STRIPE_SECRET_KEY` | *(unset → rail 503s)* | **Edition Q.** Enables card payments. Any `AAE_STRIPE_*` key trips the personal-mode interlock. |
| `AAE_STRIPE_WEBHOOK_SECRET` | *(unset)* | `whsec_…` — verifies webhook signatures (hand-rolled to Stripe's scheme). |
| `AAE_STRIPE_MODE` / `_*_USD` | `payment` / 5·15·9 | One-time vs `subscription`; supporter / oracle / deluxe-report prices. |
| `AAE_TREASURY_ETH` / `AAE_ETH_RPC` | *(unset)* | Crypto rail: your ETH address (display only; funds never custodied) + RPC for tx verification. |
| `ELEVENLABS_API_KEY` / `_VOICE_ID` | *(unset)* | Unset → browser TTS. Set → ElevenLabs neural voice. |

`AAE_AI_PROVIDER=auto` picks the best available engine per request: **kgirl** → **ollama** (local) → **openai-compatible cloud** → **offline** (chart-grounded reflective prose). `/api/health` reports the full routing state.

---

## Tiers, unlocking & payments

| Tier | Model | Unlocked by |
|---|---|---|
| free | haiku / local ollama | default |
| supporter | claude-sonnet | a contribution (crypto **or** Stripe) |
| oracle | claude-opus / **Fable 5** reports | `AAE_DEV_TOKEN`, a verified contribution, or a Stripe purchase |

**Entitlements** are stateless signed tokens (HMAC or Ed25519) backed by a `jti`-keyed ledger that adds the lifecycle a real product needs: **revocation** (a refund kills the token), **renewal** (fresh expiry), and **device re-link** (recover access on a new device from the payment reference).

**Two payment rails, one lifecycle:** the crypto rail (`/api/donate/verify`) and the **Stripe rail** (`/api/checkout` → hosted checkout, one-time or subscription; `/api/stripe/webhook` mints on paid and revokes on refund/cancel). The deluxe Personal Report has its own one-time purchase on either rail (bound to a single Oracle session by the seed's *hash* — the raw seed, which ends with your question, never reaches Stripe).

**Customers stay in control.** `/api/billing/portal` opens Stripe's hosted Customer Portal — cancel, stop auto-renew, update the card, download invoices — no email required; a cancellation flows back through the webhook and revokes access at period end. **AI cost controls** cap per-user and global daily spend and degrade gracefully to the offline compilers rather than erroring when a cap is hit.

**Using your own copy for free:** the simplest path is Edition P (`./run.sh --personal`). For a hosted non-personal instance, set an `AAE_DEV_TOKEN` and unlock via `https://your-astra/?entitlement=<token>` (it scrubs itself from the address bar). The dev token is separate from the HMAC path, so rotating `AAE_SECRET` never revokes your own access.

---

## Developer tools

One CLI wraps the lot — run from `backend/`:

```bash
.venv/bin/python tools/dev.py <command>
#   unlock                → your free-access unlock link (+ QR)
#   token  --tier oracle  → mint a browser entitlement token
#   smoke  [--full]       → tier-matrix smoke test vs a live server
#   parity [--check]      → regenerate / verify the golden vectors
#   test   [backend|core|frontend|all]  → run the test suites
#   ai set <key> | ai check | ai status → configure & LIVE-VERIFY the premium key
```

`ai check` makes one cheap real call through the reports' exact Fable-5 path and reports which model served — a green check means the premium readings will actually generate. See [`TESTING.md`](TESTING.md) for minting tokens, trust mode, and the smoke matrix; [`DEPLOY.md`](DEPLOY.md) §8 for the Stripe test drill.

---

## API

Full interactive docs at `/docs`. Routes are served under both `/api/v1/*` and bare `/api/*` (skew tolerance for cached PWA shells). Highlights:

| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `/api/generate-chart` · `/api/forecast` | — | chart · transit events |
| POST | `/api/ai-ask` · `/api/ai-ask-stream` | optional entitlement | reflective interpretation (JSON / SSE) |
| POST | `/api/natal-arcana` · `/api/tarot-reading` | optional | natal signature (AI-free) · chart-weighted spread |
| POST | `/api/oracle-report` · `/api/course` · `/api/personal-report` | **oracle** | Fable 5 syntheses over the deterministic substrate |
| POST | `/api/synastry` · `/api/composite` · `/api/davison` · `/api/progressed-chart` · `/api/solar-return` · `/api/eclipse-timeline` · `/api/harmonic-chart` · `/api/midpoint-tree` · `/api/fixed-stars` | — | relationship · predictive · advanced |
| POST | `/api/checkout` · `/api/stripe/webhook` · `/api/personal-report/checkout` · `/api/billing/portal` | — | Stripe checkout · webhook · deluxe purchase · self-service cancel |
| GET | `/api/health` · `/metrics` · `/api/admin/*` | — / — / dev token | status · Prometheus · admin |

Every deterministic endpoint has an on-device `@astra/core` equivalent the frontend falls back to when the backend is unreachable.

---

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests/ -q     # backend suite (330+ tests)
cd packages/astra-core && npm test                     # parity vs the 9 golden vectors
cd frontend && npm run build && npx playwright test    # tsc + build + e2e (desktop + mobile)
```

- **Backend** asserts against **independently-known astronomy** (J2000 Sun, Lahiri offset, dignities) and a **fail-closed security posture** (trust-mode gating, production boot guard, constant-time token checks, allowlisted external ids).
- **`@astra/core` parity** reproduces the backend's golden vectors within the tolerance contract — the drift lock, both ways.
- **e2e** drives real flows including every offline fallback with the network cut.

CI runs all of it on every push, plus a full-history Gitleaks secret scan and a CodeQL analysis that gates the PR.

---

## Roadmap

- [x] Swiss-Ephemeris core — tropical + sidereal, house systems, patterns
- [x] Layered D3 wheel · transit bi-wheel · forecast engine (Moon sub-stepping, `.ics` export)
- [x] Reflective AI (6 lenses, SSE, offline fallback) · Oracle Report / Course (Fable 5) · ElevenLabs TTS
- [x] **Astra Arcana** — natal tarot, chart-weighted spreads, explainable draws, learning paths, deck-art studio
- [x] Synastry / composite / Davison · progressions · solar returns · **eclipse timeline** · harmonics · midpoints · fixed stars
- [x] **ASTRA-CORE** — the whole deterministic engine on-device in TypeScript, parity-locked to the backend
- [x] **Offline-first PWA** — every technique degrades to on-device compute; installable; safe-areas; share-target; queued asks
- [x] **Track R** — the chapter-dial UI (holographic observatory: margin glass, constellation path, material system)
- [x] **Monetization** — entitlement lifecycle · Stripe rail · deluxe purchase · AI cost controls · subscription self-service
- [ ] **Track E** — the public engagement/pricing redesign → Phase 5 (policy/copy) → Phase 6 (launch)
- [ ] Physical **tome** — press-ready book compiler (Phase 0 dogfood done) · mobile counterpart (Capacitor)

See [`docs/progress/`](docs/progress/) for the living plan.

---

## Development notes

Full documentation map in [`docs/README.md`](docs/README.md). Core invariants, never break: **deterministic AI-free core · privacy by construction (no birth data / question text retained) · fail-closed security · parity vectors stay green.** Voice canon for all copy: *"nothing Astra produces is a life sentence — it is a life poem."*

## License

AGPL-3.0 — see [LICENSE](LICENSE). Interpretation is symbolic and reflective: a mirror for self-inquiry, not prediction.
