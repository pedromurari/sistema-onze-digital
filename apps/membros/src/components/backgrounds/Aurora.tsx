"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { PartnerTheme } from "@/types";

export function Aurora({ theme }: { theme: PartnerTheme }) {
  const reduced = useReducedMotion();
  const config = theme.background_config as { speed?: number; opacity?: number };
  const speed = config.speed ?? 0.6;
  const opacity = config.opacity ?? 0.55;
  const duration = 22 / speed;

  const blobs = [
    { color: theme.primary_color, top: "-10%", left: "-10%", size: 60 },
    { color: theme.secondary_color, top: "20%", left: "60%", size: 50 },
    { color: theme.accent_color, top: "55%", left: "10%", size: 55 },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden bg-neutral-950">
      {blobs.map((blob, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{
            width: `${blob.size}vw`,
            height: `${blob.size}vw`,
            top: blob.top,
            left: blob.left,
            background: blob.color,
            opacity,
          }}
          animate={
            reduced
              ? undefined
              : {
                  x: [0, 60, -30, 0],
                  y: [0, -40, 30, 0],
                  scale: [1, 1.15, 0.95, 1],
                }
          }
          transition={{
            duration: duration + i * 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
