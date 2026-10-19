"use client";

import { useState, useEffect } from "react";
import { Mic, BrainCircuit, Gauge, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { TiltCard } from "./tilt-card";
import { SquareAccent } from "./grid-background";

/**
 * World-Class Asymmetric Bento Grid:
 * Replaces generic static cards with tactile, interactive mini-simulations:
 * 1. Spoken Audio Spectrogram & Voice Waveform Visualizer
 * 2. Unscripted Adaptive Decision Tree (probes hand-waving)
 * 3. Committee STAR Bar Radar & Scoring Breakdown
 */
export function AsymmetricBentoGrid() {
  const [activeTab, setActiveTab] = useState<"speaking" | "typing">("speaking");
  const [selectedBranch, setSelectedBranch] = useState<number>(0);

  // Simulated live audio wave levels
  const [audioLevels, setAudioLevels] = useState<number[]>(() =>
    Array.from({ length: 22 }, () => Math.random() * 0.6 + 0.2),
  );

  useEffect(() => {
    if (activeTab !== "speaking") return;
    const interval = setInterval(() => {
      setAudioLevels(Array.from({ length: 22 }, () => Math.random() * 0.75 + 0.25));
    }, 120);
    return () => clearInterval(interval);
  }, [activeTab]);

  const decisionBranches = [
    {
      claim: "“We cut the integration test suite to ship the payment overhaul 3 weeks earlier.”",
      flag: "Vague risk mitigation",
      probe:
        "“What was the first failure mode in production, and how did you explain that trade-off to the VP?”",
      rubricNote: "Tests accountability and executive communication under fire.",
    },
    {
      claim: "“I migrated our database to DynamoDB because our Postgres queries were too slow.”",
      flag: "Missing root-cause analysis",
      probe:
        "“Did you profile index locks or connection pooling first? What was your partition key access pattern?”",
      rubricNote: "Verifies technical depth vs architectural cargo-culting.",
    },
  ];

  return (
    <div className="mt-14 grid gap-6 md:grid-cols-12">
      {/* ── TILE 1: Large Feature Card (7 Columns) — Spoken vs Typed ──────── */}
      <div className="md:col-span-7">
        <TiltCard tiltAngle={5} glareOpacity={0.12} className="h-full">
          <div className="glass-panel group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-[var(--hairline)] p-7 sm:p-9 transition-all duration-300 hover:border-bronze-500/40">
            {/* Architectural corner tick marks */}
            <span className="absolute left-3.5 top-3.5 font-mono text-[9px] text-bronze-600/60 select-none">
              ┌
            </span>
            <span className="absolute right-3.5 top-3.5 font-mono text-[9px] text-bronze-600/60 select-none">
              ┐
            </span>
            <span className="absolute left-3.5 bottom-3.5 font-mono text-[9px] text-bronze-600/60 select-none">
              └
            </span>
            <span className="absolute right-3.5 bottom-3.5 font-mono text-[9px] text-bronze-600/60 select-none">
              ┘
            </span>

            <div>
              {/* Header metadata strip */}
              <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-bronze-500/10 text-bronze-700">
                    <Mic className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-bronze-800">
                    01 // Verbal Fluency Under Pressure
                  </span>
                </div>

                {/* Interactive mode toggle */}
                <div className="flex items-center rounded-lg border border-[var(--hairline)] bg-[var(--ink-canvas)] p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab("speaking")}
                    className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-all ${
                      activeTab === "speaking"
                        ? "bg-white text-bronze-800 shadow-sm"
                        : "text-[var(--ink-text-muted)] hover:text-[var(--ink-text)]"
                    }`}
                  >
                    Voice Audio
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("typing")}
                    className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-all ${
                      activeTab === "typing"
                        ? "bg-white text-bronze-800 shadow-sm"
                        : "text-[var(--ink-text-muted)] hover:text-[var(--ink-text)]"
                    }`}
                  >
                    Chatbot Text
                  </button>
                </div>
              </div>

              <h3 className="mt-6 text-xl font-bold tracking-tight text-[var(--ink-text)] sm:text-2xl">
                Spoken, not typed. Because you can&rsquo;t backspace in the room.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
                Chatbots let you edit sentences for 3 minutes before hitting enter. In a real
                onsite, interviewers judge your hesitation, pacing, and verbal structure. Train the
                verbal muscle.
              </p>

              {/* Dynamic Interactive Waveform Spectrogram Box */}
              <div className="mt-7 rounded-2xl border border-[var(--hairline)] bg-white/80 p-5 shadow-sm">
                <div className="flex items-center justify-between font-mono text-[11px] text-[var(--ink-text-muted)]">
                  <span className="flex items-center gap-2">
                    <span className="live-dot" />
                    <span>SPECTROGRAM // 48kHz STREAM</span>
                  </span>
                  <span className="font-bold text-bronze-700">
                    {activeTab === "speaking" ? "MIC ACTIVE · -14 dBFS" : "STATIC BUFFER"}
                  </span>
                </div>

                {/* Animated Frequency Equalizer Bars */}
                <div className="mt-5 flex h-20 items-end justify-between gap-1.5 px-2">
                  {audioLevels.map((lvl, i) => (
                    <motion.div
                      key={i}
                      className="w-full rounded-t-sm"
                      style={{
                        background:
                          activeTab === "speaking"
                            ? i > 15
                              ? "linear-gradient(to top, #cba25f, #0d9488)"
                              : "linear-gradient(to top, #b78a44, #dcbd7e)"
                            : "#cbd5e1",
                      }}
                      animate={{
                        height: activeTab === "speaking" ? `${lvl * 100}%` : "12%",
                        opacity: activeTab === "speaking" ? 0.9 : 0.4,
                      }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    />
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[var(--hairline)] pt-3 font-mono text-[10px] text-[var(--ink-text-faint)]">
                  <span>LATENCY: &lt; 285ms</span>
                  <span>CADENCE: 142 WPM (OPTIMAL)</span>
                  <span>FILLERS: 0 DETECTED</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-bronze-700">
              <span>Voice streaming trains verbal composure</span>
              <ArrowRight className="size-3.5" />
            </div>
          </div>
        </TiltCard>
      </div>

      {/* ── TILE 2: Adaptive Decision Tree (5 Columns) ────────────────────── */}
      <div className="md:col-span-5">
        <TiltCard tiltAngle={6} glareOpacity={0.12} className="h-full">
          <div className="glass-panel group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-[var(--hairline)] p-7 transition-all duration-300 hover:border-bronze-500/40">
            <SquareAccent className="absolute right-4 top-4" />

            <div>
              <div className="flex items-center gap-2.5 border-b border-[var(--hairline)] pb-4">
                <span className="grid size-9 place-items-center rounded-xl bg-bronze-500/10 text-bronze-700">
                  <BrainCircuit className="size-4" aria-hidden="true" />
                </span>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-bronze-800">
                  02 // Adaptive Probe Tree
                </span>
              </div>

              <h3 className="mt-6 text-xl font-bold tracking-tight text-[var(--ink-text)]">
                Unscripted follow-ups that challenge hand-waving.
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[var(--ink-text-secondary)]">
                The AI listens to the substance of your response and dynamically pulls the thread on
                vague claims.
              </p>

              {/* Interactive Branch Switcher */}
              <div className="mt-5 space-y-3">
                {decisionBranches.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedBranch(idx)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                      selectedBranch === idx
                        ? "border-bronze-500/60 bg-white shadow-sm ring-1 ring-bronze-500/30"
                        : "border-[var(--hairline)] bg-white/60 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="font-semibold text-bronze-700">Sample Claim #{idx + 1}</span>
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 font-medium">
                        {item.flag}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs italic text-[var(--ink-text-secondary)]">
                      {item.claim}
                    </p>

                    {selectedBranch === idx && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-3 border-t border-[var(--hairline)] pt-2.5 text-xs text-[var(--ink-text)]"
                      >
                        <p className="font-mono text-[10px] font-bold uppercase text-teal-700">
                          AI Follow-up Probe:
                        </p>
                        <p className="mt-1 font-medium">{item.probe}</p>
                        <p className="mt-2 text-[10px] font-mono text-[var(--ink-text-muted)]">
                          ↳ {item.rubricNote}
                        </p>
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[var(--hairline)] pt-3 text-[11px] font-medium text-bronze-700">
              <span>Zero predetermined scripts</span>
              <span className="font-mono text-[10px] text-[var(--ink-text-muted)]">
                Real-time reasoning
              </span>
            </div>
          </div>
        </TiltCard>
      </div>

      {/* ── TILE 3: Full Width Bottom Bento Bar — Committee STAR Bar Radar ── */}
      <div className="md:col-span-12">
        <TiltCard tiltAngle={4} glareOpacity={0.1} className="h-full">
          <div className="glass-panel group relative overflow-hidden rounded-3xl border border-[var(--hairline)] p-7 sm:p-8 transition-all duration-300 hover:border-bronze-500/40">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              {/* Left Column: Description */}
              <div className="lg:col-span-5">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-bronze-500/10 text-bronze-700">
                    <Gauge className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-bronze-800">
                    03 // Committee Evaluation Bar
                  </span>
                </div>

                <h3 className="mt-4 text-xl font-bold tracking-tight text-[var(--ink-text)] sm:text-2xl">
                  A standardized rubric you can actually train against.
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
                  Every answer is graded across STAR structure, trade-off conviction, and technical
                  depth. Track your growth across sessions with committee-grade consistency.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-800">
                    BAR: STRONG HIRE (L6 STAFF)
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-[var(--ink-text-secondary)] border border-[var(--hairline)]">
                    CALIBRATED VS 4,000+ INTERVIEWS
                  </span>
                </div>
              </div>

              {/* Right Column: Live Dimension Radar Bars */}
              <div className="lg:col-span-7">
                <div className="rounded-2xl border border-[var(--hairline)] bg-white/80 p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-3">
                    <span className="font-mono text-xs font-bold text-[var(--ink-text)]">
                      DIMENSION BREAKDOWN // LIVE RUBRIC
                    </span>
                    <span className="font-mono text-xs font-semibold text-emerald-700">
                      Overall: 92.4% / Top 5%
                    </span>
                  </div>

                  <div className="mt-4 space-y-4">
                    {[
                      {
                        label: "Situation & Task Framing",
                        score: 94,
                        detail: "Succinct context under 45s without data dump",
                      },
                      {
                        label: "Action Specificity",
                        score: 96,
                        detail: "Clear first-person ownership ('I chose', 'I executed')",
                      },
                      {
                        label: "Quantified Result & Impact",
                        score: 89,
                        detail: "Tied directly to p99 latency and dollar savings",
                      },
                      {
                        label: "Technical Trade-off Rigor",
                        score: 91,
                        detail: "Articulated second-order failure modes clearly",
                      },
                    ].map((row) => (
                      <div key={row.label}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[var(--ink-text)]">{row.label}</span>
                          <span className="font-mono font-bold text-bronze-700">{row.score}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${row.score}%` }}
                            transition={{ duration: 1.2, ease: "easeOut" }}
                            className="h-full rounded-full bg-gradient-to-r from-bronze-600 via-bronze-500 to-teal-600"
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--ink-text-muted)]">
                          {row.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TiltCard>
      </div>
    </div>
  );
}
