"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Mic, Play, Square, Volume2 } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/* ─── Types ────────────────────────────────────────────────────────────── */

type SessionPhase = "idle" | "listening" | "thinking" | "answering" | "ended";

type Question = {
  role: string;
  question: string;
  /** The adaptive follow-up that proves the interviewer is actually listening. */
  followUp: string;
  notes: string[];
};

/* ─── Demo script ──────────────────────────────────────────────────────── */

const QUESTION_STREAM: Question[] = [
  {
    role: "Senior Frontend Engineer",
    question:
      "Tell me about a time you had to balance shipping speed against long-term maintainability.",
    followUp:
      "You mentioned cutting a testing layer to hit the deadline — what broke first, and how did you explain that trade-off to stakeholders?",
    notes: [
      "Strong structure — context, decision, outcome, in that order.",
      "Concrete example anchored the answer; no generic platitudes.",
      "Pacing dipped mid-answer; try trimming the setup by ~10 seconds.",
    ],
  },
  {
    role: "Product Manager",
    question:
      "Weekly retention dropped 15% after your onboarding change. Walk me through your investigation.",
    followUp:
      "If the funnel shows most users stalling on the second step, what do you ship first — and how do you validate it in a week?",
    notes: [
      "Opened with a hypothesis, not a data dump — exactly right.",
      "Missed one beat: quantify the metric before diagnosing it.",
      "Follow-up showed composure under pressure.",
    ],
  },
  {
    role: "Backend Engineer",
    question:
      "Design a public API that must survive sudden traffic spikes without degrading for paying users.",
    followUp:
      "You chose rate limiting over load shedding — walk me through what happens to free-tier users at 10× traffic.",
    notes: [
      "Clear reasoning from constraint → mechanism → trade-off.",
      "Consider naming the failure mode explicitly next time.",
      "Strong instinct for protecting paying users first.",
    ],
  },
];

/* ─── Hooks ────────────────────────────────────────────────────────────── */

