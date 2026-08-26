// FieldPanel.tsx — chapter V's "Field" tab: the whole chart as one sound.
//
// The Torus tab sounds a PAIR, and its interval is the aspect. This sounds all
// fourteen canonical bodies at once — the thing the resonarium engine was built
// to produce and which nothing had yet played, because until session 37 the
// engine was not even importable from the frontend.
//
// Everything is on-device and consumes the PERSISTED SoundtrackSpec: the seed
// is identity, so this surface plays a stored field and never mints one.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { trackEvent } from "../api/client";
import { getSoundtrack } from "../lib/soundtrackStore";
import {
  beatHzToBpm,
  beatingPairs,
  fieldVoices,
  PITCH_NAMES,
  pitchClassOf,
  resonariumState,
  type FieldVoice,
} from "../lib/natalField";
import { FieldVoicePlayer, fieldAudioSupported } from "../lib/fieldAudio";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
  } catch {
    return false;
  }
};

export const FieldPanel: React.FC = () => {
  const chart = useStore((s) => s.chart);
  const birth = useStore((s) => s.birth);
  const setMargin = useStore((s) => s.setMargin);

  const [sounding, setSounding] = useState(false);
  const [solo, setSolo] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const playerRef = useRef<FieldVoicePlayer | null>(null);

  const stored = useMemo(
    () => (chart ? getSoundtrack(birth, chart) : null),
    [birth, chart]
  );
  const present = useMemo(
    () => new Set(stored?.seed_keys ?? []),
    [stored]
  );
  const voices = useMemo(
    () => (stored ? fieldVoices(stored.spec.bedrock_hz, present) : []),
    [stored, present]
  );
  const beats = useMemo(() => beatingPairs(voices), [voices]);
  const bpm = stored ? beatHzToBpm(stored.spec.binaural.beat_hz) : 0;

  const stop = useCallback(() => {
    setSounding(false);
    setSolo(null);
    const p = playerRef.current;
    playerRef.current = null;
    void p?.stop();
  }, []);

  // Autoplay policy: the context is built inside this handler and nowhere else.
  const start = useCallback(async () => {
    if (!stored || !voices.length) return;
    setErr(null);
    try {
      const p = await FieldVoicePlayer.start(voices, stored.spec.binaural);
      if (!p) { setErr("This device has no Web Audio."); return; }
      playerRef.current = p;
      setSounding(true);
      trackEvent("field_sound");
    } catch (e) {
      setErr(String(e));
    }
  }, [stored, voices]);

  useEffect(() => () => { void playerRef.current?.stop(); playerRef.current = null; }, []);

  const toggleSolo = (i: number) => {
    const next = solo === i ? null : i;
    setSolo(next);
    const p = playerRef.current;
    if (!p) return;
    if (next === null) p.unsolo(voices);
    else p.solo(next);
  };

  const showVoice = (v: FieldVoice, i: number) => {
    toggleSolo(i);
    const pc = PITCH_NAMES[pitchClassOf((Math.log2(v.hz / 110) * 180) % 360)];
    setMargin({
      title: `${v.glyph} ${v.label} · ${v.hz.toFixed(1)} Hz`,
      subtitle: `pitch class ${pc}${v.crowd > 0 ? ` · ${v.crowd} close neighbour${v.crowd > 1 ? "s" : ""}` : " · alone in its register"}`,
      chips: [
        `mix ${(v.gain * 100).toFixed(0)}%`,
        v.crowd > 0 ? "crowded" : "clear",
      ],
      body: [
        `The bedrock map sends a longitude to a drone: 110 · 2^(λ/180) Hz, one octave every 180°. That makes 15° of zodiac exactly one semitone, and one whole sign a whole tone — the same fact the aspect table states as its 200-cent grid, seen from the absolute side.`,
        v.crowd > 0
          ? `${v.label} shares its neighbourhood with ${v.crowd} other bod${v.crowd > 1 ? "ies" : "y"}, so it sits back in the mix. Nothing is removed: the crowd is meant to be heard as one textured mass, and the beating between its members is the sound of a conjunction in the low register.`
          : `${v.label} stands alone in its part of the register, so it carries full weight and reads as a pitch rather than a texture.`,
      ],
    });
  };

  const exportState = () => {
    if (!stored) return;
    const state = resonariumState(stored.spec.seed32, stored.spec.binaural, voices);
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resonarium-state-${stored.spec.seed_hex}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    trackEvent("field_export");
  };

  if (!chart) {
    return <p className="arc-empty">Cast a chart first — the field is its fourteen bodies sounding at once.</p>;
  }
  if (!stored || voices.length === 0) {
    return <p className="arc-empty">This chart carries no drones the seed recognises.</p>;
  }

  const lo = voices.reduce((a, v) => (v.hz < a.hz ? v : a), voices[0]);
  const hi = voices.reduce((a, v) => (v.hz > a.hz ? v : a), voices[0]);

  return (
    <div>
      <div className="arc-draw-controls">
        {fieldAudioSupported() && (
          <button
            className="arc-draw-btn"
            onClick={() => (sounding ? stop() : void start())}
            aria-pressed={sounding}
          >
            {sounding ? "◼ Stop the field" : "♪ Sound the natal field"}
          </button>
        )}
        <button className="arc-draw-btn" onClick={exportState}>
          ⤓ Export for SPINE
        </button>
      </div>

      <p className="arc-ondevice">
        {sounding && (
          <span className={prefersReducedMotion() ? undefined : "torus-sound-pulse"} aria-hidden="true">◉{" "}</span>
        )}
        ☾ computed on your device — {voices.length} drones, {lo.hz.toFixed(0)}–{hi.hz.toFixed(0)} Hz
        {sounding && <> · arriving one at a time over {FieldVoicePlayer.entryDurationS(voices.length).toFixed(0)}s</>}
      </p>

      {err && <p className="arc-error">{err}</p>}

      <div className="arc-draw-controls" style={{ flexWrap: "wrap", gap: "0.35rem" }}>
        {voices.map((v, i) => (
          <button
            key={v.key}
            className={`arc-draw-btn ${solo === i ? "is-active" : ""}`}
            onClick={() => showVoice(v, i)}
            title={`${v.label} — ${v.hz.toFixed(1)} Hz, mix ${(v.gain * 100).toFixed(0)}%`}
            style={{ opacity: solo === null || solo === i ? 1 : 0.45 }}
          >
            {v.glyph} {v.hz.toFixed(0)}
          </button>
        ))}
      </div>
      {sounding && (
        <p className="arc-themes">
          Tap a body to solo it — fourteen voices at once is a mass, and soloing is how you find one inside it.
        </p>
      )}

      <p className="arc-themes" style={{ marginTop: "0.6rem" }}>
        The map is exponential — equal steps in longitude are equal steps in
        <b> cents</b>, not in Hz — so the bottom of the range is always the crowded
        end. <b>The low register is where conjunctions are heard as beating; the
        high register is where they are heard as pitch.</b> Where the chart crowds,
        each voice steps back so the crowd reads as one texture rather than a smear.
      </p>

      {beats.length > 0 ? (
        <>
          <p className="arc-themes">
            <b>{beats.length}</b> pair{beats.length > 1 ? "s" : ""} close enough to beat rather than chord:
          </p>
          {beats.map((p) => (
            <div key={`${p.a.key}-${p.b.key}`} className="arc-day">
              <div className="arc-day-head">
                <span className="arc-day-date">{p.a.glyph} {p.a.label} · {p.b.glyph} {p.b.label}</span>
                <span className="arc-day-transit">{p.beatHz.toFixed(2)} Hz</span>
              </div>
              <p className="arc-day-action">
                one pulse every {p.periodS.toFixed(1)}s — {p.a.hz.toFixed(1)} against {p.b.hz.toFixed(1)} Hz
              </p>
            </div>
          ))}
        </>
      ) : (
        <p className="arc-themes">
          No pair in this chart sits close enough to beat — every body reads as its
          own pitch.
        </p>
      )}

      <p className="arc-themes" style={{ marginTop: "0.6rem" }}>
        <b>Export for SPINE</b> writes a <code>resonarium.state.v2</code> file that
        beatmI's <b>LOAD TWIN</b> already reads: the drones become its carriers, the
        binaural beat rate becomes its <b>tempo</b> ({stored.spec.binaural.beat_hz.toFixed(2)} Hz
        → <b>{bpm.toFixed(1)} BPM</b>), and the seed becomes its generator seed
        (<code>{stored.spec.seed32}</code>). Your chart fixes the tones and the tempo;
        your intention fixes which take you get — it is the only input that moves the
        seed, and it never moves a drone.
      </p>
    </div>
  );
};
