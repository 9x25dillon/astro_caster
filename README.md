<h1 align="center">🔮 Astra — the Celestial Observatory</h1>

<p align="center"><i>Read the sky. Draw the cards. Know your timing.</i></p>

<p align="center">A modern fortune-telling app that actually does the math — natal astrology, tarot, and predictive timing, computed to arc-second precision and running <b>entirely on your device</b>. Your birthday never leaves your phone.</p>

<p align="center"><a href="https://github.com/9x25dillon/astro_caster/actions/workflows/ci.yml"><img src="https://github.com/9x25dillon/astro_caster/actions/workflows/ci.yml/badge.svg" alt="CI"></a></p>

---

## What you can do

Astra is a divination workbench built on real ephemeris math — the same celestial mechanics used by professional astrologers, wrapped in an interface you can actually enjoy.

- **🌟 Cast your birth chart** — a living D3 wheel of every planet, house, angle, and aspect at the moment you were born. Hover anything for what it means.
- **🃏 Draw your tarot** — spreads dealt from *your* chart, not a shuffle: every card is weighted by your placements and reproducible from a seed, with a plain-language "why this card" for each draw.
- **🌙 Forecast your sky** — day-by-day transits over any window, station-accurate, exportable to your calendar. Click an event and the wheel flies to that date.
- **🌑 Time the eclipses** — upcoming solar & lunar eclipses and exactly which of *your* natal points they light up.
- **⚭ Read relationships** — synastry, composite, and Davison charts for two people, plus a relationship-bond tarot spread.
- **◷ Look ahead** — secondary progressions, solar returns, harmonic charts, midpoint trees, and fixed-star contacts.
- **✦ Ask the Oracle** — an optional AI guide (Claude) that weaves your chart and cards into a long-form reading — always grounded in the deterministic math beneath it.

> Astrology and tarot here are **mirrors for reflection, not fixed predictions of the future.** Astra tells your fortune the honest way: it shows you the pattern and hands you the pen.

---

## What makes it different

Most horoscope apps fake it — canned text keyed off your sun sign. Astra computes everything from scratch, and it does three things almost nothing else does:

- **🔒 Private by construction.** Your birth data — the most personal number you have — is never *retained* by a server: the entire deterministic engine runs **on your device**, and when you do use the optional backend (AI readings), requests are processed in memory and the server keeps no birth data and no question text — telemetry stores only anonymous counters (casting preferences, query lengths).
- **📴 Works fully offline.** No signal, no backend, no problem: charts, tarot, forecasts, relationship math, predictive timing, and eclipses all compute locally. The app is an installable PWA.
- **🎯 Provably correct.** The on-device TypeScript engine (`@astra/core`) is **drift-locked to the Python/Swiss-Ephemeris backend** by golden-vector parity tests that run on every commit — so the fast local math and the reference math can never silently disagree.

Zero API keys required. The AI Oracle is the only part that ever needs the network, and it's entirely optional.

---

## Architecture

```
        ┌──────────────────────────────────────────────┐
        │  React 19 · TypeScript · Vite 8 (PWA)         │
        │  Zustand · ChartWheel (D3 SVG) · modals       │
        │                                               │
        │  @astra/core  ── the deterministic engine,    │
        │    ON-DEVICE: chart · tarot · forecast ·      │
        │    synastry/composite/davison · progressions ·│
        │    returns · eclipses · harmonics · midpoints ·│
        │    fixed stars   (pure TS, astronomy-engine)  │
        └───────────────┬──────────────────────────────┘
                        │  /api/*  — only for the AI Oracle
                        │           & first-load reference
        ┌───────────────▼──────────────────────────────┐
        │  FastAPI · Python 3.12                        │
        │  ephemeris.py → pyswisseph (Swiss / Moshier)  │
        │  forecast.py · tarot.py · synastry.py ·       │
        │  predictive.py · advanced.py                  │
        │  ai.py → multi-provider LLM (Claude & friends)│
        │  entitlements.py → signed tokens · telemetry  │
        └───────────────┬──────────────────────────────┘
                        │  golden vectors
        ┌───────────────▼──────────────────────────────┐
        │  parity/*.json  — the drift lock: the backend │
        │  generates them, @astra/core must reproduce   │
        │  them in CI, forever. 8 vectors, every commit.│
        └───────────────────────────────────────────────┘
```

**The philosophy — mathematics first, visualization second, reflection always:**

