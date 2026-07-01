# Hand_off.md

_Last updated: 2026-06-30 (end of crash-recovery + ship session)_

## TL;DR for next session
Everything from the 2026-06-30 session is **merged to `main`**. Nothing was lost in the
mid-session power crash. The repo is clean, tests pass, and the app runs. You're picking up
from a stable baseline, not mid-task.

---

## Current state

- **Branch:** `main` @ merge commit `d9afc4b` (PR #4 merged & branch deleted).
- **Working tree:** clean.
- **Remote:** `github.com/9x25dillon/astro_caster`.
- **Verification at handoff:**
  - Backend: `36 passed` (`pytest`) — 0.76s
  - Frontend: `tsc -b && vite build` clean (64 modules, no type errors)
  - App boots: FastAPI **31 routes**, **27 `/api/*` endpoints** in OpenAPI

## What shipped this session (now on `main`)
- Full **Minor Arcana** tarot deck (78 cards)
- **Synastry** (`backend/synastry.py`): cross-aspect grid w/ reciprocity emphasis + house
  rulers, composite chart (house cusps, derived-MC variant, geographic midpoint, composite
  aspects), synastry-tarot bond-card weighting
- **Predictive** (`backend/predictive.py`): secondary progressions, solar returns, eclipse timeline
- **Advanced** (`backend/advanced.py`): harmonic charts, midpoint trees, fixed stars
- Frontend modals: `RelationshipModal.tsx`, `PredictiveModal.tsx`, `AdvancedModal.tsx`
- UI screenshots in `docs/screenshots/` (17 × `ui-NN-HH-MM-SS.png`)

New endpoints wired in `backend/main.py`:
`/api/synastry`, `/api/synastry-tarot`, `/api/composite`, `/api/progressed-chart`,
`/api/solar-return`, `/api/eclipse-timeline`, `/api/harmonic-chart`, `/api/midpoint-tree`

## How to run it
```bash
./run.sh          # backend :8787 (FastAPI) + frontend :5173 (Vite), Ctrl-C stops both
```
- App:        http://127.0.0.1:5173/
- API docs:   http://127.0.0.1:8787/docs
- `run.sh` is idempotent about ports — it clears stale listeners on 8787/5173 before starting.
- Shell here is **fish**; use `bash -c '...'` for any loop/conditional one-liners.

## Tests
```bash
cd backend && .venv/bin/python -m pytest -q          # 36 tests
cd frontend && npm run build                          # typecheck + build
```

## Open threads / next candidates
- **Synastry optional enhancements** — `backend/synastry.py:12` notes remaining
  `# TODO (optional)` items; these are nice-to-haves, nothing blocking.
- No other outstanding TODOs in backend source.

## Known gotchas (carried from project memory)
- Watch the **base-URL bug** and the **oracle token budget** — see project memory
  `project_aae_state.md` for specifics before touching AI/oracle paths.

## Working-style notes (to make next session faster)
- I move fastest when given **acceptance criteria up front** (e.g. "done = tests green + PR merged").
- Say the **disposition** of ambiguous files explicitly (commit vs. restore vs. ignore).
- Feel free to **batch** multi-step requests in one message ("push, open PR into main, spin it up").
