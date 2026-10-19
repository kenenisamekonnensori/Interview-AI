"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";

interface SpineNode {
  id: string;
  label: string;
  progress: number; // 0 to 1 scroll target
  title: string;
}

const SPINE_NODES: SpineNode[] = [
  { id: "hero", label: "01", progress: 0.05, title: "Live Audio Input" },
  { id: "differentiators", label: "02", progress: 0.20, title: "Duplex Latency" },
  { id: "voice-engine", label: "03", progress: 0.38, title: "Neural Synthesis" },
  { id: "tracks", label: "04", progress: 0.52, title: "Rubric Engine" },
  { id: "how-it-works", label: "05", progress: 0.68, title: "Adaptive Probe" },
  { id: "feedback", label: "06", progress: 0.82, title: "STAR Bar Scorecard" },
  { id: "cta", label: "07", progress: 0.95, title: "Ready For Onsite" },
];

/**
 * Connective Spine: An animated scroll-driven neural circuit beam that connects
 * every component on the landing page into a unified, living narrative.
 */
export function ConnectiveSpine() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    offset: ["start start", "end end"],
  });

  // Buttery spring smoothed progress
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 24,
    restDelta: 0.001,
  });

  // Calculate beam fill height
  const beamHeight = useTransform(smoothProgress, [0, 1], ["0%", "100%"]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-y-0 left-4 z-40 hidden w-12 lg:left-8 xl:left-12 lg:block"
      aria-hidden="true"
    >
      <div className="relative h-full w-full">
        {/* Background track rail */}
        <div className="absolute left-1/2 top-20 bottom-20 w-[1.5px] -translate-x-1/2 bg-[var(--hairline)]" />

        {/* Scroll-driven active glowing beam */}
        <motion.div
          style={{ height: beamHeight }}
          className="absolute left-1/2 top-20 w-[2px] -translate-x-1/2 bg-gradient-to-b from-bronze-400 via-bronze-500 to-teal-500 shadow-[0_0_12px_rgba(203,162,95,0.8)]"
        >
          {/* Animated data packet traveling with the tip */}
          <motion.div
            animate={{
              boxShadow: [
                "0 0 6px 2px rgba(203,162,95,0.6)",
                "0 0 16px 5px rgba(203,162,95,1)",
                "0 0 6px 2px rgba(203,162,95,0.6)",
              ],
              scale: [1, 1.25, 1],
            }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-0 left-1/2 size-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-bronze-500 shadow-md"
          />
        </motion.div>

        {/* Section Waypoint Nodes */}
        {SPINE_NODES.map((node) => {
          return (
            <SpineWaypoint
              key={node.id}
              node={node}
              scrollProgress={smoothProgress}
            />
          );
        })}
      </div>
    </div>
  );
}

function SpineWaypoint({
  node,
  scrollProgress,
}: {
  node: SpineNode;
  scrollProgress: ReturnType<typeof useSpring>;
}) {
  // Check active state when scroll passes node threshold
  const isActive = useTransform(scrollProgress, (val) => val >= node.progress);

  return (
    <div
      style={{ top: `${node.progress * 88 + 8}%` }}
      className="group pointer-events-auto absolute left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
      title={`${node.label} // ${node.title}`}
    >
      {/* Concentric pulse ring */}
      <motion.div
        animate={{
          scale: [1, 1.6, 1],
          opacity: [0.3, 0.8, 0.3],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: node.progress * 2 }}
        className="absolute -inset-1.5 rounded-full border border-bronze-500/30"
      />

      {/* Center node pip */}
      <div className="relative flex size-6 items-center justify-center rounded-full border border-bronze-500/40 bg-[var(--ink-canvas)] shadow-sm transition-all duration-300 group-hover:scale-125 group-hover:border-bronze-500 group-hover:shadow-[0_0_10px_rgba(203,162,95,0.5)]">
        <span className="font-mono text-[9px] font-bold text-bronze-700">
          {node.label}
        </span>
      </div>

      {/* Floating telemetry tooltip on hover */}
      <div className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--hairline)] bg-white/95 px-2.5 py-1 text-[11px] font-medium text-[var(--ink-text)] opacity-0 shadow-lg backdrop-blur-md transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-1">
        <span className="font-mono text-bronze-600 mr-1.5">{node.label}</span>
        {node.title}
      </div>
    </div>
  );
}

/**
 * Animated SVG connecting circuit beam that links two related UI elements
 * with pulsing signal packets moving along the wire.
 */
export function AnimatedConnectionPath({
  className = "",
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden="true">
      <svg
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        preserveAspectRatio="none"
      >
        <line
          x1={orientation === "horizontal" ? "0%" : "50%"}
          y1={orientation === "horizontal" ? "50%" : "0%"}
          x2={orientation === "horizontal" ? "100%" : "50%"}
          y2={orientation === "horizontal" ? "50%" : "100%"}
          stroke="rgba(45, 35, 25, 0.12)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <motion.line
          x1={orientation === "horizontal" ? "0%" : "50%"}
          y1={orientation === "horizontal" ? "50%" : "0%"}
          x2={orientation === "horizontal" ? "100%" : "50%"}
          y2={orientation === "horizontal" ? "50%" : "100%"}
          stroke="url(#beam-gradient)"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: [0, 1, 1],
            pathOffset: [0, 0, 1],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <defs>
          <linearGradient id="beam-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#cba25f" stopOpacity="0" />
            <stop offset="50%" stopColor="#dcbd7e" stopOpacity="1" />
            <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
