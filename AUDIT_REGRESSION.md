# AUDIT_REGRESSION.md — Astra Arcana

_Phase 6 closing gate. The "after" half of the audit bracket opened by
`AUDIT_BASELINE.md` (baseline commit `d9afc4b`). Reviewed 2026-07-01 on branch
`production-hardening`, commits `96f3f71`…`9378fc6` + this phase._

**Method:** every security-sensitive diff since baseline re-read in final form
(not from the changelog), each control given a verdict; the producer/consumer
boundaries flagged in `AUDIT_BASELINE.md` §3 re-inspected against the changed
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

1. **Git-history purge — DEFERRED (operator decision, 2026-07-01).** Real birth
   data (`34.935,-117.199` · 1987-11-11) remains in git history from `b1bdd5f`
   onward on the GitHub remote. Removal procedure when approved:
   `git filter-repo --replace-text` (or BFG) targeting the coordinate/date
   strings → force-push → all collaborators re-clone → invalidate GitHub's
   cached views (contact support or make the repo private/public cycle).
   Interim mitigation available: make the repository private.
2. **CI first run:** the workflow exists on the branch but has not yet executed;
   verify all three jobs pass on the PR before merge.
3. **Informational:** endpoint error details interpolate exception text
   (`f"... failed: {exc}"`). Reviewed: the raised messages are validation-class
   (bad date/tz/card id) and safe; keep an eye on this pattern if endpoints ever
   handle secrets or filesystem paths.

---

_End of regression audit. Bracket closed: `AUDIT_BASELINE.md` (before) →
`AUDIT_REGRESSION.md` (after)._
