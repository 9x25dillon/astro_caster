// components/SupportModal.tsx
// The open-paywall "support to unlock" experience + transparent funding
// dashboard. Two ways to support:
//   1. Connect an EVM wallet and send directly (returns a tx hash we redeem).
//   2. Send manually, then paste the tx hash to verify.
// Any amount unlocks the supporter tier — premium features fund the projects.
import React, { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { ELEMENT_COLORS } from "../lib/astro";
import { openBillingPortal, ApiError } from "../api/client";
import { looksLikeStripeReference } from "../lib/paymentRef";

// Minimal EIP-1193 shape so we don't need a wallet SDK.
type Eth = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
function getEthereum(): Eth | null {
  return (window as unknown as { ethereum?: Eth }).ethereum ?? null;
}

// ETH (decimal) -> wei hex string, float-safe.
function toWeiHex(eth: number): string {
  const [whole, frac = ""] = eth.toString().split(".");
  const fracPad = (frac + "0".repeat(18)).slice(0, 18);
  const wei = BigInt(whole || "0") * 10n ** 18n + BigInt(fracPad || "0");
  return "0x" + wei.toString(16);
}

const PREMIUM = [
  ["☾", "In-depth readings", "Whole-chart synthesis via the 9B / cloud model"],
  ["✦", "Premium voice", "ElevenLabs neural narration of every reflection"],
  ["☼", "Daily horoscope", "A personal transit reading each day"],
  ["✶", "Saved charts", "Keep a library of charts across sessions"],
  ["▦", "Birth-chart poster", "Export a printable PDF of your chart"],
  ["⚯", "Synastry", "Relationship & compatibility charts"],
];

// Suggested support tiers, expressed in ETH (any amount unlocks).
const TIERS = [
  { eth: 0.001, label: "Spark" },
  { eth: 0.003, label: "Seeker" },
  { eth: 0.01, label: "Patron" },
];

const PILLAR_COLOR: Record<string, string> = {
  Music: ELEMENT_COLORS.Fire,
  Research: ELEMENT_COLORS.Water,
  Agents: ELEMENT_COLORS.Air,
};

export const SupportModal: React.FC = () => {
  const open = useStore((s) => s.supportOpen);
  const close = () => useStore.getState().openSupport(false);
  const treasury = useStore((s) => s.treasury);
  const loadTreasury = useStore((s) => s.loadTreasury);
  const redeem = useStore((s) => s.redeemDonation);
  const isSupporter = useStore((s) => s.isSupporter);
  const entitlement = useStore((s) => s.entitlement);

  const [amount, setAmount] = useState(0.003);
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  // Customer self-service — open Stripe's Customer Portal to cancel, stop
  // auto-renew, update the card, or get invoices. Crypto supporters have no
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

  useEffect(() => {
    if (open && !treasury) loadTreasury();
  }, [open, treasury, loadTreasury]);

  if (!open) return null;

  const evm = treasury?.chains.find((c) => c.id === "evm");

  const connectAndSend = async () => {
    const eth = getEthereum();
    if (!eth) {
      setStatus("No EVM wallet detected. Install MetaMask, or send manually below.");
      return;
    }
    if (!evm) {
      setStatus("No EVM treasury configured.");
      return;
    }
    setBusy(true);
    setStatus("Confirm the transaction in your wallet…");
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts[0];
      const hash = (await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: evm.address, value: toWeiHex(amount) }],
      })) as string;
      setStatus("Sent! Verifying & unlocking…");
      const ok = await redeem(hash, "evm");
      setStatus(ok ? "Unlocked — thank you for supporting the work." : "Could not verify yet.");
    } catch (e) {
      setStatus((e as Error).message || "Transaction cancelled.");
    } finally {
      setBusy(false);
    }
  };

  const verifyManual = async () => {
    if (!txHash.trim()) return;
    // THE WRONG DOOR, closed. This field is the ON-CHAIN rail, and a Stripe
    // reference sent down it comes back "on-chain verification unavailable and
    // trust mode is disabled" — which reads like a failed payment and is
    // nothing of the kind. On 2026-08-28 a customer with a real, verified $5.50
    // receipt was told exactly that, and stopped looking. A card reference must
    // be recognised HERE, where they pasted it, and named as belonging
    // somewhere else — not denied by a rail that was never asked about it.
    if (looksLikeStripeReference(txHash)) {
      setStatus(
        "That's a card payment reference, not a crypto transaction — this " +
        "field only verifies on-chain payments. Restore a card purchase in " +
        "the Library, under ⚿ Bring your key: paste it there and your access " +
        "comes back, with nothing charged again.",
      );
      return;
    }
    setBusy(true);
    setStatus("Verifying…");
    const ok = await redeem(txHash.trim(), "evm");
    setStatus(ok ? "Unlocked — thank you!" : "Could not verify that transaction.");
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={close} aria-label="Close">×</button>
        <h2 className="section" style={{ marginTop: 0 }}>
          ☤ Support the Observatory
        </h2>
        <p className="muted" style={{ marginTop: -4 }}>
          {treasury?.philosophy ??
            "The observatory is free to explore. Supporting it unlocks the deep features."}
        </p>

        {isSupporter && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ color: "var(--gold-soft)", margin: 0 }}>
              ✦ You're a supporter — premium features are unlocked. Thank you.
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
          {(treasury?.allocation ?? []).map((p) => (
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

        {/* Support actions */}
        <h3 style={{ color: "var(--gold)", fontSize: 14, margin: "14px 0 6px" }}>
          Choose an amount (pay what you want)
        </h3>
        <div className="row" style={{ marginBottom: 8 }}>
          {TIERS.map((t) => (
            <button
              key={t.eth}
              className={`chip ${amount === t.eth ? "active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => setAmount(t.eth)}
            >
              {t.label} · {t.eth} Ξ
            </button>
          ))}
          <input
            type="number"
            step={0.001}
            min={0}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            style={{ maxWidth: 90 }}
            title="Custom amount (ETH)"
          />
        </div>

        <button className="primary" disabled={busy} onClick={connectAndSend}>
          {busy ? "…" : `Connect wallet & support (${amount} Ξ)`}
        </button>

        {evm && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10, wordBreak: "break-all" }}>
            Or send {evm.asset} to{" "}
            <code
              style={{ color: "var(--sepia)", cursor: "pointer" }}
              title="Copy address"
              onClick={() => navigator.clipboard?.writeText(evm.address)}
            >
              {evm.address}
            </code>{" "}
            {!treasury?.configured && "(placeholder — set AAE_TREASURY_ETH)"}
          </p>
        )}

        <div className="row" style={{ marginTop: 6 }}>
          <input
            placeholder="…then paste your transaction hash to unlock"
            aria-label="Transaction hash"
            className="crypto-tx-field"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
          />
          <button className="ghost crypto-verify-btn" style={{ width: "auto" }}
                  disabled={busy} onClick={verifyManual}>
            Verify
          </button>
        </div>

        {status && (
          <p style={{ marginTop: 10, color: "var(--gold-soft)", fontSize: 13 }}>{status}</p>
        )}
      </div>
    </div>
  );
};
