// arcanaSession — a paid reading must not vanish when the reader looks away.
//
// Reported by the operator after buying a $5.50 Oracle Report: "the text
// disappeared and brought me back to the first chapter", plus "I don't like
// how the readings disappear if you change the chapter tabs either". Both are
// the same mechanism — ArcanaModal is mounted per chapter with distinct keys,
// so a chapter switch remounts it and component state dies.
//
// The keep is deliberately module-scoped (page lifetime), and deliberately
// scoped to ONE chart. That second rule is the dangerous one: a reading
// resurfacing under somebody else's birth data would be worse than losing it.
import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import {
  __resetArcanaSession,
  keepSize,
  readKeep,
  scopeArcanaSession,
  writeKeep,
} from "../src/lib/arcanaSession";

beforeEach(() => __resetArcanaSession());

test("a value written survives being read back — the whole point", () => {
  scopeArcanaSession("chart-a");
  writeKeep("oracle", { report: "A long paid reading." });
  assert.deepEqual(readKeep("oracle", null), { report: "A long paid reading." });
});

test("an unwritten key falls back, and a written falsy value does not", () => {
  scopeArcanaSession("chart-a");
  assert.equal(readKeep("never-written", "fallback"), "fallback");
  // `has`, not truthiness: "" and null are legitimate kept values.
  writeKeep("empty", "");
  assert.equal(readKeep("empty", "fallback"), "");
  writeKeep("nulled", null);
  assert.equal(readKeep("nulled", "fallback"), null);
});

test("a different chart empties the keep — no reading crosses charts", () => {
  scopeArcanaSession("chart-a");
  writeKeep("oracle", { report: "Alice's reading." });
  scopeArcanaSession("chart-b");
  assert.equal(readKeep("oracle", null), null);
  assert.equal(keepSize(), 0);
});

test("re-declaring the SAME chart keeps everything", () => {
  // Called on every render, so this is the common path by far: it must not
  // clear anything, or the keep would be emptied continuously and the bug
  // would look fixed only until the first re-render.
  scopeArcanaSession("chart-a");
  writeKeep("oracle", { report: "Kept." });
  scopeArcanaSession("chart-a");
  scopeArcanaSession("chart-a");
  assert.deepEqual(readKeep("oracle", null), { report: "Kept." });
});

test("returning to the first chart does NOT resurrect its old reading", () => {
  // The keep is emptied on the way out, not swapped — there is no per-chart
  // archive here. Durable storage is the Library's job (bookshelf.ts), and a
  // stale in-memory copy competing with it is how two sources of truth start.
  scopeArcanaSession("chart-a");
  writeKeep("oracle", { report: "Alice's reading." });
  scopeArcanaSession("chart-b");
  scopeArcanaSession("chart-a");
  assert.equal(readKeep("oracle", null), null);
});
