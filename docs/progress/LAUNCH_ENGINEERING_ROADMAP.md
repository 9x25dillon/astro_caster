# Launch Engineering Roadmap — the path from "the code works" to "customers pay"

_Authored session 19 (2026-07-24) at the operator's request. This is the
intricate engineering plan for the next arc: Edition Q to first revenue. It
sits beneath `PUBLIC_LAUNCH_SCHEDULE.md` (the phase-level plan) and feeds
`Hand_off.md` (the live work order). Read `Hand_off.md` first for current state._

---

## 0. The situation, stated precisely

**The monetization CODE is done and on main** (Phase 4: entitlement lifecycle,
Stripe rail, deluxe purchase, cost controls, subscription self-service; 339
backend tests). **The PRODUCT around it is not.** The gap between here and first
revenue is three things, none of which are backend engine work:

1. **No purchase UI.** The Stripe rail shipped backend-first. There is **no Buy
   button, no pricing surface, and — critically — no redirect-return handler**:
   after Stripe redirects back to `?checkout=<id>` / `?report_checkout=<id>`,
   nothing in the frontend reads that param or mints the entitlement. This is
   the single hard blocker.
2. **No policies.** Taking real money legally requires privacy / terms / refund
   / pricing pages (Phase 5). Stripe's own ToS requires them.
3. **No public deployment.** The app runs on `localhost`. Live payments need a
   real HTTPS host with a real webhook endpoint (Phase 3.6, blocked on the D4
   VPS the operator provisions).

**The critical path to revenue:**

```
  M0  Validate the rail in TEST mode (free, safe)          ← gate, do first
  M1  Track E-3: purchase mechanics + pricing surface      ← THE NEXT SESSION
  M2  Track E-1/E-2: threshold + progressive depth (UX)
  M3  Phase 5: policies & copy
  M4  Phase 3.6: deploy to the VPS + live webhook
  M5  Go live: test→live keys, soft launch, soak
```

