"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { PartnerTheme } from "@/types";

export function Orbs({ theme }: { theme: PartnerTheme }) {
  const reduced = useReducedMotion();
  const config = theme.background_config as { speed?: number; opacity?: number };
  const speed = config.speed ?? 0.4;
  const opacity = config.opacity ?? 0.6;

  const orbs = [
    { color: theme.primary_color, top: "8%", left: "15%", size: 22, duration: 14 },
    { color: theme.secondary_color, top: "65%", left: "70%", size: 30, duration: 18 },
    { color: theme.accent_color, top: "40%", left: "50%", size: 16, duration: 12 },
    { color: theme.primary_color, top: "75%", left: "20%", size: 18, duration: 16 },
    { color: theme.secondary_color, top: "15%", left: "75%", size: 14, duration: 20 },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden bg-neutral-950">
      {orbs.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-2xl"
          style={{
            width: `${orb.size}vw`,
            height: `${orb.size}vw`,
            top: orb.top,
            left: orb.left,
            background: orb.color,
            opacity,
          }}
          animate={reduced ? undefined : { y: [0, -30, 0], x: [0, 15, 0] }}
          transition={{
            duration: orb.duration / speed,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.6,
          }}
        />
      ))}
    </div>
  );
}
