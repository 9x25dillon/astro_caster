// LibraryVault.tsx — R-3: the Library's ground floor (wireframes fig. 4).
// The vault (export / restore everything) and support & unlock live here now;
// the masthead keeps identity only.
import React, { useRef, useState } from "react";
import { downloadVault, restoreVault } from "../lib/vault";
import { PricingPanel } from "./PricingPanel";
import { useStore } from "../store/useStore";

export const LibraryVault: React.FC = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  // Session 25: the key-import field. The reader APK has no address bar, so a
  // subscription bought on the web had NO way back into the app — this field
  // is that last mile, and it works identically in every browser.
  const importEntitlement = useStore((s) => s.importEntitlement);
  const isSupporter = useStore((s) => s.isSupporter);
  const replaySync = useStore((s) => s.replaySync);
  const toggleReplaySync = useStore((s) => s.toggleReplaySync);
  const forgetSyncedReadings = useStore((s) => s.forgetSyncedReadings);
  const [syncNote, setSyncNote] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [keyNote, setKeyNote] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);

  // Session 29: the OTHER half of "Bring your key", which was missing.
  //
  // The import field has existed since session 25, but nothing in the app ever
  // SHOWED a key, so a subscriber who bought in a desktop browser had no way to
  // get their own key out of it and onto their phone — the field they needed to
  // fill had no source. The only route was devtools
  // (`localStorage.getItem("aae.entitlement")`), which is not a thing to ask a
  // paying customer to do. Export is the mirror of import and belongs beside it.
  //
  // Hidden behind a toggle rather than simply rendered, because the token IS the
  // subscription: it is a bearer credential with no device binding (payload is
  // tier/ref/verified/iat/exp/jti — see backend mint_entitlement), so anyone who
  // reads it off a shared screen or a screenshot holds the tier until it
  // expires. Default-hidden costs one tap and removes it from every incidental
  // capture.
  const entitlement = useStore((s) => s.entitlement);
  const [keyShown, setKeyShown] = useState(false);
  const [copyNote, setCopyNote] = useState("");

  const copyKey = async () => {
    if (!entitlement) return;
    try {
      await navigator.clipboard.writeText(entitlement);
      setCopyNote("Key copied — paste it into this same field on the other device.");
    } catch {
      // Clipboard access is refused in plenty of ordinary situations (insecure
      // context, permissions policy, older WebViews). The field is readOnly but
      // selectable, so there is always a manual path — say so rather than
      // leaving a dead button.
      setCopyNote("Could not reach the clipboard — select the key above and copy it by hand.");
    }
    setTimeout(() => setCopyNote(""), 6000);
  };

  const importKey = async () => {
    if (keyBusy) return;
    setKeyBusy(true);
    setKeyNote("");
    // importEntitlement is contracted to resolve, never reject — but the
    // button disables itself on keyBusy, so ANY escaping throw leaves the
    // field stuck on "Verifying…" with only a reload to clear it. Belt and
    // braces: the spinner comes down in `finally` regardless of who breaks
    // the contract later.
    try {
      const res = await importEntitlement(keyDraft);
      setKeyNote(res.note);
      if (res.ok) setKeyDraft("");
    } catch {
      setKeyNote("Something went wrong reading that key. Nothing was stored.");
    } finally {
      setKeyBusy(false);
    }
  };

  return (
    <div className="lib-surface lib-vault">
      {/* Replay sync — the opt-in half of the guardrail. Its home is here, next
          to the vault and the key, because it is the same kind of decision:
          what of yours lives where. Shown only to readers who hold a key,
          since without one there is no owner for the readings. */}
      {isSupporter && (
        <section className="lib-replay-sync" style={{ marginBottom: 18 }}>
          <h2 className="lib-title">↺ Remembered readings</h2>
          <p className="shelf-sub">
            Ask the same question of the same chart and Astra gives you the same
            reading back rather than writing a second, different one. That
            happens on this device already, and costs you nothing.
            {" "}
            <b>Turn this on</b> and your readings are also held on the server, so
            they follow you to another device or survive a cleared browser — which
            means the question you asked is stored there too, inside its answer.
            Off unless you say otherwise.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span
              className={`chip ${replaySync ? "active" : ""}`}
              onClick={() => {
                toggleReplaySync();
                setSyncNote("");
              }}
              role="switch"
              aria-checked={replaySync}
              aria-label="Sync remembered readings"
            >
              {replaySync ? "\u25c9" : "\u25cb"} sync across devices
            </span>
            <button
              className="ghost replay-forget"
              style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
              title="Delete every reading held for you on the server"
              onClick={async () => {
                if (!window.confirm(
                  "Delete every reading held for you on the server? Readings stored on this device stay."
                )) return;
                try {
                  const n = await forgetSyncedReadings();
                  setSyncNote(`${n} reading${n === 1 ? "" : "s"} deleted from the server`);
                } catch {
                  setSyncNote("could not reach the server — nothing was deleted");
                }
                setTimeout(() => setSyncNote(""), 4000);
              }}
            >
              Forget synced readings
            </button>
            {syncNote && <span className="shelf-sub">{syncNote}</span>}
          </div>
        </section>
      )}

      <h2 className="lib-title">⇓ The Vault</h2>
      <p className="shelf-sub">
        Everything the observatory keeps lives in this browser — profiles,
        entitlement, report claims, the shelf, the journal. The vault is all
        of it as one file, built and saved locally. It carries your birth
        data: guard it like a key.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="ghost vault-export"
          style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
          title="Download ALL local observatory data as one file"
          onClick={async () => {
            const n = await downloadVault();
            setMsg(`vault saved · ${n} entries`);
            setTimeout(() => setMsg(""), 2500);
          }}
        >
          ⇓ Export vault
        </button>
        <button
          className="ghost vault-import"
          style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
          title="Restore a previously exported vault file (overwrites matching local data, then reloads)"
          onClick={() => fileRef.current?.click()}
        >
          ⇑ Restore
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (!window.confirm("Restore this vault? Matching local data will be overwritten, then the observatory reloads.")) return;
            try {
              const n = await restoreVault(await f.text());
              setMsg(`restored ${n} entries — reloading…`);
              setTimeout(() => window.location.reload(), 700);
            } catch (err) {
              setMsg(String((err as Error).message ?? err));
              setTimeout(() => setMsg(""), 4000);
            }
          }}
        />
        {msg && <span className="muted" style={{ fontSize: 11 }}>{msg}</span>}
      </div>

      <div className="lib-keyimport">
        <h3 className="lib-subtitle">⚿ Bring your key</h3>
        {/* One field, three kinds of paste. Someone who cleared their site data
            has no key to bring — the key WAS what they lost — and what they
            still have is a receipt. A second field would have been a second
            door, and three doors with the wrong one visible is precisely how a
            paid $5.50 edition went undelivered on 2026-08-28. */}
        <p className="shelf-sub">
          Subscribed on the web? Paste your unlock key — or the whole unlock
          link — here. It is verified first and then lives only in this
          {" "}browser.{isSupporter ? " A key is already active on this device; importing another replaces it." : ""}
        </p>
        <p className="shelf-sub">
          <b>Lost your key?</b> If you cleared your browser or you are on a new
          device, paste the payment reference from your receipt instead — the
          <code> cs_…</code> in the link Stripe returned you to, or the
          {" "}<code>pi_…</code> / <code>sub_…</code> on the receipt itself.
          Your access comes back; you are not charged again.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="key-import-field"
            aria-label="Entitlement key"
            placeholder="paste key, unlock link, or payment reference"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void importKey(); }}
            style={{ flex: "1 1 220px", minWidth: 180, fontSize: 12, padding: "4px 8px" }}
          />
          <button
            className="ghost key-import-btn"
            style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
            disabled={keyBusy || !keyDraft.trim()}
            onClick={() => void importKey()}
          >
            {keyBusy ? "Verifying…" : "⚿ Unlock this device"}
          </button>
        </div>
        {keyNote && (
          <p className="muted key-import-note" role="status" style={{ fontSize: 11, marginTop: 6 }}>
            {keyNote}
          </p>
        )}

        {/* Export. Only offered when there is actually a key here — on a device
            with no subscription this would be a button that can only disappoint. */}
        {isSupporter && entitlement && (
          <div className="key-export" style={{ marginTop: 14 }}>
            <h4 className="lib-subtitle" style={{ fontSize: 13 }}>⚿ Take your key to another device</h4>
            <p className="shelf-sub">
              Your subscription lives in this browser as a single key. Reveal it
              here, copy it, and paste it into the same field on your phone or
              tablet — it works on as many of your own devices as you like.{" "}
              <strong>Treat it like a password:</strong> anyone holding this key
              has your tier until it expires.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="ghost key-reveal-btn"
                style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
                aria-expanded={keyShown}
                onClick={() => { setKeyShown((v) => !v); setCopyNote(""); }}
              >
                {keyShown ? "◦ Hide my key" : "⚿ Show my key"}
              </button>
              <button
                className="ghost key-copy-btn"
                style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
                onClick={() => void copyKey()}
              >
                ⧉ Copy my key
              </button>
            </div>
            {keyShown && (
              <textarea
                className="key-export-field"
                aria-label="Your entitlement key"
                readOnly
                value={entitlement}
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  width: "100%", marginTop: 8, fontSize: 11,
                  fontFamily: "ui-monospace, monospace", padding: "6px 8px",
                  wordBreak: "break-all", resize: "vertical",
                }}
              />
            )}
            {copyNote && (
              <p className="muted key-export-note" role="status" style={{ fontSize: 11, marginTop: 6 }}>
                {copyNote}
              </p>
            )}
          </div>
        )}
      </div>

      {/* E-3: support & unlock became a real pricing surface — both rails, live
          prices — instead of a lone button into the crypto modal. */}
      <PricingPanel />
    </div>
  );
};
