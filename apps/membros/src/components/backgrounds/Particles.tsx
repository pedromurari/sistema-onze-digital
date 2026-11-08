"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { PartnerTheme } from "@/types";

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Arredondado para evitar mismatch de hidratação: o navegador re-serializa
// estilos inline de alta precisão (CSSOM), o que diverge do número exato do JS.
function round(n: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

export function Particles({ theme }: { theme: PartnerTheme }) {
  const reduced = useReducedMotion();
  const config = theme.background_config as { speed?: number; opacity?: number; density?: number };
  const speed = config.speed ?? 0.5;
  const opacity = config.opacity ?? 0.5;
  const density = config.density ?? 50;

  const colors = [theme.primary_color, theme.secondary_color, theme.accent_color];

  const dots = useMemo(
    () =>
      Array.from({ length: density }, (_, i) => ({
        top: round(seededRandom(i * 1.7) * 100),
        left: round(seededRandom(i * 2.3 + 5) * 100),
        size: round(2 + seededRandom(i * 3.1 + 9) * 3, 2),
        color: colors[i % colors.length],
        duration: round(8 + seededRandom(i * 4.7) * 10, 2),
        delay: round(seededRandom(i * 5.9) * 6, 2),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [density]
  );

  return (
    <div className="absolute inset-0 overflow-hidden bg-neutral-950">
      {dots.map((dot, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: `${dot.top}%`,
            left: `${dot.left}%`,
            width: dot.size,
            height: dot.size,
          }}
        >
          <motion.span
            className="block h-full w-full rounded-full"
            style={{ background: dot.color, opacity }}
            animate={
              reduced
                ? undefined
                : { y: [0, -18, 0], opacity: [opacity * 0.3, opacity, opacity * 0.3] }
            }
            transition={{
              duration: dot.duration / speed,
              repeat: Infinity,
              ease: "easeInOut",
              delay: dot.delay,
            }}
          />
        </div>
      ))}
    </div>
  );
}
