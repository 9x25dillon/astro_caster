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

## 0. ✅ DECIDED 2026-08-15 — it is a monthly subscription

**The offer is a monthly subscription.** Operator's decision, recorded here so
it stops being a question.

The problem it settles: the landing page advertises `$3.25 / mo` and
`$9.99 / mo`, while `AAE_STRIPE_MODE` is unset on the box and `_mode()`
defaults to `payment` — once (`stripe_rail.py:93`). Going live in that state
charges the first customer a single $3.25 for something sold as monthly.

**The fix is one environment variable and nothing else.** Every customer-facing
surface was audited on the day of the decision and all four already describe a
subscription:

| Surface | Says |
|---|---|
| `landing/index.html` | `$3.25 / mo`, `$9.99 / mo`, "Cancel any time from your own billing portal" |
| `/legal/pricing` | "Monthly tiers renew until you cancel"; price grandfathering |
| `/legal/refunds` | "Full refund of the most recent payment within 14 days"; self-service cancel via the portal |
| `/legal/terms` | "Monthly tiers renew automatically until you cancel" |

So the documents were right and the server was out of step. **No copy change is
required** — `AAE_STRIPE_MODE=subscription` makes every published promise true.
The app was never at risk either way: `PricingPanel` words the offer from
`/api/pricing`'s `mode` (`recurring = mode === "subscription"`).

**The $5.50 deluxe report is unaffected**, and deliberately so:
`create_report_checkout_session` hard-codes `"mode": "payment"` — "a report is
not a subscription" — so it stays one-time no matter what the tier mode is.
`$5.50 once` on the page remains true.

### Why the CODE default stays `payment`

Do not "fix" `_mode()`'s fallback to `subscription` to match. The default is a
fail-safe and it points the right way:

- fallback `payment` while selling monthly → the customer pays **once** and
  still gets a full entitlement (`AAE_ENT_DAYS`, 365 days). The business loses
  money; nobody is harmed.
- fallback `subscription` while selling one-time → the customer is **billed
  every month** for something sold once. That is the harmful direction, and no
  refund makes it not have happened.

An explicit env var plus a preflight that fails loudly (§4) is the right guard.
A default that quietly charges people recurring is not.

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

### Where to run it

**On this workstation, not on the box.** The tool only makes network calls —
to `https://app.astra-arcana.com`, to `https://astra-arcana.com`, and to
`https://api.stripe.com`. It never reads the server's `.env` and does not need
to. Anywhere with this repo and the Stripe key works.

### The quick version, with no key

Run this any time. It checks the public surfaces and needs no secret at all:

```bash
cd ~/astro-aae/backend
.venv/bin/python tools/m5_preflight.py
```

`.venv/bin/python` rather than plain `python` is deliberate — the repo's
virtualenv, the same interpreter the tests run under. Nothing here needs
`sudo`.

### The full gate, with the live key

Get the key from the Stripe dashboard: flip the **View test data** toggle OFF
so you are in live mode, then Developers → API keys → Secret key → Reveal. It
begins `sk_live_`.

**Keep it out of your shell history.** The project already has the convention —
`~/.stripe-test` is one line, bare key, mode 600. Do the same for live:

```bash
install -m 600 /dev/null ~/.stripe-live     # create it empty, already 600
nano ~/.stripe-live                          # paste the key, save
```

Then run the gate reading the key from that file, so the secret never appears
in a command line:

```bash
cd ~/astro-aae/backend
env AAE_STRIPE_SECRET_KEY="$(cat ~/.stripe-live)" \
  .venv/bin/python tools/m5_preflight.py --expect-live
```

(In fish: `env AAE_STRIPE_SECRET_KEY=(cat ~/.stripe-live) .venv/bin/python
tools/m5_preflight.py --expect-live` — same shape, fish's own substitution
syntax. The plain `VAR=value cmd` prefix also works in both fish ≥3.1 and zsh
if you would rather paste the key inline; it just lands in history.)

`--expect-live` is what turns observations into failures: without it, a closed
rail and a test key are merely reported; with it, they block.

### Reading the output

Four sections, in the order a purchase would exercise them: **HEALTH** (is the
server the public build, on the right ephemeris), **PRICING + COPY** (does what
we advertise match what we would charge), **WEBHOOK** (is the secret loaded),
then the three **STRIPE** sections (account, endpoint, portal).

| Mark | Means |
|---|---|
| `✓ PASS` | nothing to do |
| `! WARN` | look at it; it does not block. Before the keys go in, "webhook secret is loaded → 503" is the expected warn |
| `✗ FAIL` | blocking. Every FAIL is repeated at the bottom under **Blocking:** with its one-line reason |

The last line is the score, and the exit status matches it — `0` when there are
no failures, `1` otherwise, so it can gate a script.

What the common failures mean:

| FAIL | Fix |
|---|---|
| `Stripe API answers — HTTP Error 401` | the key is wrong, revoked, or you copied the publishable key. A 401 here is never a network problem |
| `key is LIVE mode` | you are holding `sk_test_`. Turn off "View test data" in the dashboard and copy again |
| `card rail is open — …unset on the server` | the live key is not in the box's `.env` yet (§2). Expected until you do that step |
| `webhook secret is loaded — 503` | `AAE_STRIPE_WEBHOOK_SECRET` is not in the box's `.env` yet (§3) |
| `an endpoint points at this deployment` | no webhook registered in the LIVE dashboard, or its URL differs. It prints every URL it did find |
| `an active portal configuration exists` | §1's portal activation, in the LIVE dashboard — test and live are separate |
| `copy and rail disagree` | §0. Do not go live with this one open |

### It cannot spend your money

Every Stripe call is a GET — `_stripe_get` hard-codes the method, so the tool
cannot create a charge, a session or a customer even if it is edited
carelessly. The single write it makes is a deliberately **invalid** POST to our
own webhook, which the signature check rejects before anything is minted or
revoked; that is how it distinguishes "secret loaded" (400) from "secret
missing" (503) from outside the box.

Exit 0 means go. It printed three blocking failures the first time it was run
against production, all of them §0 — and zero once the mode was set.

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
