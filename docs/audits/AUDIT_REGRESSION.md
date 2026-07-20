# AUDIT_REGRESSION.md — Astra Arcana

_Phase 6 closing gate. The "after" half of the audit bracket opened by
`docs/audits/AUDIT_BASELINE.md` (baseline commit `d9afc4b`). Reviewed 2026-07-01 on branch
`production-hardening`, commits `96f3f71`…`9378fc6` + this phase._

**Method:** every security-sensitive diff since baseline re-read in final form
(not from the changelog), each control given a verdict; the producer/consumer
boundaries flagged in `docs/audits/AUDIT_BASELINE.md` §3 re-inspected against the changed
types; new surface (Phases 4–5) audited as new perimeter. Suite state at review:
**105 backend tests passing, frontend `tsc -b && vite build` clean, 34 routes boot.**

---

## 1. Control-by-control verdicts (security-sensitive diffs)

| Control | Baseline state | Final state | Verdict |
|---|---|---|---|
| Trust-mode gate | Any non-empty tx hash granted an entitlement when `AAE_ETH_RPC` unset; non-EVM branch granted on `bool(tx_hash.strip())` | Dual gate: explicit `AAE_TRUST_MODE` **and** recognized non-prod `AAE_ENV`; unset/malformed → denied (`verify_eth_payment`, `accept_offchain_payment`) | **Strengthened, fail-closed** |
| Boot guard | None | `assert_safe_boot()` at `main.py` import refuses prod boot with trust mode on or unset/blank/default `AAE_SECRET`; **re-proven on every CI run** (workflow imports `main` with `AAE_ENV` unset and asserts the refusal) | **New control + continuous proof** |
| Token verification | HMAC-SHA256 sig, `compare_digest`, expiry check | Unchanged logic; fixed token format has no algorithm field (no alg-confusion surface); base64 decode exception-guarded; expiry enforced (`exp < now → None`). **Signature + expiry both checked — complete for the stateless design.** | **Unchanged, verified complete** |
| Dev/admin token | `token != _DEV_TOKEN` (timing-variable), duplicated in `main.py` | Single `ENT.check_dev_token` (`hmac.compare_digest`), fails closed when unset; `main._DEV_TOKEN` removed | **Strengthened** |
| Response headers | None | nosniff / DENY / CSP `default-src 'none'` / no-referrer / HSTS middleware, `setdefault` (won't clobber upstream) — asserted by test | **New control** |
| Background tasks | 6× bare `create_task` (exceptions swallowed) | All via `_spawn` with done-callback logging | **Strengthened** |
| Input validation | Server-clock dates; `date` field N/A | `resolve_local_date` rejects bad date/tz → 400; **Phase 5 found and fixed** `/api/tarot-reading` silently folding an unparseable `date` into the seed (now 400, fail-before/pass-after test) | **Strengthened** |
| Determinism seeding | sha256 (`_seed_rng`), server-clock coupled | Pure function of (signature, local date [daily], spread, question, source); new inputs default to no-ops so pre-existing seeds reproduce; deck-art **reuses** `tarot._seed_rng` rather than re-implementing seeding | **Strengthened, invariant intact** |
| PII | Real birth data in 5 files | Working tree clean (Einstein / synthetic Y2K); **history residual — see §5** | **Mitigated, residual open** |

No control was weakened, bypassed, or made conditional in any diff reviewed.

## 2. Producer/consumer boundaries (AUDIT_BASELINE §3, re-inspected)

- **W3 synastry seam ("grok-engineered" draft):** `synastry.py` is byte-identical
  to baseline. Its only tarot import is `build_natal_arcana_signature`, whose
  call signature is unchanged; the `NatalArcanaSignature` model gained only
  defaulted fields (`weight_sources`), so the boundary is backward-compatible.
  Synastry tests pass against the new types.
- **Arcana-lens contract:** phantom `_LENS_GUIDANCE["arcana"]` removed; guard
  comment in `ai.py` names the invariant; `test_lens_contract.py` locks
  `_LENS_GUIDANCE` keys == `AIRequest.lens` union. The `source_lens` now threaded
  into the arcana prompt is **static server-side data** selected by a closed
  `SourceSystem` Literal — no user free-text reaches that prompt slot (no new
  prompt-injection surface).
- **Duplicated real-coords fixture:** gone; all four test files + frontend
  default use public/synthetic data.
- **`daily_arcana_from_events` skip-on-no-event:** resolved (exactly-N contract,
  now also asserted at the endpoint with a stubbed empty forecast).
- **`verify_ai.py` orphan:** unchanged, intentionally standalone, not wired into CI.

## 3. New perimeter added after baseline (Phases 4–5)

- **`/api/deck-art` (`deck_art.py`):** no network or file I/O; prompt text is
  composed exclusively from static correspondence tables + the pydantic-validated
  chart (no user free-text enters the prompt); unknown `card_id` → 400, unknown
  `source` → 422 (closed Literal); disclaimer on the response; determinism
  asserted at unit and endpoint level. No entitlement required — consistent with
  the other open arcana endpoints (deliberate, not an omission).
- **CI workflow:** read-only `permissions: contents: read`; secrets limited to
  `GITHUB_TOKEN` for Gitleaks. Note: `gitleaks-action@v2` is free for personal
  repos (this one) but needs `GITLEAKS_LICENSE` if the repo moves to an org.
- **Dependencies:** none added in Phases 4–6 (Phase 1.4's `tzdata==2026.2` was
  the last, verified on PyPI). Dependabot now sweeps pip/npm/actions weekly.

## 4. Definition-of-Done rubric

| Criterion | Status |
|---|---|
| No swallowed async errors | ✅ `_spawn` everywhere; tested |
| No hardcoded secrets | ✅ default dev secret cannot reach prod (boot guard, CI-proven); `backend/.env` gitignored/untracked; Gitleaks full-history scan in CI |
| Resource-level authz / IDOR | ✅ re-confirmed N/A: stateless bearer entitlements, **no per-user owned resources added** in Phases 4–6 |
| No orphan state | ✅ `verify_ai.py` documented-intentional; no new orphans |
| Dependencies real / CVE-monitored | ✅ unchanged set + Dependabot |
| Complexity ceilings | ✅ manual review: no new function approaches cyclomatic 10 (largest new unit, `build_card_prompt`, is linear composition) |
| Behavioral coverage on new code | ✅ 27 new tests in Phases 4–5 (12 deck-art, 15 endpoint), all asserting behavior; one real bug found and fixed by them |
| Determinism intact | ✅ identical inputs → identical draws/prompts, offline; legacy seeds reproduce (locked by `test_timezone_seed.py`) |
| Disclaimer on every response | ✅ incl. new `DeckArtResponse`; rides the `.ics` body |
| CI green on clean checkout | ✅ pipeline defined; first run occurs when the branch is pushed (see §5) |

## 5. Open items / operator log

1. **Git-history purge — RESOLVED: LEAVE (explicit operator decision,
   2026-07-01).** The operator has confirmed the history stays as-is. Real
   birth data (values redacted from this doc 2026-07-20) remains in git history from
   `b1bdd5f` onward; the working tree has been clean since Phase 1.2. Revisit
   this decision if the repository is ever made public. Removal procedure
   retained for reference: `git filter-repo --replace-text` (or BFG) targeting
   the coordinate/date strings → force-push → collaborators re-clone →
   invalidate GitHub's cached views (support ticket or private/public cycle).
2. **CI first run:** the workflow exists on the branch but has not yet executed;
   verify all three jobs pass on the PR before merge.
3. **Informational:** endpoint error details interpolate exception text
   (`f"... failed: {exc}"`). Reviewed: the raised messages are validation-class
   (bad date/tz/card id) and safe; keep an eye on this pattern if endpoints ever
   handle secrets or filesystem paths.

---

_End of regression audit. Bracket closed: `docs/audits/AUDIT_BASELINE.md` (before) →
`docs/audits/AUDIT_REGRESSION.md` (after)._

---

## 6. Mini-audit — PDF-2: Personal Report separate purchase rail (2026-07-01)

Appended per the **new-paid-surface rule** (every new paid surface gets a fresh
mini-audit). Surface under audit: `POST /api/personal-report/purchase` (new) and
the purchase gate added to `POST /api/personal-report`.

### Fail-closed matrix

| Scenario | Outcome |
|---|---|
| No entitlement / supporter tier hits purchase rail | 402 before any payment work |
| Oracle tier, no RPC, trust mode off | 402 — payment unverifiable, no mint |
| Trust mode on in production | impossible — `assert_safe_boot` refuses boot |
| On-chain verified tx, `AAE_REPORT_MIN_WEI` unset/0 | 402 — purchases disabled until the operator prices the product |
| On-chain verified tx below `AAE_REPORT_MIN_WEI` | 402 — below price |
| Oracle tier compiles without a claim | 402 (detail names "purchase") — the old free-ride is closed |
| Claim minted for a different session seed | 402 — one-shot per session |
| Tier entitlement token passed as a claim | 402 — no `product` field; token kinds are disjoint |
| Claim passed as a tier entitlement | free tier — no `tier` field; fails closed |
| Expired claim (`AAE_REPORT_TOKEN_DAYS`, default 30) | rejected by `verify_report_token` |
| Dev/admin token | exempt from the claim (already an operator bypass for tier) |

### Controls carried over from existing paid surfaces

- **Rate limiting:** the purchase rail shares the `oracle` bucket and is checked
  **before** tier work and the RPC call — a spray of fake tx hashes cannot run up
  RPC cost.
- **Constant-time comparisons:** claim signature via `hmac.compare_digest`
  (inherited from `verify_token`); seed binding compared constant-time as well.
- **Honest provenance:** trust-mode mints carry `verified: false` end-to-end and
  the response `note` says so.
- **Telemetry:** `report_purchase` logged to `tier_events` (action-keyed, visible
  in the existing admin summary); no new PII — `ref` is the tx-hash prefix,
  consistent with `donate_verify`.
- **Gate ordering:** a purchase claim does NOT substitute for the genuine-session
  proof — a claim bound to a fabricated seed still 409s
  (`test_fabricated_seed_rejected` now proves the ordering explicitly).

### Known limitation (accepted, tracked) — CLOSED 2026-07-05

Claims are **stateless** (by design — no payment-system rebuild): the server
keeps no receipt ledger, so one on-chain tx that meets the price can be
presented repeatedly to mint claims for *different* session seeds. Blast radius
is bounded — oracle tier plus a real qualifying payment are still required, and
each mint is telemetry-logged with the tx prefix, so reuse is visible in
`tier_events`. Follow-up when a shared store lands for R2 (Redis/SQLite):
record redeemed tx hashes and reject reuse.

**Closure (2026-07-05, receipt-ledger branch):** backend/receipts.py — a
SQLite ledger beside the telemetry db (AAE_RECEIPTS_DB, default
data/receipts.db, gitignored). /api/personal-report/purchase redeems the tx
atomically (BEGIN IMMEDIATE) after payment verification and before minting:
first redemption wins; re-minting for the SAME seed stays allowed
(recompiles / lost-claim recovery); a different seed 402s naming the reuse;
an unavailable ledger FAILS CLOSED (no mint). Tx hashes normalized
(strip+lowercase) so case variants are one receipt. /api/donate/verify
intentionally stays replayable — supporters re-verify their tx to recover a
lost tier token (the documented AAE_SECRET-rotation path), and a tier token
has no cross-seed amplification. 9 tests in test_receipts.py.

### Coverage

10 new behavioral tests in `test_personal_report.py`; full suite 144 green.
Frontend `tsc -b && vite build` green.
