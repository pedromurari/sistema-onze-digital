"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { PartnerTheme } from "@/types";

export function Waves({ theme }: { theme: PartnerTheme }) {
  const reduced = useReducedMotion();
  const config = theme.background_config as { speed?: number; opacity?: number };
  const speed = config.speed ?? 0.5;
  const opacity = config.opacity ?? 0.5;

  const layers = [
    { color: theme.primary_color, y: "60%", duration: 26 / speed, dir: 1 },
    { color: theme.secondary_color, y: "72%", duration: 34 / speed, dir: -1 },
    { color: theme.accent_color, y: "84%", duration: 42 / speed, dir: 1 },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden bg-neutral-950">
      {layers.map((layer, i) => (
        <motion.svg
          key={i}
          viewBox="0 0 1200 300"
          preserveAspectRatio="none"
          className="absolute left-0 w-[200%]"
          style={{ top: layer.y, opacity }}
          animate={reduced ? undefined : { x: [0, -600 * layer.dir] }}
          transition={{ duration: layer.duration, repeat: Infinity, ease: "linear" }}
        >
          <path
            d="M0,150 C150,220 350,80 600,150 C850,220 1050,80 1200,150 L1200,300 L0,300 Z"
            fill={layer.color}
          />
        </motion.svg>
      ))}
    </div>
  );
}
