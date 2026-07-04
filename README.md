<h1 align="center">☤ Astra — Celestial Observatory</h1>

<p align="center"><i>Mathematics first, visualization second, reflection always.</i></p>

<p align="center"><a href="https://github.com/9x25dillon/astro_caster/actions/workflows/ci.yml"><img src="https://github.com/9x25dillon/astro_caster/actions/workflows/ci.yml/badge.svg" alt="CI"></a></p>

A production-grade natal chart + transit observatory with a multi-provider AI guide,
Swiss Ephemeris precision, a chart-grounded **natal tarot module (Astra Arcana)**,
ElevenLabs neural voice, tier-based entitlements, and a personal forecast engine.
Works fully offline with zero API keys.

---

## Architecture

```
                 ┌──────────────────────────────────────┐
                 │  React 18 + TypeScript + Vite (PWA)   │
                 │  Zustand store ─ ChartWheel (D3 SVG)  │
                 │  DetailPanel · ForecastPanel ·        │
                 │  ArcanaModal · OracleModal · Admin    │
                 └───────────────┬──────────────────────┘
                                 │  /api/*  (Vite proxy)
                 ┌───────────────▼──────────────────────┐
                 │  FastAPI · Python 3.12                │
                 │  ephemeris.py  → pyswisseph (Swiss)   │
                 │  forecast.py   → transit engine       │
                 │  tarot.py      → natal arcana engine  │
                 │  ai.py         → multi-provider LLM   │
                 │  entitlements.py → HMAC-signed tokens │
                 │  telemetry.py  → SQLite observability │
                 └──────────────────────────────────────┘
```

**Three-layer philosophy:**

1. **Mathematics first** — `ephemeris.py` wraps Swiss Ephemeris (Moshier fallback). UTC-correct
   Julian Day, FLG_SPEED for retrograde, equatorial calls for declination, tropical *and* sidereal
   zodiacs, eight house systems, Asc/MC/Vertex, Nodes, Lilith, Part of Fortune. Verified against
   known ephemeris values.
2. **Visualization second** — `ChartWheel.tsx` renders five composable SVG layers (zodiac · houses ·
   aspects · planets · transit bi-wheel) with anti-collision glyph spreading, retrograde pulse,
   hover glow, chord highlighting, and a unified hover popover for every element — planet, sign,
   house, natal aspect, **and transit-to-natal chord**.
3. **Interpretation third** — `ai.py` is a Socratic, archetype-driven guide, and `tarot.py` maps the
   chart into tarot archetypes. Both are provider-agnostic and tier-routed, with chart-grounded
   offline fallbacks so they work with zero credentials.

---

## Quick start

Prereqs: Python 3.11+ and Node 18+. (`uv` recommended but optional.)

```bash
./run.sh            # installs deps, starts backend :8787 + frontend :5173
```

Open **http://localhost:5173**. A default chart loads so the observatory is never empty.
API docs at **http://localhost:8787/docs**.

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

---

## Configuration

Create `backend/.env` (gitignored). All variables are optional — the app runs with none of them.

