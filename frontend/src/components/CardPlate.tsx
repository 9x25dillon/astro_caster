// CardPlate.tsx — a card's rendered image, wherever that card appears.
//
// A plate is paid for once (an oracle-tier image generation) and stored in the
// Gallery forever. Until now it was only ever visible in the Studio that made
// it. This is the shared display: the draw that prompted it, chapter II's
// reading, and the card of the day all show the same image, for free, offline,
// from the moment it exists.
//
// Showing a plate NEVER costs anything and never touches the network — the
// bytes are already on the device. Only the optional render affordance spends
// money, and it is deliberately a separate, explicit tap.
import React from "react";
import { usePlate } from "../lib/plateCache";

export const CardPlate: React.FC<{
  /** Tarot card id, e.g. "death" or "ace_of_cups". */
  cardId: string;
  cardName: string;
  /** Deck lineage on display; a plate from another lineage is used as a
   *  fallback rather than asking the reader to pay twice for one picture. */
  source?: string | null;
  /** Turned cards show their art turned — the same fact the chip states. */
  reversed?: boolean;
  /** Omit to show nothing when unrendered (a read-only surface). Supply it and
   *  an unrendered card offers to be painted. */
  onRender?: () => void;
  rendering?: boolean;
  /** Rendered width; the plate is square. */
  size?: number;
}> = ({ cardId, cardName, source, reversed, onRender, rendering, size = 168 }) => {
  const plate = usePlate(cardId, source);

  if (plate) {
    return (
      <img
        src={plate.dataUrl}
        alt={`${cardName} — rendered plate`}
        loading="lazy"
        className="arc-plate-img"
        style={{
          width: "100%",
          maxWidth: size,
          aspectRatio: "1 / 1",
          objectFit: "cover",
          borderRadius: 8,
          display: "block",
          margin: "6px auto",
          // A reversed card's art is turned with it. Not decoration: the chip
          // already says "reversed", and a picture that disagreed with the
          // label would be the thing a reader trusts least.
          transform: reversed ? "rotate(180deg)" : undefined,
        }}
      />
    );
  }

  if (!onRender) return null;

  return (
    <button
      type="button"
      className="arc-draw-btn"
      onClick={(e) => { e.stopPropagation(); onRender(); }}
      disabled={rendering}
      title={`Render a plate for ${cardName} — a paid image generation, kept forever`}
      style={{ margin: "6px auto", display: "block", fontSize: "0.72rem" }}
    >
      {rendering ? "Painting…" : "✶ Render this card"}
    </button>
  );
};
