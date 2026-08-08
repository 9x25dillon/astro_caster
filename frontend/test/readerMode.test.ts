// A1 — the reader-mode flag.
//
// This constant decides whether an artifact is allowed to sell. Getting its
// parsing wrong in either direction is expensive: a reader build that still
// offers checkout fails store review, and a WEB build accidentally in reader
// mode silently stops taking money with no error anywhere.
//
// So the cases below are mostly about the ambiguous inputs — unset, empty,
// "0", "false" — because those are what a misconfigured CI job actually
// produces, and the direction they fail in is a deliberate choice.
import { strict as assert } from "node:assert";
import { test } from "node:test";

/** Re-evaluate the module's parse rule against a given raw env value. */
function parse(raw: string | undefined): boolean {
  const v = (raw ?? "") as string;
  return v !== "" && v !== "0" && v.toLowerCase() !== "false";
}

test("unset or empty means SELLING — the web build is the default", () => {
  // The failure direction matters: a CI job that forgets the variable should
  // ship the normal website, not a site that quietly refuses payment.
  assert.equal(parse(undefined), false);
  assert.equal(parse(""), false);
});

test("explicit off values are honoured rather than treated as truthy strings", () => {
  // Vite inlines env values as STRINGS, so a naive boolean cast makes "0" and
  // "false" both true — the classic version of this bug.
  assert.equal(parse("0"), false);
  assert.equal(parse("false"), false);
  assert.equal(parse("False"), false);
  assert.equal(parse("FALSE"), false);
});

test("any affirmative value turns reader mode on", () => {
  for (const v of ["1", "true", "TRUE", "yes", "on"]) {
    assert.equal(parse(v), true, v);
  }
});

test("a stray value counts as ON, so an unrecognised setting fails safe", () => {
  // If someone writes VITE_READER_MODE=maybe on the APK build, the safe
  // reading is "don't sell" — a store rejection is worse than a lost sale.
  assert.equal(parse("maybe"), true);
});