1. **Mathematics first** — `ephemeris.py` wraps Swiss Ephemeris (Moshier fallback): UTC-correct Julian Day, retrograde speed, declination, tropical *and* sidereal zodiacs, house systems, angles, Nodes, Lilith, Part of Fortune — verified against independently-known astronomy. `@astra/core` reproduces it in the browser via `astronomy-engine`, an independent Moshier implementation, proven equivalent by parity CI.
2. **Visualization second** — `ChartWheel.tsx` renders composable SVG layers (zodiac · houses · aspects · planets · transit bi-wheel) with anti-collision glyph spreading, retrograde pulse, chord highlighting, and a unified hover popover for every element.
3. **Reflection always** — the interpretive layer (AI Oracle + tarot) is Socratic and archetype-driven, provider-agnostic and tier-routed, with chart-grounded offline fallbacks so it works with zero credentials.

---

## Quick start

Prereqs: Python 3.11+ and Node 20+. (`uv` recommended but optional.)

```bash
./run.sh            # installs deps, starts backend :8787 + frontend :5173
```

Open **http://localhost:5173**. A default chart loads so the observatory is never empty. API docs at **http://localhost:8787/docs**.

### Manual setup

**Backend**
```bash
cd backend
uv venv --python 3.12 .venv && VIRTUAL_ENV=.venv uv pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8787
```

