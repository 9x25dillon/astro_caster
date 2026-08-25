// The deck the engines deal is the deck the surfaces offer. FULL_DECK_IDS is
// the single ordered list both read, so this pins its shape: a picker that
// silently lost the suits, or a draw that gained a 79th card, fails here rather
// than in front of a reader.

import assert from "node:assert/strict";
import { test } from "node:test";

import { FULL_DECK_IDS, MAJOR_IDS, cardById } from "../src/tarot.js";

test("deck index: 78 cards, no repeats", () => {
  assert.equal(FULL_DECK_IDS.length, 78);
  assert.equal(new Set(FULL_DECK_IDS).size, 78);
});

test("deck index: the trumps come first, in canonical order", () => {
  assert.deepEqual(FULL_DECK_IDS.slice(0, 22), MAJOR_IDS);
  assert.equal(MAJOR_IDS.length, 22);
});

test("deck index: every id resolves to a card", () => {
  for (const id of FULL_DECK_IDS) {
    const card = cardById(id);
    assert.ok(card, `no card for id ${id}`);
    assert.equal(card.id, id);
    assert.ok(card.name.length > 0, `card ${id} has no name`);
  }
});

test("deck index: 22 major, and 14 in each of the four suits", () => {
  const cards = FULL_DECK_IDS.map((id) => cardById(id)!);
  assert.equal(cards.filter((c) => c.arcana === "major").length, 22);

  const minors = cards.filter((c) => c.arcana === "minor");
  assert.equal(minors.length, 56);
  for (const suit of ["wands", "cups", "swords", "pentacles"]) {
    assert.equal(
      minors.filter((c) => c.suit === suit).length, 14,
      `suit ${suit} is not 14 cards`,
    );
  }
  // A trump carries no suit — the Studio's picker groups on exactly this.
  assert.ok(cards.filter((c) => c.arcana === "major").every((c) => !c.suit));
});
