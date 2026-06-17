/**
 * Lightweight confetti burst — canvas-based particle system.
 * Fires once on mount, auto-clears after animation completes.
 * No external deps, <2KB gzipped.
 */
import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  shape: "circle" | "rect";
}

const COLORS = [14, 40, 200, 280, 330]; // warm + cool hues spaced apart
const COUNT = 60;

export function Confetti({ onDone }: { onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const particles: Particle[] = [];
    const now = performance.now();

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    for (let i = 0; i < COUNT; i++) {
      const hue = COLORS[Math.floor(Math.random() * COLORS.length)];
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6;
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 80,
        y: canvas.height * 0.4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2 - Math.random() * 4,
        life: 0,
        maxLife: 1.2 + Math.random() * 1.8,
        size: 5 + Math.random() * 7,
        hue,
        shape: Math.random() > 0.5 ? "circle" : "rect",
      });
    }

    let last = now;
    function tick(t: number) {
      if (!running) return;
      const dt = Math.min((t - last) / 1000, 0.1);
      last = t;

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      let alive = false;
      for (const p of particles) {
        p.life += dt;
        if (p.life > p.maxLife) continue;
        alive = true;

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 3 * dt; // gravity
        p.vx *= 0.99;

        const alpha = 1 - p.life / p.maxLife;
        const scale = 1 - p.life / p.maxLife * 0.4;
        const size = p.size * scale;

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.life * 4);
        ctx!.globalAlpha = alpha;
        ctx!.fillStyle = `hsl(${p.hue}, 70%, 60%)`;

        if (p.shape === "circle") {
          ctx!.beginPath();
          ctx!.arc(0, 0, size / 2, 0, Math.PI * 2);
          ctx!.fill();
        } else {
          ctx!.fillRect(-size / 2, -size / 2, size, size);
        }

        ctx!.restore();
      }

      if (alive) {
        requestAnimationFrame(tick);
      } else {
        onDone?.();
      }
    }

    requestAnimationFrame(tick);

    return () => {
      running = false;
    };
  }, [onDone]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[100]"
      aria-hidden
    />
  );
}
