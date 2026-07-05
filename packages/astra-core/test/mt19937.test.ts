// The MT19937 port must reproduce CPython's random.Random bit-for-bit, since
// the tarot draw depends on it. Vectors are Python-generated
// (parity/mt19937.json); doubles compare with ===, not a tolerance — this is
// an exactness claim, not an approximation.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { MT19937 } from "../src/mt19937.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(path.join(here, "../../../parity/mt19937.json"), "utf8")
);

for (const kase of payload.cases) {
  test(`mt19937: seed ${JSON.stringify(kase.seed_text)}`, () => {
    const rng = new MT19937(kase.sha256);
    const got = kase.sequence.map(() => rng.random());
    assert.deepEqual(got, kase.sequence);
  });
}
