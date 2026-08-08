// capacitor.config.ts — A1, the Android shell (APK_I18N_ROADMAP Track A).
//
// One artifact, three destinations: Play, F-Droid, and direct download all
// consume the SAME APK. Only the store choice drags in agreements, so the shell
// is shared cost and the expensive channel can be deferred until demand is
// proven rather than assumed.
//
// READER MODE is the whole design. The APK ships with NO billing SDK and no
// purchase UI: every free/deterministic feature works, and a paid tier is
// IMPORTED as an entitlement token rather than sold in-app. That single choice
// is what lets one build satisfy Play's billing policy, F-Droid's FOSS
// requirements, and direct download simultaneously — see `server` below for the
// mechanism that keeps it honest.
//
// iOS is deliberately absent. AGPL-3.0 is what closes Apple *and* what qualifies
// us for F-Droid; that trade was ratified in MOBILE_ROADMAP §4.2.1 and is not
// reopened here.
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.astraarcana.observatory",
  appName: "Astra",

  // The PWA build is the app. There is no second codebase and no second engine:
  // @astra/core already casts charts on-device, so the shell is a shell.
  webDir: "dist",

  android: {
    // Ship the web assets INSIDE the APK and never load remote code. This is
    // what makes the build reviewable: an F-Droid reviewer can verify that the
    // APK's behaviour is fully determined by the source they built.
    //
    // It is also what keeps reader-mode honest — a shell that could fetch a
    // remote bundle could be given a purchase UI after review, so the absence
    // of that capability is the actual guarantee, not a promise in a README.
    webContentsDebuggingEnabled: false,
  },

  server: {
    // No `url`. A Capacitor `server.url` points the shell at a live site, which
    // would (a) break offline — the entire premise of the on-device engine —
    // and (b) let remote content change what the app does after review. Both
    // are disqualifying. Leave this empty.
    androidScheme: "https",
  },

  plugins: {
    // The splash exists so first paint isn't a white flash while the WASM Swiss
    // engine initialises. Keep it short — the observatory should feel like it
    // was already running.
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: "#0b0b0f",
      showSpinner: false,
    },
  },
};

export default config;