| Variable | Default | Purpose |
|---|---|---|
| `AAE_ENV` | *(unset → production)* | Deployment environment. Recognized non-prod values: `development`/`dev`/`local`/`test`/`testing`. **Fail-closed: unset or unrecognized is treated as production**, where the app *refuses to boot* with a default `AAE_SECRET` or trust mode enabled (`entitlements.assert_safe_boot`). `run.sh` sets `development` for you. |
| `AAE_SECRET` | `aae-dev-secret-change-me` | HMAC secret for entitlement tokens. **Set this to a strong random value.** In production the app refuses to boot on the default; in dev the default works but tokens are forgeable. Rotating it invalidates previously-minted supporter tokens (the `AAE_DEV_TOKEN` bypass is unaffected). |
| `AAE_TRUST_MODE` | *(unset → off)* | Dev-only: accept a support tx hash *without* on-chain verification. Takes effect **only** when explicitly truthy **and** `AAE_ENV` is non-production; denied (fail-closed) everywhere else, and production boot is refused if it is set. |
| `SE_EPHE_PATH` | *(unset)* | Path to Swiss `.se1` files. Unset → Moshier model (no files needed). See [Ephemeris files](#ephemeris-files-optional--for-arc-second-precision). |
| `AAE_AI_API_KEY` | *(unset)* | Unset → offline/local AI. Set → cloud LLM via OpenRouter or any OpenAI-compatible gateway. |
| `AAE_AI_BASE_URL` | `https://openrouter.ai/api` | Base URL **without** `/v1` — the code appends `/v1/chat/completions` itself. |
| `AAE_AI_MODEL` | `anthropic/claude-haiku-4-5` | Free-tier model (quick reflections). |
| `AAE_AI_MODEL_SUPPORTER` | `anthropic/claude-sonnet-4-6` | Supporter-tier model (in-depth readings). |
| `AAE_AI_MODEL_ORACLE` | `anthropic/claude-opus-4-8` | Oracle-tier model (full structured report). |
| `AAE_OLLAMA_MODEL` | `qwen2.5:3b` | Local Ollama model for free-tier when no cloud key is set. |
| `AAE_DEV_TOKEN` | *(unset)* | Raw string that grants oracle tier with no expiry — for local development. Store in `localStorage` as `aae.entitlement`. |
| `AAE_ENT_DAYS` | `365` | Supporter token lifetime in days. |
| `AAE_TREASURY_ETH` | *(unset)* | Your ETH address. Displayed in the support dashboard; the app never custodies funds. |
| `AAE_ETH_RPC` | *(unset)* | EVM RPC URL for on-chain tx verification. Unset → verification is unavailable and donations are **denied** unless dev trust mode applies (see `AAE_TRUST_MODE`). Set it (+ `AAE_MIN_WEI`) before any public deploy. |
| `ELEVENLABS_API_KEY` | *(unset)* | Unset → browser TTS. Set → ElevenLabs neural voice with prosodic chunk stitching. |
| `ELEVENLABS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` | Default voice. Browse via `/api/tts/voices`. |

### AI providers — local-first, auto-routed

Astra speaks through a **real model with zero API keys**. `AAE_AI_PROVIDER=auto` picks the best
available engine in order:

| Priority | Provider | Description | Needs |
|---|---|---|---|
| 1 | **kgirl** | Topological-consensus `/ask` with ChaosRAG grounding and coherence/energy metrics | kgirl stack on `:8000` |
| 2 | **ollama** | Local Ollama, OpenAI-compatible — fast and private | Ollama running locally |
| 3 | **openai** | Any OpenAI-compatible cloud (OpenRouter / Nous / OpenAI) | `AAE_AI_API_KEY` |
| 4 | **offline** | Chart-grounded reflective prose generator | nothing |

**Paid tiers always use cloud** when a key is present — free tier uses local/ollama first.
`/api/health` reports full routing state.

### Tier model routing

| Tier | Model | Output budget | Unlocked by |
|---|---|---|---|
| free | `claude-haiku-4-5` / local ollama | 1000 tok | default |
| supporter | `claude-sonnet-4-6` | 3000 tok | crypto contribution via `/api/donate/verify` |
| oracle | `claude-opus-4-8` | 6000 tok | `AAE_DEV_TOKEN`, or an **on-chain-verified** contribution ≥ `AAE_ORACLE_MIN_WEI` (must be explicitly set > 0; trust-mode payments never mint oracle) |

### Oracle Report — Claude Fable 5 (oracle tier)

The deepest paid reading: `POST /api/oracle-report` builds the full **deterministic
substrate first** (natal signature + chart-weighted spread + learning path — zero AI),
then layers a long-form Claude **Fable 5** synthesis over it via the official Anthropic
SDK. If the AI layer is unavailable (no key, network down, safety refusal) the endpoint
returns a deterministic offline report with honest provenance — `ai_source` is always
`"llm"` or `"offline"`, and `model` names the actual serving model. Server-side fallback
to Opus 4.8 is enabled so a false-positive safety decline is transparently re-served.
The response `seed` makes the draw reproducible; the disclaimer rides the data.

Configuration (`backend/.env`):

```
AAE_ANTHROPIC_API_KEY=sk-ant-...          # unset => deterministic offline report
AAE_ORACLE_REPORT_MODEL=claude-fable-5
AAE_ORACLE_REPORT_FALLBACK=claude-opus-4-8
AAE_ORACLE_REPORT_MAX_TOKENS=16000
AAE_ORACLE_REPORT_EFFORT=high             # low|medium|high|xhigh|max
```

> **Cost & requirements:** Fable 5 is Anthropic's premium tier (~$10/$50 per MTok —
> roughly 2× Opus pricing) and requires **30-day data retention** on your Anthropic org
> (zero-data-retention orgs get a 400 on every call). A single report can run minutes
> and consume meaningful output tokens — budget accordingly and consider rate limiting
> (see the reliability backlog) before opening it to wide traffic.

