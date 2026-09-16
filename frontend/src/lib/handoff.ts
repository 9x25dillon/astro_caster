// handoff.ts — moving a key between devices without retyping it.
//
// A subscription is one bearer token in localStorage (see readerMode.ts and
// LibraryVault.tsx for why). Getting it from a laptop to a phone used to mean:
// reveal, copy, get the text across somehow, paste. This module gives the key a
// SHAPE that crosses devices on its own: an unlock link, and a QR of that link.
//
//   https://app.astra-arcana.com/unlock#entitlement=<token>
//
// A FRAGMENT, not a query string (session 42 security pass). The key is a
// bearer credential. A query string is sent to the server and lands in nginx
// and Cloudflare access logs, in any proxy cache, and in browser history; a
// fragment never leaves the browser — it is not part of the HTTP request at
// all. Android delivers the full URL including the fragment to the App Link
// intent, so the APK path is unaffected. The old `?entitlement=` form is still
// READ (links already shared keep working) but is no longer generated.
//
// Three things open that URL, and all three end in the same import:
//   * the PWA, in any browser — useStore.ts captures `?entitlement=` at module
//     load and scrubs it from the bar (that path has existed since session 25);
//   * the reader APK, via an Android App Link on the `/unlock` path — declared
//     in AndroidManifest.xml, proven by /.well-known/assetlinks.json on the app
//     host, and delivered to the web layer by nativeUnlockLinks.ts;
//   * the ⚿ Bring your key field, which accepts the whole link pasted as text.
//
// The path is `/unlock` rather than `/` so the App Link claims ONE route. If
// the APK claimed the whole host, every ordinary link to the observatory would
// try to open the app instead of the site — and a reader build must never
// intercept the buy page it signposts to.
//
// Nothing here is a purchase surface: a link carries a key that was already
// paid for. It is exactly as sensitive as the key, and the copy says so.

import { toDataURL } from "qrcode";

export const HANDOFF_ORIGIN = "https://app.astra-arcana.com";
export const HANDOFF_PATH = "/unlock";

/** The link a phone can open to take this key. */
export function handoffUrl(token: string): string {
  return `${HANDOFF_ORIGIN}${HANDOFF_PATH}#entitlement=${encodeURIComponent(token)}`;
}

/**
 * The entitlement carried by a URL, or null. Used by the native launch path,
 * where the URL arrives as a string from an intent rather than as
 * window.location. Tolerates a malformed escape (returns the raw value rather
 * than throwing — a key never contains `%`, so a decode failure means the link
 * was mangled in transit and the import's own validation will say so).
 */
export function entitlementFromUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  // Fragment first (the generated form), query second (legacy links).
  const frag = new URLSearchParams(u.hash.replace(/^#/, "")).get("entitlement");
  const raw = frag ?? u.searchParams.get("entitlement");
  if (raw === null || raw === "" || raw === "clear") return null;
  return raw;
}

/** True when this location is the hand-off route and should collapse to `/`. */
export function isHandoffPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === HANDOFF_PATH;
}

/**
 * A QR image of the unlock link, as a data: URL. The link is long (a signed
 * token), so error correction stays at the default M and the module count
 * lands around 41–45 for a typical key; at 220px that is comfortably scannable
 * by a phone camera at arm's length.
 */
export function handoffQr(token: string): Promise<string> {
  return toDataURL(handoffUrl(token), {
    margin: 2,
    width: 220,
    color: { dark: "#0b0b0f", light: "#f3dfb5" },
  });
}
