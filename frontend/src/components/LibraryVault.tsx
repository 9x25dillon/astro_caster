// LibraryVault.tsx — R-3: the Library's ground floor (wireframes fig. 4).
// The vault (export / restore everything) and support & unlock live here now;
// the masthead keeps identity only.
import React, { useRef, useState } from "react";
import { downloadVault, restoreVault } from "../lib/vault";
import { PricingPanel } from "./PricingPanel";

export const LibraryVault: React.FC = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");

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

      {/* E-3: support & unlock became a real pricing surface — both rails, live
          prices — instead of a lone button into the crypto modal. */}
      <PricingPanel />
    </div>
  );
};
