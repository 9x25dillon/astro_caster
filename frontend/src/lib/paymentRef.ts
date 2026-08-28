// paymentRef.ts — telling a card receipt from a crypto transaction, on sight.
//
// Why this is its own module and not a regex inlined at each call site: it is
// the piece of logic that decides WHICH PAYMENT RAIL a pasted string belongs
// to, and getting that wrong is not cosmetic. The observatory has two rails,
// and the crypto one answers anything it doesn't recognise with "on-chain
// verification unavailable and trust mode is disabled" — a sentence that reads
// like "your payment failed" and is actually "you are at the wrong door".
//
// On 2026-08-28 a customer with a verified $5.50 receipt was told exactly that,
// and stopped looking. The product had taken the money and never delivered.
// So: recognise a card reference wherever it is pasted, and name the right
// door instead of denying a real payment.

/**
 * The Stripe object ids a customer can plausibly still hold after their
 * browser has forgotten everything:
 *
 *   cs_…   the checkout session — in the URL Stripe returned them to, so it
 *          survives in history even when site data is cleared
 *   pi_…   the payment intent — printed on a one-time receipt
 *   sub_…  the subscription — on the invoice, and what the entitlement ledger
 *          stores as the `ref` for a recurring plan
 *
 * These are exactly the ids the server's `ref_for_session` produces, which is
 * why they are the three the ledger indexes and the restore endpoint accepts.
 *
 * Deliberately NOT a general Stripe-id matcher. `ch_`, `in_`, `cus_` and the
 * rest are real ids that this rail cannot resolve, and claiming them here
 * would trade one wrong door for another — a confident refusal instead of a
 * useful one.
 *
 * The tail is deliberately loose. This regex decides WHICH RAIL, not whether
 * the reference is well-formed — the server does that, and answers "malformed
 * Stripe reference", which is a useful sentence. A length floor here would
 * send a truncated `pi_` paste back down the key path to be told "that key
 * didn't verify", which is the same wrong-door failure in miniature.
 */
export const STRIPE_REF_RE = /^(?:cs|pi|sub)_[A-Za-z0-9_]+$/;

/**
 * True when `value` is a card purchase reference.
 *
 * Whitespace is stripped first because these arrive by the same routes keys do
 * — a wrapped mail-client line, a phone's share sheet — and a leading space is
 * not a different kind of receipt.
 *
 * An EVM transaction hash (`0x` + 64 hex) can never match: it has no
 * underscore and starts with a digit-led prefix, so the two rails' inputs are
 * disjoint by shape and neither can be mistaken for the other.
 */
export function looksLikeStripeReference(value: string): boolean {
  return STRIPE_REF_RE.test(value.trim());
}
