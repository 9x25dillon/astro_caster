# Public Launch Schedule — secure, monetized, public Astra

_Status: **RATIFIED by the operator 2026-07-19** (drafted same day).
Supersedes the "personal instrument" direction of 2026-07-08 **for the public
track only**; the personal instrument survives as Edition P below.
NEXT_ARC.md carries a banner pointing here._

_Ratified decisions: **D1 = (b)** fresh public repo cut from a clean tree
(working repo's history stays private) · **D2** Stripe primary, crypto kept
as alternative rail · **D3** AGPL-3.0 stays (source offer in footer) ·
**D4** single VPS + docker-compose behind Cloudflare._

---

## 0. The two editions (the governing idea)

One codebase, two deployments:

| | **Edition P — the operator's observatory** | **Edition Q — the public product** |
|---|---|---|
| Access | **Everything unlocked, no restrictions, forever** | Tiered: free / supporter / oracle |
| Rate limits | None | Sliding-window, spend-capped |
| Payments | None (never pays himself) | Stripe + crypto rails |
| Hosting | His machine (localhost / LAN) | Hardened public host |
| Data | His vault, his `.env`, his DBs | Zero-retention posture, policies published |

Everything in this schedule is Edition Q work **except Phase 1**, which makes
Edition P a first-class configuration instead of a token workaround.

## 0.1 Security triage — ✅ CLOSED 2026-07-19

The GitHub vulnerability flag is resolved. Findings, for the record:

- The flagged fix was already merged by the operator as Dependabot PRs
  **#72–#74** (vite 8.1.3→8.1.4 security patch, tzdata 2026.3, setup-node 7).
  Local main was stale; now fast-forwarded to `7b7a0fa`, `npm ci` + venv
  resync done, **frontend build green, 199 backend + 37 core tests green**.
- Fresh audits of all three dependency surfaces: `npm audit` (frontend,
  astra-core) and `pip-audit` over the full frozen backend set — **0 known
  vulnerabilities**.
- **Dependabot alerts + automated security fixes were DISABLED on the repo —
  enabled via API 2026-07-19.** Alerts page currently reports 0 open.

---

## Decision gates (operator calls — needed before the phase that consumes them)

- **D1 · Git history (blocks Phase 2 exit).** The public repo's history
  contains the operator's birth data (AUDIT_REGRESSION §5.1 — "LEAVE" was
  chosen under the personal direction; a public product reopens it).
  Options: (a) `git filter-repo` scrub + force-push, (b) fresh public repo
  cut from a clean tree (history stays private), (c) leave as-is, accepted.
  **Recommendation: (b)** — cleanest, keeps the working repo intact.
- **D2 · Payment rails (blocks Phase 4).** Current rail is crypto-only
  (on-chain verification). A public product realistically needs **Stripe**
  (cards, subscriptions, refunds). Recommendation: Stripe primary, crypto
  kept as the alternative rail.
