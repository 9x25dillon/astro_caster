// readerMode.ts — A1. The Android shell is a READER, not a shop.
//
// The APK ships with no billing SDK and no purchase UI. Every free and
// deterministic feature works; a paid tier is IMPORTED as an entitlement token
// that was bought on the web. That one choice is what lets a single artifact
// satisfy Play's billing policy, F-Droid's FOSS requirements, and direct
// download at the same time — instead of three builds and three review stories.
//
// Why a BUILD-TIME constant and not a runtime setting: it cannot be flipped by
// a server response, a query param, or anything else at runtime, so the shell
// cannot be turned into a shop after review without shipping a new build.
//
// ⚠️ What this does NOT claim, because it was measured and found false: the
// checkout code is NOT eliminated from the reader bundle. `createCheckout` and
// the button's label still appear in `dist/` under VITE_READER_MODE=1 — Vite
// inlines the constant but the component's JSX keeps the import alive. So the
// honest guarantee is "no purchase UI is reachable and no billing SDK is
// bundled" (the rail is a redirect to a URL the server returns), NOT "the
// bytes are absent". Do not tell a store reviewer the stronger version.
//
// Making the stronger claim true would mean a separate entry point or a dynamic
// import for the purchase surface. Worth doing if a reviewer ever asks for it;
// not worth pre-building on a guess.
//
// Set at build time:  VITE_READER_MODE=1 npm run build

/**
 * True when this build must not sell anything.
 *
 * Reads a raw env string rather than a boolean because Vite inlines env values
 * as strings; `"0"` and `"false"` are treated as off so an unset-vs-disabled
 * mistake in CI fails toward the SELLING build (the web default) rather than
 * silently shipping a reader build to the website.
 */
export const READER_MODE: boolean = (() => {
  const raw = (import.meta.env?.VITE_READER_MODE ?? "") as string;
  return raw !== "" && raw !== "0" && raw.toLowerCase() !== "false";
})();

/**
 * Where a reader-build visitor goes to buy. Deliberately a plain URL rather
 * than an in-app flow: the moment the app opens a purchase surface it owns, it
 * is selling, and the whole reader-mode argument collapses.
 */
export const PURCHASE_URL = "https://astra-arcana.com/#support";
