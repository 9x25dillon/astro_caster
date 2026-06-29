// lib/speech.ts
// Astra's voice — two interchangeable engines behind one `speak()`:
//   • "browser"     Web Speech API (no key, offline, free)
//   • "elevenlabs"  premium neural voice via the backend /api/tts (needs key)
// If the ElevenLabs request fails for any reason, we transparently fall back to
// the browser voice so Astra always speaks.
import { useCallback, useEffect, useRef, useState } from "react";
import { getHealth, getTtsVoices, ttsSynthesize, type ElevenVoice } from "../api/client";
import { useStore } from "../store/useStore";

export type SpeechEngine = "browser" | "elevenlabs";

export const speechSupported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window;

/** Convert Astra's light markdown into natural spoken text (browser engine). */
export function speakableText(md: string): string {
  return md
    .replace(/^##\s*(.+)$/gm, "$1. ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^[-•]\s*/gm, ", ")
    .replace(/[#*_`>]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\.\.+/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function scoreVoice(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (v.lang.toLowerCase().startsWith("en")) s += 10;
  if (/en[-_]GB/i.test(v.lang)) s += 2;
  const name = v.name.toLowerCase();
  if (/(natural|neural|premium|enhanced|samantha|serena|jenny|aria|sonia|libby|google uk)/.test(name)) s += 6;
  if (/female|woman|samantha|serena|jenny|aria|sonia|libby|fiona|moira/.test(name)) s += 3;
  if (v.localService) s += 1;
  return s;
}

export function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}

export interface UseSpeech {
  // engines
  engine: SpeechEngine;
  setEngine: (e: SpeechEngine) => void;
  elevenAvailable: boolean;
  elevenVoices: ElevenVoice[];
  elevenVoiceId: string | null;
  setElevenVoiceId: (id: string) => void;
  // browser voices
  supported: boolean;
  voices: SpeechSynthesisVoice[];
  voiceURI: string | null;
  setVoiceURI: (uri: string) => void;
  // shared
  rate: number;
  setRate: (r: number) => void;
  speaking: boolean;
  loading: boolean; // fetching ElevenLabs audio
  speak: (text: string) => void;
  stop: () => void;
}

export function useSpeech(): UseSpeech {
  const supported = speechSupported();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [rate, setRate] = useState<number>(0.92);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);

  const [engine, setEngine] = useState<SpeechEngine>("browser");
  const [elevenAvailable, setElevenAvailable] = useState(false);
  const [elevenVoices, setElevenVoices] = useState<ElevenVoice[]>([]);
  const [elevenVoiceId, setElevenVoiceId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const reqIdRef = useRef(0); // guards against stale async audio

  // Lazily create the <audio> element (client-only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const a = new Audio();
    a.onplay = () => setSpeaking(true);
    a.onended = () => setSpeaking(false);
    a.onpause = () => setSpeaking(false);
    a.onerror = () => setSpeaking(false);
    audioRef.current = a;
    return () => {
      a.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  // Browser voices load asynchronously.
  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) {
        setVoices(v);
        setVoiceURI((cur) => cur ?? pickDefaultVoice(v)?.voiceURI ?? null);
      }
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [supported]);

  // Detect premium TTS once; if available, prefer it and load its voice list.
  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then(async (h) => {
        if (cancelled || !h.tts?.available) return;
        setElevenAvailable(true);
        setEngine("elevenlabs"); // premium by default when configured
        setElevenVoiceId((cur) => cur ?? h.tts.default_voice_id ?? null);
        try {
          const { voices: ev } = await getTtsVoices();
          if (!cancelled) setElevenVoices(ev);
        } catch {
          /* voice list is best-effort */
        }
      })
      .catch(() => {
        /* health unreachable -> stay on browser engine */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stop = useCallback(() => {
    reqIdRef.current++; // invalidate any in-flight synthesis
    if (supported) window.speechSynthesis.cancel();
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setSpeaking(false);
    setLoading(false);
  }, [supported]);

  const speakBrowser = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(speakableText(text));
      u.rate = rate;
      u.pitch = 1.0;
      const voice = voices.find((v) => v.voiceURI === voiceURI);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [supported, rate, voices, voiceURI]
  );

  const speak = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      stop();
      if (engine === "elevenlabs" && elevenAvailable) {
        const id = ++reqIdRef.current;
        setLoading(true);
        const entitlement = useStore.getState().entitlement;
        ttsSynthesize(text, elevenVoiceId, entitlement)
          .then((blob) => {
            if (id !== reqIdRef.current) return; // superseded by a newer request
            const a = audioRef.current;
            if (!a) throw new Error("no audio element");
            if (urlRef.current) URL.revokeObjectURL(urlRef.current);
            const url = URL.createObjectURL(blob);
            urlRef.current = url;
            a.src = url;
            a.playbackRate = rate; // honour the pace slider
            setLoading(false);
            return a.play();
          })
          .catch(() => {
            // Any failure (503/network/quota) -> graceful browser fallback.
            if (id !== reqIdRef.current) return;
            setLoading(false);
            speakBrowser(text);
          });
        return;
      }
      speakBrowser(text);
    },
    [engine, elevenAvailable, elevenVoiceId, rate, stop, speakBrowser]
  );

  return {
    engine,
    setEngine,
    elevenAvailable,
    elevenVoices,
    elevenVoiceId,
    setElevenVoiceId,
    supported,
    voices,
    voiceURI,
    setVoiceURI,
    rate,
    setRate,
    speaking,
    loading,
    speak,
    stop,
  };
}
