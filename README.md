<h1 align="center">☤ Astra — Celestial Observatory</h1>

<p align="center"><i>Mathematics first, visualization second, reflection always.</i></p>

A production-grade natal chart + transit observatory with a multi-provider AI guide,
Swiss Ephemeris precision, ElevenLabs neural voice, tier-based entitlements, and a
90-day personal forecast engine. Works fully offline with zero API keys.

---

## Architecture

```
                 ┌──────────────────────────────────────┐
                 │  React 18 + TypeScript + Vite (PWA)   │
                 │  Zustand store ─ ChartWheel (D3 SVG)  │
                 │  DetailPanel · ForecastPanel · Admin  │
                 └───────────────┬──────────────────────┘
                                 │  /api/*  (Vite proxy)
                 ┌───────────────▼──────────────────────┐
                 │  FastAPI · Python 3.12                │
                 │  ephemeris.py  → pyswisseph (Swiss)   │
                 │  forecast.py   → 90-day engine        │
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
   hover glow, chord highlighting, and click-to-select. Transit ring uses even-odd SVG fill for a
   clean annular band with ring labels.
3. **Interpretation third** — `ai.py` is a Socratic, archetype-driven guide. Provider-agnostic,
   tier-routed, with a chart-grounded offline fallback so it works with zero credentials.

---

## Quick start

Prereqs: Python 3.11+ and Node 18+. (`uv` recommended but optional.)

```bash
./run.sh            # installs deps, starts backend :8787 + frontend :5173
```

Open **http://localhost:5173**. The Einstein chart loads by default so the observatory is never
empty. API docs at **http://localhost:8787/docs**.

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

Copy `backend/.env.example` → `backend/.env`:

| Variable | Default | Purpose |
|---|---|---|
| `SE_EPHE_PATH` | *(unset)* | Path to Swiss `.se1` files. Unset → Moshier model (no files needed). |
| `AAE_AI_API_KEY` | *(unset)* | Unset → offline/local AI. Set → cloud LLM via OpenRouter or any OpenAI-compatible gateway. |
| `AAE_AI_BASE_URL` | `https://openrouter.ai/api` | Base URL **without** `/v1` — the code appends `/v1/chat/completions` itself. |
| `AAE_AI_MODEL` | `anthropic/claude-haiku-4-5` | Free-tier model (quick reflections). |
| `AAE_AI_MODEL_SUPPORTER` | `anthropic/claude-sonnet-4-6` | Supporter-tier model (in-depth readings). |
| `AAE_AI_MODEL_ORACLE` | `anthropic/claude-opus-4-8` | Oracle-tier model (full structured report). |
| `AAE_OLLAMA_MODEL` | `qwen2.5:3b` | Local Ollama model for free-tier when no cloud key is set. |
| `AAE_DEV_TOKEN` | *(unset)* | Raw string that grants oracle tier with no expiry — for local development. Store in `localStorage` as `aae.entitlement`. |
| `AAE_SECRET` | *(generated)* | HMAC secret for entitlement tokens. **Never rotate** — changing it invalidates all existing supporter tokens. |
| `AAE_ENT_DAYS` | `365` | Supporter token lifetime in days. |
| `AAE_TREASURY_ETH` | *(unset)* | Your ETH address. Displayed in the support dashboard; the app never custodies funds. |
| `AAE_ETH_RPC` | *(unset)* | EVM RPC URL for on-chain tx verification. Unset → honour-system trust mode. |
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
The active provider and model are shown as a badge in the UI (`⬡ local · qwen2.5:3b`,
`Claude Opus 4.8 · oracle`, etc.). `/api/health` reports full routing state.

### Tier model routing

| Tier | Model | Unlocked by |
|---|---|---|
| free | `claude-haiku-4-5` / local ollama | default |
| supporter | `claude-sonnet-4-6` | crypto contribution via `/api/donate/verify` |
| oracle | `claude-opus-4-8` | `AAE_DEV_TOKEN` or future higher-tier entitlement |

### Ephemeris files (optional — for arc-second precision)