/** Cycles a fake amplitude value so the waveform feels alive without mic access. */
function useSimulatedLevel(active: boolean) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    const startedAt = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = (now - startedAt) / 1000;
      // Layered sines read as "someone speaking" better than random noise.
      const value = (Math.sin(t * 6.1) * 0.5 + Math.sin(t * 9.7 + 1.3) * 0.3 + 0.55) * 0.9;
      setLevel(Math.min(1, Math.max(0.08, value)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return level;
}

/* ─── Component ────────────────────────────────────────────────────────── */

/**
 * Interactive landing demo: a bounded slice of the real product loop —
 * question → live listening → adaptive follow-up → coach's notes.
 * No microphone access; purely presentational.
 */
export function MockInterviewDemo() {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [sessionIndex, setSessionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [notes, setNotes] = useState<string[] | null>(null);
  const [turn, setTurn] = useState(0);

  const question = QUESTION_STREAM[questionIndex % QUESTION_STREAM.length] ?? QUESTION_STREAM[0]!;
  const listening = useSimulatedLevel(phase === "listening");

  // Restart the typewriter for each new interviewer turn.
  const fullText =
    phase === "answering" ? (showFollowUp ? question.followUp : question.question) : "";
  const [typed, setTyped] = useState("");
  const typeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== "answering" || !fullText) {
      setTyped("");
      return;
    }
    setTyped("");
    let i = 0;
    typeTimer.current = setInterval(() => {
      i += 1;
      setTyped(fullText.slice(0, i));
      if (i >= fullText.length && typeTimer.current) clearInterval(typeTimer.current);
    }, 22);
    return () => {
      if (typeTimer.current) clearInterval(typeTimer.current);
    };
  }, [phase, fullText]);

  const startSession = () => {
    setSessionIndex((n) => n + 1);
    setPhase("listening");
    setShowFollowUp(false);
    setNotes(null);
    setQuestionIndex((prev) => (prev + 1) % QUESTION_STREAM.length);
  };

  const endSession = () => {
    setPhase("ended");
    setNotes(question.notes);
  };

  const submitAnswer = () => {
    setPhase("thinking");
    setTurn((n) => n + 1);
    // Simulated reasoning latency before the adaptive follow-up arrives.
    setTimeout(() => {
      setShowFollowUp(true);
      setPhase("answering");
    }, 1400);
  };

  const waveform = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  return (
    <div className="glass-panel relative overflow-hidden rounded-2xl">
      {/* Warm key light from the top-right, matching the moon scene */}
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-bronze-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-16 h-40 w-40 rounded-full bg-bronze-400/8 blur-3xl" />

      <div className="relative">
        {/* Session header */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-5 py-3">
          <div className="flex min-w-0 items-center gap-3 text-sm">
            {phase === "idle" || phase === "ended" ? (
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-text-muted)]">
                Demo
              </span>
            ) : (
              <span className="live-dot shrink-0">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--teal)]">
                  Live
                </span>
              </span>
            )}
            <span className="truncate font-medium text-[var(--ink-text-secondary)]">
              {question.role}
            </span>
          </div>

          {phase !== "idle" && (
            <button
              type="button"
              onClick={endSession}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-text-muted)] transition-colors hover:text-[var(--ink-text)]"
            >
              <Square className="size-3" aria-hidden="true" />
              End session
            </button>
          )}
        </div>

        {/* Turn counter + question viewport */}
        <div className="px-5 pb-5 pt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-text-faint)]">
            Turn {turn + 1} of 3
          </p>

          <div className="mt-3 flex min-h-[168px] flex-col justify-center rounded-xl border border-[var(--hairline)] bg-[var(--ink-canvas)]/60 px-5 py-5 sm:min-h-[188px]">
            {phase === "idle" && (
              <div className="flex flex-col items-center text-center">
                <div className="grid size-11 place-items-center rounded-full bg-bronze-500/15">
                  <Mic className="size-5 text-bronze-300" aria-hidden="true" />
                </div>
                <p className="mt-4 text-sm font-medium text-[var(--ink-text)]">
                  A live interview, right here.
                </p>
                <p className="mt-1.5 max-w-[280px] text-xs leading-relaxed text-[var(--ink-text-secondary)]">
                  This is a recorded demo — no microphone needed. The real thing listens to you.
                </p>
                <button
                  type="button"
                  onClick={startSession}
                  className="btn-primary mt-5 inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm"
                >
                  <Play className="size-3.5 fill-current" aria-hidden="true" />
                  Play the demo
                </button>
              </div>
            )}

            {phase === "listening" && (
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-12 items-end gap-[3px]" aria-hidden="true">
                  {waveform.map((i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full bg-[var(--teal)]"
                      style={{
                        height: `${Math.max(12, 100 * Math.abs(Math.sin(listening * 3 + i * 0.55)))}%`,
                        opacity: 0.55 + 0.45 * Math.abs(Math.cos(listening * 2 + i * 0.4)),
                        transition: "height 90ms linear",
                      }}
                    />
                  ))}
                </div>
                <p className="text-center text-sm text-[var(--ink-text-secondary)]">
                  <span className="font-medium text-[var(--ink-text)]">
                    &ldquo;{question.question}&rdquo;
                  </span>
                </p>
                <button
                  type="button"
                  onClick={submitAnswer}
                  className="btn-ghost inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs"
                >
                  <Mic className="size-3.5" aria-hidden="true" />
                  Answer out loud
                </button>
              </div>
            )}

            {phase === "thinking" && (
              <div className="flex flex-col items-center gap-3.5">
                <div className="flex items-center gap-2.5 rounded-full border border-[var(--hairline)] bg-black/25 px-4 py-2">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="size-1.5 animate-pulse rounded-full bg-bronze-300"
                        style={{ animationDelay: `${i * 160}ms` }}
                      />
                    ))}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-text-secondary)]">
                    Analyzing your answer
                  </span>
                </div>
                <p className="text-center text-xs text-[var(--ink-text-muted)]">
                  The interviewer is forming a follow-up from what you actually said.
                </p>
              </div>
            )}

            {phase === "answering" && (
              <div className="flex items-start gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-bronze-500/15">
                  <Volume2 className="size-4 text-bronze-300" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--ink-text-muted)]">AI Interviewer</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ink-text)]">
                    {typed}
                    <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-bronze-300 align-middle" />
                  </p>
                  {!showFollowUp && typed.length >= fullText.length && (
                    <button
                      type="button"
                      onClick={submitAnswer}
                      className="btn-ghost mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs"
                    >
                      Finish answering
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </button>
                  )}
                  {showFollowUp && typed.length >= fullText.length && (
                    <button
                      type="button"
                      onClick={endSession}
                      className="btn-ghost mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs"
                    >
                      See session feedback
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {phase === "ended" && notes && (
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-text-muted)]">
                  Coach&rsquo;s notes
                </p>
                <ul className="mt-3 space-y-2">
                  {notes.map((note, i) => (
                    <li
                      key={note}
                      className="flex items-start gap-2.5 text-sm leading-relaxed text-[var(--ink-text-secondary)]"
                    >
                      <span
                        className="mt-[7px] size-1 shrink-0 rounded-full"
                        style={{ background: i === 2 ? "var(--teal)" : "var(--bronze)" }}
                        aria-hidden="true"
                      />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer strip */}
          <div
            className={cn(
              "mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-text-faint)]",
            )}
          >
            <span>Adaptive follow-ups</span>
            <span aria-hidden="true" className="text-bronze-500/60">
              ●
            </span>
            <span>Real-time scoring</span>
            <span aria-hidden="true" className="text-bronze-500/60">
              ●
            </span>
            <span>Instant report</span>
          </div>
        </div>

        {/* Post-session conversion */}
        {phase === "ended" && (
          <div className="border-t border-[var(--hairline)] px-5 py-4 text-center">
            <Link
              href="/sign-up"
              className="btn-primary inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm"
            >
              Do it for real — with your resume <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={startSession}
              className="ml-3 inline-flex h-10 items-center rounded-lg px-3 text-xs font-medium text-[var(--ink-text-muted)] transition-colors hover:text-[var(--ink-text)]"
            >
              Replay ({sessionIndex > 1 ? `session ${sessionIndex}` : "different role"})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
