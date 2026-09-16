// nativeUnlockLinks.ts — the APK's half of the unlock link (see handoff.ts).
//
// In the browser, `?entitlement=` is read off window.location at module load.
// Inside the Capacitor shell window.location is the bundled `https://localhost/`
// and never carries the intent's URL, so the link has to be fetched from the
// App plugin instead: `getLaunchUrl()` for a cold start, `appUrlOpen` when the
// app is already running (the activity is singleTask, so a second link
// re-enters the same instance rather than starting another).
//
// Both arrive here and go through the SAME `importEntitlement` the paste field
// uses — verified against the server first, stored only if it checks out. A
// link is a paste that saved the user some typing, nothing more.
//
// Dynamic import on purpose: the web build never loads the plugin module.

import { Capacitor } from "@capacitor/core";
import { entitlementFromUrl } from "./handoff";

type Importer = (raw: string) => Promise<{ ok: boolean; note: string }>;

export async function attachNativeUnlockLinks(
  importEntitlement: Importer,
  onNote: (note: string) => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  let App: typeof import("@capacitor/app").App;
  try {
    ({ App } = await import("@capacitor/app"));
  } catch {
    return; // plugin absent from this build: the paste field still works
  }

  const take = async (url: string | undefined | null) => {
    if (!url) return;
    const token = entitlementFromUrl(url);
    if (!token) return;
    const res = await importEntitlement(token);
    onNote(res.note);
  };

  try {
    const launch = await App.getLaunchUrl();
    await take(launch?.url);
  } catch { /* no launch url: an ordinary tap on the icon */ }

  try {
    await App.addListener("appUrlOpen", (ev) => { void take(ev.url); });
  } catch { /* listener unavailable: cold-start path above still covers installs */ }
}
