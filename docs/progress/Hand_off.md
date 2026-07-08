# Hand_off.md

_Last updated: 2026-07-08 (track-d-housekeeping)_

## TL;DR for next session

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
- Ideas shelf: WASM-Swiss for *all* bodies (would collapse the cross-engine
  tolerances to zero and retire astronomy-engine); sidereal zodiac on-device;
  richer tarot-card grid in the print renderer (PDF-1 follow-on).

## Known gotchas (carried forward)

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
