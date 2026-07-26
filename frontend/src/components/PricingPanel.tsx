// PricingPanel.tsx — Track E-3: the honest pricing surface.
//
// The math is the product; the unlock is an invitation, not a wall. Everything
// deterministic — the chart, the draw, the forecast, the whole engine — is free
// and runs on your device forever. What support buys is the *synthesis*: the
// Fable-5 written work and the premium voice. This panel says that first,
// because it's true, and because a paywall that lies about what's behind it
// isn't worth the conversion.
//
// Prices come from GET /api/pricing (env is the source of truth) — never
// hardcoded here, or they drift the moment a price changes. When the card rail
// isn't configured the card column simply doesn't exist, so an unconfigured
// instance degrades honestly to the crypto rail instead of offering a button
// that would 503.
import React, { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { createCheckout, getPricing, trackEvent, ApiError, type Pricing } from "../api/client";

// AGPL §13: offering this over a network obliges us to offer the source. The
// URL is a build-time constant so a fork can point it at its own repository.
export const SOURCE_URL =
  import.meta.env.VITE_SOURCE_URL ?? "https://github.com/9x25dillon/astro_caster";

const TIER_COPY: Record<string, { label: string; blurb: string }> = {
  supporter: {
    label: "Supporter",
    blurb: "In-depth readings on the cloud model, premium narrated voice, the daily transit reading.",
  },
  oracle: {
    label: "Oracle",
    blurb: "Everything in Supporter, plus the Oracle Report, the Course, and the deck-art studio.",
  },
};

export const PricingPanel: React.FC = () => {
  const isSupporter = useStore((s) => s.isSupporter);
  const openSupport = useStore((s) => s.openSupport);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getPricing()
      .then((p) => { if (live) { setPricing(p); trackEvent("pricing_viewed"); } })
      .catch(() => { /* offline: the crypto rail and the free tier still stand */ });
    return () => { live = false; };
  }, []);

  // Stripe checkout is a redirect flow — we leave the app entirely and come
  // back to `?checkout=<session_id>`, which the store settles on mount.
  const buy = async (tier: "supporter" | "oracle") => {
    setBusyTier(tier);
    setErr(null);
    try {
      const { url } = await createCheckout(tier);
      trackEvent("checkout_started", { tier, rail: "card" });
      window.location.href = url;
    } catch (e) {
      setErr(
        e instanceof ApiError && e.status === 503
          ? "Card payments aren't enabled on this instance — the crypto rail below still works."
          : `Could not open checkout: ${(e as Error).message}`,
      );
      setBusyTier(null);
    }
  };

  const recurring = pricing?.mode === "subscription";
  const cards = pricing?.card_available ? pricing.tiers : [];

  return (
    <div className="lib-support pricing-panel">
      <h2 className="lib-title" style={{ marginTop: 18 }}>☤ Support &amp; Unlock</h2>

      <p className="shelf-sub">
        {isSupporter
          ? "This observatory runs unlocked — thank you. The door stays open below if you want to revisit or extend your support."
          : "The engine is yours already. Every chart, draw, transit and forecast is computed on your own device, free, offline, forever — that part is never for sale. Support opens the written work: the Oracle Report, the Course, the deluxe edition, and the premium voice."}
      </p>

      {cards.length > 0 && (
        <>
          <div className="pricing-tiers">
            {cards.map(({ tier, usd }) => {
              const copy = TIER_COPY[tier] ?? { label: tier, blurb: "" };
              return (
                <div key={tier} className={`pricing-tier pricing-tier--${tier}`}>
                  <div className="pricing-tier-head">
                    <span className="pricing-tier-name">{copy.label}</span>
                    <span className="pricing-tier-price">
                      ${usd}
                      <span className="pricing-tier-per">{recurring ? "/month" : " once"}</span>
                    </span>
                  </div>
                  <p className="pricing-tier-blurb">{copy.blurb}</p>
                  <button
                    className={`pricing-buy ${busyTier === tier ? "is-live" : ""}`}
                    disabled={busyTier !== null}
                    onClick={() => buy(tier as "supporter" | "oracle")}
                  >
                    {busyTier === tier ? "Opening checkout…" : `Unlock with card · $${usd}`}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="pricing-fine">
            {recurring
              ? "Cancel any time, from inside the app — the ✦ Supporter panel opens Stripe's portal, no email to us required. Cancelling keeps your access until the period you paid for ends."
              : "A one-time unlock. No subscription, no renewal."}
            {pricing && pricing.report_usd > 0 && (
              <> The deluxe Personal Report is bought separately, per Oracle session, for ${pricing.report_usd}.</>
            )}
          </p>
        </>
      )}

      {err && <p className="pricing-err">{err}</p>}

      {/* The crypto rail — always available, and the only rail when Stripe is
          unconfigured. Not .support-pill: that selector is the masthead's
          identity pill and e2e matches it strictly. */}
      <button
        className={`lib-support-btn ${isSupporter ? "is-supporter" : ""}`}
        onClick={() => { trackEvent("checkout_started", { rail: "crypto" }); openSupport(true); }}
      >
        {isSupporter
          ? "✦ Supporter — view options"
          : cards.length > 0
            ? "☤ …or contribute with crypto"
            : "☤ Support / Unlock"}
      </button>

      {/* M3: the policies live as real pages with real URLs, because Stripe
          links them at the point of sale and a customer must be able to read
          them before paying. The AGPL source link is a licence obligation, not
          a courtesy — offering this over a network entitles users to the code. */}
      <p className="pricing-legal">
        <a href="/legal/pricing.html">Pricing</a>
        <a href="/legal/refunds.html">Refunds — 14 days</a>
        <a href="/legal/terms.html">Terms</a>
        <a href="/legal/privacy.html">Privacy</a>
        <a href={SOURCE_URL} rel="noreferrer">Source (AGPL)</a>
      </p>
    </div>
  );
};