The app works without any data files — Moshier is accurate to a few arc-seconds. For maximum
precision download the official Swiss Ephemeris files and point `SE_EPHE_PATH` at them:

```
https://www.astro.com/ftp/swisseph/ephe/   →  sepl_*.se1, semo_*.se1, seas_*.se1
```

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
- Transit-to-natal chord highlighting: hover a planet to dim unrelated chords and glow active ones
- Transit slider with debounced live recomputation

### 90-day forecast engine
- Transit-to-transit and transit-to-natal aspects over any date range
- Moon handled at 6-hour sub-steps (4 per day) — catches fast Moon aspects missed by daily loops
- Final-day pass captures aspects still within orb at range end
- Events grouped by month, expandable with meaning text
- Click any event → transit slider jumps to that date
- Search/filter by planet, type, or keyword
- ★ Bookmark events persisted to `localStorage`
- Export: `.txt` plain text or `.ics` iCalendar for any calendar app
- "Ask Astra" per event → deep AI reflection routed to DetailPanel

### AI interpretation
- 6 lenses: psychological · natal · evolutionary · transit · relationship · traditional
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
- Re-verifying the same tx hash mints a fresh token — blockchain txs are permanent
- `validateEntitlement()` called on startup — expired tokens cleared automatically
- Support panel at `/#support`; deep-link shareable

### Admin telemetry dashboard
- `GET /api/admin/stats?token=<dev_token>` — oracle-only endpoint
- Frontend dashboard at `/#admin` (or "⊙ stats" link for supporters)
- KPI cards: charts cast (total / 24h / 7d), AI queries (total / 24h)
- Bar charts: AI by tier / depth / lens / model, top features, tier events
- SQLite telemetry at `backend/data/telemetry.db`

---

## API

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/health` | — | status, ephemeris mode, AI provider, tier models |
| POST | `/api/generate-chart` | — | planets, houses, angles, aspects, patterns, balances |
| POST | `/api/transits` | — | transiting positions + aspects to natal |
| POST | `/api/forecast` | — | 90-day transit events (transit-to-transit + transit-to-natal) |
| POST | `/api/ai-ask` | optional entitlement | reflective interpretation (non-streaming) |
| POST | `/api/ai-ask-stream` | optional entitlement | SSE token stream of the reflection |
| POST | `/api/suggestions` | — | navigational questions for the focal house |
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

Asserts against **independently-known astronomy** — J2000 Sun position, Lahiri sidereal offset,
0°-cusp house wrapping, retrograde/speed agreement, Asc/Desc opposition, classical dignities.
Not against our own output, so it catches real regressions.

---

## Roadmap

- [x] Swiss Ephemeris core — tropical + sidereal, 8 house systems
- [x] Layered D3 wheel — anti-collision glyphs, retrograde pulse, hover glow
- [x] Aspects (major + minor) with applying/separating phase
- [x] Graph pattern detection: Stellium, Grand Trine, T-Square, Grand Cross, Yod, Kite
- [x] Transit slider with debounced live recomputation
- [x] Element/modality radars
- [x] Transit bi-wheel — even-odd annular ring, ring labels, chord highlighting
- [x] 90-day forecast engine with Moon sub-stepping and last-day capture
- [x] Forecast search, bookmarks, .txt/.ics export
- [x] Reflective AI — 6 lenses, quick + deep, SSE streaming, offline fallback
- [x] Oracle structured report — collapsible sections, per-section speak + copy
- [x] ElevenLabs TTS with prosodic chunk stitching
- [x] Tier-based model routing (haiku / sonnet / opus)
- [x] HMAC entitlement tokens — crypto-verified, stateless, startup validation
- [x] Admin telemetry dashboard
- [x] PWA (installable, offline-capable)
- [ ] Synastry / composite / Davison comparative charts
- [ ] Progressions, solar returns, eclipse timeline
- [ ] Harmonic charts, midpoint trees, fixed-star overlay
- [ ] WebGL observatory zoom

---

## License

AGPL-3.0 — see [LICENSE](LICENSE). Interpretation is symbolic and reflective: a mirror for
self-inquiry, not prediction.
