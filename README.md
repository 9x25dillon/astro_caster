<h1 align="center">☤ Astrological Analysis Environment (AAE)</h1>

<p align="center"><i>A celestial observatory — mathematics first, visualization second, reflection always.</i></p>

A production-grade web app for natal charts, transits, and symbolic interpretation.
Swiss Ephemeris precision feeding a layered D3 wheel and a reflective, archetype-based
AI guide that never makes deterministic predictions.

---

## Architecture

```
                 ┌──────────────────────────────────────┐
                 │  React 18 + TypeScript + Vite (PWA)   │
                 │  Zustand store ─ ChartWheel (D3 SVG)  │
                 │  DetailPanel · Radar · TransitSlider  │
                 └───────────────┬──────────────────────┘
                                 │  /api/*  (Vite proxy)
                 ┌───────────────▼──────────────────────┐
                 │  FastAPI                              │
                 │  ephemeris.py  → pyswisseph (Swiss)   │
                 │  patterns.py   → graph detection      │
                 │  astrology.py  → signs/dignity/aspects│
                 │  ai.py         → reflective interpret │
                 └──────────────────────────────────────┘
```

**Three-layer philosophy:**

1. **Mathematics first** — `ephemeris.py` wraps the Swiss Ephemeris. UTC-correct Julian
   Day, FLG_SPEED for retrograde, equatorial calls for declination, tropical *and*
   sidereal zodiacs, eight house systems, Asc/MC/Vertex, Nodes, Chiron, Lilith,
   Part of Fortune (day/night formula). Verified against known ephemeris values.
2. **Visualization second** — `ChartWheel.tsx` renders five composable SVG layers
   (zodiac · houses · aspects · planets · transits) with anti-collision glyph
   spreading, retrograde pulse, hover glow, and click-to-select.
3. **Interpretation third** — `ai.py` is a Socratic, archetype-driven guide. It is
   provider-agnostic (any OpenAI-compatible endpoint) and ships with a **real,
   chart-grounded offline fallback** so it works with zero credentials.

---

## Quick start

Prereqs: Python 3.11+ and Node 18+. (`uv` recommended but optional.)

```bash
./run.sh            # installs deps, starts backend :8787 + frontend :5173
```

Then open **http://localhost:5173**. The Einstein chart loads by default so the
observatory is never empty. API docs live at **http://localhost:8787/docs**.

### Manual setup

**Backend**
```bash
cd backend
uv venv --python 3.12 .venv && VIRTUAL_ENV=.venv uv pip install -r requirements.txt
# (or: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)
.venv/bin/uvicorn main:app --reload --port 8787
```

