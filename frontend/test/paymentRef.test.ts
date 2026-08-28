// Which rail a pasted string belongs to.
//
// The observatory takes money two ways, and the crypto rail answers anything
// it doesn't recognise with "on-chain verification unavailable and trust mode
// is disabled" — which reads like "your payment failed" and means "wrong
// door". A customer with a verified $5.50 receipt met that sentence on
// 2026-08-28 and stopped looking; the edition they had paid for was never
// compiled. So the two rails' inputs have to be told apart on sight, and the
// cases below are the ones that decide it.
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { looksLikeStripeReference } from "../src/lib/paymentRef";

test("the three references a customer can actually still hold", () => {
  // cs_ from the URL Stripe returned them to; pi_ from a one-time receipt;
  // sub_ from an invoice, and what the ledger stores for a recurring plan.
  assert.equal(looksLikeStripeReference("cs_test_a1B2c3D4e5F6g7"), true);
  assert.equal(looksLikeStripeReference("pi_3u9g90LyOHuDktpU0abcdef"), true);
  assert.equal(looksLikeStripeReference("sub_1U4lWeLyOHuDktpUiiUpM3Ri"), true);
});

test("an EVM transaction hash is never mistaken for a card receipt", () => {
  // The direction that matters most: misreading a crypto hash as a card
  // reference would send a genuine on-chain payment to a rail that cannot
  // verify it — the same failure, pointed the other way.
  assert.equal(looksLikeStripeReference("0x" + "ab".repeat(32)), false);
  assert.equal(looksLikeStripeReference("0xdeadbeef"), false);
});

test("whitespace from a wrapped paste does not change what a receipt is", () => {
  // References arrive by the routes keys do — a mail client's wrap, a phone's
  // share sheet — and a leading space is not a different kind of receipt.
  assert.equal(looksLikeStripeReference("  sub_1U4lWeLyOHuDktpU  "), true);
  assert.equal(looksLikeStripeReference("\npi_3u9g90LyOHuDktpU\n"), true);
});

test("an entitlement key is not a payment reference", () => {
  // The same field takes both. A key that got classified as a receipt would
  // be sent to Stripe, fail, and tell a subscriber their valid key is a dead
  // payment.
  assert.equal(
    looksLikeStripeReference("eyJ0aWVyIjoib3JhY2xlIn0.abc123def456"),
    false,
  );
  assert.equal(looksLikeStripeReference("not-a-real-token"), false);
});

test("Stripe ids this rail cannot resolve are left alone", () => {
  // ch_ (charge), in_ (invoice) and cus_ (customer) are real ids that the
  // restore endpoint cannot turn into an entitlement. Claiming them here would
  // trade one wrong door for another — a confident refusal instead of a
  // useful one.
  assert.equal(looksLikeStripeReference("ch_3u9g90LyOHuDktpU"), false);
  assert.equal(looksLikeStripeReference("in_1U4lWeLyOHuDktpU"), false);
  assert.equal(looksLikeStripeReference("cus_QabcdefghijK"), false);
});

test("a truncated reference still goes to the card rail", () => {
  // Routing, not validation. The server answers a short id with "malformed
  // Stripe reference"; the key path would answer it with "that key didn't
  // verify" — the same wrong-door failure in miniature, and the one this
  // whole module exists to stop.
  assert.equal(looksLikeStripeReference("pi_abc"), true);

  // A bare prefix is not a paste anyone makes, and nothing follows it to route.
  assert.equal(looksLikeStripeReference(""), false);
  assert.equal(looksLikeStripeReference("sub_"), false);
});
