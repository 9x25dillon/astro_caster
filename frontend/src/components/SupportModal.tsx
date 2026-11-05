// components/SupportModal.tsx
// The open-paywall "support to unlock" overlay + transparent funding
// dashboard. Paying happens with a card on the pricing page (Library, chapter
// VIII); this overlay explains what support buys and where it goes, and lets
// a subscriber manage billing. The crypto wallet rail was removed 2026-11-05.
import React, { useState } from "react";
import { useStore } from "../store/useStore";
import { ELEMENT_COLORS } from "../lib/astro";
import { openBillingPortal, ApiError } from "../api/client";

const PREMIUM = [
  ["☾", "In-depth readings", "Whole-chart synthesis via the 9B / cloud model"],
  ["✦", "Premium voice", "ElevenLabs neural narration of every reflection"],
  ["☼", "Daily horoscope", "A personal transit reading each day"],
  ["✶", "Saved charts", "Keep a library of charts across sessions"],
  ["▦", "Birth-chart poster", "Export a printable PDF of your chart"],
  ["⚯", "Synastry", "Relationship & compatibility charts"],
];

// Fixed here since /api/treasury went away with the crypto rail. Change the
// split in this one place.
const PHILOSOPHY =
  "Open paywall — the observatory is free to explore. Supporting it unlocks " +
  "the deep features and funds independent music, research, and AI work.";
const ALLOCATION = [
  { name: "Music", pct: 40, note: "K1ll releases — distribution, mastering, and production tooling." },
  { name: "Research", pct: 30, note: "Open research: The Geometry of Observation and related work." },
  { name: "Agents", pct: 30, note: "AI/agent infrastructure — hermes-agent, kgirl, and friends." },
];

const PILLAR_COLOR: Record<string, string> = {
  Music: ELEMENT_COLORS.Fire,
  Research: ELEMENT_COLORS.Water,
  Agents: ELEMENT_COLORS.Air,
};

export const SupportModal: React.FC = () => {
  const open = useStore((s) => s.supportOpen);
  const close = () => useStore.getState().openSupport(false);
  const isSupporter = useStore((s) => s.isSupporter);
  const entitlement = useStore((s) => s.entitlement);

  const [status, setStatus] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  // Customer self-service — open Stripe's Customer Portal to cancel, stop
  // auto-renew, update the card, or get invoices. A one-time unlock has no
  // recurring charge, so the server answers 409 (nothing to cancel).
  const manageBilling = async () => {
    if (!entitlement) return;
    setPortalBusy(true);
    setStatus(null);
    try {
      const { url } = await openBillingPortal(entitlement);
      window.location.href = url;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStatus(
          "Nothing to cancel — your access isn't a recurring card subscription. " +
          "(Self-service billing is for Stripe card plans.)",
        );
      } else if (e instanceof ApiError && e.status === 503) {
        setStatus("Card billing isn't enabled on this instance.");
      } else {
        setStatus((e as Error).message || "Could not open the billing portal.");
      }
    } finally {
      setPortalBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={close} aria-label="Close">×</button>
        <h2 className="section" style={{ marginTop: 0 }}>
          ☤ Support the Observatory
        </h2>
        <p className="muted" style={{ marginTop: -4 }}>
          {PHILOSOPHY}
        </p>

        {isSupporter && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ color: "var(--gold-soft)", margin: 0 }}>
              ✦ You're a supporter — premium features are unlocked. Thank you.
            </p>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Your key, and taking it to your phone or another browser: the
              Library (chapter VIII), under <b>⚿ Bring your key</b> — show it as a
              QR, copy the unlock link, or re-check that it is still valid.
            </p>
            <button
              className="ghost"
              style={{ alignSelf: "flex-start" }}
              onClick={manageBilling}
              disabled={portalBusy || !entitlement}
              title="Cancel, stop auto-renew, update your card, or download invoices — no email required."
            >
              {portalBusy ? "Opening…" : "Manage or cancel subscription"}
            </button>
          </div>
        )}

        {/* Funding dashboard */}
        <h3 style={{ color: "var(--gold)", fontSize: 14, margin: "14px 0 6px" }}>
          Where your support goes
        </h3>
        <div className="funding-bars">
          {ALLOCATION.map((p) => (
            <div key={p.name} className="funding-row" title={p.note}>
              <span className="funding-label">{p.name}</span>
              <div className="funding-track">
                <div
                  className="funding-fill"
                  style={{ width: `${p.pct}%`, background: PILLAR_COLOR[p.name] ?? "var(--gold)" }}
                />
              </div>
              <span className="funding-pct">{p.pct}%</span>
            </div>
          ))}
        </div>

        {/* What unlocking grants */}
        <h3 style={{ color: "var(--gold)", fontSize: 14, margin: "14px 0 6px" }}>
          Supporter unlocks
        </h3>
        <div className="premium-grid">
          {PREMIUM.map(([g, t, d]) => (
            <div key={t} className="premium-item" title={d}>
              <span style={{ color: "var(--gold-soft)", fontSize: 16 }}>{g}</span> {t}
            </div>
          ))}
        </div>

        {/* The 402 gates open this overlay directly; the card tiers live in the
            Library (chapter VIII), so the way to pay is a link there. */}
        {!isSupporter && (
          <button
            className="primary card-instead-btn"
            style={{ width: "100%", marginTop: 12 }}
            onClick={() => {
              close();
              if (window.location.hash === "#support") {
                window.history.replaceState(null, "", window.location.pathname);
              }
              window.location.hash = "#support";
            }}
          >
            ✦ Subscribe with a card →
          </button>
        )}

        {status && (
          <p style={{ marginTop: 10, color: "var(--gold-soft)", fontSize: 13 }}>{status}</p>
        )}
      </div>
    </div>
  );
};
