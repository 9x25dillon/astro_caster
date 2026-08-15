# M5 — taking the first live payment

_Written 2026-08-15, session 28, at the operator's request: the wiring and the
checklist, so going live is pasting keys and clicking through rather than
rediscovering how any of it fits together._

**State when this was written:** the rail is **closed**. `/api/pricing` reports
`card_available: false` and the webhook answers `503`, because the Stripe keys
were deliberately parked in session 24 — test keys on a public instance let
anyone mint a real 365-day entitlement with card `4242`. Everything below is
what re-opening it correctly requires.

**The code needs no changes.** The rail (`backend/stripe_rail.py`), the webhook,
the mint/revoke lifecycle, the customer portal and the entitlement import on
Android are all built and tested. M5 is configuration, one real purchase, and
the discipline to undo it in the right order.

---

## 0. The decision that comes first — and it is not a small one

**The landing page advertises `$3.25 / mo` and `$9.99 / mo`. The rail is
configured to charge `payment` — once.**

`AAE_STRIPE_MODE` is unset on the box, and `_mode()` defaults to `payment`
(`stripe_rail.py:93`). Go live as-is and the first customer is charged a single
$3.25 for something the page sold as monthly. That is a mis-sale, not a bug
report, and it is the most expensive thing in this document.

Two ways to close it — **pick one before anything else:**

| | Do | Consequence |
|---|---|---|
| **A. Sell a subscription** _(recommended)_ | set `AAE_STRIPE_MODE=subscription` | matches the page, matches the app's copy, and makes the cancel/portal machinery meaningful — it is what the rail was built around |
| **B. Sell a one-time unlock** | edit `landing/index.html` to say `once`, redeploy | simpler to support, but the Customer Portal, `customer.subscription.deleted` and the whole cancel path become dead code |

The app itself is already honest either way — `PricingPanel` words the offer
from `/api/pricing`'s `mode` (`recurring = mode === "subscription"`). Only the
landing page hardcodes "/ mo", so only the landing page can lie.

**The rest of this document assumes A.**

---

## 1. Before touching the server

- [ ] **The LLC question.** The roadmap draws the line at the first *live*
      payment, which is this. It is also the cheaper Play route later:
      organisation accounts skip the 12-tester / 14-day closed-testing
      requirement personal accounts must complete.
- [ ] **Confirm the prices.** $3.25 / $9.99 / $5.50 have been flagged as
      placeholders since July. They are the defaults *in code*
      (`price_cents()`), deliberately, so a deploy that forgets a var charges
      the intended price rather than an old one — but "intended" is only true
      if you still intend it. Existing subscribers keep the price their
      subscription was created at; raising it later does not migrate anyone.
- [ ] **Stripe account is verified for live charges.** `charges_enabled` and
      `payouts_enabled` both true. The preflight reads both.
- [ ] **Activate the Customer Portal in the LIVE dashboard.** Settings →
      Billing → Customer portal → activate, enable "Cancel subscriptions"
      (plus payment-method updates and invoices). **Test and live are
      configured separately** — a working test-mode portal proves nothing about
      live. Without this, `billing_portal/sessions` returns a configuration
      error and **nobody can cancel**, which matters more than it sounds: see §5.

---

## 2. The wiring — where the keys actually go

⚠️ **Edit `~/astro-aae/.env` on the box — the repo-root one, not
`backend/.env`.**

`docker-compose.yml` passes every variable through `environment:` with
`${VAR:-}` interpolation, which compose resolves from the `.env` beside the
compose file. `backend/.dockerignore` excludes `.env`, so `backend/.env` is
**not in the image** and the `load_dotenv()` inside the container finds
nothing. Editing `backend/.env` on the box is the failure that looks exactly
like a key that did not work.

```bash
ssh -i ~/.ssh/astra_hetzner astra@178.104.120.219
cd ~/astro-aae
cp .env .env.bak.pre-m5.$(date +%Y%m%d%H%M)     # the rollback
nano .env
```

The block to set (the parked one is commented as `# M0-parked AAE_STRIPE_*`,
with a backup at `.env.bak.stripe-m0` — **do not simply uncomment it, those
are test keys**):

```bash
AAE_STRIPE_SECRET_KEY=sk_live_…          # LIVE. Never sk_test on this box.
AAE_STRIPE_WEBHOOK_SECRET=whsec_…        # from the endpoint created in §3
AAE_STRIPE_MODE=subscription             # §0 — the mis-sale gate
AAE_STRIPE_SUPPORTER_USD=3.25
AAE_STRIPE_ORACLE_USD=9.99
AAE_STRIPE_REPORT_USD=5.50
AAE_PUBLIC_URL=https://app.astra-arcana.com
```

**`AAE_PUBLIC_URL` is load-bearing and easy to get wrong.** It is the base for
`success_url`, which is where Stripe returns a paying customer:
`{base}/?checkout={CHECKOUT_SESSION_ID}`. The store settles that parameter on
mount and collects the token. Point it at the apex (the landing page) or leave
it at the `http://127.0.0.1:5173` default and the payment succeeds while the
customer lands somewhere that cannot hand them what they bought. It must be
**the app origin**, `https://app.astra-arcana.com`.

