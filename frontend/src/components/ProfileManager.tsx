// ProfileManager.tsx — localStorage-based saved chart profiles.
import React, { useState } from "react";
import { useStore } from "../store/useStore";
import { shareBirth } from "../lib/shareChart";
import { downloadVault, restoreVault } from "../lib/vault";
import type { BirthInput } from "../types";

export interface SavedProfile {
  id: string;
  name: string;
  birth: BirthInput;
  createdAt: string;
}

const KEY = "aae.profiles";

export const loadProfiles = (): SavedProfile[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};

const saveAll = (profiles: SavedProfile[]) =>
  localStorage.setItem(KEY, JSON.stringify(profiles));

const dateStr = (b: BirthInput) =>
  `${b.month}/${b.day}/${b.year}`;

export const ProfileManager: React.FC<{ onLoad?: () => void }> = ({ onLoad }) => {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const birth = useStore((s) => s.birth);
  const setBirth = useStore((s) => s.setBirth);
  const generate = useStore((s) => s.generate);

  const [profiles, setProfiles] = useState<SavedProfile[]>(loadProfiles);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [shareMsg, setShareMsg] = useState("");

  const share = async () => {
    const result = await shareBirth(birth);
    if (result === "copied") setShareMsg("Link copied");
    else if (result === "shared") setShareMsg("Shared");
    else setShareMsg("Couldn't share");
    setTimeout(() => setShareMsg(""), 2200);
  };

  const save = () => {
    const name = saveName.trim() || birth.label || `Chart ${profiles.length + 1}`;
    const entry: SavedProfile = {
      id: Date.now().toString(36),
      name,
      birth: { ...birth, label: name },
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...profiles].slice(0, 12); // max 12 saved charts
    saveAll(next);
    setProfiles(next);
    setSaveName("");
    setSaving(false);
  };

  const load = (p: SavedProfile) => {
    setBirth(p.birth);
    generate();
    onLoad?.();
  };

  const remove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = profiles.filter((p) => p.id !== id);
    saveAll(next);
    setProfiles(next);
  };

  const startEdit = (p: SavedProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditingName(p.name);
  };

  const commitEdit = (id: string) => {
    const name = editingName.trim();
    if (!name) { setEditingId(null); return; }
    const next = profiles.map((p) =>
      p.id === id ? { ...p, name, birth: { ...p.birth, label: name } } : p
    );
    saveAll(next);
    setProfiles(next);
    setEditingId(null);
  };

  return (
    <div className="profile-manager">
      <h2 className="section">My Charts</h2>

      {saving ? (
        <div className="profile-save-row">
          <input
            className="profile-name-input"
            placeholder="Name this chart…"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            autoFocus
          />
          <button className="primary" style={{ width: "auto", padding: "6px 10px", fontSize: 12 }} onClick={save}>
            Save
          </button>
          <button className="ghost" style={{ width: "auto", padding: "6px 8px", fontSize: 12 }} onClick={() => setSaving(false)}>
            ✕
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            className="ghost"
            style={{ fontSize: 12, padding: "4px 10px", width: "auto" }}
            onClick={() => { setSaveName(birth.label || ""); setSaving(true); }}
          >
            ↑ Save current chart
          </button>
          <button
            className="ghost"
            style={{ fontSize: 12, padding: "4px 10px", width: "auto" }}
            title="Share this chart as a self-contained link (no data leaves the link)"
            onClick={share}
          >
            ⇪ Share
          </button>
          <button
            className="ghost vault-export"
            style={{ fontSize: 12, padding: "4px 10px", width: "auto" }}
            title="Download ALL local observatory data (profiles, entitlement, report claims, bookmarks) as one file. It contains your birth data — guard it like a key."
            onClick={async () => {
              const n = await downloadVault();
              setShareMsg(`vault saved · ${n} entries`);
              setTimeout(() => setShareMsg(""), 2500);
            }}
          >
            ⇓ Vault
          </button>
          <button
            className="ghost vault-import"
            style={{ fontSize: 12, padding: "4px 10px", width: "auto" }}
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
                setShareMsg(`restored ${n} entries — reloading…`);
                setTimeout(() => window.location.reload(), 700);
              } catch (err) {
                setShareMsg(String((err as Error).message ?? err));
                setTimeout(() => setShareMsg(""), 4000);
              }
            }}
          />
          {shareMsg && <span className="muted" style={{ fontSize: 11 }}>{shareMsg}</span>}
        </div>
      )}

      {profiles.length > 0 && (
        <div className="profile-list">
          {profiles.map((p) => (
            <div key={p.id} className="profile-item"
                 onClick={() => editingId !== p.id && load(p)}
                 title={editingId === p.id ? undefined : `Born ${dateStr(p.birth)}`}>
              {editingId === p.id ? (
                <input
                  className="profile-name-input"
                  value={editingName}
                  autoFocus
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit(p.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => commitEdit(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flex: 1, fontSize: 12 }}
                />
              ) : (
                <div className="profile-item-name"
                     onDoubleClick={(e) => startEdit(p, e)}
                     title="Double-click to rename">
                  {p.name}
                </div>
              )}
              <div className="profile-item-date">{dateStr(p.birth)}</div>
              <button
                className="profile-item-del"
                onClick={(e) => remove(p.id, e)}
                title="Remove"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {profiles.length === 0 && !saving && (
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          No saved charts yet. Cast a chart and save it here.
        </p>
      )}
    </div>
  );
};
