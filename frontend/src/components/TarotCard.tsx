// TarotCard.tsx — the interactive draw (session 25): a dealt card lands
// face-down and flips on tap, the way a spread is actually turned. This is
// presentation ONLY — the deal itself is the same seeded, parity-locked draw
// (`mt19937.ts` / `parity/tarot-draw.json`); nothing here touches the engine,
// fetches anything, or changes which card is where.
import React, { useEffect, useRef } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
  } catch {
    return false;
  }
};

// Tilt parallax: the phone's gyroscope leans a revealed card a few degrees.
// Deliberately modest: ±4°, damped, and OFF entirely under reduced motion.
// iOS gates deviceorientation behind a permission prompt — we never ask, so
// there it simply stays still; Android and desktop need no permission.
function useTiltParallax(hostRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof DeviceOrientationEvent === "undefined") return;
    if (prefersReducedMotion()) return;
    let raf = 0;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      // beta (front/back) and gamma (left/right), clamped to a whisper.
      const tx = Math.max(-4, Math.min(4, (e.beta - 40) / 10));
      const ty = Math.max(-4, Math.min(4, e.gamma / 10));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        host.style.setProperty("--tarot-tilt-x", `${tx.toFixed(2)}deg`);
        host.style.setProperty("--tarot-tilt-y", `${ty.toFixed(2)}deg`);
      });
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      cancelAnimationFrame(raf);
    };
  }, [hostRef]);
}

// The engraved back — inline SVG, no asset fetch, themed by currentColor so
// it follows the instrument's palette in both editions.
const CardBack: React.FC<{ position: string }> = ({ position }) => (
  <div className="tarot-back-face" aria-hidden="true">
    <svg viewBox="0 0 120 180" className="tarot-back-plate" role="presentation">
      <rect x="4" y="4" width="112" height="172" rx="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10" y="10" width="100" height="160" rx="5" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.7" />
      <circle cx="60" cy="90" r="34" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="60" cy="90" r="24" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.7" />
      {/* eight-pointed engraving star */}
      {[0, 45, 90, 135].map((deg) => (
        <line
          key={deg}
          x1="60" y1="52" x2="60" y2="128"
          stroke="currentColor" strokeWidth="0.6" opacity="0.8"
          transform={`rotate(${deg} 60 90)`}
        />
      ))}
      <circle cx="60" cy="90" r="4" fill="currentColor" opacity="0.9" />
      <text x="60" y="94" textAnchor="middle" fontSize="10" fill="var(--bg, #0b0b12)">✦</text>
    </svg>
    <span className="tarot-back-pos">{position}</span>
    <span className="tarot-back-hint">tap to turn</span>
  </div>
);

export const TarotCard: React.FC<{
  position: string;
  revealed: boolean;
  onReveal: () => void;
  children: React.ReactNode; // the card's face — the existing .arc-drawn body
}> = ({ position, revealed, onReveal, children }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  useTiltParallax(hostRef);

  return (
    <div
      ref={hostRef}
      className={`tarot-card ${revealed ? "is-revealed" : "is-facedown"}`}
    >
      <div className="tarot-flip">
        {/* `inert` keeps the face-down front's buttons (journal pad, copy)
            out of the tab order while it's hidden behind the back. */}
        <div className="tarot-face tarot-face--front" inert={!revealed || undefined}>
          {children}
        </div>
        {/* The back stays mounted so the 3D turn can animate; once revealed
            it faces away (backface-visibility) and stops taking clicks. It IS
            the reveal control, so a face-down card exposes exactly one
            interaction — the flip (one motion per intent). */}
        <button
          type="button"
          className="tarot-face tarot-face--back"
          aria-label={`Turn the ${position} card`}
          aria-hidden={revealed}
          tabIndex={revealed ? -1 : 0}
          onClick={revealed ? undefined : onReveal}
        >
          <CardBack position={position} />
        </button>
      </div>
    </div>
  );
};
