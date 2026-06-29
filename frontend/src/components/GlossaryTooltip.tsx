// GlossaryTooltip.tsx — hover tooltip for astrological terms. Free for all users.
import React, { useRef, useState } from "react";
import { getEntry } from "../lib/glossary";

interface Props {
  term: string;
  children: React.ReactNode;
}

export const GlossaryTooltip: React.FC<Props> = ({ term, children }) => {
  const entry = getEntry(term);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!entry) return <>{children}</>;

  const show = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = rect.right + 10;
    const y = rect.top - 4;
    // flip left if too close to right edge
    if (x + 260 > window.innerWidth) x = rect.left - 268;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPos({ x: Math.max(8, x), y: Math.max(8, y) }), 220);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPos(null);
  };

  return (
    <>
      <span className="gloss-trigger" onMouseEnter={show} onMouseLeave={hide}>
        {children}
      </span>
      {pos && (
        <div className="gloss-bubble" style={{ left: pos.x, top: pos.y }}>
          <div className="gloss-bubble-term">
            {entry.glyph && <span style={{ marginRight: 5 }}>{entry.glyph}</span>}
            {entry.term}
          </div>
          <div className="gloss-bubble-short">{entry.short}</div>
        </div>
      )}
    </>
  );
};
