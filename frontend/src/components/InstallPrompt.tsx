// InstallPrompt.tsx — home-screen install affordance for the PWA.
//
// Chromium fires `beforeinstallprompt` when the app is installable; we stash it
// (calling preventDefault to suppress the browser's own mini-infobar) and offer
// our own gilt pill so installing matches the observatory chrome. iOS Safari
// never fires the event and has no programmatic install, so on iOS-standalone-
// capable-but-not-installed we fall back to the "Share → Add to Home Screen"
// hint instead.
import React, { useEffect, useState } from "react";
import { trackEvent } from "../api/client";

// Not in the TS DOM lib yet — the install-prompt event shape.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "aae.install_dismissed";

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  // iOS reports standalone via a non-standard navigator flag.
  (window.navigator as unknown as { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
  !/crios|fxios/i.test(window.navigator.userAgent); // only Safari can add-to-home

export const InstallPrompt: React.FC = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY));

  useEffect(() => {
    if (dismissed || isStandalone()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // suppress Chromium's default mini-infobar
      setDeferred(e as BeforeInstallPromptEvent);
      trackEvent("install_prompt_available");
    };
    const onInstalled = () => {
      setDeferred(null);
      setShowIosHint(false);
      trackEvent("install_completed");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS gives us no event — show the manual hint after a beat so it doesn't
    // race the ceremony modal on first load.
    let iosTimer: number | undefined;
    if (isIos()) iosTimer = window.setTimeout(() => setShowIosHint(true), 4000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, [dismissed]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
    trackEvent("install_prompt_dismissed");
  };

  const install = async () => {
    if (!deferred) return;
    trackEvent("install_prompt_accepted");
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    trackEvent("install_prompt_choice", { outcome });
    // The event is single-use; drop it either way (appinstalled handles success).
    setDeferred(null);
    if (outcome === "dismissed") dismiss();
  };

  if (dismissed) return null;
  if (deferred) {
    return (
      <div className="install-prompt" role="dialog" aria-label="Install Astra">
        <span className="install-glyph" aria-hidden>☤</span>
        <span className="install-copy">Install Astra for offline access on your home screen.</span>
        <button className="install-btn" onClick={install}>Install</button>
        <button className="install-x" onClick={dismiss} aria-label="Dismiss">×</button>
      </div>
    );
  }
  if (showIosHint) {
    return (
      <div className="install-prompt" role="dialog" aria-label="Add Astra to Home Screen">
        <span className="install-glyph" aria-hidden>☤</span>
        <span className="install-copy">
          Add Astra to your Home Screen: tap <b>Share</b> <span aria-hidden>⬆</span> then
          {" "}<b>Add to Home Screen</b>.
        </span>
        <button className="install-x" onClick={dismiss} aria-label="Dismiss">×</button>
      </div>
    );
  }
  return null;
};
