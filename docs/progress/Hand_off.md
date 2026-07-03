# Hand_off.md

_Last updated: 2026-07-01 (end of PDF-2/testing/enrichment session)_

## TL;DR for next session

Everything is **merged to `main` @ `508c5a5` and pushed**; all feature branches
(`reliability-pdf`, `fable5-oracle-report`, `production-hardening`) are deleted
locally and on origin. Working tree clean, **146 backend tests green**, frontend
builds clean. You're picking up from a stable, single-branch baseline.

## What shipped this session (now on `main`)

1. **PDF-2 — separate purchase rail for the deluxe Personal Report.**
   Operator decision recorded: off-chain receipt/token (no payment rebuild).
   `POST /api/personal-report/purchase` verifies a treasury tx against
   `AAE_REPORT_MIN_WEI` (unset ⇒ purchases disabled, fail closed) and mints an
   HMAC **report token bound to ONE oracle session seed**
   (`AAE_REPORT_TOKEN_DAYS`, default 30). `/api/personal-report` 402s without
   the claim — detail contains the word `purchase`, which the frontend branches
   on; the dev token is exempt. UI purchase rail lives in the deluxe block;
   claims persist per-seed in `localStorage["aae.report_tokens"]`.
2. **PDF-3/PDF-4** — audio companion (narrates Synthesis + Practices) and
   deterministic sigil-notes pipeline, landed with PDF-2.
3. **Testing tooling** — see `TESTING.md`:
   - `backend/tools/smoke_tiers.py` — 26-check tier × endpoint gate matrix
     against a running server; default run costs nothing; `--full` compiles
     end-to-end (free offline without an Anthropic key).
   - `backend/tools/mint_test_tokens.py` — mints supporter/oracle tokens and
     seed-bound report claims; prints browser localStorage snippets.
4. **Glossary fix** — `.gloss-entry` needed `flex-shrink: 0`; `overflow:hidden`
   zeroes a flex item's min-size, so the fixed-height list crushed all 40
   entries to ~4px ("all" tab looked empty). Verified by headless screenshot.
5. **Deluxe report enrichment** — the compile now weaves in the other Astra
   modules (all client-derived, optional request fields):
   `reflection_summary` (Detail-panel reading → quoted inside the Oracle
   synthesis), `soul_profile` and `life_path` (subsections of the deep-dive),
   extended `sigil_notes` (chaos + gematria word-value + dominant-planet
   kamea). Both provenances carry them: Fable prompt AND offline compiler.
6. **Esoteric-tome cover art** — `coverArtSvg()` in
   `frontend/src/lib/printReport.ts`: deterministic frontispiece (natal
   planets at true longitudes joined into a constellation, engraved-gold
   zodiac ring — U+FE0E text presentation, session-seeded star field, chaos
   sigil in a gold annulus, tome frame). Injected on the print cover page.
7. **short_seed** — display seed is now a sha256 digest fragment on
   `PersonalReportResponse` and the printed cover. The RAW seed's tail is the
   user's question (it printed "Seed: d right now?"). The raw seed is still
   what binds claims — `mint_test_tokens.py --seed` takes the RAW seed.

## How to run / test

```bash
./run.sh                                   # backend :8787 + frontend :5173
AAE_TRUST_MODE=1 ./run.sh                  # ...with the purchase rail mintable
cd backend && .venv/bin/pytest -q          # 146 tests
cd frontend && npm run build               # typecheck + build
.venv/bin/python tools/smoke_tiers.py      # tier gate matrix vs live server
.venv/bin/python tools/mint_test_tokens.py # browser tokens for any tier
```

## Environment reality (shapes what "working" looks like locally)

- `run.sh` exports `AAE_ENV=development`; **trust mode is OFF** by default, so
  donate/purchase rails correctly reject everything until `AAE_TRUST_MODE=1`.
- **No `AAE_ANTHROPIC_API_KEY`** in `backend/.env` → Oracle/Personal reports
  compile in the deterministic offline mode (free to test end-to-end, honest
  `ai_source: "offline"` badges). OpenRouter/ollama serve the lens readings.
- `AAE_DEV_TOKEN` (in `.env`) grants oracle tier AND bypasses the purchase
  gate — use a minted plain-oracle token to test the rail itself.
- Tokens copied from a wrapped terminal line break silently: startup
  validation clears the mangled token and the UI quietly shows free tier.
  `mint_test_tokens.py` output + the `.replace(/\s+/g,"")` console snippet
  pattern avoids this.
- `*.pdf` is now gitignored — user print artifacts carry birth data; never
  commit them (one was caught and amended out this session).

## Open threads / next candidates

- **Receipt ledger (R2-adjacent):** report claims are stateless, so one paid
  tx can be replayed across different session seeds. When a shared store
  lands (Redis/SQLite), record redeemed tx hashes and reject reuse. Recorded
  in `docs/audits/AUDIT_REGRESSION.md` §6.
- **PDF-1 follow-on (optional):** richer tarot-card grid + two-column layouts
  from the design mock in the print renderer.
- **AdminPanel:** surface `report_purchase` tier-events explicitly in the UI
  (they're in `/api/admin/stats` → `tier_events` already).
- **Frontend chunk-size warning** (>500 kB) — cosmetic, unaddressed.
- **CI:** confirm the workflow's three jobs pass on GitHub now that
  everything is on `main` (defined during production-hardening; first runs
  happen on push).
- Before any public deploy: set `AAE_ETH_RPC`, `AAE_ORACLE_MIN_WEI`,
  `AAE_REPORT_MIN_WEI`; revisit the git-history birth-data decision
  (`docs/audits/AUDIT_REGRESSION.md` §5.1, operator chose LEAVE on 2026-07-01).

## Known gotchas (carried forward)

- **Base-URL bug:** `AAE_AI_BASE_URL` must NOT include `/v1` (code appends it).
- **Oracle token budget:** 2500+ tokens or readings truncate mid-sentence.
- Shell here is **fish** — use `bash -c '...'` for loops/conditionals.
- The raw oracle seed is a signature STRING (ends with the question), not a
  hash. Display uses `short_seed`; binding/minting uses the raw value.

## Working-style notes (what sped this session up / would speed the next)

- Acceptance criteria up front ("done = gate 402s for oracle tier without a
  claim, tests green, committed") let work land in one pass.
- Bug reports travel fastest as a **minimal reproduction**: the exact click
  path or console/error text, verbatim. "Token doesn't work" took a full
  server-side chain-walk to localize to a copy-paste line-wrap.
- Multi-part asks are welcome — a short list ("1. glossary scroll fix,
  2. weave soul profile into the report, 3. tome cover art") lands cleaner
  than a run-on sentence, and each item can be verified independently.