### Personal Report — deluxe compiled edition (optional post-Oracle product)

`POST /api/personal-report` compiles a research-paper-style deluxe edition (PDF-ready
markdown: cover, sigil & invocation, natal foundation, psychological + evolutionary
deep-dive, the Oracle I–V core, chart-referenced tarot layout, Career Constellation and
Relationship Mirror inserts, sigil codex, practices, appendix). **Gated twice, fail
closed:** oracle tier (402), and the request must reference a **genuine prior Oracle
session** — the server re-derives the deterministic seed from (chart, spread, question,
date, source) and rejects a fabricated or foreign session with 409. Privacy: the AI
prompt carries only symbolic data; the cover uses a `{{BIRTH_INFO}}` placeholder the
renderer fills client-side. Offline fallback compiles the same 11-part structure
deterministically with honest `ai_source`. Spec: `docs/prompts/FABLE5_PERSONAL_REPORT_PROMPT.md`;
PDF design: `docs/design/ASTRO_ARCANA_PERSONAL_REPORT_DESIGN.md` (+ printable mock).

In the UI, a **"✦ Compile Personal Report"** affordance appears beneath a successful
Oracle Report (Draw tab): it echoes the exact session context (seed/date) for the
server's verification, previews the 11 parts, and downloads the PDF-ready `.md`.

### Rate limiting (cost protection)

The AI paths are protected by a sliding-window limiter keyed by client IP + entitlement
digest: `/api/ai-ask*`, `/api/suggestions`, and AI-enriched `/api/tarot-reading` share
the `AAE_RATE_LIMIT_AI` budget (default 20/min); the two paid Fable endpoints
(`/api/oracle-report`, `/api/personal-report`) share the stricter
`AAE_RATE_LIMIT_ORACLE` budget (default 5/min). Over-budget requests get **429** with a
`Retry-After` header. **Default: on in production, off in dev/test** (mirror of the
trust-mode philosophy); `AAE_RATE_LIMIT_ENABLED=1/0` overrides explicitly. Deterministic
offline draws are never throttled.

```
AAE_PERSONAL_REPORT_MODEL=claude-fable-5   # shares AAE_ANTHROPIC_API_KEY + fallback
AAE_PERSONAL_REPORT_MAX_TOKENS=32000       # 24–36-page PDF target — expensive; budget it
AAE_PERSONAL_REPORT_EFFORT=high
```

### Ephemeris files (optional — for arc-second precision)

The app works without any data files — Moshier is accurate to a few arc-seconds. For maximum
precision, drop the official Swiss `.se1` files into a directory and point `SE_EPHE_PATH` at it.
The `_18` set covers 1800–2400 (planets, Moon, and main asteroids incl. Chiron):

