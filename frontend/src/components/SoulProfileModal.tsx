// SoulProfileModal.tsx — soul archetype, avatar, life themes, manifestation portal.
import React, { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { deriveSoulProfile } from "../lib/archetypes";
import { ManifestationAvatar } from "./ManifestationAvatar";
import { ORDINAL } from "../lib/astro";

const OBSERVATORY_PHILOSOPHY = `Your birth chart is not a sentence — it is a signal. At the moment of your first breath, the geometry of the solar system printed a holographic frequency map onto the fabric of your consciousness: planets as sources of light and intention, houses as the dimensional spaces they illuminate, and the angular relationships between them as the polarity circuits through which that light flows.

These patterns do not determine your life. They describe the specific frequency you arrived with — the unique configuration of consciousness you inhabit. The question is never "what will happen to me?" but "what can I build with this?" Every planet is a lens. Every house is a domain of experience. Every aspect is a live circuit between two archetypes within you. You are not reading the stars. You are reading yourself — learning the grammar of your own nature so you can speak it fluently and direct it with intention.

The avatar you see here is your frequency map made visible: your dominant element as the quality of your energy, your modality as its characteristic impulse, the planet web as the living network of your inner archetypes, and the North Node arc as the arrow of your becoming. It is not fixed. It evolves as you do.`;

export const SoulProfileModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const chart = useStore((s) => s.chart);
  const birth = useStore((s) => s.birth);
  const isSupporter = useStore((s) => s.isSupporter);
  const openSupport = useStore((s) => s.openSupport);
  const [intention, setIntention] = useState("");
  const [showPhilosophy, setShowPhilosophy] = useState(false);

  const profile = useMemo(
    () => (chart ? deriveSoulProfile(chart) : null),
    [chart]
  );

  if (!chart || !profile) {
    return (
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal soul-modal">
          <button className="modal-close" onClick={onClose}>×</button>
          <h2 className="section" style={{ marginTop: 0 }}>Soul Profile</h2>
          <p className="muted">Cast a chart first to reveal your soul profile.</p>
        </div>
      </div>
    );
  }

  const [c1] = profile.elementColors;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal soul-modal">
        <button className="modal-close" onClick={onClose}>×</button>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="soul-header">
          <div className="soul-avatar-col">
            <ManifestationAvatar chart={chart} profile={profile} size={210} />
            <div className="soul-archetype-tag" style={{ borderColor: c1, color: c1 }}>
              {profile.archetype}
            </div>
          </div>
          <div className="soul-title-col">
            {birth.label && <p className="muted" style={{ marginBottom: 4 }}>{birth.label}</p>}
            <h2 className="soul-type-name" style={{ color: c1 }}>{profile.soulType}</h2>
            <p className="soul-tagline">"{profile.tagline}"</p>
            <p className="soul-description">{profile.description}</p>
            <div className="soul-planet-badge">
              <span style={{ fontSize: 18, marginRight: 6 }}>{profile.dominantGlyph}</span>
              <span style={{ fontSize: 13, color: "var(--sepia)" }}>
                Most aspected: <b style={{ color: "var(--parchment)" }}>{profile.dominantPlanet}</b>
              </span>
            </div>
          </div>
        </div>

        {/* ── Frequency ───────────────────────────────────────────────── */}
        <div className="soul-section">
          <h3 className="soul-section-label">Your Frequency</h3>
          <div className="soul-frequency-text">
            {profile.frequency.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>

        {/* ── Life Themes ─────────────────────────────────────────────── */}
        <div className="soul-section">
          <h3 className="soul-section-label">Dominant Life Themes</h3>
          <div className="soul-themes-grid">
            {profile.lifeThemes.map((t) => (
              <div key={t.house} className="soul-theme-card">
                <div className="soul-theme-house" style={{ color: c1 }}>
                  {ORDINAL(t.house)} House
                </div>
                <div className="soul-theme-name">{t.theme}</div>
                <div className="soul-theme-planets muted">
                  {t.planets.slice(0, 4).join(" · ")}
                  {t.planets.length > 4 ? " …" : ""}
                </div>
                {isSupporter ? (
                  <div className="soul-theme-focus">{t.focus}</div>
                ) : (
                  <div className="soul-theme-focus locked" style={{ fontSize: 12 }}>
                    {t.focus.slice(0, 52)}…{" "}
                    <span className="lock-badge" style={{ cursor: "pointer" }} onClick={() => openSupport(true)}>
                      ✦ unlock
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Manifestation Portal ────────────────────────────────────── */}
        <div className="soul-section">
          <h3 className="soul-section-label">Manifestation Portal · North Node</h3>
          {isSupporter ? (
            <>
              <p className="soul-frequency-text" style={{ marginBottom: 14 }}>{profile.manifestation}</p>
              <label className="field" style={{ marginBottom: 0 }}>
                <span style={{ color: c1, letterSpacing: "0.06em", fontSize: 12 }}>
                  STATE YOUR INTENTION — what future happiness are you building toward?
                </span>
                <textarea
                  value={intention}
                  onChange={(e) => setIntention(e.target.value)}
                  placeholder="I am becoming someone who…"
                  rows={3}
                  style={{ resize: "vertical", lineHeight: 1.6, fontSize: 14 }}
                />
              </label>
              {intention && (
                <div className="soul-intention-echo" style={{ borderColor: c1 }}>
                  <span style={{ fontSize: 11, color: c1, display: "block", marginBottom: 4, letterSpacing: "0.06em" }}>
                    YOUR INTENTION IS WITNESSED
                  </span>
                  "{intention}"
                </div>
              )}
            </>
          ) : (
            <div className="soul-gate" onClick={() => openSupport(true)}>
              <div className="soul-gate-icon">☽</div>
              <div>
                <div style={{ color: "var(--gold-soft)", marginBottom: 4 }}>Manifestation Portal · Supporter Feature</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Access your North Node guidance and intention-setting space. Support the observatory to unlock.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Observatory Philosophy ───────────────────────────────────── */}
        <div className="soul-section" style={{ marginBottom: 0 }}>
          <button
            className="ghost"
            style={{ fontSize: 12, padding: "4px 10px", width: "auto", marginBottom: 10 }}
            onClick={() => setShowPhilosophy((v) => !v)}
          >
            {showPhilosophy ? "▲ hide" : "▼ The Observatory Perspective"}
          </button>
          {showPhilosophy && (
            <div className="soul-philosophy">
              {OBSERVATORY_PHILOSOPHY.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
