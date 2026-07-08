// JournalPad.tsx — P1: the pen half of "shows you the pattern and hands you
// the pen". A small local-first composer: card-prompted pads overwrite in
// place (one reflection per card per session); freeform pads append.
import React, { useEffect, useState } from "react";
import { journalSave, type JournalEntry } from "../lib/bookshelf";

export const JournalPad: React.FC<{
  seed: string;
  position?: string | null;
  prompt?: string | null;
  cardName?: string | null;
  question?: string | null;
  existing?: JournalEntry | null;
  /** Freeform pads clear after save (they append); prompted pads keep text. */
  freeform?: boolean;
  onSaved?: (e: JournalEntry) => void;
}> = ({ seed, position, prompt, cardName, question, existing, freeform, onSaved }) => {
  const [open, setOpen] = useState(Boolean(existing));
  const [text, setText] = useState(existing?.text ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (existing) { setText(existing.text); setOpen(true); }
  }, [existing]);

  async function save() {
    if (!text.trim()) return;
    setState("saving");
    try {
      const e = await journalSave({
        seed, position: position ?? null, prompt: prompt ?? null,
        cardName: cardName ?? null, question: question ?? null,
        text: text.trim(),
      });
      setState("saved");
      onSaved?.(e);
      if (freeform) { setText(""); setOpen(false); }
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("idle");
    }
  }

  if (!open) {
    return (
      <button className="ghost jr-open" onClick={() => setOpen(true)}>
        ✎ {freeform ? "Add a reflection" : "Write"}
      </button>
    );
  }
  return (
    <div className="jr-pad">
      <textarea
        className="jr-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={prompt ? "Your answer stays on this device…" : "A reflection, kept on this device…"}
        rows={3}
      />
      <div className="jr-row">
        <button className="ghost jr-save" onClick={save} disabled={state === "saving" || !text.trim()}>
          {state === "saved" ? "✓ kept" : state === "saving" ? "…" : "Keep"}
        </button>
        <button className="ghost jr-cancel" onClick={() => setOpen(Boolean(existing))}>
          close
        </button>
      </div>
    </div>
  );
};