**Guiding constraints (operator's ratified direction + the repo invariants):**
- **The math is the product; the mysticism is a lens, esoteric by invitation.**
  Edition Q's public face must be engaging and ergonomically intuitive first.
- **Privacy by construction** stays absolute — no birth data / question text
  retained; the funnel telemetry is anonymous counters only.
- **Test-mode first, always.** No live key touches anything until M5, and never
  through chat or the repo — only a production host's secret store.
- **The interlock holds:** any `AAE_STRIPE_*` key ⇒ Edition Q ⇒ personal mode
  refuses to boot. Edition P is never the thing that takes money.

---

## M0 — Test-mode validation (the gate) · ✅ **PASSED 2026-08-11**

Run against the real production deployment (`app.astra-arcana.com`), not
localhost, with `sk_test` keys and a real Stripe webhook endpoint:

| step | result |
|---|---|
| checkout session | `success_url` = the APP origin (not the `127.0.0.1:5173` default) |
| payment (4242…) | `status: complete`, `payment_status: paid`, $3.25 subscription |
| webhook → mint | `POST /api/stripe/webhook 200 31ms` |
| entitlement | 241-char token, `verified: true`, `exp - iat` = 365 days |
| token grants access | `GET /api/entitlement` → `tier: supporter` |
| refund alone | **access survived** — see the M5 warning below, this is why |
| cancel → revoke | `POST … 200 3ms` → `tier: free` |

Four defects had to be fixed to get here, none of them in the rail itself:
compose never forwarded `AAE_STRIPE_*`; it never forwarded `AAE_PUBLIC_URL`
(whose default would have redirected paying customers to localhost); the
passthrough then crash-looped the backend because `${VAR:-}` sets a variable to
empty and `float("")` raises at import; and the M5 refund step below was wrong.

**Goal:** prove the rail end-to-end with test keys + test cards before building
any UI on top of it. ~30 minutes, jointly (operator clicks the browser bits).

**Runbook** (already scaffolded once this session; see `Hand_off.md` toggle):
1. `.env` → Edition Q test mode (comment `AAE_PERSONAL_MODE`, uncomment the
   `AAE_ENV`/`AAE_STRIPE_*` block, `AAE_STRIPE_MODE=subscription`).
2. `stripe listen --forward-to http://127.0.0.1:8787/api/stripe/webhook` →
   `whsec_` into `.env`.
3. `bash run.sh`; `POST /api/checkout {tier:"oracle"}` → hosted URL.
4. Pay `4242 4242 4242 4242`; confirm `checkout.session.completed` mints (admin
   ledger shows it, customer recorded).
5. Open `/api/billing/portal` with that entitlement → **cancel** → confirm
   `customer.subscription.deleted` revokes at period end.
6. `POST /api/personal-report/checkout` → pay → `.../claim` mints the report
   token → the deluxe report compiles.
7. Trip a budget cap and confirm graceful degrade to the offline compiler.

**Acceptance:** mint, self-serve cancel→revoke, deluxe claim, and cost-cap
degrade all observed live in test mode. **Exit:** revert `.env` to personal.
This de-risks every UI decision in M1 — we build against a rail we've watched work.

---

## M1 — Track E-3: purchase mechanics + pricing surface  ·  **THE NEXT SESSION**

The centerpiece. This closes the hard blocker (§0.1) and makes the app one a
customer can actually buy. Buildable and fully testable in test mode; needs no
VPS and no policies. Estimated one focused session; PR per sub-milestone.

### 1.1 The redirect-return plumbing (the missing link)

Stripe checkout is a **redirect** flow: the browser leaves to Stripe, pays, and
returns to a `success_url` we set. Backends mint on that return. The frontend
does not yet handle the return. Build it mirroring the existing `?entitlement=`
IIFE in `store/useStore.ts` (which already decodes + scrubs a URL param cleanly).

- **Tier return** — `?checkout=<session_id>` (or `?checkout=cancel`):
  - New store bootstrap (IIFE or an `onMount` effect): if `checkout` present and
    not `cancel`, call **`GET /api/checkout/{id}`** (mints-on-read, webhook-lag
    resilient). On `{granted, entitlement}`, store the token exactly like
    `redeemDonation` does (`localStorage[ENT_KEY]`, `set({entitlement, isSupporter:true})`).
  - Poll briefly (e.g. 3× / 2s) while `{granted:false, status:"pending"}` to
    cover the case where the browser beats the webhook.
  - `cancel` → a gentle "checkout cancelled" note, no state change.
  - **Scrub the param** from the address bar (mirror the entitlement IIFE) so a
    reload can't re-trigger and the id doesn't linger.
- **Deluxe return** — `?report_checkout=<session_id>`:
  - The claim needs the **Oracle seed** (`POST /api/personal-report/checkout/claim
    {session_id, seed}`), but the redirect only carries the session id.
  - **Design:** before redirecting to a deluxe checkout, **stash the pending
    seed** in `localStorage["aae.pending_report_seed"]` keyed to the session.
    On return, read it, call `claimReportCheckout(session_id, seed)`, save the
    `report_token` (the ArcanaModal already persists report tokens by seed),
    then clear the stash + scrub the param.
  - Failure modes to handle explicitly: 402 not-yet-paid (retry/poll), 409
    wrong-seed / not-a-report-session, missing stash (surface "re-open the
    session and retry").

**Acceptance 1.1:** a simulated return (see §1.5 e2e) stores the entitlement /
report token and flips `isSupporter` / unlocks the deluxe compile, with the URL
param scrubbed.

### 1.2 The Buy actions + a pricing source of truth

- **`client.ts`:** add `createCheckout(tier)` → `POST /api/checkout` (the tier
  rail; `reportCheckout` / `claimReportCheckout` / `openBillingPortal` already
  exist). Each returns a hosted URL; the button does `window.location.href = url`
  after stashing any needed context (the seed, for deluxe).
- **Backend — one small addition: `GET /api/pricing`.** Prices live in env
  (`AAE_STRIPE_*_USD`); the UI must not hardcode them or drift. Return
  `{card_available: stripe_available(), crypto_available: bool, mode, tiers:
  [{tier, usd}], report_usd}`. The pricing surface renders from this, and hides
  the card option when the rail is off (so Edition P / an unconfigured instance
  degrades honestly to the crypto/offline story). ~15 lines + a test.

### 1.3 The pricing surface (E-3 proper)

Today "Support / Unlock" lives in chapter VIII (Library) and the crypto-only
`SupportModal`. E-3 turns that into a real, honest pricing surface — **the math
is the product, the unlock is an invitation, not a wall.**

- A `PricingPanel` (rendered in chapter VIII and reachable from the masthead
  pill), driven by `GET /api/pricing`:
  - The **free tier's honesty up front** — everything deterministic is free and
    on-device forever; the unlock buys the *Fable-5 syntheses* (Oracle Report,
    Course, deluxe Personal Report) and premium voice, not the math.
  - **Two rails, plainly:** "Unlock with card" (Stripe → redirect) **and** the
    existing crypto contribution, side by side; card hidden when unconfigured.
  - **Subscription vs one-time** framed clearly (supporter/oracle tiers vs the
    per-session deluxe report), with the **cancel-anytime** promise visible
    (links to the portal — the self-service we just built is a selling point).
  - Voice canon in the copy: *"nothing Astra produces is a life sentence — it is
    a life poem."* Copy test: does the line open a door or close one?
- The deluxe **"Buy with card"** button joins the existing crypto purchase row
  in `ArcanaModal` (it already has the crypto tx-hash flow + the `reportToken`
  state; add the Stripe path beside it, stashing the seed per §1.1).

### 1.4 Funnel telemetry (anonymous)

Add `trackEvent` breadcrumbs — **counts only, no identifiers, no birth/question
data** (honor the privacy invariant + the existing telemetry posture):
`pricing_viewed`, `checkout_started {tier|deluxe, rail}`, `checkout_returned
{granted}`, `checkout_cancelled`. These become the conversion funnel later
without ever touching PII.

### 1.5 Test strategy (how to e2e a redirect without real Stripe)

- **e2e (Playwright):** you cannot drive Stripe's hosted page in CI, and must
  not. Instead **intercept the routes** (the repo already uses `context.route`
  for offline specs): stub `POST /api/checkout` → `{url:"/?checkout=cs_test_e2e",
  session_id}` so the app "redirects" to its own origin; stub `GET
  /api/checkout/cs_test_e2e` → a paid `{granted, entitlement}`. Assert the store
  stored the token, `isSupporter` is true, and the URL param was scrubbed. Mirror
  for the deluxe claim (stub `.../checkout/claim`). New specs:
  `e2e/checkout-return.spec.ts`, `e2e/deluxe-checkout.spec.ts`.
- **Backend:** `GET /api/pricing` gating + shape (card hidden when Stripe off);
  extends `test_stripe_rail.py`.
- **Unit (frontend):** the seed-stash / return-handler pure logic.

### 1.6 Acceptance + commit plan for M1

- **Done =** in test mode, a customer clicks "Unlock with card," pays a test
  card, lands back unlocked (tier), **and** buys + compiles a deluxe report by
  card; the pricing surface reads live prices and hides card when the rail's off;
  new e2e green; privacy invariant intact (telemetry is counters).
- **Commits / PRs (each shippable):**
  1. `feat(pay): checkout redirect-return handlers + GET /api/pricing`
  2. `feat(pay): pricing surface (E-3) + card Buy actions`
  3. `feat(pay): deluxe card purchase in ArcanaModal + seed stash`
  4. `test(pay): checkout-return + deluxe e2e (route-stubbed)`
- **Explicitly NOT in M1:** the E-1/E-2 onboarding redesign (M2), any live key,
  any deploy. Keep the blast radius to "a customer can now pay."

---

## M2 — Track E-1 / E-2: threshold + progressive depth

The engaging, esoteric-by-invitation redesign the operator ratified. Bigger and
more design-led than M1; **wireframes first** (an artifact, iterated like the
Track R holographic wireframes were).

- **E-1 — the threshold / onboarding.** The first-visit experience for someone
  who is *not* a deep-esoteric user: lead with the math and the utility ("your
  actual sky, computed"), let the mysticism reveal itself. De-taboo the door.
  Must obey the Track R **ergonomic law** (fixed spatial positions, ≤2
  interactions to anything, keys, thumb targets).
- **E-2 — progressive depth.** Reveal esoteric layers by invitation, not by
  dumping them; the pricing surface (M1) is one such invitation, timed to a
  moment of demonstrated value, not a cold wall.
- **Analytics:** the M1 funnel events start telling us where the threshold leaks.

**Prereq:** M1 first — a pricing surface that works, then the UX that frames it.

---

## M3 — Phase 5: policies & copy

Legally load-bearing for real money; can partly parallelize M1/M2.

- **Privacy policy** — the true, unusually strong story: birth data and question
  text are never retained server-side; telemetry is anonymous counters; the
  deterministic engine runs on-device. This is a *feature*, said plainly.
- **Terms of service**, **refund policy** (define the window; the rail already
  supports refund→revoke), **pricing page** copy.
- **AGPL source link** in the footer (D3 obligation).
- **Disclaimer/voice pass** over all public copy per the canon.
- A small `/legal` surface (static routes or a chapter), linked from pricing +
  footer. Stripe checkout can then link ToS/refund at the point of sale.

---

## M4 — Phase 3.6: deploy (blocked on the operator provisioning D4)

- **Operator:** provision the VPS + DNS (ratified: single VPS + docker-compose
  behind Cloudflare). This is the one hard external dependency.
- **Session:** bring up the prod compose stack, TLS via Cloudflare, run the smoke
  matrix + full e2e against staging. Point a **real Stripe webhook endpoint** at
  `https://<domain>/api/stripe/webhook` (replaces `stripe listen`). Then the two
  deferred edge verifications: external header scan (securityheaders.com — Phase
  2.5's last box) and Prometheus alert rules (error-rate, AI-spend, uptime).
- **Secrets on the host**, never in the repo/image: `AAE_SECRET`, the Stripe
  keys (still **test** at this point), API keys.

---

## M5 — Go live (the only place a live key appears)

- Configure the **live** Customer Portal in the Stripe dashboard (cancel on).
- Swap `sk_test_`→`sk_live_` **and** the live `whsec_` **in the host's secret
  store only** — never chat, never the repo. Set live `AAE_STRIPE_*_USD`.
- One tiny **real-money** smoke: buy the cheapest tier on a real card, confirm
  mint, then **cancel the subscription** and confirm revoke — then refund the
  charge to return the money.

  ⚠️ **Cancel is the revoke trigger, not refund.** This step used to read
  "refund it and confirm revoke", which M0 proved would fail. The mint stores
  `ref = payment_intent OR subscription OR session_id`, so for a subscription
  the ref is `sub_…`; `charge.refunded` resolves `ref = payment_intent OR
  charge_id`, i.e. `py_…`. Different namespaces, so the revoke lookup cannot
  match and access survives the refund.

  That is defensible — refunding an invoice does not cancel a subscription in
  Stripe either — and it is NOT a problem for **one-time** purchases (the
  deluxe report), where the mint ref *is* the payment_intent and refund→revoke
  works. But doing it in the wrong order on live money means debugging the rail
  during your first real transaction. Cancel, verify `tier: free`, then refund.

  **Verified in test mode 2026-08-11 (M0):** mint via webhook (200, 31ms),
  token grants `tier=supporter verified=true`, refund alone left access intact,
  `customer.subscription.deleted` revoked it to `tier: free`.
- **Soft launch → soak:** watch the `aae_ai_spend_alarm` gauge, error rate, and
  the funnel; keep the offline-degrade path as the safety net. Announce when the
  soak is quiet.

---

## Cross-cutting engineering concerns

- **PCI scope is minimal by design.** Stripe **hosted** checkout means card data
  never touches our servers → SAQ-A, the lightest self-assessment. Do not add a
  custom card form (that would balloon scope). Keep the redirect model.
- **Key discipline (test→live).** Test keys may live commented in `.env` for the
  dev toggle. Live keys exist **only** in the production host's secret store.
  Rolling any key is a dashboard action; re-place values via the edit tool,
  never echoed. The `sk_test_` key that hit chat this session should be rolled.
- **The interlock is the safety rail.** It already prevents Edition P from
  co-existing with any Stripe key. Keep every new payment path behind
  `stripe_available()` (503 when off) so an unconfigured instance degrades to
  crypto/offline honestly.
- **Cost controls are live** (Phase 4.4): the budget caps + graceful degrade
  protect against a spend runaway once real traffic arrives. Wire the M4
  Prometheus alert to `aae_ai_spend_alarm`.
- **Determinism & privacy invariants are non-negotiable** through all of this:
  deterministic AI-free core, no PII retained, fail-closed security, parity
  vectors green. None of M1–M5 touches the engine, so parity is unaffected —
  but the CI gate (pytest · parity · e2e · Gitleaks · CodeQL) still guards every
  PR.

## Open decisions to resolve before M5

- **Pricing** — the `AAE_STRIPE_*_USD` defaults (5/15/9) are placeholders;
  confirm real numbers before the live smoke.
- **Refund window** — define it (M3) so the policy and the ToS agree.
- **Subscription vs one-time as the default** — `AAE_STRIPE_MODE`; the cancel
  self-service makes subscriptions defensible, but one-time oracle unlocks may
  convert better. A/B once the funnel exists.
- **D4 host** — operator provisions; M4 is blocked until then.

---

## What the NEXT session should actually do

**M0 (validate, ~30 min jointly) → M1 (Track E-3: purchase mechanics + pricing
surface).** That is the whole next session: end it with a customer able to pay
by card in test mode — tier unlock and deluxe report — behind a live-priced
pricing surface, proven by route-stubbed e2e, privacy intact. M2–M5 follow in
order, with M4 gated on the VPS. Everything here is buildable without a live key
and without a host except M4/M5 — so momentum need never wait on either.
