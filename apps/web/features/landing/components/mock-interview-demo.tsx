"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Mic, Play, RotateCcw, Sparkles, Square, Volume2, Cpu, CheckCircle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TiltCard } from "./tilt-card";

/* ─── Types ────────────────────────────────────────────────────────────── */

type SessionPhase = "idle" | "listening" | "thinking" | "answering" | "ended";

type Question = {
  role: string;
  badge: string;
  question: string;
  candidateAnswer: string;
  followUp: string;
  notes: string[];
};

/* ─── Demo scripts ─────────────────────────────────────────────────────── */

const QUESTION_STREAM: Question[] = [
  {
    role: "Senior Frontend Engineer",
    badge: "L5/Senior",
    question: "Tell me about a time you had to balance shipping speed against long-term maintainability.",
    candidateAnswer: "We cut our end-to-end integration test coverage to hit the Q3 payment launch deadline two weeks early...",
    followUp: "You mentioned cutting test coverage to hit the deadline — what was the first failure mode in production, and how did you explain that trade-off to stakeholders?",
    notes: [
      "STAR structure: 92% (succinct context, clear first-person ownership)",
      "Technical Depth: Identified second-order failure boundaries accurately",
      "Pacing Drill: Trim setup context by ~10 seconds next round",
    ],
  },
  {
    role: "Staff Backend Engineer",
    badge: "L6/Staff",
    question: "Design an API rate limiter that must handle 200,000 requests/sec with multi-region consistency.",
    candidateAnswer: "I chose a token bucket algorithm stored in Redis clusters with asynchronous replication...",
    followUp: "When Redis replica lag reaches 400ms during cross-region network partitions, how do you prevent paying users from being throttled incorrectly?",
    notes: [
      "Distributed rigor: Addressed partition tolerance and blast radius",
      "Quantified trade-offs: Token bucket vs sliding window log evaluated cleanly",
      "Poise: Remained calm and methodical when challenged on replica lag",
    ],
  },
  {
    role: "Lead Product Manager",
    badge: "Group PM",
    question: "Weekly user retention dropped 14% after your onboarding redesign. Walk me through your first 48 hours.",
    candidateAnswer: "I segmented the funnel drop-off by acquisition channel, hypothesized friction at the team-invite step...",
    followUp: "If the data confirms the invite step caused the drop, do you roll back entirely or ship an emergency unblocking patch in 24 hours? Walk me through that decision.",
    notes: [
      "Executive communication: Led with metric hypothesis within 30 seconds",
      "Prioritization: Balanced user trust against engineering velocity",
      "Follow-up: Defended rollback strategy with revenue-impact data",
    ],
  },
];

