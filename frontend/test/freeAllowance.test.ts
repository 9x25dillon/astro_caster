// FREE-1 — the device-side daily allowance ledger.
//
// The behaviour worth pinning is what happens when storage misbehaves. This
// counter gates a courtesy, not a payment, so every ambiguous case must resolve
// in the visitor's favour: a wiped, corrupt, or unavailable store means "you
// still have your readings", never "you've had enough". The budget is protected
// server-side by budget.py's global cap, so failing open here costs cents and
// failing closed would cost trust.
import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";

// Minimal localStorage for node:test — the module only uses get/set/remove.
class MemStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as { localStorage?: unknown }).localStorage = new MemStore();

const {
  DAILY_PREMIUM_READINGS, premiumAvailable, premiumRemaining,
  consumePremium, resetAllowance,
} = await import("../src/lib/freeAllowance.js");

const KEY = "aae.free_allowance";
const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

beforeEach(() => { (globalThis.localStorage as MemStore).clear(); });

test("a fresh visitor has the full allowance", () => {
  assert.equal(premiumAvailable(), true);
  assert.equal(premiumRemaining(), DAILY_PREMIUM_READINGS);
});

test("the allowance is spent one reading at a time and then closes", () => {
  for (let i = DAILY_PREMIUM_READINGS; i > 0; i--) {
    assert.equal(premiumAvailable(), true);
    assert.equal(premiumRemaining(), i);
    consumePremium();
  }
  assert.equal(premiumAvailable(), false);
  assert.equal(premiumRemaining(), 0);
});

test("spending past the limit never reports a negative remainder", () => {
  for (let i = 0; i < DAILY_PREMIUM_READINGS + 5; i++) consumePremium();
  assert.equal(premiumRemaining(), 0);
  assert.equal(premiumAvailable(), false);
});

test("a ledger from another day is ignored, so the allowance turns over", () => {
  localStorage.setItem(KEY, JSON.stringify({ day: "2001-01-01", used: 99 }));
  assert.equal(premiumAvailable(), true);
  assert.equal(premiumRemaining(), DAILY_PREMIUM_READINGS);
});

test("a corrupt ledger fails OPEN rather than locking the visitor out", () => {
  for (const junk of ["not json", "null", "[]", '{"day":123}', '{"used":"two"}']) {
    (globalThis.localStorage as MemStore).clear();
    localStorage.setItem(KEY, junk);
    assert.equal(premiumAvailable(), true, `junk: ${junk}`);
  }
});

test("a negative count cannot be forged into extra readings", () => {
  localStorage.setItem(KEY, JSON.stringify({ day: today(), used: -50 }));
  assert.equal(premiumRemaining(), DAILY_PREMIUM_READINGS);
});

test("storage that throws on read still leaves the allowance open", () => {
  const store = globalThis.localStorage as MemStore;
  const original = store.getItem;
  store.getItem = () => { throw new Error("private browsing"); };
  try {
    assert.equal(premiumAvailable(), true);
  } finally {
    store.getItem = original;
  }
});

test("storage that throws on write does not break a reading", () => {
  const store = globalThis.localStorage as MemStore;
  const original = store.setItem;
  store.setItem = () => { throw new Error("quota exceeded"); };
  try {
    assert.doesNotThrow(() => consumePremium());
  } finally {
    store.setItem = original;
  }
});

test("reset restores the full allowance", () => {
  consumePremium();
  assert.equal(premiumRemaining(), DAILY_PREMIUM_READINGS - 1);
  resetAllowance();
  assert.equal(premiumRemaining(), DAILY_PREMIUM_READINGS);
});
