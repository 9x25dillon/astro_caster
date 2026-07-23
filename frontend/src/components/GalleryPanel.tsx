// GalleryPanel.tsx — The Archive's shelf in the Library (chapter VIII):
// every generated image the observatory has collected — tarot plates, sigils,
// chart art — kept as permanent artifacts. Plates gather toward a physical
// deck (press a proof sheet here); everything is downloadable and travels in
// the Vault.
import React, { useCallback, useEffect, useState } from "react";
import {
  galleryDelete, galleryList, type GalleryItem, type GalleryKind,
} from "../lib/bookshelf";
import { downloadDeckManifest, pressDeck } from "../lib/deckPress";

const KIND_LABEL: Record<GalleryKind, string> = {
  plate: "Tarot plates",
  sigil: "Sigils",
  wheel: "Wheels",
  chart: "Charts",
  other: "Other",
};

function downloadItem(it: GalleryItem) {
  const a = document.createElement("a");
  a.href = it.data;
  const ext = it.mime === "image/svg+xml" ? "svg" : "png";
  a.download = `astra-${it.kind}-${it.cardId ?? it.id}.${ext}`;
  a.click();
}

export const GalleryPanel: React.FC = () => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [msg, setMsg] = useState("");

  const reload = useCallback(() => {
    galleryList().then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const plates = items.filter((i) => i.kind === "plate");
  const groups = (Object.keys(KIND_LABEL) as GalleryKind[])
    .map((k) => [k, items.filter((i) => i.kind === k)] as const)
    .filter(([, list]) => list.length);

  return (
    <div className="lib-surface lib-gallery">
      <h2 className="lib-title">◈ The Gallery</h2>
      <p className="shelf-sub">
        Every image the observatory renders is kept here — a permanent,
        collectible archive. The tarot plates gather toward a physical deck;
        press a proof sheet below, or export each card for a printer. All of
        it travels inside the Vault.
      </p>

      {plates.length > 0 && (
        <div className="gal-deck-bar" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {plates.length} of 78 cards collected
          </span>
          <button
            className="ghost gal-press-deck"
            style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
            onClick={() => {
              const n = pressDeck(plates);
              setMsg(n ? `pressing ${n} cards…` : "no cards yet");
              setTimeout(() => setMsg(""), 2500);
            }}
          >
            ⎙ Press deck (proof sheet)
          </button>
          <button
            className="ghost gal-deck-manifest"
            style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
            onClick={() => downloadDeckManifest(plates)}
          >
            ↓ Deck manifest
          </button>
          {msg && <span className="muted" style={{ fontSize: 11 }}>{msg}</span>}
        </div>
      )}

      {items.length === 0 && (
        <p className="muted" style={{ fontSize: 12 }}>
          Nothing rendered yet — paint a plate in the Studio (chapter VII) and
          it lands here.
        </p>
      )}

      {groups.map(([kind, list]) => (
        <section key={kind} className="gal-group">
          <h3 className="gal-group-title" style={{ fontSize: 13, margin: "12px 0 6px" }}>
            {KIND_LABEL[kind]} <span className="muted">· {list.length}</span>
          </h3>
          <div
            className="gal-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}
          >
            {list.map((it) => (
              <figure key={it.id} className="gal-item" style={{ margin: 0 }}>
                <img
                  src={it.data}
                  alt={it.title}
                  title={it.title}
                  loading="lazy"
                  style={{ width: "100%", aspectRatio: "2.75 / 4.75", objectFit: "cover", borderRadius: 4, border: "1px solid var(--glass-lo, #3a3730)" }}
                />
                <figcaption style={{ fontSize: 9, textAlign: "center", marginTop: 2, opacity: 0.8 }}>
                  {it.title}
                </figcaption>
                <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 2 }}>
                  <button
                    className="gal-dl" title="Download this image"
                    style={{ fontSize: 10, padding: "1px 6px", width: "auto" }}
                    onClick={() => downloadItem(it)}
                  >↓</button>
                  <button
                    className="gal-del" title="Remove from the Gallery"
                    style={{ fontSize: 10, padding: "1px 6px", width: "auto" }}
                    onClick={async () => {
                      if (!window.confirm(`Remove "${it.title}" from the Gallery?`)) return;
                      await galleryDelete(it.id);
                      reload();
                    }}
                  >✕</button>
                </div>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