- **D3 · License posture (blocks Phase 5).** AGPL-3.0 is fine for a
  monetized SaaS you own — but it obliges offering source to users. Accept
  that (recommended: yes, it's already public) or dual-license.
- **D4 · Hosting target (blocks Phase 3).** A VPS + docker-compose
  (DEPLOY.md already exists) vs managed platform. Recommendation: single
  VPS behind Cloudflare to start; the stack is one compose file.

---

## Phase 1 — Edition P: the unrestricted personal build — ✅ BUILT 2026-07-19 (branch `edition-p-personal-mode`)

> Your requirement: a personal version with **no locked features or
> restrictions**. Today that's approximated by `AAE_DEV_TOKEN`; it should be
> a boot mode, not a token you carry.

- **1.1 `AAE_PERSONAL_MODE=1`**: instance-wide oracle tier for every
  request — no tokens, no entitlement checks, no purchase gates (deluxe
  exemption included — the gate that bit during Phase 0), no rate limits,
  no telemetry.
- **1.2 Fail-closed interlock**: personal mode **refuses to boot** if any
  public-facing signal is set (treasury address, Stripe keys, non-localhost
  bind) — so the unrestricted build can never accidentally be the public one.
- **1.3 `run.sh --personal`** (or default when `.env` says so) + README
  section "Your own observatory".
- _Done when:_ fresh browser, zero tokens → every feature (Oracle, deluxe
  report, Course, plates, TTS) works; boot with a Stripe key + personal
  mode → refuses; tests assert both.

## Phase 2 — Security hardening (the public gate, ~3–4 sessions)

- **2.1 Repo surfaces** — ✅ DONE 2026-07-20: Dependabot alerts ✅ +
  auto-fixes ✅; CodeQL workflow ✅ (#77); secret scanning + push
  protection verified enabled.
- **2.2 Execute D1** (git-history decision) — **working-tree half done
  2026-07-20**: real birth-data literals scrubbed from the 4 files that
  still carried them (test fixtures, vault-tool docstring, audit-doc
  citations) — see PR #78. **The actual repo cut (fresh public repo from
  a clean tree, per the ratified D1=(b)) is still pending — an
  operator-level decision** (new GitHub repo, hosting, what stays
  private) rather than something to execute unilaterally mid-session.
- **2.3 Secret hygiene** — runbook ✅ (DEPLOY.md §6, #77); **rotation
  drill PERFORMED 2026-07-20** (`AAE_SECRET` + dev token; old token
  verified dead, smoke green). API keys rotate at their consoles in the
  pre-deploy sweep.
- **2.4 Prompt-injection hardening** — ✅ DONE (#77): `promptsafe.py`
  quarantines user text (delimiters + instruction to treat as data) before
  it enters oracle/course/personal-report prompts; red-team cases in
  `test_prompt_quarantine.py`.
- **2.5 Edge posture** — ✅ DONE 2026-07-20: nginx security headers ✅
  (#77, now drift-locked by `test_edge_headers.py` in #78), CORS pinned to
  `AAE_CORS` (credentialed CORS refused when wildcard, `main.py`), request
  size cap added (`client_max_body_size 1m`, #78 — the one item 2.5 was
  still missing), rate limiter defaults ON in production
  (`test_enabled_by_default_in_production`). TLS itself is the D4 host's
  job (Cloudflare/VPS termination) — nothing to verify pre-deploy.
- **2.6 Run `/security-review`** — ✅ RUN 2026-07-20 over the Phase 2
  range: one verified finding (personal-mode interlock missed
  `AAE_TREASURY_SOL`), fixed by prefix-sweeping `AAE_TREASURY_*` (PR #78);
  everything else clean.
- _Done when:_ review clean ✅, rotation drill performed once ✅
  (2026-07-20), CI carries CodeQL + gitleaks + parity + full matrix ✅.
  **Headers verified by an external scanner (securityheaders.com /
  Mozilla Observatory) still needs a live host** — no Docker daemon
  access in this environment to stand nginx up locally, and there's no
  deployed edge yet to point a scanner at. `test_edge_headers.py`
  drift-locks the config statically in the meantime; run the real
  scanner once the D4 staging deploy (Phase 3.6) is up.

## Phase 3 — Productionization (parked backlog wakes, ~3 sessions)

- **3.1 F1 API versioning** — ✅ DONE 2026-07-20: pure-ASGI prefix
  rewrite serves every route at `/api/v1/*` AND bare `/api/*` (cached
  PWA shells tolerate skew); frontend on `API_BASE=/api/v1`; unknown
  versions 404; `api_version` in `/api/health` + root. e2e exact-path
  matchers converted to suffix predicates.
- **3.2 F2 structured logging** — ✅ DONE 2026-07-20: `logsetup.py` —
  JSON lines in production (AAE_LOG_JSON overrides either way), human in
  dev; X-Request-ID bound per request (inbound honored when well-formed),
  access line emitted by our middleware (uvicorn's silenced — it can't
  see the request context; ours adds duration and strips query strings so
  `?entitlement=` never reaches logs). No-birth-data-in-logs asserted in
  `test_structured_logging.py`.
- **3.3 R4 metrics + alerting** — ✅ metrics DONE 2026-07-20: `metrics.py`
  (dependency-free Prometheus text format) + operator-gated `GET /metrics`
  (outside `/api/*` so the nginx edge never proxies it); the
  `_RequestContext` middleware records request counts/durations by
  route+status-class (unknown paths fold to `(other)` — cardinality
  bounded), and `observe_ai_call` counts provider-backed calls + response
  chars per kind (offline fallbacks excluded — the point is spend). Alert
  RULES (error-rate, AI-spend, uptime) ship with 3.6's scraper config,
  not the app — they need a live Prometheus to fire against. (Landed via
  PR #88 — the #85 re-land, since #85's stacked merge never reached main.)
- **3.4 F3/F4 caching** — ✅ DONE 2026-07-20 (measured first): profiled
  the deterministic paths — `generate_forecast(90d)` = ~94 ms, called
  repeatedly by the frontend for the same chart/day; `calculate_chart` =
  ~0.9 ms, measured NOT worth caching. Built `backend/cache.py` (a
  thread-safe bounded LRU with hit/miss/eviction stats + copy-on-return)
  and applied it to forecast, keyed on natal-longitudes + start-day +
  window + significance floor. **Measured 60× on a warm hit** (94 → 1.6
  ms). Stats surface in `/api/admin/stats.caches`; a Prometheus
  `aae_cache_*` family is a one-line follow-up now that metrics has landed
  (#88). `AAE_CACHE_ENABLED=0` disables. Aspect/chart caching left unbuilt
  on purpose — the numbers didn't justify it.
- **3.5 Backups** — ✅ DONE 2026-07-20: `backend/tools/backup.py` encrypts
  `data/*.db` + `.env` into one authenticated file (Fernet + scrypt);
  DEPLOY.md §7 runbook + systemd-timer schedule; **restore drill
  PERFORMED** against live state (create → restore → both DBs
  `integrity_check=ok`, `.env` byte-identical, wrong passphrase rejected)
  and logged. The `drill` self-check is in CI (`test_backup.py`). Re-run
  the on-host drill against real volumes after the first staging deploy.
- **3.6 Staging deploy** on the D4 target from docker-compose; smoke matrix
  (`dev.py smoke --full`) against it.
- _Done when:_ staging serves the full app over TLS with dashboards live and
  a restore drill logged.

## Phase 4 — Monetization (~3–4 sessions)

- **4.1 Entitlement lifecycle**: expiry/renewal/revocation for paid tokens;
  device re-link flow; admin lookup tooling (extends receipts ledger).
- **4.2 Stripe rail (D2)**: Checkout for supporter/oracle (subscription or
  one-time — operator choice), webhook → verify → mint entitlement → receipt
  row; refund webhook → revoke. Crypto rail kept: set `AAE_ETH_RPC`,
  `AAE_ORACLE_MIN_WEI`, `AAE_REPORT_MIN_WEI` (the pre-deploy trio from the
  audit).
- **4.3 Deluxe purchases**: per-report purchase flow on the same rail
  (machinery exists; wire to Stripe).
- **4.4 AI cost controls**: per-user daily budgets, global spend alarm,
  graceful degrade to offline compilers when capped (already honest —
  keep `ai_source` provenance).
- **4.5 Tome storefront gate** (PHYSICAL_TOME_PRODUCT Phase 2) — **only if
  Phase 0's printed copy passes in hand**; Lulu fulfillment, priced ≥ the
  $150 gift-worthiness bar.
- _Done when:_ a stranger with a card can buy each tier and the deluxe
  report end-to-end on staging (Stripe test mode), refunds revoke, spend
  alarms fire in a drill.

## Phase 5 — Policy, legal, copy (~1–2 sessions, can overlap Phase 4)

- Privacy policy (the true story: birth data never retained server-side;
  telemetry = anonymous counters), Terms, refund policy, pricing page.
- D3 executed (AGPL source link in footer).
- Disclaimer/refrain pass over all public copy per the voice canon —
  *"nothing Astra produces is a life sentence — it is a life poem"* — plus
  the reflective-not-predictive framing in ToS.
- App-store review of AI-content rules **only if** H2 (Capacitor) wakes.

## Phase 6 — Launch (~1–2 sessions + soak)

- Load test the AI endpoints (they're the expensive path) + static surfaces.
- Full e2e + smoke matrix against production config; airplane-mode PWA check
  on the public URL.
- Soft launch (unlisted URL, a few real users) → 1–2 week soak watching
  dashboards → public announce.
- Incident runbook: key rotation, provider outage (offline compilers are the
  designed fallback), refund/abuse handling.

---

## Suggested calendar (at the current ~2 sessions/week cadence)

| Week | Work |
|---|---|
| **W1** (Jul 20–26) | Phase 1 (Edition P) + Phase 2 start (CodeQL, secret scanning, D1 decision) |
| **W2** (Jul 27–Aug 2) | Phase 2 finish (rotation, prompt-injection, headers, security review). **Aug 1: Fable cap returns** — live-verify reports |
| **W3** (Aug 3–9) | Phase 3 (versioning, logging, metrics, backups, staging deploy on D4) |
| **W4** (Aug 10–16) | Phase 4 core (entitlement lifecycle, Stripe rail, deluxe purchase) |
| **W5** (Aug 17–23) | Phase 4 finish (cost controls) + Phase 5 (policies, pricing, copy) |
| **W6** (Aug 24–30) | Phase 6: load test, soft launch, soak |
| **W7+** | Public announce when the soak is quiet |

**Standing threads that ride alongside (not gated on this):** the Phase 0
tome order (operator's hands; its verdict gates 4.5), P3 plate live-verify
(needs `AAE_OPENAI_API_KEY`), PB1 book compiler, monthly dependency cadence.

**Ground rules carried over:** acceptance criteria up front · every phase
lands as PRs the operator merges · parity vectors stay green · fail-closed
remains the security posture · Edition P never gets weaker while Edition Q
gets harder.
