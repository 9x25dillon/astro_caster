# Payment surface — security pass, 2026-09-15 (session 42)

Scope: every endpoint that mints, moves, renews or revokes an entitlement, the
Stripe webhook, the billing portal, the crypto rail, and the new key hand-off
(`/unlock`, QR, App Link). Method: read the code paths end to end and write a
failing test for each finding before fixing it. Tests: `backend/tests/
test_payment_hardening.py`, `test_entitlement_renew_stripe.py`,
`frontend/test/handoff.test.ts`, `e2e/entitlement-import.spec.ts`.

The operator (whose profession is security) raised this after the hand-off
shipped. It should have been part of the hand-off. Recorded as such.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | **High** | `POST /api/checkout` and `/api/personal-report/checkout` honoured client-supplied `success_url` / `cancel_url` verbatim. Stripe's hosted page carries our name, so an attacker could mint a session returning to a host they control, hand the link to a victim, and receive the `cs_…` id the moment the victim paid. `GET /api/checkout/{cs}` exchanges that id for the key, and `relink_ref` MOVES it — superseding the victim's own copy. | **Fixed.** Return URLs must be on `AAE_PUBLIC_URL`'s exact origin (scheme + host + port) or the request is 400 before Stripe is called. The shipped client never sent them. |
| F2 | **High** | The entitlement — a bearer credential with no device binding — was accepted from a query string in three places: `/?entitlement=` (the session-25 import link, promoted this session into a QR and an "unlock link"), `GET /api/entitlement?token=`, and `GET /api/admin/stats?token=`. Query strings land in nginx and Cloudflare access logs, proxy caches and browser history. | **Fixed.** The hand-off link now carries the key in the URL **fragment** (`/unlock#entitlement=`), which is never sent to a server; legacy `?entitlement=` links are still read (and now `access_log off` on `/unlock` and on any request carrying `arg_entitlement`). The two `?token=` fallbacks are removed: header only. **APK 1.0.8 parses only the query form; 1.0.9 reads the fragment.** |
| F3 | Medium | No rate limit on the unauthenticated money endpoints: `POST /api/checkout` (unbounded Stripe session creation), `GET /api/checkout/{cs}` (a `cs_` id is a bearer — guessing must be expensive), `/api/donate/verify` and `/api/entitlement/relink` (each call is an upstream RPC hit), `/api/entitlement/renew`, `/api/billing/portal`. | **Fixed.** All six go through `RL.check(request, "free", …)` (20/min per IP + token digest in production; keyed via `clientip.py`, which trusts `CF-Connecting-IP`/`X-Forwarded-For` only because the backend is `expose:`d, never `ports:`). |
| F4 | Medium (design) | **Crypto rail claim/takeover.** A tier is minted to whoever first pastes the hash of a public transaction to the treasury; `relink` lets anyone watching the chain supersede the payer's key later. `entitlements.relink_ref` has documented since Phase 4.1 that "a public tx hash is not proof". | **Open — documented.** Fix: bind the claim to the payer. The Support panel already holds `window.ethereum`; require `personal_sign` over a server nonce from the transaction's `from` address and verify the EIP-191 signature server-side (needs keccak + secp256k1 recovery: `eth-account`, or `coincurve` + `pycryptodome`). Until then the rail is honest about being trust-on-first-claim, and the Stripe rail is the primary one. |
| F5 | Low | Webhook replay inside Stripe's 5-minute signature tolerance. Effects are idempotent (a replayed mint relinks the same ref; a replayed revoke revokes), so nothing new is granted — but a replayed mint churns the holder's key. | **Fixed.** Event-id dedupe, bounded (4096) and in-process; the app runs one worker. A duplicate is acknowledged 200 with `duplicate: true` so Stripe stops retrying. |
| F6 | Low (ops) | `charge.refunded` revokes by `payment_intent`; a subscription's key is stored under `sub_…`, so refunding an invoice payment does not revoke (memory `next-build-order` §cancel→refund order). | **Open — procedural.** Cancel first, verify `tier: free`, then refund. A code fix would map `invoice.payment_failed`/refund → subscription via `invoice.subscription`. |
| F7 | Info | Anyone holding a key can open the billing portal for it (card last-4, email, invoices). Inherent to a bearer with no device binding; the vault copy says "treat it like a password" and the hand-off defaults the QR/key to hidden. | Accepted. Device binding would break the whole reader-APK design (one key, many own devices). |
| F8 | Info | Production boot refuses: default HMAC secret, trust mode, dev token, ed25519 without a key, unpinned CORS (`assert_safe_boot`). Confirmed by reading; not changed. | Verified. |

## What was NOT reviewed

The AI/report generation paths (cost caps, budgets) and the replay sync
store were out of scope for this pass. The APK's native layer was reviewed
only for the App Link (one path, autoVerify, assetlinks fingerprint read from
the keystore).

## Deploy notes

Backend changed → full `docker compose up -d --build`. After deploy, prove from
outside: `POST /api/checkout` with an off-site `success_url` → 400;
`GET /api/entitlement?token=<valid>` → `tier: free`; the same key in
`X-AAE-Token` → its tier.
