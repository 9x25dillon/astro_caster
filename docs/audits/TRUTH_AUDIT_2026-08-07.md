# Truth audit — public claims vs actual behaviour

_Run 2026-08-07 against `main`, ahead of the 2026-08-10 publishability date._

**Scope and method.** Every load-bearing claim on the four `/legal` pages was
checked against the code that would have to implement it — not against the
handoffs, which is how the last set of claims went stale
(`docs/audits/DATA_DISCREPANCIES.md`). Where a claim is enforced by a test, the
test is named. Where it is honoured by hand, this says so.

**Headline: no misrepresentation found.** Two claims are *weaker* than what the
product now does, one is policy-only with no code behind it (correctly), and the
privacy page's third-party disclosure is accurate as of GAZ. Details below.

---

## 1. Privacy — verified

| claim | verdict | evidence |
|---|---|---|
| "We store no birth data… never written to a database and never written to a log file" | ✅ **true, and tested** | `tests/test_structured_logging.py::test_no_birth_data_reaches_the_log_stream` drives the endpoints with distinctive values and fails the build if any appear in a log line |
| "A chart cast records the time, house system, zodiac and tier… not the birth date, time, or coordinates" | ✅ **true** | `telemetry.log_chart()` inserts exactly `(ts, house_sys, zodiac, tier)` — the birth dict is read for two preference fields and nothing else |
| "Query strings are stripped before anything is written, so unlock links never appear in logs" | ✅ **true** | `logsetup.py` access line strips the query; the comment records `?entitlement=` as the reason |
| "If you paid by card we also keep the customer identifier Stripe gives us" | ✅ **true** | `receipts.py` `stripe_customers` table, one column, documented as being for the billing portal |
| "by default the chart is computed on the server… the promise is not that they never move — it is that nothing is kept" | ✅ **true, and unusually honest** | `useStore` calls `generateChart` (server) first and `localChart` (on-device) only as fallback. The page could have claimed on-device-first and did not |
| Third parties: Stripe, AI providers, OpenAI, ElevenLabs, Cloudflare | ✅ **accurate as of GAZ** | Nominatim and CARTO were removed from the recipient table; they now appear only in a paragraph disclosing that they *used to* receive data. That paragraph is a historical statement and is correct |

**Nothing new is sent** by the pending FREE-1 change: the daily allowance is
counted in `localStorage` and the request carries a boolean, not an identifier.
No privacy-page edit is owed for it.

## 2. Pricing page — accurate, but about to be superseded

The page is **truthful about what exists on `main` today**. Two pending PRs
change what it should say, and both already carry the matching copy edits:

| pending | changes | copy already updated in that PR? |
|---|---|---|
| **#149** FREE-1 + pricing | $3/$9/$5 → **$3.25/$9.99/$5.50**; free tier gains 2 premium readings/day | ✅ yes — including the device-side-count disclosure |
| **#148** TZ-2 | nothing user-facing on `/legal` | n/a |

⚠️ **Do not publish the current pricing page alongside the new Stripe prices.**
Either merge #149 (page and prices move together) or leave both. Split-merging
those two halves is the one way this audit's clean result becomes false.

## 3. Refunds — policy-only, correctly

"Fourteen days" is stated consistently across `refunds.html` and the pricing
page, and `e2e/legal.spec.ts` pins that consistency. There is **no 14-day check
in code** — refunds are issued by hand in the Stripe dashboard, and the webhook
then revokes the entitlement (`charge.refunded` → revoke, round-trip tested in
`test_stripe_rail.py`).

That is the correct shape. A policy window is a promise about what a human will
do; encoding it would only create a second place for it to drift.

## 4. Licence and source

AGPL-3.0, stated on the pricing page, matching `LICENSE`. The AGPL obliges
offering source to users, and the repository is public — so the obligation is
already met by the footer link rather than needing a build-time offer.

## 5. What this audit did **not** cover

Stated so the scope isn't overread later — the exact failure this repo keeps
producing:

- **Not a legal review.** This checks that claims match behaviour. Whether the
  claims are *sufficient* for any jurisdiction is a lawyer's question.
- **Not the AI-generated copy.** Reading text is produced per-request; this
  audits the static policy surface only.
- **Not the marketing/landing copy**, which does not exist yet.
- **Not the store listing**, which will need its own pass and should own the
  `NonFreeNet` anti-feature plainly (see `APK_A0_FINDINGS.md`).

## 6. Standing risk

The claims are true *today* because someone checked today. The privacy page's
strongest sentences — "nothing is kept", "never leaves the device" — are exactly
the kind that survive a change that falsifies them, because nothing fails when
they go stale. Two are currently backed by tests
(`test_no_birth_data_reaches_the_log_stream`, `no-external.spec.ts`); the rest
are backed by a person reading code.

**Re-run this audit whenever a data path changes** — a new provider, a new stored
field, a new outbound call. It took under an hour with the code open.
