// The pure-TS SHA-256 must match node:crypto exactly — the tarot seed (and
// thus every draw) depends on it. Covers empty, ASCII, multibyte UTF-8, the
// tarot U+0001 seed separator, and block-boundary lengths (55/56/64 bytes,
// where padding branches).

import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

import { sha256Hex } from "../src/sha256.js";

const ref = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const CASES = [
  "",
  "a",
  "abc",
  "natal-seed-1daily",
  "The quick brown fox jumps over the lazy dog",
  "☉ sun ♃ jupiter — glyphs and em dashes",
  "x".repeat(55),
  "x".repeat(56),
  "x".repeat(63),
  "x".repeat(64),
  "x".repeat(65),
  "x".repeat(200),
];

for (const s of CASES) {
  test(`sha256: ${JSON.stringify(s.length > 20 ? s.slice(0, 20) + "…" : s)}`, () => {
    assert.equal(sha256Hex(s), ref(s));
  });
}
