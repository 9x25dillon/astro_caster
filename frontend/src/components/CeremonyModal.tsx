// CeremonyModal.tsx — ritual multi-step birth data entry.
// Replaces the "tax form" experience with something ceremonial.
import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
// Lazy for the same reason as Controls: the picker pulls in the map + gazetteer.
const LocationPicker = React.lazy(() =>
  import("./LocationPicker").then((m) => ({ default: m.LocationPicker }))
);
import { checkOffsetAgainstLongitude, resolveOffset } from "@astra/core";
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
  // Tracks the unknown-birth-time escape hatch, so the note can switch from
  // offering noon to explaining what using it means.
  const [noonUsed, setNoonUsed] = useState(false);
  // TZ-2: the birthplace's IANA zone, once we know it. `null` means we don't,
  // and the visitor's own ±h entry stands untouched — the previous code filled
  // this gap with the browser's CURRENT offset, which is the bug being closed.
  const [zone, setZone] = useState<string | null>(null);

  const set = (fields: Partial<BirthInput>) =>
    setDraft((d) => ({ ...d, ...fields }));

  // TZ-2 — resolve the offset from the ZONE at the BIRTH MOMENT.
  //
  // The bug this closes: `tz_offset` was seeded from the browser's current
  // offset, so a July birth entered in January (or any birth before a zone
  // changed its rules) was cast an hour or more wrong. Nothing errored — the
  // wheel simply described a different sky, which is the worst kind of wrong
  // for this product.
  //
  // Recomputed on every date/time change, not just on city pick, because the
  // right answer depends on both: the same city gives a different offset in
  // June than in December, and a different one again in 1979 than in 2026.
  const resolution = useMemo(() => {
    if (!zone) return null;
    try {
      return resolveOffset(
        { year: draft.year, month: draft.month, day: draft.day, hour: draft.hour, minute: draft.minute },
        zone,
        draft.lng,
      );
    } catch {
      return null; // an unknown zone must not break the ceremony
    }
  }, [zone, draft.year, draft.month, draft.day, draft.hour, draft.minute, draft.lng]);

  // TZ-3: the typed-offset guard. Only meaningful when the reader typed the
  // offset themselves — a zone-resolved one is right by construction, and
  // warning about it would be the app arguing with its own resolver.
  const offsetWarning = useMemo(
    () => (zone ? null : checkOffsetAgainstLongitude(draft.tz_offset, draft.lng)),
    [zone, draft.tz_offset, draft.lng]
  );

  useEffect(() => {
    if (!resolution) return;
    setDraft((d) => (d.tz_offset === resolution.hours ? d : { ...d, tz_offset: resolution.hours }));
  }, [resolution]);

  // Track E-1: the ceremony is entered by choice, so it must be leaveable the
  // same way. Capture phase + stopImmediatePropagation so Esc means exactly
  // "close this" and doesn't ALSO fire the App's chapter-home handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || casting) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, casting]);

  // Geolocate when the user REACHES the location step — not on mount. A
  // mount-time request meant a permission prompt at first paint back when this
  // opened itself (bad first impression for a privacy-first app, and a
  // Lighthouse best-practices deduction). It is entered by choice now, but the
  // rule stands: ask at the step that needs it.
  useEffect(() => {
    if (step !== 2) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        // TZ-2: take the device's IANA ZONE NAME, never its current offset. The
        // offset is today's DST state; the zone is a rule set that can be
        // evaluated at the birth moment instead (see the resolver effect below).
        // Guessing the birthplace from where you stand now is still a guess —
        // but it is a guess the visitor can see and correct, and the arithmetic
        // on top of it is right.
        setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
        setDraft((d) => ({ ...d, lat: parseFloat(lat.toFixed(4)), lng: parseFloat(lng.toFixed(4)) }));
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
                    aria-invalid={offsetWarning?.level === "invalid" || undefined}
                    className={offsetWarning && offsetWarning.level !== "ok" ? "tz-suspect" : undefined}
                    onChange={(e) => { setZone(null); set({ tz_offset: Number(e.target.value) }); }} />
                </label>
              </div>
              {offsetWarning && offsetWarning.level !== "ok" && (
                <p className={`tz-warning tz-warning--${offsetWarning.level}`} role="status">
                  {offsetWarning.message}
                </p>
              )}
              {/* TZ-2 disclosure. The project's posture is never to be silently
                  clever, so a resolution that did something non-obvious — took
                  the first of a doubled hour, moved a nonexistent one forward,
                  or fell back to local mean time — says so in plain words. */}
              {zone && (
                <p className="dim" style={{ fontSize: 11, margin: "6px 0 0" }}>
                  {resolution?.note
                    ? resolution.note
                    : `Resolved from ${zone} for ${draft.year} — historical rules included.`}
                  {resolution?.kind === "lmt" && resolution.zoneAlternativeHours !== undefined && (
                    <>
                      {" "}
                      <button
                        className="ghost"
                        style={{ width: "auto", padding: "1px 7px", fontSize: 11 }}
                        onClick={() => { setZone(null); set({ tz_offset: resolution.zoneAlternativeHours! }); }}
                      >
                        use {resolution.zoneAlternativeHours >= 0 ? "+" : ""}
                        {resolution.zoneAlternativeHours}h instead
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>

            {/* E-1b: the privacy claim belongs HERE, at the most private field
                we ever ask for, not on an arrival banner nobody was anxious at
                yet. It is also unusually strong and literally true — the
                deterministic engine runs in this browser. */}
            {/* Accuracy matters more here than warmth: this is the claim the
                privacy policy has to underwrite, made at the moment somebody
                types the most private thing we ask for. The chart is computed
                on the SERVER by default (POST /api/generate-chart), so
                "never leaves this browser" was false. What IS true — and
                enforced by tests — is that nothing is retained. */}
            <p className="ceremony-privacy">
              Your birth details are used to draw your chart and then let go:
              never saved to a database, never written to a log. The same
              astronomy also runs inside this browser, which is why the
              observatory keeps working with no connection at all.
            </p>

            {/* E-1b: the unknown-birth-time escape hatch. A large share of
                people do not know their minute, and until now that stopped them
                dead at this field. Say what noon costs, then let them past. */}
            <p className="ceremony-unknown">
              {noonUsed ? (
                <>
                  Using <b>noon</b>. Everything but the houses and the rising
                  sign still holds — the planets barely move in a day.
                </>
              ) : (
                <>
                  Don't know the exact time?{" "}
                  <button
                    type="button"
                    className="ceremony-noon"
                    onClick={() => { set({ hour: 12, minute: 0 }); setNoonUsed(true); }}
                  >
                    Use noon
                  </button>{" "}
                  — everything but the houses and the rising sign still holds.
                </>
              )}
            </p>

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
                      onChange={(lat, lng, tz) => {
                        set({ lat, lng });
                        // Only a gazetteer pick carries a zone. A bare map click
                        // leaves the previous one alone rather than guessing.
                        if (tz) setZone(tz);
                      }}
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
