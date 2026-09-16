// LibraryVault.tsx — R-3: the Library's ground floor (wireframes fig. 4).
// The vault (export / restore everything) and support & unlock live here now;
// the masthead keeps identity only.
import React, { useEffect, useRef, useState } from "react";
import { downloadVault, restoreVault } from "../lib/vault";
import { handoffQr, handoffUrl } from "../lib/handoff";
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
  const entitlementExp = useStore((s) => s.entitlementExp);
  const refreshEntitlement = useStore((s) => s.refreshEntitlement);
  const [keyShown, setKeyShown] = useState(false);
  const [copyNote, setCopyNote] = useState("");
  // Session 42: the key gets a shape that crosses devices by itself — an
  // unlock link and a QR of it (handoff.ts). Scan the QR with the phone's
  // camera: the reader APK opens on it (App Link) or, without the APK, the
  // PWA does; both import the key the same way the paste field would.
  const [qr, setQr] = useState<string | null>(null);
  const [qrShown, setQrShown] = useState(false);
  const [checkNote, setCheckNote] = useState("");
  const [checkBusy, setCheckBusy] = useState(false);

  useEffect(() => {
    if (!qrShown || !entitlement) { setQr(null); return; }
    let live = true;
    handoffQr(entitlement).then((d) => { if (live) setQr(d); }).catch(() => { if (live) setQr(null); });
    return () => { live = false; };
  }, [qrShown, entitlement]);

  const recheckKey = async () => {
    if (checkBusy) return;
    setCheckBusy(true);
    try {
      const res = await refreshEntitlement();
      setCheckNote(res.note);
    } finally {
      setCheckBusy(false);
    }
  };

  const copyText = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote(done);
    } catch {
      setCopyNote("Could not reach the clipboard — reveal the key and copy it by hand.");
    }
    setTimeout(() => setCopyNote(""), 6000);
  };

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
      {/* Session 42: a visitor WITHOUT a key came here to buy — the prices go
          first. A subscriber came here for their key and the vault; for them
          the pricing surface keeps its place at the bottom. */}
      {!isSupporter && <PricingPanel />}
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
            <h4 className="lib-subtitle" style={{ fontSize: 13 }}>⚿ Your key</h4>
            {/* The question "is my subscription still good on this device?" gets
                a line, not a devtools trip. Re-check asks the server now and
                renews a key that is inside its last 45 days (the app also does
                this quietly on launch). */}
            <p className="shelf-sub key-status" role="status">
              Active on this device
              {entitlementExp
                ? ` · valid until ${new Date(entitlementExp * 1000).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`
                : ""}
              . A subscription renews this key on its own for as long as it is paid.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="ghost key-recheck-btn"
                style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
                disabled={checkBusy}
                onClick={() => void recheckKey()}
                title="Ask the observatory whether this key is still valid, and renew it if it is close to expiring"
              >
                {checkBusy ? "Checking…" : "↻ Re-check my key"}
              </button>
            </div>
            {checkNote && (
              <p className="muted key-check-note" role="status" style={{ fontSize: 11, marginTop: 6 }}>
                {checkNote}
              </p>
            )}

            <h4 className="lib-subtitle" style={{ fontSize: 13, marginTop: 14 }}>⚿ Take your key to another device</h4>
            <p className="shelf-sub">
              Your subscription lives here as a single key, and it works on as
              many of your own devices as you like. The quickest way across:
              {" "}<b>show the QR and scan it with your phone's camera</b> — the
              Astra app opens on it if it is installed, the web version if not,
              and either one takes the key. Or copy the unlock link and send it
              to yourself; or copy the bare key and paste it into this same
              field over there.{" "}
              <strong>Treat all three like a password:</strong> anyone holding
              the key has your tier until it expires.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="ghost key-qr-btn"
                style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
                aria-expanded={qrShown}
                onClick={() => { setQrShown((v) => !v); setCopyNote(""); }}
              >
                {qrShown ? "◦ Hide QR" : "▦ Show QR for my phone"}
              </button>
              <button
                className="ghost key-link-btn"
                style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
                onClick={() => void copyText(handoffUrl(entitlement), "Unlock link copied — open it on the other device and the key comes with it.")}
              >
                ⧉ Copy unlock link
              </button>
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
            {qrShown && (
              <div className="key-qr" style={{ marginTop: 10 }}>
                {qr
                  ? <img src={qr} width={220} height={220} alt="QR code of your unlock link" style={{ display: "block", borderRadius: 6, maxWidth: "100%" }} />
                  : <span className="muted" style={{ fontSize: 11 }}>Drawing the code…</span>}
                <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  This code IS your key. Hide it before sharing your screen.
                </p>
              </div>
            )}
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
      {isSupporter && <PricingPanel />}
    </div>
  );
};