export function MockInterviewDemo() {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [turn, setTurn] = useState(0);
  const [typed, setTyped] = useState("");
  const [thinkingStep, setThinkingStep] = useState(0);

  const question = QUESTION_STREAM[questionIndex]!;

  // Audio waveform levels generator
  const [waveLevels, setWaveLevels] = useState<number[]>(() =>
    Array.from({ length: 24 }, () => Math.random() * 0.5 + 0.1)
  );

  useEffect(() => {
    if (phase !== "listening" && phase !== "answering") return;
    const interval = setInterval(() => {
      setWaveLevels(Array.from({ length: 24 }, () => Math.random() * 0.75 + 0.25));
    }, 110);
    return () => clearInterval(interval);
  }, [phase]);

  // Stepped thinking simulation
  useEffect(() => {
    if (phase !== "thinking") return;
    setThinkingStep(0);
    const t1 = setTimeout(() => setThinkingStep(1), 500);
    const t2 = setTimeout(() => setThinkingStep(2), 1000);
    const t3 = setTimeout(() => {
      setPhase("answering");
    }, 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase]);

  // Typewriter effect for AI voice answer
  useEffect(() => {
    if (phase !== "answering") {
      setTyped("");
      return;
    }
    const fullText = question.followUp;
    let i = 0;
    const interval = setInterval(() => {
      i += 2;
      setTyped(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(interval);
      }
    }, 28);
    return () => clearInterval(interval);
  }, [phase, question.followUp]);

  const startSession = () => {
    setPhase("listening");
    setTurn(0);
  };

  const submitAnswer = () => {
    setPhase("thinking");
    setTurn(1);
  };

  const endSession = () => {
    setPhase("ended");
  };

  const switchRole = (idx: number) => {
    setQuestionIndex(idx);
    setPhase("idle");
    setTurn(0);
  };

  return (
    <TiltCard tiltAngle={4} glareOpacity={0.12}>
      <div className="glass-panel group relative overflow-hidden rounded-3xl border border-[var(--hairline)] p-6 sm:p-7 shadow-2xl">
        {/* Precision architectural corner ticks */}
        <span className="absolute left-3.5 top-3.5 font-mono text-[9px] text-bronze-600/60 select-none">┌</span>
        <span className="absolute right-3.5 top-3.5 font-mono text-[9px] text-bronze-600/60 select-none">┐</span>
        <span className="absolute left-3.5 bottom-3.5 font-mono text-[9px] text-bronze-600/60 select-none">└</span>
        <span className="absolute right-3.5 bottom-3.5 font-mono text-[9px] text-bronze-600/60 select-none">┘</span>

        {/* Studio Deck Header Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
              <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
              LIVE DUPLEX // &lt;280ms
            </span>
            <span className="font-mono text-[11px] text-[var(--ink-text-muted)]">
              48kHz OPUS AUDIO
            </span>
          </div>

          {/* Quick role switcher tabs */}
          <div className="flex items-center rounded-lg border border-[var(--hairline)] bg-[var(--ink-canvas)] p-1 text-[11px] font-mono">
            {QUESTION_STREAM.map((q, idx) => (
              <button
                key={q.role}
                type="button"
                onClick={() => switchRole(idx)}
                className={`rounded px-2 py-0.5 transition-all ${
                  questionIndex === idx
                    ? "bg-white text-bronze-900 font-bold shadow-xs"
                    : "text-[var(--ink-text-muted)] hover:text-[var(--ink-text)]"
                }`}
              >
                {q.role.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Console Body Viewport */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--ink-text-muted)]">
            <span>TARGET ROLE: {question.role.toUpperCase()}</span>
            <span className="text-bronze-700 font-bold">TURN 0{turn + 1} OF 03</span>
          </div>

          <div className="mt-3.5 min-h-[220px] rounded-2xl border border-[var(--hairline)] bg-white/80 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
            {/* 1. IDLE STATE */}
            {phase === "idle" && (
              <div className="flex flex-1 flex-col items-center justify-center text-center py-4">
                <div className="grid size-12 place-items-center rounded-2xl bg-bronze-500/10 text-bronze-700 shadow-sm">
                  <Mic className="size-6" />
                </div>
                <h4 className="mt-4 text-base font-bold text-[var(--ink-text)]">
                  Live voice interview simulator
                </h4>
                <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-[var(--ink-text-secondary)]">
                  The AI asks questions, listens to your verbal trade-offs, and interrupts when claims are vague.
                </p>
                <button
                  type="button"
                  onClick={startSession}
                  className="btn-primary mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-semibold shadow-md"
                >
                  <Play className="size-3.5 fill-current" />
                  Start Interactive Voice Demo
                </button>
              </div>
            )}

            {/* 2. LISTENING STATE */}
            {phase === "listening" && (
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-bronze-700">
                    <span>INTERVIEWER QUESTION</span>
                    <span className="live-dot font-semibold">LISTENING TO YOU</span>
                  </div>
                  <p className="mt-2 text-base font-semibold leading-relaxed text-[var(--ink-text)]">
                    &ldquo;{question.question}&rdquo;
                  </p>
                </div>

                <div className="my-5 rounded-xl border border-[var(--hairline)] bg-[var(--ink-canvas)]/60 p-4">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--ink-text-muted)]">
                    <span>MICROPHONE INPUT (SIMULATED)</span>
                    <span className="font-semibold text-teal-700">LIVE AUDIO BUFFER: 98.4% CLARITY</span>
                  </div>

                  {/* 24-Bar Frequency Equalizer */}
                  <div className="mt-3 flex h-10 items-end justify-between gap-1">
                    {waveLevels.map((lvl, i) => (
                      <div
                        key={i}
                        className="w-full rounded-xs bg-gradient-to-t from-teal-700 to-teal-500 transition-all duration-100"
                        style={{ height: `${lvl * 100}%` }}
                      />
                    ))}
                  </div>

                  <p className="mt-3 text-xs italic text-[var(--ink-text-secondary)]">
                    &ldquo;{question.candidateAnswer}&rdquo;
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={submitAnswer}
                    className="btn-primary inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold"
                  >
                    Finish speaking
                    <ArrowRight className="size-3.5" />
                  </button>
                  <span className="font-mono text-[10px] text-[var(--ink-text-faint)]">
                    AI probes trade-offs automatically
                  </span>
                </div>
              </div>
            )}

            {/* 3. THINKING / REASONING STATE */}
            {phase === "thinking" && (
              <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                <div className="relative size-12">
                  <div className="absolute inset-0 rounded-full border-2 border-bronze-500/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-bronze-500 border-t-transparent animate-spin" />
                  <Cpu className="absolute inset-0 m-auto size-5 text-bronze-700" />
                </div>

                <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider text-bronze-800">
                  Adaptive Reasoning Engine Active
                </p>

                <div className="mt-3 space-y-1.5 font-mono text-xs text-[var(--ink-text-secondary)]">
                  <p className={thinkingStep >= 0 ? "text-emerald-700 font-medium" : "text-slate-400"}>
                    ✓ Transcribed speech buffer (Nova-2 48kHz)
                  </p>
                  <p className={thinkingStep >= 1 ? "text-emerald-700 font-medium" : "text-slate-400"}>
                    ✓ Identified trade-off: cut test coverage without risk bounds
                  </p>
                  <p className={thinkingStep >= 2 ? "text-bronze-700 font-bold animate-pulse" : "text-slate-400"}>
                    → Formulating unscripted follow-up probe...
                  </p>
                </div>
              </div>
            )}

            {/* 4. ANSWERING / ADAPTIVE PROBE STATE */}
            {phase === "answering" && (
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-teal-800">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Volume2 className="size-3.5" />
                      AI INTERVIEWER FOLLOW-UP (VOICE SYNTHESIS)
                    </span>
                    <span className="rounded bg-teal-500/10 px-2 py-0.5 text-[10px] text-teal-800 font-medium">
                      UNSCRIPTED PROBE
                    </span>
                  </div>

                  <p className="mt-3 text-base font-semibold leading-relaxed text-[var(--ink-text)]">
                    {typed}
                    <span className="ml-1 inline-block h-4 w-[2px] bg-bronze-600 animate-pulse align-middle" />
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline)] pt-4">
                  <button
                    type="button"
                    onClick={endSession}
                    className="btn-primary inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold"
                  >
                    View Scorecard & Feedback
                    <ArrowRight className="size-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setPhase("listening")}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-text-muted)] hover:text-bronze-700 transition-colors"
                  >
                    <RotateCcw className="size-3" />
                    Answer follow-up out loud
                  </button>
                </div>
              </div>
            )}

            {/* 5. SESSION ENDED / NOTES */}
            {phase === "ended" && (
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-[var(--ink-text-muted)]">
                    <span>COACH DEBRIEF // COMMITTEE BAR</span>
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-800 font-bold">
                      STRONG HIRE (92%)
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {question.notes.map((note, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 rounded-xl border border-[var(--hairline)] bg-white/70 p-3 text-xs text-[var(--ink-text-secondary)]"
                      >
                        <CheckCircle className="size-4 shrink-0 text-emerald-600 mt-0.5" />
                        <span>{note}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-[var(--hairline)] pt-3">
                  <Link
                    href="/sign-up"
                    className="btn-primary inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold"
                  >
                    Practice with your real resume
                    <ArrowRight className="size-3" />
                  </Link>

                  <button
                    type="button"
                    onClick={startSession}
                    className="font-mono text-xs text-[var(--ink-text-muted)] hover:text-bronze-700 transition-colors"
                  >
                    Restart demo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer telemetry status line */}
        <div className="mt-4 flex items-center justify-between font-mono text-[10px] text-[var(--ink-text-faint)]">
          <span>REAL-TIME VOICE PIPELINE</span>
          <span>STAR RIGOR CHECKED</span>
          <span>NO CREDIT CARD REQUIRED</span>
        </div>
      </div>
    </TiltCard>
  );
}
