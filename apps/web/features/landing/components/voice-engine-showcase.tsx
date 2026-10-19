"use client";

import { useState, useEffect } from "react";
import { Mic, Zap, Cpu, Volume2, ShieldCheck, CheckCircle2, ArrowRight, Activity, Terminal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionHeading } from "./section-heading";
import { FadeUp, StaggerContainer, StaggerItem } from "./animations";
import { TiltCard } from "./tilt-card";

const PIPELINE_STEPS = [
  {
    step: "01",
    title: "Streaming Voice Transcription",
    provider: "Deepgram Nova-2 (48kHz)",
    latency: "< 115ms",
    icon: Mic,
    desc: "Browser-direct WebSocket captures vocal cadence, pauses, and inflection with 98.4% transcription precision.",
    highlight: "Zero typed lag",
    payloadPreview: "WS_FRAME: { type: 'audio_stream', codec: 'opus', sample_rate: 48000, interim_results: true }",
  },
  {
    step: "02",
    title: "Adaptive Reasoning Engine",
    provider: "Gemini 2.5 Flash",
    latency: "< 165ms",
    icon: Cpu,
    desc: "Cross-references your target role and resume in real-time. Detects hand-waving and formulates unscripted follow-up probes.",
    highlight: "Non-scripted dialogue",
    payloadPreview: "PROBE_TRIGGER: { flag: 'vague_tradeoff', topic: 'cache_invalidation', action: 'probe_failure_mode' }",
  },
  {
    step: "03",
    title: "Dynamic Interruption Support",
    provider: "Deterministic State Machine",
    latency: "< 24ms",
    icon: Zap,
    desc: "Just like a seasoned hiring manager, the AI can interject if an answer goes off-track or asks for immediate architectural clarification.",
    highlight: "Natural turn-taking",
    payloadPreview: "DUPLEX_SIGNAL: { vad_threshold: 0.85, barge_in: true, mute_synthesizer: true, preserve_context: true }",
  },
  {
    step: "04",
    title: "Low-Latency Speech Synthesis",
    provider: "Neural Voice TTS",
    latency: "< 120ms",
    icon: Volume2,
    desc: "Synthesizes human-cadenced conversational speech so practice feels genuine, spontaneous, and conversational.",
    highlight: "Human conversational flow",
    payloadPreview: "AUDIO_OUT: { stream: 'chunked_pcm', duration_ms: 1840, natural_breathing_pause: true }",
  },
];

export function VoiceEngineShowcase() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % PIPELINE_STEPS.length);
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  const currentStep = PIPELINE_STEPS[activeStep]!;

  return (
    <section className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <FadeUp>
        <SectionHeading
          eyebrow="The Real-Time Voice Engine"
          title="Under 350ms total response latency. It feels like an actual phone screen."
          description="Most AI tools make you wait 3-5 seconds between messages. Interviewer AI streams conversational turns so fast your brain treats it as a real person in the room."
        />
      </FadeUp>

      {/* Latency benchmark telemetry HUD bar */}
      <FadeUp delay={0.15}>
        <div className="glass-panel mx-auto mt-12 flex max-w-4xl flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--hairline)] p-4 sm:px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="live-dot font-mono text-xs font-semibold uppercase tracking-wider text-[var(--teal)]">
              Voice Engine Telemetry
            </span>
          </div>

          <div className="flex items-center gap-6 font-mono text-xs text-[var(--ink-text-secondary)]">
            <span>
              End-to-End Latency:{" "}
              <strong className="font-semibold text-bronze-700">~285ms</strong>
            </span>
            <span className="hidden sm:inline text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="hidden sm:inline">
              Buffer Jitter: <strong className="font-semibold text-emerald-700">&lt; 3ms</strong>
            </span>
            <span className="hidden sm:inline text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="hidden sm:inline">
              Format: <strong className="font-semibold text-bronze-700">Opus 48kHz</strong>
            </span>
          </div>
        </div>
      </FadeUp>

      {/* Interactive 4-step pipeline grid with connective data conduits */}
      <div className="relative mt-10">
        <StaggerContainer className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" staggerDelay={0.1}>
          {PIPELINE_STEPS.map((item, index) => {
            const Icon = item.icon;
            const isSelected = activeStep === index;

            return (
              <StaggerItem key={item.step}>
                <TiltCard tiltAngle={7} glareOpacity={0.12} className="h-full">
                  <div
                    onClick={() => setActiveStep(index)}
                    className={`group relative flex h-full cursor-pointer flex-col justify-between rounded-2xl border p-6 transition-all duration-300 ${
                      isSelected
                        ? "border-bronze-500/60 bg-white shadow-[0_16px_40px_-12px_rgba(183,138,68,0.25)] ring-1 ring-bronze-500/30"
                        : "border-[var(--hairline)] bg-white/75 hover:border-bronze-500/35 hover:bg-white"
                    }`}
                  >
                    {/* Active pulse aura */}
                    {isSelected && (
                      <motion.div
                        layoutId="active-step-glow"
                        className="pointer-events-none absolute -inset-px rounded-2xl border-2 border-bronze-500/50 shadow-[0_0_20px_rgba(203,162,95,0.35)]"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}

                    {/* Architectural corner square tag */}
                    <span
                      className={`absolute right-3.5 top-3.5 inline-block size-1.5 rounded-[1px] transition-colors ${
                        isSelected ? "bg-bronze-500 shadow-[0_0_6px_#cba25f]" : "bg-bronze-500/30"
                      }`}
                    />

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-bronze-600">
                          {item.step}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium transition-colors ${
                            isSelected
                              ? "bg-bronze-500/15 text-bronze-800 font-bold"
                              : "bg-[var(--muted)] text-[var(--ink-text-muted)]"
                          }`}
                        >
                          {item.latency}
                        </span>
                      </div>

                      <div
                        className={`mt-5 grid size-10 place-items-center rounded-xl transition-all ${
                          isSelected
                            ? "bg-bronze-500 text-white shadow-md shadow-bronze-500/30 scale-105"
                            : "bg-bronze-500/10 text-bronze-700 group-hover:bg-bronze-500/20"
                        }`}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </div>

                      <h3 className="mt-4 text-base font-semibold text-[var(--ink-text)]">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--ink-text-secondary)]">
                        {item.desc}
                      </p>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-[var(--hairline)] pt-3 text-[11px] font-medium text-bronze-700">
                      <span>{item.highlight}</span>
                      <span className="font-mono text-[10px] text-[var(--ink-text-muted)]">
                        {item.provider}
                      </span>
                    </div>
                  </div>
                </TiltCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>

      {/* Live Pipeline Step Inspector / Telemetry Terminal */}
      <FadeUp delay={0.25} className="mt-6">
        <div className="glass-panel rounded-2xl border border-[var(--hairline)] p-4 sm:p-5 font-mono text-xs shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-3">
            <span className="flex items-center gap-2 text-bronze-800 font-semibold">
              <Terminal className="size-3.5" />
              <span>STAGE INSPECTOR // STEP {currentStep.step}: {currentStep.title.toUpperCase()}</span>
            </span>
            <span className="text-[10px] text-[var(--ink-text-muted)]">
              STATE: STREAMING ACTIVE
            </span>
          </div>
          <div className="mt-3 text-[11px] text-[var(--ink-text-secondary)] overflow-x-auto whitespace-nowrap bg-[var(--ink-canvas)] p-3 rounded-lg border border-[var(--hairline)]">
            <span className="text-bronze-700 font-bold">&gt; </span>
            <code>{currentStep.payloadPreview}</code>
          </div>
        </div>
      </FadeUp>
    </section>
  );
}
