"use client";

import { motion } from "framer-motion";

interface GridBackgroundProps {
  className?: string;
  variant?: "subtle" | "dense" | "hero";
  children?: React.ReactNode;
}

export function GridBackground({
  className = "",
  variant = "subtle",
  children,
}: GridBackgroundProps) {
  const gridSize = variant === "dense" ? "bg-grid-squares-dense" : "bg-grid-squares";

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      {/* Precision square grid pattern */}
      <div
        className={`pointer-events-none absolute inset-0 ${gridSize} opacity-95`}
        aria-hidden="true"
      />

      {/* Subtle radial mask so grid softly breathes at far edges */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,var(--ink-canvas)_98%)]"
        aria-hidden="true"
      />

      {/* Decorative architectural square accents */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <motion.div
          animate={{
            opacity: [0.35, 0.6, 0.35],
            scale: [1, 1.05, 1],
          }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-[12%] top-[18%] size-24 rounded-lg border border-bronze-500/15 bg-bronze-500/[0.02]"
        />
        <motion.div
          animate={{
            opacity: [0.2, 0.5, 0.2],
            scale: [1, 1.08, 1],
          }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute right-[15%] top-[45%] size-32 rounded-xl border border-bronze-500/12 bg-bronze-500/[0.015]"
        />
        <div className="absolute left-[8%] bottom-[20%] size-16 rounded-md border border-[var(--hairline)]" />
      </div>

      {children}
    </div>
  );
}

/** Micro architectural square markers for cards and badges */
export function SquareAccent({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block size-1.5 rounded-[1px] bg-bronze-500/70 ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Dynamic mouse-following radial illumination that softly highlights the
 * architectural square grid near the user's cursor.
 */
import { useEffect, useState } from "react";

export function InteractiveGridSpotlight() {
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  if (!mounted) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-30 transition-opacity duration-300"
      style={{
        background: `radial-gradient(550px circle at ${mousePos.x}px ${mousePos.y}px, rgba(203, 162, 95, 0.08), transparent 70%)`,
      }}
      aria-hidden="true"
    />
  );
}