Never paste a secret on the same line as `cat > file` — it becomes part of the
filename. Type the command, press Enter first, then paste, then Ctrl-D.

Then:

```bash
docker compose up -d --build
```

Env is read at boot; a restart is not optional.

---

## 3. Register the webhook (Stripe dashboard, LIVE mode)

Developers → Webhooks → Add endpoint:

- **URL:** `https://app.astra-arcana.com/api/stripe/webhook`
- **Events — exactly these three are acted on** (`plan_from_event`):

| Event | What it does |
|---|---|
| `checkout.session.completed` | **mint** the entitlement (`relink_ref`) |
| `charge.refunded` | revoke — one-time purchases |
| `customer.subscription.deleted` | revoke — subscriptions, at period end |

Anything else returns `{"received": true, "handled": false}`, which is fine —
but an endpoint subscribed to *fewer* than these takes money and then cannot
mint or revoke.

Copy the `whsec_…` it shows **once** into `AAE_STRIPE_WEBHOOK_SECRET` and
restart. Stripe never reveals it again; a mismatch shows up as every event
being rejected `400`, which looks like Stripe being broken and is not.

---

## 4. Preflight — before anyone touches a card

```bash
cd backend
AAE_STRIPE_SECRET_KEY=sk_live_… \
  .venv/bin/python tools/m5_preflight.py --expect-live
```

Every Stripe call it makes is a GET (`_stripe_get` hard-codes the method), so
it cannot create a charge, a session or a customer. It checks the account is
live and enabled, that a webhook endpoint points here with the three events,
that an active portal configuration exists with cancel enabled, that the
secret is loaded (an intentionally invalid POST must come back `400`, not
`503`), and — the check that exists because of §0 — that the landing page's
prices and their "/ mo" agree with what the rail will actually charge.

Exit 0 means go. It printed three blocking failures the first time it was run
against production, all of them §0.

---

## 5. The purchase drill — in this order, and the order is the point

**Do not reorder these. A refund does NOT revoke a subscription.** The mint
stores `ref = payment_intent OR subscription OR session_id` — for a
subscription that is `sub_…`. `charge.refunded` carries `py_…`. Different
namespaces, so the revoke never matches. It is correct for one-time purchases
and silently wrong for subscriptions. **Cancel is the revoke trigger.**

1. [ ] **Buy the supporter tier with a real card**, on the web, from the phone
       you actually use.
2. [ ] **Verify the mint.** The browser returns to `?checkout=<id>`; the token
       should appear without a reload. Confirm server-side — the header is
       `X-AAE-Token`, and prefer it over the deprecated `?token=` fallback,
       which lands in access logs and proxy caches:
       ```bash
       curl -s https://app.astra-arcana.com/api/entitlement \
         -H "X-AAE-Token: <token>" | jq '{tier, verified, supporter}'
       # -> {"tier": "supporter", "verified": true, "supporter": true}
       ```
3. [ ] **Import it into the APK** — Library → chapter VIII → "⚿ Bring your
       key". Paste the bare token, then the whole unlock link. Supporter chrome
       must appear and survive a force-stop and relaunch. **This closes the
       last-mile check that has never been done with a real purchased key.**
4. [ ] **Cancel from inside the app** — the ☤ Support panel opens Stripe's
       portal. This is what §1's portal activation was for.
5. [ ] **Verify the revoke.** `customer.subscription.deleted` arrives at period
       end, not immediately — access continues until the paid period ends and
       *then* drops to `tier: free`. Confirm the webhook was received and
       handled (Stripe dashboard → the endpoint → recent deliveries, 200), then
       re-check the entitlement.
6. [ ] **Refund the charge** from the Stripe dashboard, last. By now the
       entitlement is already revoked by the cancel, which is the only order in
       which both facts end up true.

---

## 6. If it goes wrong — parking it again

```bash
cd ~/astro-aae
cp .env.bak.pre-m5.<stamp> .env      # or comment the AAE_STRIPE_* block
docker compose up -d --build
curl -s https://app.astra-arcana.com/api/pricing | jq .card_available   # -> false
```

An unset key closes the rail with a `503` rather than failing open, and the
crypto rail plus every free and deterministic feature keep working. Refund any
real charge from the dashboard; the entitlement is separately revocable from
the receipts ledger.

**One thing parking does not undo:** entitlements already minted stay valid
until they expire or are revoked. `RCPT.ent_revoke_ref` is the lever.

---

## What this does not cover

- **Play Store.** Needs an AAB, not an APK, and signing is currently
  post-build via `apksigner`, which does not carry over to bundles. Unrelated
  to M5 and unblocked by nothing here.
- **Tax.** Stripe Tax is not configured. Whether that matters is an LLC-shaped
  question, not an engineering one.
- **The crypto rail**, which is independent and currently also closed
  (`crypto_available: false`).
