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
  const [keyDraft, setKeyDraft] = useState("");
  const [keyNote, setKeyNote] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);

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
        <p className="shelf-sub">
          Subscribed on the web? Paste your unlock key — or the whole unlock
          link — here. It is verified first and then lives only in this
          {" "}browser.{isSupporter ? " A key is already active on this device; importing another replaces it." : ""}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="key-import-field"
            aria-label="Entitlement key"
            placeholder="paste key or unlock link"
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
            {keyBusy ? "Verifying…" : "⚿ Import key"}
          </button>
        </div>
        {keyNote && (
          <p className="muted key-import-note" role="status" style={{ fontSize: 11, marginTop: 6 }}>
            {keyNote}
          </p>
        )}
      </div>

      {/* E-3: support & unlock became a real pricing surface — both rails, live
          prices — instead of a lone button into the crypto modal. */}
      <PricingPanel />
    </div>
  );
};
