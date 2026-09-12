import React, { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  r: number;
  baseOpacity: number;
  twinkle: boolean;
  phase: number;
  speed: number;
}

export const Starfield: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let rafId = 0;
    let stars: Star[] = [];

    const seed = (w: number, h: number) => {
      stars = [];
      const n = Math.round((w * h) / 5500); // ~360 on 1440p, ~220 on 1080p
      for (let i = 0; i < n; i++) {
        const rand = Math.random();
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          // size tiers: tiny (most), medium, bright (rare)
          r: rand < 0.62 ? 0.4 : rand < 0.88 ? 0.85 : 1.5,
          baseOpacity: 0.1 + Math.random() * 0.62,
          twinkle: Math.random() < 0.28,
          phase: Math.random() * Math.PI * 2,
          speed: 0.35 + Math.random() * 1.1,
        });
      }
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      seed(canvas.width, canvas.height);
      restart();
    };

    let t = 0;
    const draw = () => {
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);

      for (const s of stars) {
        const op = s.twinkle && !motion.matches
          ? s.baseOpacity * (0.4 + 0.6 * Math.sin(t * s.speed + s.phase))
          : s.baseOpacity;

        // Core star dot
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(228,215,185,${op.toFixed(3)})`;
        ctx.fill();

        // Soft halo for bright stars only
        if (s.r >= 1.5) {
          const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
          grad.addColorStop(0, `rgba(201,180,140,${(op * 0.3).toFixed(3)})`);
          grad.addColorStop(1, "rgba(201,180,140,0)");
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      t += 0.013;
      if (!motion.matches && !document.hidden) rafId = requestAnimationFrame(draw);
    };

    // Canvas motion must honor the same preference as CSS, including changes
    // made while the app is open. Hidden documents do no decorative work.
    const restart = () => {
      cancelAnimationFrame(rafId);
      if (!document.hidden) draw();
    };

    resize();
    window.addEventListener("resize", resize);
    motion.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      motion.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", restart);
    };
  }, []);

  return (
    <canvas
      aria-hidden="true"
      ref={ref}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
};