```bash
mkdir -p backend/ephe && cd backend/ephe
for f in sepl_18.se1 semo_18.se1 seas_18.se1; do
  curl -fsSL -O "https://raw.githubusercontent.com/aloistr/swisseph/master/ephe/$f"
done
# then in backend/.env:
#   SE_EPHE_PATH=/abs/path/to/backend/ephe
```

`/api/health` will then report `"ephemeris": "swiss-files"` instead of `"moshier"`.

---

## Features

### Chart engine
- Natal chart: planets, houses (8 systems), angles (Asc/MC/Desc/IC/Vertex), Nodes, Lilith,
  Part of Fortune (day/night formula), dignities, elements, modalities
- Aspects: major + minor, applying/separating phase, orb-weighted
- Pattern detection: Stellium, Grand Trine, T-Square, Grand Cross, Yod, Kite
- Tropical and sidereal zodiacs; verified against known ephemeris values

### Transit bi-wheel
- Live transit ring overlaid on the natal wheel — even-odd SVG annular band (no opacity bleed)
- Ring labels: "natal" and "sky \[date\]" near the Asc axis
- Transit-to-natal chord highlighting on planet hover, **plus a hover popover** on each chord
  describing the transit (e.g. *Saturn □ Sun*, transiting–natal, orb + applying/separating)
- Transit slider with debounced live recomputation

### Forecast engine
- Transit-to-transit and transit-to-natal aspects over any date range (default 90 days)
- Moon handled at 6-hour sub-steps (4 per day) — catches fast Moon aspects missed by daily loops
- Final-day pass captures aspects still within orb at range end
- Events grouped by month, expandable with meaning text
- Click any event → transit slider jumps to that date
- Search/filter by planet, type, or keyword; ★ bookmarks persisted to `localStorage`
- Export: `.txt` plain text or `.ics` iCalendar for any calendar app
- "Ask Astra" per event → deep AI reflection routed to DetailPanel

### Astra Arcana — natal tarot observatory
A symbolic overlay on the chart engine. Tarot + astrology are framed as **mirrors for
self-reflection, never deterministic prediction**. The deterministic core is **offline-first and
AI-free**; AI enrichment is opt-in and tier-gated. Opened via the **✶ Arcana** masthead button.

- **Natal Arcana signature** — every placement mapped to its archetypal trump (Golden Dawn
  attributions): Sun → The Sun, Moon → The High Priestess, sign-trumps for the angles, etc., with a
  weighted "soul deck," dominant element/modality, strongest themes, and growth-ward shadows.
