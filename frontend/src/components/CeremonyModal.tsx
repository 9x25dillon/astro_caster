// CeremonyModal.tsx — ritual multi-step birth data entry.
// Replaces the "tax form" experience with something ceremonial.
import React, { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
// Lazy for the same reason as Controls: leaflet only loads on map open.
const LocationPicker = React.lazy(() =>
  import("./LocationPicker").then((m) => ({ default: m.LocationPicker }))
);
import type { BirthInput } from "../types";

const STEPS = [
  {
    heading: "The Observatory Opens",
    body: "Every birth moment is a map of the sky at the exact coordinates of your arrival into the world. Tell us when and where you came into being.",
  },
  {
    heading: "When did you arrive?",
    body: "The moment of your first breath holds the angular pattern of the celestial sphere — a map that is uniquely yours.",
  },
  {
    heading: "Where on Earth?",
    body: "The horizon line at your birthplace determines your Ascendant — the rising sign that shapes how you meet the world.",
  },
  {
    heading: "Name this chart",
    body: "Optional — helps if you keep multiple charts. Leave it blank and the sky still speaks.",
  },
];

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const fmtTime = (h: number, m: number) => {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
};

const BLANK: BirthInput = {
  year: 1990, month: 6, day: 15,
  hour: 12, minute: 0, second: 0,
  lat: 40.7128, lng: -74.0060,
  tz_offset: -5,
  house_system: "P", zodiac: "tropical", ayanamsha: 1,
  label: "",
};

interface Props {
  onClose: () => void;
}

export const CeremonyModal: React.FC<Props> = ({ onClose }) => {
  const setBirth = useStore((s) => s.setBirth);
  const generate = useStore((s) => s.generate);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<BirthInput>(BLANK);
  const [showMap, setShowMap] = useState(false);
  const [casting, setCasting] = useState(false);

  const set = (fields: Partial<BirthInput>) =>
    setDraft((d) => ({ ...d, ...fields }));

  // Geolocate when the user REACHES the location step — not on mount. The
  // ceremony auto-opens on first visit, so a mount-time request meant a
  // permission prompt at first paint (bad first impression for a
  // privacy-first app, and a Lighthouse best-practices deduction).
  useEffect(() => {
    if (step !== 2) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        // Rough UTC offset from the browser as a fallback for timezone.
        const tz_offset = -new Date().getTimezoneOffset() / 60;
        setDraft((d) => ({ ...d, lat: parseFloat(lat.toFixed(4)), lng: parseFloat(lng.toFixed(4)), tz_offset }));
      },
      () => undefined, // silently ignore denial
      { timeout: 5000 }
    );
  }, [step]);

  const cast = () => {
    setCasting(true);
    setBirth(draft);
    setTimeout(() => {
      generate();
      onClose();
    }, 600);
  };

  const datePreview = `${MONTH_NAMES[draft.month - 1]} ${draft.day}, ${draft.year}`;
  const timePreview = fmtTime(draft.hour, draft.minute);

  return (
    <div className="ceremony-overlay">
      <div className="ceremony-modal">
        {/* Progress dots */}
        <div className="ceremony-dots">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`ceremony-dot ${step >= i + 1 ? "done" : step === i && i > 0 ? "active" : i === 0 && step === 0 ? "" : ""}`}
              style={{
                opacity: i === 0 ? 0 : step > i ? 1 : step === i ? 0.9 : 0.25,
                background: step > i ? "var(--gold)" : step === i && i > 0 ? "var(--gold)" : "var(--rule)",
              }}
            />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="ceremony-step">
            <div className="ceremony-symbol">☿</div>
            <h2 className="ceremony-heading">{STEPS[0].heading}</h2>
            <p className="ceremony-body">{STEPS[0].body}</p>
            <div className="ceremony-actions">
              <button className="primary ceremony-btn" onClick={() => setStep(1)}>
                Begin ✦
              </button>
              <button className="ghost ceremony-btn-sm" onClick={onClose}>
                Skip, use controls
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Date & Time */}
        {step === 1 && (
          <div className="ceremony-step">
            <h2 className="ceremony-heading">{STEPS[1].heading}</h2>
            <p className="ceremony-body">{STEPS[1].body}</p>

            <div className="ceremony-preview">{datePreview} · {timePreview}</div>

            <div className="ceremony-field-group">
              <div className="ceremony-row">
                <label className="ceremony-field">
                  <span>Year</span>
                  <input type="number" value={draft.year}
                    onChange={(e) => set({ year: Number(e.target.value) })} />
                </label>
                <label className="ceremony-field">
                  <span>Month</span>
                  <select value={draft.month} onChange={(e) => set({ month: Number(e.target.value) })}>
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="ceremony-field">
                  <span>Day</span>
                  <input type="number" min={1} max={31} value={draft.day}
                    onChange={(e) => set({ day: Number(e.target.value) })} />
                </label>
              </div>
              <div className="ceremony-row">
                <label className="ceremony-field">
                  <span>Hour (0–23)</span>
                  <input type="number" min={0} max={23} value={draft.hour}
                    onChange={(e) => set({ hour: Number(e.target.value) })} />
                </label>
                <label className="ceremony-field">
                  <span>Minute</span>
                  <input type="number" min={0} max={59} value={draft.minute}
                    onChange={(e) => set({ minute: Number(e.target.value) })} />
                </label>
                <label className="ceremony-field">
                  <span>Timezone ±h</span>
                  <input type="number" step={0.25} value={draft.tz_offset}
                    onChange={(e) => set({ tz_offset: Number(e.target.value) })} />
                </label>
              </div>
            </div>

            <div className="ceremony-actions">
              <button className="ghost ceremony-btn-sm" onClick={() => setStep(0)}>← Back</button>
              <button className="primary ceremony-btn" onClick={() => setStep(2)}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 2: Location */}
        {step === 2 && (
          <div className="ceremony-step">
            <h2 className="ceremony-heading">{STEPS[2].heading}</h2>
            <p className="ceremony-body">{STEPS[2].body}</p>

            <div className="ceremony-field-group">
              <div className="ceremony-row">
                <label className="ceremony-field">
                  <span>Latitude</span>
                  <input type="number" step={0.0001} value={draft.lat}
                    onChange={(e) => set({ lat: Number(e.target.value) })} />
                </label>
                <label className="ceremony-field">
                  <span>Longitude</span>
                  <input type="number" step={0.0001} value={draft.lng}
                    onChange={(e) => set({ lng: Number(e.target.value) })} />
                </label>
              </div>
              <button
                className="ghost"
                style={{ fontSize: 12, padding: "4px 10px", width: "auto", marginTop: 4 }}
                onClick={() => setShowMap((v) => !v)}
              >
                {showMap ? "▲ hide map" : "⊕ pick on map"}
              </button>
              {showMap && (
                <div style={{ marginTop: 10 }}>
                  <React.Suspense fallback={<p className="dim" style={{ fontSize: 12 }}>summoning map…</p>}>
                    <LocationPicker
                      lat={draft.lat}
                      lng={draft.lng}
                      onChange={(lat, lng) => set({ lat, lng })}
                    />
                  </React.Suspense>
                </div>
              )}
            </div>

            <div className="ceremony-actions">
              <button className="ghost ceremony-btn-sm" onClick={() => setStep(1)}>← Back</button>
              <button className="primary ceremony-btn" onClick={() => setStep(3)}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 3: Name + Cast */}
        {step === 3 && (
          <div className="ceremony-step">
            <h2 className="ceremony-heading">{STEPS[3].heading}</h2>
            <p className="ceremony-body">{STEPS[3].body}</p>

            <div className="ceremony-field-group">
              <label className="ceremony-field" style={{ maxWidth: 340 }}>
                <span>Chart name</span>
                <input
                  type="text"
                  placeholder="Your name, or leave blank…"
                  value={draft.label}
                  onChange={(e) => set({ label: e.target.value })}
                  autoFocus
                />
              </label>

              <div className="ceremony-summary">
                <div className="ceremony-summary-row">
                  <span>Date</span><span>{datePreview}</span>
                </div>
                <div className="ceremony-summary-row">
                  <span>Time</span><span>{timePreview} (UTC {draft.tz_offset >= 0 ? "+" : ""}{draft.tz_offset}h)</span>
                </div>
                <div className="ceremony-summary-row">
                  <span>Place</span><span>{draft.lat.toFixed(3)}° N · {draft.lng.toFixed(3)}° E</span>
                </div>
              </div>
            </div>

            <div className="ceremony-actions">
              <button className="ghost ceremony-btn-sm" onClick={() => setStep(2)}>← Back</button>
              <button
                className={`primary ceremony-btn ${casting ? "casting" : ""}`}
                onClick={cast}
                disabled={casting}
              >
                {casting ? "Casting…" : "✶ Cast the Chart"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
