// arcanaPicker — the Studio picker's signature group must offer each card once.
//
// The bug this pins (shipped 93c244e, caught 2026-08-26 by a CI e2e run): the
// "Your signature" optgroup rendered one <option> per BODY, valued by card id.
// Two bodies can carry the SAME trump, so the picker offered one id twice —
// 79 options for 78 cards — and e2e/studio-deck.spec.ts failed on
// `cardIds.length === new Set(cardIds).size`.
//
// It was invisible for weeks because it is SKY-DEPENDENT. The e2e loads "/"
// with no birth data, i.e. the live sky, and only some ascendants collide. That
// makes the e2e a poor guard: it fails a couple of hours a day and passes the
// rest. These tests are the deterministic guard it could not be.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  mergeSignatureByCard,
  signatureOptionLabel,
  type SignatureLinkLike,
} from "../src/lib/arcanaPicker";

const link = (body: string, id: string, name: string): SignatureLinkLike => ({
  body,
  card: { id, name },
});

test("the real collision: North Node and an Aquarius Ascendant both carry the Star", () => {
  // cardForBody: a planet with its own card takes PLANET_MAJOR; anything else
  // takes SIGN_MAJOR[sign]. Only Ascendant and Midheaven take the second route,
  // and Aquarius's card is `star` — which is ALSO the North Node's, and the
  // North Node is always in the signature.
  const links = [
    link("Sun", "sun", "The Sun"),
    link("Moon", "high_priestess", "The High Priestess"),
    link("Ascendant", "star", "The Star"),
    link("North Node", "star", "The Star"),
  ];
  const opts = mergeSignatureByCard(links);

  const ids = opts.map((o) => o.id);
  assert.equal(ids.length, new Set(ids).size, "every option id must be distinct");
  assert.deepEqual(ids, ["sun", "high_priestess", "star"]);

  const star = opts.find((o) => o.id === "star")!;
  assert.deepEqual(star.bodies, ["Ascendant", "North Node"], "both carriers kept");
  assert.equal(signatureOptionLabel(star), "The Star (Ascendant, North Node)");
});

test("the other collision: Ascendant and Midheaven sharing a sign", () => {
  const opts = mergeSignatureByCard([
    link("Ascendant", "moon", "The Moon"),
    link("Midheaven", "moon", "The Moon"),
  ]);
  assert.equal(opts.length, 1);
  assert.equal(signatureOptionLabel(opts[0]), "The Moon (Ascendant, Midheaven)");
});

test("signature order is preserved, and a merged card keeps its FIRST position", () => {
  const opts = mergeSignatureByCard([
    link("Sun", "sun", "The Sun"),
    link("Ascendant", "star", "The Star"),
    link("Mercury", "magician", "The Magician"),
    link("North Node", "star", "The Star"),
  ]);
  assert.deepEqual(opts.map((o) => o.id), ["sun", "star", "magician"]);
});

test("the ordinary chart is untouched — one body, one card, same label as before", () => {
  const opts = mergeSignatureByCard([
    link("Sun", "sun", "The Sun"),
    link("Moon", "high_priestess", "The High Priestess"),
  ]);
  assert.equal(opts.length, 2);
  assert.equal(signatureOptionLabel(opts[0]), "The Sun (Sun)");
  assert.deepEqual(opts[1].bodies, ["Moon"]);
});

test("empty, null and malformed links do not throw", () => {
  assert.deepEqual(mergeSignatureByCard([]), []);
  assert.deepEqual(mergeSignatureByCard(null), []);
  assert.deepEqual(mergeSignatureByCard(undefined), []);
  // a link whose card never resolved (CARD_BY_ID miss) is skipped, not rendered
  // as an option with an empty value — "" is the whole-soul-deck sentinel.
  const opts = mergeSignatureByCard([
    { body: "Ghost", card: undefined as unknown as { id: string; name: string } },
    link("Sun", "sun", "The Sun"),
  ]);
  assert.deepEqual(opts.map((o) => o.id), ["sun"]);
});

test("the same body listed twice is not double-counted in the label", () => {
  const opts = mergeSignatureByCard([
    link("Ascendant", "star", "The Star"),
    link("Ascendant", "star", "The Star"),
  ]);
  assert.deepEqual(opts[0].bodies, ["Ascendant"]);
});
