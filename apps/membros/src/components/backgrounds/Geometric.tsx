"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { PartnerTheme } from "@/types";

export function Geometric({ theme }: { theme: PartnerTheme }) {
  const reduced = useReducedMotion();
  const config = theme.background_config as { speed?: number; opacity?: number };
  const speed = config.speed ?? 0.35;
  const opacity = config.opacity ?? 0.4;

  const shapes = [
    { color: theme.primary_color, top: "5%", left: "-5%", size: 40, duration: 60, rotateFrom: 0 },
    { color: theme.accent_color, top: "60%", left: "70%", size: 30, duration: 45, rotateFrom: 45 },
    {
      color: theme.secondary_color,
      top: "35%",
      left: "40%",
      size: 22,
      duration: 50,
      rotateFrom: 20,
    },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden bg-neutral-950">
      {shapes.map((shape, i) => (
        <motion.div
          key={i}
          className="absolute border"
          style={{
            width: `${shape.size}vw`,
            height: `${shape.size}vw`,
            top: shape.top,
            left: shape.left,
            borderColor: shape.color,
            opacity,
            borderWidth: 1,
          }}
          animate={reduced ? undefined : { rotate: [shape.rotateFrom, shape.rotateFrom + 360] }}
          transition={{
            duration: shape.duration / speed,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 30%, transparent 0%, ${theme.primary_color}10 100%)`,
        }}
      />
    </div>
  );
}