- **Spread draws** — daily, three-card (Self/Mirror/Shadow), elemental balance, twelve-house,
  shadow integration, creative expression. Draws are **chart-weighted and reproducible**: seeded
  from a SHA-256 of the chart + question + spread + source system (never Python's salted `hash()`),
  with no duplicate cards in a spread. The daily draw folds in the **querent's local date**
  (`date` on the request; the client sends the browser's local day) so a daily card is
  reproducible for a given date regardless of the server clock.
- **Source systems (lineages)** — every reading is cast through a selectable interpretive
  tradition: `golden_dawn` (default) · `rws` · `thoth` · `jungian`. The lineage folds into the
  determinism seed (a different tradition yields a different draw) and frames both the offline
  prose and the AI prompt. The default contributes nothing to the seed, so legacy seeds reproduce.
- **Explainability** — every drawn card carries `weight_sources`: *why it was likely*, derived
  from the exact natal contributions that fed the draw (a major's sources sum to its draw
  weight — the panel and the seed can never disagree).
- **AI reading** (supporter/oracle) — weaves the drawn cards with the natal placements through the
  same provider/tier routing as the main guide, falling back silently to deterministic prose offline.
- **Oracle Report** (oracle tier) — the observatory's deepest reading: a long-form Claude
  **Fable 5** synthesis (`## I..V` structure — Signature / Spread / Path / Practices /
  Synthesis) over the full deterministic substrate, triggered from the Draw tab. The UI shows
  honest provenance (the actual serving model, or a "deterministic offline report" badge), the
  reproducible `seed` (copyable), the lineage, and the disclaimer; sections render as
  collapsible cards with per-section Speak/Copy. Lower tiers get a clear 402 → support flow.
  See **Oracle Report — Claude Fable 5** under Configuration.
- **Transit cards** — a thin overlay on the forecast engine: each day's top activation mapped to a
  trump with lesson, shadow, alignment action, and journal prompt. Requests accept `start_date`
  (ISO) and `timezone` (IANA) so the window starts on the *querent's* local day; an N-day request
  returns **exactly N** cards (quiet days get a deterministic natal-weighted integration-day trump).
- **Calendar export** — the forecast window as an RFC 5545 `.ics` file (one ritual or journal
  prompt per day, stable UIDs so re-imports update instead of duplicating).
- **Arcane Classroom** — leads with a **generated learning path**: a deterministic archetypal
  sequence from your strongest trump (anchor) toward an underdeveloped shadow (growth edge),
  followed by the static offline lessons.
- **Expression Studio** — offline generators (archetype poem, affirmation, sigil prompt, shadow
  letter, mythic birth story) composed from your signature, all copyable — plus **deck-art
  prompts**: deterministic art-direction briefs for any card (or your whole soul deck), composed
  from the card's correspondences, your natal placements, and the selected lineage's visual
  tradition. Prompt generation only — bring your own image tool.

### AI interpretation
- 6 lenses: psychological · natal · evolutionary · transit · relationship · traditional
  (these are the only values `/api/ai-ask` accepts). Astra Arcana is **not** a lens —
  tarot uses its own interpretation path via `POST /api/tarot-reading`.
- Quick (free) and in-depth (supporter) depth modes
- Oracle structured report: `## Section` headers parsed into collapsible accordion cards,
  each with per-section 🔊 Speak and ↓ Copy buttons
- Streaming SSE delivery with blinking cursor; controls hidden mid-stream
- Export full reading as `.txt`

### Voice (TTS)
- Browser speech synthesis (free, always available)
- ElevenLabs neural voice (supporter-gated): sentence-boundary splitting with
  `previous_request_id` stitching for seamless prosodic continuity across chunks
- Voice selector, speed control, auto-speak toggle

### Profiles + ceremony
- Multiple saved natal profiles in `localStorage`; double-click to rename inline
- Ceremony modal on first visit: geolocation pre-fills lat/lng + timezone before step 2

### Entitlements — open paywall
- Stateless HMAC-SHA256 signed tokens stored in `localStorage` — no server-side sessions
- Support flows on-chain to your treasury (`AAE_TREASURY_ETH`); app never custodies funds
- On-chain tx verification via `AAE_ETH_RPC`; honour-system fallback when unset
- `validateEntitlement()` called on startup — expired tokens cleared automatically
- Support panel at `/#support`; deep-link shareable

### Admin telemetry dashboard
- `GET /api/admin/stats?token=<dev_token>` — oracle-only endpoint
- Frontend dashboard at `/#admin` (or "⊙ stats" link for supporters)
- KPI cards, AI-by-tier/depth/lens/model bar charts, top features
- SQLite telemetry at `backend/data/telemetry.db`

### Resonarium × Biosentinel — natal-seeded instrument
- Standalone, **local-only** audiovisual instrument in [`resonarium/`](resonarium/) —
  not wired into the FastAPI app or the React client; runs offline by construction
  (HTML ships a `default-src 'none'; connect-src 'none'` CSP)
- Deterministic **natal seed** shared bit-exact across Python and JS
  (`natal_seed.py` / `natal_seed.js`): SHA-256 → 64-bit seed → mulberry32 PRNG,
  enforced by a cross-platform parity suite (`resonarium/tests/`, 38 tests)
- Browser app (`resonarium-enhanced.html`) with a **Sentinel Mode** overlay over
  an immutable natal bedrock, plus a headless controller
  (`resonarium_biosentinel_cli.py`) sharing `state_schema.json`
- **Not a medical device** — no health claims; visual modulation hard-capped at
  2.5 Hz, audio clamped 20 Hz–18 kHz. See [`resonarium/README.md`](resonarium/README.md)

---

## API

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/health` | — | status, ephemeris mode, AI provider, tier models |
| POST | `/api/generate-chart` | — | planets, houses, angles, aspects, patterns, balances |
| POST | `/api/transits` | — | transiting positions + aspects to natal |
| POST | `/api/forecast` | — | transit events (transit-to-transit + transit-to-natal) |
| POST | `/api/ai-ask` | optional entitlement | reflective interpretation (non-streaming) |
| POST | `/api/ai-ask-stream` | optional entitlement | SSE token stream of the reflection |
| POST | `/api/suggestions` | — | navigational questions for the focal house |
| POST | `/api/natal-arcana` | — | deterministic natal tarot signature (AI-free) |
| POST | `/api/tarot-reading` | optional entitlement | chart-weighted spread + optional AI enrichment (`source`, `date`) |
| POST | `/api/oracle-report` | **oracle tier** (402 below) | long-form Fable 5 report over the deterministic substrate (`ai_source`, `model`, `seed`, disclaimer) |
| POST | `/api/personal-report` | **oracle tier** + verified Oracle session (409 on mismatch) | deluxe compiled edition (PDF-ready markdown) — optional post-Oracle product |
| POST | `/api/arcana-forecast` | — | daily transit-card overlay (`start_date`, `timezone`, `source`; exactly N cards) |
| POST | `/api/learning-path` | — | deterministic archetypal learning path (anchor → growth edge) |
| POST | `/api/deck-art` | — | deterministic deck-art prompts (one card or the soul deck) |
| POST | `/api/arcana-calendar` | — | forecast as `.ics` (`text/calendar`; ritual or journal per day) |
| POST | `/api/synastry` `/api/composite` `/api/davison` | — | comparative charts for two people |
| POST | `/api/synastry-tarot` | — | relationship spread over a synastry pair |
| POST | `/api/progressed-chart` `/api/solar-return` `/api/eclipse-timeline` | — | predictive timing charts |
| POST | `/api/harmonic-chart` `/api/midpoint-tree` `/api/fixed-stars` | — | advanced analysis overlays |
| GET | `/api/tts/voices` | — | available ElevenLabs voices |
| POST | `/api/tts` | supporter | `audio/mpeg` neural voice MP3 |
| GET | `/api/treasury` | — | treasury address + funding allocation |
| POST | `/api/donate/verify` | — | verify support tx, mint entitlement token |
| GET | `/api/entitlement` | — | validate a supporter token (`?token=`) |
| POST | `/api/telemetry/event` | — | log a UI feature event |
| GET | `/api/admin/stats` | dev token | telemetry summary (charts, AI, features, tier events) |

---

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```

- `test_chart.py` asserts against **independently-known astronomy** — J2000 Sun position, Lahiri
  sidereal offset, 0°-cusp house wrapping, retrograde/speed agreement, classical dignities.
- `test_tarot.py` / `test_timezone_seed.py` / `test_explainability.py` assert the arcana engine is
  **deterministic and explainable** — reproducible seeded draws, legacy-seed stability, and
  weight-source panels that sum to the exact draw weights.
- `test_entitlements.py` / `test_security.py` / `test_api_endpoints.py` assert the security posture
  **fails closed** — trust-mode gating, the production boot guard, response headers, constant-time
  token checks, and a tier gate that never even attempts the AI call for the free tier.
- `test_daily_forecast.py` / `test_arcana_calendar.py` / `test_learning_path.py` / `test_deck_art.py`
  cover the exactly-N forecast contract, RFC 5545 `.ics` correctness, and the deterministic
  learning-path and deck-art generators.

Tests assert against known facts and invariants, not our own output, so they catch real regressions.
CI (GitHub Actions) runs the backend suite, an app-boot smoke check, a production boot-guard
re-proof, the frontend `tsc -b && vite build`, and a full-history Gitleaks secret scan on every
push and PR.

Frontend type/build check:

```bash
cd frontend && ./node_modules/.bin/tsc -b && npm run build
```

---

## Roadmap

- [x] Swiss Ephemeris core — tropical + sidereal, 8 house systems
- [x] Layered D3 wheel — anti-collision glyphs, retrograde pulse, unified hover popovers
- [x] Aspects (major + minor) with applying/separating phase
- [x] Graph pattern detection: Stellium, Grand Trine, T-Square, Grand Cross, Yod, Kite
- [x] Transit bi-wheel — even-odd annular ring, ring labels, chord highlighting + popover
- [x] Forecast engine with Moon sub-stepping and last-day capture
- [x] Forecast search, bookmarks, .txt/.ics export
- [x] Reflective AI — 6 lenses, quick + deep, SSE streaming, offline fallback
- [x] Oracle structured report — collapsible sections, per-section speak + copy
- [x] **Astra Arcana** — natal tarot signature, chart-weighted spreads, transit cards, classroom, studio
- [x] ElevenLabs TTS with prosodic chunk stitching
- [x] Tier-based model routing (haiku / sonnet / opus)
- [x] HMAC entitlement tokens — crypto-verified, stateless, startup validation
- [x] Admin telemetry dashboard · PWA (installable, offline-capable)
- [x] Synastry / composite / Davison comparative charts (+ synastry tarot)
- [x] Progressions, solar returns, eclipse timeline
- [x] Harmonic charts, midpoint trees, fixed-star overlay
- [x] Minor Arcana card-level meanings (full 78-card deck)
- [x] Source-system lineages (Golden Dawn / RWS / Thoth / Jungian) folded into seed + interpretation
- [x] Explainable draws (`weight_sources`), local-date determinism, exactly-N daily cards
- [x] Learning paths, `.ics` calendar export, deck-art prompt studio
- [x] CI: pytest + boot guard + frontend build + secret scan; Dependabot
- [x] Resonarium × Biosentinel — natal-seeded local instrument, Python↔JS parity suite
- [x] Alchemical UI layer — metals seal, correspondence card, sigil marks, transmutation flare
- [x] Mobile unlock via `?entitlement=<token>` URL param (Termux/phone browsers)
- [ ] Mobile counterpart — see [`docs/progress/MOBILE_ROADMAP.md`](docs/progress/MOBILE_ROADMAP.md) (H1 PWA → H2 Capacitor → H3 on-device ASTRA-CORE)

---

## Development & Progress Tracking

For ongoing work (full documentation map: [`docs/README.md`](docs/README.md) —
living progress docs in `docs/progress/`, audits in `docs/audits/`, prompt
specs in `docs/prompts/`, design contracts in `docs/design/`, superseded
plans in `docs/archive/`):

- See `docs/progress/COMPREHENSIVE_TASK_SCHEDULE.md` (prioritized tasks, Fable 5 completion items, reliability backlog, recommendations, ACs, and verification commands).
- See `docs/progress/PROJECT_WORK_HISTORY_MAP.md` (full timeline by wave/phase/branch, feature status tables, audit brackets, git commands, and instructions for keeping the map current).
- Update both + `CHANGELOG.md` after every logical phase or branch close.
- Always run: `cd backend && .venv/bin/python -m pytest -q` and `cd frontend && npm run build`.
- Core invariants (never break): deterministic AI-free core; `DISCLAIMER` travels on every response; fail-closed security.

## License

AGPL-3.0 — see [LICENSE](LICENSE). Interpretation is symbolic and reflective: a mirror for
self-inquiry, not prediction.