**Frontend**
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # production PWA bundle → dist/
```

The on-device engine lives in `packages/astra-core/` and is consumed directly from source (a Vite alias) — run `npm ci` there once so the frontend build can resolve it.

---

## The on-device engine (`@astra/core`)

The load-bearing idea: extract every deterministic technique into a dependency-free TypeScript package that is **provably equivalent** to the Python backend, so the app keeps its privacy and offline promises without shipping a Python runtime to your phone.

- **Parity as a product, not a QA step.** `backend/tools/gen_parity_vectors.py` writes the backend's own output to `parity/*.json`; `@astra/core` must reproduce those vectors within a versioned tolerance contract on **every commit**. Divergence is a red build, not a bug report. Bit-exact where the math is arithmetic (tarot RNG reproduces CPython's Mersenne Twister); tolerance-bounded where it's astronomical (`astronomy-engine` vs Swiss).
- **Everything degrades gracefully.** Each surface tries the backend, then falls back to on-device compute with a "☾ computed on your device" badge. Chart, tarot, forecast, synastry/composite/Davison, progressions, solar returns, eclipses, harmonics, midpoints, and fixed stars all work with the backend absent.
- **Known edge:** the pure-TS ephemeris lacks the lunar Node / Chiron / Lilith, so the offline path uses a reduced body set (Sun–Pluto, Asc, MC, Part of Fortune). The full body set is a WASM-Swiss escalation, deferred until the vectors demand it.

See [`docs/progress/MOBILE_ROADMAP.md`](docs/progress/MOBILE_ROADMAP.md) for the full ASTRA-CORE story.

---

## Configuration

Create `backend/.env` (gitignored). **Every variable is optional — the app runs with none of them** (offline AI, browser voice, honour-system unlocks).

| Variable | Default | Purpose |
|---|---|---|
| `AAE_ENV` | *(unset → production)* | Deployment environment. Non-prod values: `development`/`dev`/`local`/`test`. **Fail-closed:** unset/unrecognized ⇒ production, where the app *refuses to boot* with a default `AAE_SECRET` or trust mode on. `run.sh` sets `development`. |
| `AAE_SECRET` | `aae-dev-secret-change-me` | HMAC secret for entitlement tokens. **Set to a strong random value.** Production refuses to boot on the default; in dev the default works but tokens are forgeable. |
| `AAE_DEV_TOKEN` | *(unset)* | Raw string that grants **oracle tier, no expiry** — for using your own app for free (see [Unlock your own copy](#unlock-your-own-copy)). |
| `AAE_TRUST_MODE` | *(unset → off)* | Dev-only: accept a support tx hash *without* on-chain verification. Only in non-production; production boot is refused if set. |
| `SE_EPHE_PATH` | *(unset)* | Path to Swiss `.se1` files. Unset → Moshier (no files, ~arc-second accurate). |
| `AAE_AI_API_KEY` | *(unset)* | Unset → offline/local AI. Set → cloud LLM via OpenRouter or any OpenAI-compatible gateway. |
| `AAE_AI_BASE_URL` | `https://openrouter.ai/api` | Base URL **without** `/v1` — the code appends `/v1/chat/completions`. |
| `AAE_AI_MODEL` / `_SUPPORTER` / `_ORACLE` | haiku / sonnet / opus | Tier-routed models (free / supporter / oracle). |
| `AAE_OLLAMA_MODEL` | `qwen2.5:3b` | Local Ollama model for free tier when no cloud key is set. |
| `AAE_TREASURY_ETH` / `AAE_ETH_RPC` | *(unset)* | Your ETH address (displayed only; app never custodies funds) + RPC for on-chain tx verification. |
| `ELEVENLABS_API_KEY` / `_VOICE_ID` | *(unset)* | Unset → browser TTS. Set → ElevenLabs neural voice with prosodic chunk stitching. |

### AI providers — local-first, auto-routed

Astra speaks through a **real model with zero API keys**. `AAE_AI_PROVIDER=auto` picks the best available engine: **kgirl** (topological-consensus stack) → **ollama** (local) → **openai-compatible cloud** → **offline** (chart-grounded reflective prose). Paid tiers always use cloud when a key is present; `/api/health` reports the full routing state.

### Tiers

| Tier | Model | Budget | Unlocked by |
|---|---|---|---|
| free | haiku / local ollama | 1000 tok | default |
| supporter | claude-sonnet | 3000 tok | crypto contribution via `/api/donate/verify` |
| oracle | claude-opus / **Fable 5** reports | 6000 tok+ | `AAE_DEV_TOKEN`, or an on-chain-verified contribution |

The **Oracle Report** (oracle tier) is the deepest reading: a long-form Claude **Fable 5** synthesis over a fully-deterministic substrate (natal signature + chart-weighted spread + learning path), with honest provenance (`ai_source` is always `"llm"` or `"offline"`) and a reproducible `seed`. See `docs/prompts/` for the prompt spec. AI paths are rate-limited (sliding window, on in prod / off in dev).

### Unlock your own copy

It's your observatory — you shouldn't pay yourself. Set a dev token and it unlocks the full oracle tier with no expiry:

```bash
# backend/.env
AAE_DEV_TOKEN=$(openssl rand -hex 24)
```

Then hand it to the app. On a phone or any browser without devtools, the easiest way is the URL:

```
https://your-astra/?entitlement=<AAE_DEV_TOKEN>      # unlocks & scrubs itself from the address bar
https://your-astra/?entitlement=clear                # back to free tier
```

Or mint scoped test tokens for any tier with `backend/tools/mint_test_tokens.py` (see [Developer tools](#developer-tools)). The dev token is separate from the HMAC signing path, so rotating `AAE_SECRET` never revokes your own access.

---

## Developer tools

One CLI wraps the lot — run from `backend/`:

```bash
.venv/bin/python tools/dev.py <command>
#   unlock              → your free-access unlock link (wraps unlock.py)
#   token  --tier oracle  → mint a browser entitlement token
#   smoke  [--full]     → tier-matrix smoke test vs a live server
#   parity [--check]    → regenerate / verify the golden vectors
#   test   [backend|core|frontend|all]  → run the test suites
#   ai set <key> | ai check | ai status → configure & LIVE-VERIFY the premium key
```

The individual tools it wraps:

| Tool | What it does |
|---|---|
| `tools/unlock.py` | Prints your `?entitlement=` free-access link + QR (oracle tier, no expiry). |
| `tools/mint_test_tokens.py` | Mints browser entitlement tokens for any tier (`--tier oracle`, `--seed <raw>` for report claims). |
| `tools/smoke_tiers.py` | Tier-matrix smoke test against a live server (26 checks, zero-cost by default; `--full` for the paid E2E paths). |
| `tools/gen_parity_vectors.py` | Regenerates the 8 golden vectors (`--check` is the CI drift tripwire). |
| `frontend/e2e/` | Playwright suite (desktop + Pixel-7 emulation) driving real flows, including every offline fallback with the API severed. |

### Enabling the premium AI readings (Fable 5)

The **in-depth Oracle Report** and the **deluxe PDF Personal Report** are long-form Claude **Fable 5** syntheses over the deterministic substrate. With no key they fall back to a deterministic offline report (honest `ai_source`); to serve the real thing, set an Anthropic key and verify it reaches Fable 5 in one command:

```bash
cd backend
.venv/bin/python tools/dev.py ai set sk-ant-...     # writes AAE_ANTHROPIC_API_KEY to .env
.venv/bin/python tools/dev.py ai check              # one cheap real call through the reports' exact path
```

`ai check` makes a single request via the same beta / server-side-fallback / effort surface the reports use, and tells you which model served — so a green check means the premium readings will actually generate (and it diagnoses the two common blockers: an invalid key, or an org without the 30-day data retention Fable 5 requires). Both reports also honor `AAE_ORACLE_REPORT_*` / `AAE_PERSONAL_REPORT_*` overrides (model, effort, max tokens, fallback) — see [Tiers](#tiers).

See [`TESTING.md`](TESTING.md) for the full walkthrough (minting tokens, trust mode, smoke matrix).

---

## API

Full interactive docs at `/docs`. Highlights:

| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `/api/generate-chart` | — | planets, houses, angles, aspects, patterns, balances |
| POST | `/api/forecast` | — | transit events (transit-to-transit + transit-to-natal) |
| POST | `/api/ai-ask` · `/api/ai-ask-stream` | optional entitlement | reflective interpretation (JSON / SSE stream) |
| POST | `/api/natal-arcana` · `/api/tarot-reading` | optional | natal signature (AI-free) · chart-weighted spread (+ opt-in AI) |
| POST | `/api/oracle-report` | **oracle** | long-form Fable 5 report over the deterministic substrate |
| POST | `/api/synastry` · `/api/composite` · `/api/davison` · `/api/synastry-tarot` | — | relationship charts |
| POST | `/api/progressed-chart` · `/api/solar-return` · `/api/eclipse-timeline` | — | predictive timing |
| POST | `/api/harmonic-chart` · `/api/midpoint-tree` · `/api/fixed-stars` | — | advanced overlays |
| POST | `/api/tts` · GET `/api/tts/voices` | supporter / — | ElevenLabs neural voice |
| GET | `/api/health` · `/api/treasury` · `/api/admin/stats` | — / — / dev token | status · treasury · telemetry |

Every deterministic endpoint above also has an on-device `@astra/core` equivalent the frontend falls back to when the backend is unreachable.

---

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests/ -q     # backend suite
cd packages/astra-core && npm test                     # parity vs golden vectors
cd frontend && npm run build && npx playwright test    # tsc + build + e2e
```

- **Backend** asserts against **independently-known astronomy** (J2000 Sun, Lahiri offset, dignities) and a **fail-closed security posture** (trust-mode gating, production boot guard, constant-time token checks).
- **`@astra/core` parity** reproduces the backend's golden vectors within the tolerance contract — the drift lock, both ways.
- **e2e** drives real flows including every offline fallback with the network cut.

CI runs all of it on every push, plus a full-history Gitleaks secret scan.

---

## Roadmap

- [x] Swiss-Ephemeris core — tropical + sidereal, house systems, patterns
- [x] Layered D3 wheel · transit bi-wheel · forecast engine (Moon sub-stepping, `.ics` export)
- [x] Reflective AI (6 lenses, SSE, offline fallback) · Oracle Report (Fable 5) · ElevenLabs TTS
- [x] **Astra Arcana** — natal tarot, chart-weighted spreads, lineages, explainable draws, learning paths, deck-art studio
- [x] Synastry / composite / Davison · progressions · solar returns · **eclipse timeline** · harmonics · midpoints · fixed stars
- [x] Entitlements (signed tokens, crypto-verified) · admin telemetry · Resonarium × Biosentinel instrument
- [x] **ASTRA-CORE** — the whole deterministic engine ported to on-device TypeScript, parity-locked to the backend
- [x] **Offline-first PWA** — every technique degrades to on-device compute; installable; safe-areas; share-target; queued asks
- [ ] Mobile counterpart — Capacitor wrapper (H2) → store distribution — see [`docs/progress/MOBILE_ROADMAP.md`](docs/progress/MOBILE_ROADMAP.md)

---

## Development notes

Full documentation map in [`docs/README.md`](docs/README.md) (living progress in `docs/progress/`, audits, prompt specs, design contracts). Core invariants, never break: **deterministic AI-free core · `DISCLAIMER` travels on every response · fail-closed security · parity vectors stay green.**

## License

AGPL-3.0 — see [LICENSE](LICENSE). Interpretation is symbolic and reflective: a mirror for self-inquiry, not prediction.
