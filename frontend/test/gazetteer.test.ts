// Unit tests for the offline city search (GAZ-2).
//
// These cover the three properties the search has to hold, none of which the
// e2e suite can see: that folding makes accented names reachable by plain
// ASCII, that ranking follows population, and that the same query always
// returns the same order. Determinism is a project invariant, not a nicety —
// a search that reorders between runs makes a birthplace ambiguous.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fold, gazetteerFrom } from "../src/lib/gazetteer";

// Rows must be population-descending, because ROW ORDER IS THE RANKING — the
// artifact stores no population field. The generator guarantees this; the
// fixture reproduces it by hand.
const packed = {
  schema: 1,
  count: 7,
  attribution: "© GeoNames (CC BY 4.0)",
  tz: ["Europe/Zurich", "America/Sao_Paulo", "Europe/Berlin"],
  cc: ["BR", "CH", "DE"],
  a1: ["BW", "SP", "ZH"],
  rows: [
    // name, ascii ("" = same as name), cc, a1, lat, lng, tz
    ["São Paulo", "Sao Paulo", 0, 1, -23.55, -46.63, 1],
    ["Zürich", "Zurich", 1, 2, 47.377, 8.541, 0],
    ["Ulm", "", 2, 0, 48.401, 9.987, 2],
    ["Neu-Ulm", "", 2, 0, 48.393, 10.0, 2],
    ["Zürich-Affoltern", "Zurich-Affoltern", 1, 2, 47.42, 8.5, 0],
    ["Blaustein", "", 2, 0, 48.41, 9.93, 2],
    ["Ulmen", "", 2, 0, 50.21, 6.98, 2],
  ] as [string, string, number, number, number, number, number][],
};

const gaz = gazetteerFrom(packed);

test("fold strips diacritics and lowercases", () => {
  assert.equal(fold("Zürich"), "zurich");
  assert.equal(fold("São Paulo"), "sao paulo");
  assert.equal(fold("ULM"), "ulm");
  assert.equal(fold(""), "");
});

test("an accented city is reachable by its plain-ASCII spelling", () => {
  const hits = gaz.search("zurich");
  assert.equal(hits[0].name, "Zürich");
  // and by the accented spelling itself
  assert.equal(gaz.search("Zürich")[0].name, "Zürich");
  assert.equal(gaz.search("sao paulo")[0].name, "São Paulo");
});

test("an exact match outranks a prefix match, which outranks a substring", () => {
  const hits = gaz.search("ulm").map((c) => c.name);
  // "Ulm" is exact; "Ulmen" is a prefix match; "Neu-Ulm" only contains it.
  assert.equal(hits[0], "Ulm");
  assert.ok(hits.indexOf("Ulmen") < hits.indexOf("Neu-Ulm"), `got ${hits.join(", ")}`);
});

test("ties within a tier follow population, i.e. row order", () => {
  // Both are prefix matches on "zurich"; São Paulo aside, Zürich (row 1)
  // precedes Zürich-Affoltern (row 4) purely by population.
  const hits = gaz.search("zuri").map((c) => c.name);
  assert.deepEqual(hits, ["Zürich", "Zürich-Affoltern"]);
});

test("the same query always returns the same order", () => {
  const once = gaz.search("ulm").map((c) => c.name);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(gaz.search("ulm").map((c) => c.name), once);
  }
  // and a freshly built index agrees with the first
  assert.deepEqual(gazetteerFrom(packed).search("ulm").map((c) => c.name), once);
});

test("rows expand with their country, admin1 and IANA zone", () => {
  const [ulm] = gaz.search("ulm");
  assert.equal(ulm.country, "DE");
  assert.equal(ulm.admin1, "BW");
  assert.equal(ulm.tz, "Europe/Berlin");
  assert.equal(ulm.lat, 48.401);
  assert.equal(ulm.lng, 9.987);
  // ascii falls back to name when the artifact stored ""
  assert.equal(ulm.ascii, "Ulm");
});

test("ascii is expanded from the name when stored empty", () => {
  const [zurich] = gaz.search("zurich");
  assert.equal(zurich.ascii, "Zurich"); // stored explicitly, differs from name
});

test("the limit is respected and the query is trimmed", () => {
  assert.equal(gaz.search("u", 2).length, 2);
  assert.deepEqual(gaz.search("  ulm  ").map((c) => c.name), gaz.search("ulm").map((c) => c.name));
});

test("an empty or whitespace query returns nothing rather than everything", () => {
  assert.deepEqual(gaz.search(""), []);
  assert.deepEqual(gaz.search("   "), []);
});

test("a miss returns no results instead of a wrong one", () => {
  assert.deepEqual(gaz.search("qzxwv"), []);
});

test("a schema the loader does not understand is refused, not guessed at", () => {
  assert.throws(
    () => gazetteerFrom({ ...packed, schema: 99 }),
    /schema 99, expected 1/,
  );
});

test("search never mutates the artifact it was built from", () => {
  const before = JSON.stringify(packed);
  gaz.search("ulm");
  gaz.search("zurich");
  assert.equal(JSON.stringify(packed), before);
});
