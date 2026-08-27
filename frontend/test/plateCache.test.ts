// plateCache — a card painted once must appear everywhere that card appears.
//
// Deck-art plates were already durable (the Gallery, IndexedDB, keyed
// `plate:{source}:{cardId}`), but only the Studio that made them ever read
// them back. A reader who paid to render Death saw it in chapter VII and
// nowhere else: not in the draw that prompted it, not in chapter II's reading,
// not in the card of the day.
//
// Two rules here are easy to get wrong and expensive when they are:
//
//  · SOURCE FALLBACK. A card holds one plate per deck lineage. Refusing to
//    show a Thoth plate on a Golden Dawn draw would ask the reader to pay a
//    second time for a picture they already own.
//  · REPLACE, DON'T STACK. Re-rendering must overwrite that lineage's plate,
//    mirroring the Gallery's own stable-id rule — otherwise the cache and the
//    database disagree about which image is current.
import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import {
  __resetPlateCache,
  hasPlate,
  plateCount,
  plateFor,
  rememberPlate,
} from "../src/lib/plateCache";

const plate = (cardId: string, source: string | null, data = "x") => ({
  id: `plate:${source}:${cardId}`,
  kind: "plate" as const,
  cardId,
  title: cardId,
  mime: "image/png",
  data: `data:image/png;base64,${data}`,
  source,
  seed: null,
  meta: null,
});

beforeEach(() => __resetPlateCache());

test("a card with no plate reports none, and asks for nothing", () => {
  assert.equal(plateFor("death"), null);
  assert.equal(hasPlate("death"), false);
  assert.equal(plateCount(), 0);
});

test("a remembered plate is found by card id", () => {
  rememberPlate(plate("death", "golden_dawn", "GD"));
  const found = plateFor("death", "golden_dawn");
  assert.ok(found);
  assert.equal(found.cardId, "death");
  assert.equal(found.source, "golden_dawn");
  assert.ok(found.dataUrl.endsWith("GD"));
  assert.equal(hasPlate("death"), true);
  assert.equal(plateCount(), 1);
});

test("the requested lineage wins when the card has several", () => {
  rememberPlate(plate("death", "golden_dawn", "GD"));
  rememberPlate(plate("death", "thoth", "TH"));
  assert.ok(plateFor("death", "golden_dawn")!.dataUrl.endsWith("GD"));
  assert.ok(plateFor("death", "thoth")!.dataUrl.endsWith("TH"));
});

test("another lineage's plate is shown rather than none — nobody pays twice", () => {
  rememberPlate(plate("death", "thoth", "TH"));
  const found = plateFor("death", "golden_dawn");
  assert.ok(found, "a Thoth plate beats no plate on a Golden Dawn draw");
  assert.equal(found.source, "thoth");
});

test("a plate with no lineage recorded is still usable", () => {
  rememberPlate(plate("death", null, "ANY"));
  assert.ok(plateFor("death", "golden_dawn"));
  assert.ok(plateFor("death"));
});

test("re-rendering REPLACES that lineage rather than stacking", () => {
  rememberPlate(plate("death", "golden_dawn", "FIRST"));
  rememberPlate(plate("death", "golden_dawn", "SECOND"));
  assert.ok(plateFor("death", "golden_dawn")!.dataUrl.endsWith("SECOND"));
  // and the other lineage is untouched by that replacement
  rememberPlate(plate("death", "thoth", "TH"));
  rememberPlate(plate("death", "golden_dawn", "THIRD"));
  assert.ok(plateFor("death", "golden_dawn")!.dataUrl.endsWith("THIRD"));
  assert.ok(plateFor("death", "thoth")!.dataUrl.endsWith("TH"));
});

test("cards are independent — painting one does not illustrate another", () => {
  rememberPlate(plate("death", "golden_dawn"));
  assert.equal(hasPlate("death"), true);
  assert.equal(hasPlate("the_tower"), false);
  assert.equal(plateFor("the_tower"), null);
  assert.equal(plateCount(), 1);
});

test("minors are ordinary cards here — the whole 78 can be illustrated", () => {
  rememberPlate(plate("ace_of_cups", "golden_dawn"));
  assert.equal(hasPlate("ace_of_cups"), true);
  assert.ok(plateFor("ace_of_cups"));
});

test("a malformed artifact is ignored rather than cached as a broken image", () => {
  rememberPlate({ ...plate("death", "golden_dawn"), cardId: null } as never);
  assert.equal(plateFor("death"), null);
  rememberPlate({ ...plate("death", "golden_dawn"), data: "" });
  assert.equal(plateFor("death"), null, "an empty data URL is not a plate");
  assert.equal(plateCount(), 0);
});

test("the lookup is referentially stable, so useSyncExternalStore cannot loop", () => {
  // getSnapshot must return the same reference between emits; a fresh wrapper
  // object each call is an infinite render loop in React.
  rememberPlate(plate("death", "golden_dawn"));
  assert.equal(plateFor("death", "golden_dawn"), plateFor("death", "golden_dawn"));
});
