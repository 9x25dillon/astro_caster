// The unlock link: what it looks like, and what the APK reads back out of it.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { entitlementFromUrl, handoffUrl, isHandoffPath, HANDOFF_ORIGIN } from "../src/lib/handoff";

const TOKEN = "eyJ0aWVyIjoic3VwcG9ydGVyIn0.abc123";

describe("handoffUrl", () => {
  it("lands on the app origin's /unlock route with the key as a query param", () => {
    const u = new URL(handoffUrl(TOKEN));
    assert.equal(u.origin, HANDOFF_ORIGIN);
    assert.equal(u.pathname, "/unlock");
    assert.equal(u.searchParams.get("entitlement"), TOKEN);
  });

  it("round-trips through entitlementFromUrl", () => {
    assert.equal(entitlementFromUrl(handoffUrl(TOKEN)), TOKEN);
  });

  it("survives a key with characters a query string would otherwise eat", () => {
    const odd = "a+b/c=d.sig&e";
    assert.equal(entitlementFromUrl(handoffUrl(odd)), odd);
  });
});

describe("entitlementFromUrl", () => {
  it("is null for an ordinary link, an empty key, the clear sentinel, or junk", () => {
    assert.equal(entitlementFromUrl("https://app.astra-arcana.com/"), null);
    assert.equal(entitlementFromUrl("https://app.astra-arcana.com/unlock?entitlement="), null);
    assert.equal(entitlementFromUrl("https://app.astra-arcana.com/unlock?entitlement=clear"), null);
    assert.equal(entitlementFromUrl("not a url"), null);
  });

  it("reads the key off any path — the PWA accepts ?entitlement= at / too", () => {
    assert.equal(entitlementFromUrl(`https://app.astra-arcana.com/?entitlement=${TOKEN}`), TOKEN);
  });
});

describe("isHandoffPath", () => {
  it("matches /unlock with or without a trailing slash and nothing else", () => {
    assert.equal(isHandoffPath("/unlock"), true);
    assert.equal(isHandoffPath("/unlock/"), true);
    assert.equal(isHandoffPath("/"), false);
    assert.equal(isHandoffPath("/unlocked"), false);
  });
});