**Frontend**
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # production PWA bundle in dist/
```

---

## Configuration

Copy `backend/.env.example` → `backend/.env`:

| Variable | Default | Purpose |
|---|---|---|
| `SE_EPHE_PATH` | *(unset)* | Path to Swiss `.se1` files. Unset ⇒ built-in Moshier model (no files needed). |
| `AAE_AI_API_KEY` | *(unset)* | Unset ⇒ offline reflective AI. Set ⇒ live LLM. |
| `AAE_AI_BASE_URL` | `openrouter.ai/api/v1` | Any OpenAI-compatible gateway (OpenRouter / Nous Portal / OpenAI). |
| `AAE_AI_MODEL` | `anthropic/claude-3.5-sonnet` | Model id for quick reflections. |
| `AAE_AI_MODEL_DEEP` | `anthropic/claude-3-opus` | Model for "In-depth reading" (depth=deep). |
| `ELEVENLABS_API_KEY` | *(unset)* | Unset ⇒ free browser voice. Set ⇒ premium neural voice via `/api/tts`. |
| `ELEVENLABS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` | Default voice (Rachel). Browse via `/api/tts/voices`. |

### AI providers (local-first, auto-routed)

Astra speaks through a **real model out of the box, no API key**. `AAE_AI_PROVIDER=auto`
picks the best engine available, in order:

| Provider | What it is | Quality / Speed | Needs |
|---|---|---|---|
| **kgirl** | Topological-consensus `/ask` (coherence + ChaosRAG grounding) | Richest, grounded | kgirl server on `:8000` |
| **ollama** | Local Ollama, OpenAI-compatible | Free/private; 3B fast+loose, 9B rich+slow (CPU) | Ollama running (it is) |
| **openai** | Any OpenAI-compatible cloud (OpenRouter/Nous/OpenAI) | Best + fastest | `AAE_AI_API_KEY` |
| **offline** | Chart-grounded reflective generator | Deterministic, instant | — |

The chart **mathematics is always exact** (Swiss Ephemeris); only the interpretive prose
varies by engine. `/api/health` reports the active provider; the UI shows it as a badge
(`⬡ local · qwen2.5:3b`, `✦ kgirl consensus` with coherence/energy, etc.).

To enable the full kgirl path, start its stack (`cd ~/AURIC_OCTITRICE/kgirl && ./START_NOW.sh`)
— AAE auto-detects it on `:8000` and routes through topological consensus + ChaosRAG.

### Ephemeris files (optional, for arc-second precision)

The app is fully functional **without** any data files — pyswisseph's Moshier model
is accurate to a few arc-seconds. For maximum precision and long-range asteroid
coverage, download the official files and point `SE_EPHE_PATH` at them:

```
https://www.astro.com/ftp/swisseph/ephe/   →  sepl_*.se1, semo_*.se1, seas_*.se1
```

---

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | — | status + ephemeris mode |
| POST | `/api/generate-chart` | `ChartRequest` | planets, houses, angles, aspects, patterns, balances |
| POST | `/api/transits` | `{natal, transit_iso}` | transiting positions + aspects to natal |
| POST | `/api/ai-ask` | `{query, chart, lens, selected_*}` | reflective interpretation |
| POST | `/api/suggestions` | `{chart, lens}` | navigational questions for the focal house |
| GET | `/api/tts/voices` | — | available ElevenLabs voices (empty if unconfigured) |
| POST | `/api/tts` | `{text, voice_id?, entitlement?}` | `audio/mpeg` MP3 (supporter-gated) |
| POST | `/api/ai-ask-stream` | `AIRequest` | SSE token stream of the reflection |
| GET | `/api/treasury` | — | treasury address + funding allocation |
| POST | `/api/donate/verify` | `{tx_hash, chain}` | verifies support, mints entitlement token |
| GET | `/api/entitlement` | `?token=` | validates a supporter token |

### Monetization — open paywall

The observatory is **free to explore**; the deep features ask for support that funds the
creator's other projects. Nothing is hard-walled.

- **Free:** natal chart + wheel, aspects, patterns, dignities, radars, transits, a *quick*
  reflection per selection (local/offline), browser voice.
- **Supporter (pay-what-you-want crypto):** in-depth 9B/cloud readings, ElevenLabs premium
  voice, daily horoscope, saved charts, PDF poster, synastry.

Support flows on-chain to a treasury **you** control (`AAE_TREASURY_ETH`); the app never
custodies funds. A contribution mints an HMAC-signed entitlement token (stored client-side)
that unlocks premium for `AAE_ENT_DAYS`. With `AAE_ETH_RPC` set, contributions are verified
on-chain; otherwise an honour-system trust mode applies. The **Support panel** (masthead pill
or `/#support`) shows a live funding dashboard splitting revenue across Music / Research /
Agents.

---

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```

The suite asserts against **independently-known astronomy** (the J2000 Sun position,
Lahiri sidereal offset, 0°-cusp house wrapping, retrograde/speed agreement,
Asc/Desc opposition, classical dignities) — not against our own output, so it catches
real regressions.

---

## Roadmap (target observatory state)

- [x] Swiss Ephemeris core, tropical + sidereal, 8 house systems
- [x] Layered D3 wheel, anti-collision glyphs, retrograde pulse
- [x] Aspects (major + minor) with applying/separating phase
- [x] Graph pattern detection: Stellium, Grand Trine, T-Square, Grand Cross, Yod, Kite
- [x] Transit slider with debounced live recomputation
- [x] Element/Modality radars · reflective AI · navigational suggestions · PWA
- [ ] Synastry / composite / Davison comparative charts
- [ ] Progressions, returns, eclipse timeline events
- [ ] Harmonic charts & midpoint trees · fixed-star overlay · WebGL observatory zoom

MIT licensed. Interpretation is symbolic and reflective — a mirror for self-inquiry,
not prediction.
