"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, CheckCircle2, Mic, Timer, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { TiltCard } from "./tilt-card";

type Metric = {
  icon: typeof Activity;
  label: string;
  value: number;
  suffix: string;
  delta: string;
};

/**
 * World-Class Hiring Committee Feedback Report:
 * Designed like an authentic silicon-valley calibration debrief sheet:
 * - Readiness Bar Conic Ring with smooth spring interpolator
 * - Committee Recommendation Tag (STRONG HIRE · L6 STAFF)
 * - Transcript Quote Breakdown with Real-Time Annotation Pills
 * - Immediate Actionable Drills for Onsite Preparation
 */
export function FeedbackPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "-60px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const metrics: Metric[] = [
    { icon: Activity, label: "STAR Structure", value: 89, suffix: "%", delta: "+14% vs avg" },
    { icon: Mic, label: "Technical Rigor", value: 92, suffix: "%", delta: "Senior bar met" },
    { icon: Timer, label: "Pacing & Delivery", value: 86, suffix: "%", delta: "142 wpm optimal" },
  ];

  return (
    <TiltCard tiltAngle={4} glareOpacity={0.1}>
      <div
        ref={ref}
        className="glass-panel relative overflow-hidden rounded-3xl border border-[var(--hairline)] p-7 sm:p-9 shadow-xl"
      >
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

        {/* Ambient warm champagne glow */}
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-bronze-500/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-40 w-40 rounded-full bg-teal-500/8 blur-3xl" />

        <div className="relative">
          {/* Header Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hairline)] pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-bronze-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-bronze-800">
                  REPORT_ID // SR-4902-L6
                </span>
                <span className="font-mono text-xs text-[var(--ink-text-muted)]">
                  Senior Distributed Systems Engineer
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-[var(--ink-text)]">
                Debrief & Candidate Calibration Packet
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="size-3.5" />
                COMMITTEE: STRONG HIRE
              </span>
            </div>
          </div>

          {/* Overall score ring & 3 Core Dimension Cards */}
          <div className="mt-8 flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:gap-10">
            <ScoreRing value={inView ? 91 : 0} />

            <div className="grid flex-1 gap-4 sm:grid-cols-3">
              {metrics.map(({ icon: Icon, label, value, suffix, delta }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-[var(--hairline)] bg-white/80 p-4.5 shadow-sm transition-all hover:border-bronze-500/30"
                >
                  <div className="flex items-center justify-between text-[var(--ink-text-muted)]">
                    <span className="text-[11px] font-mono font-semibold uppercase tracking-wide">
                      {label}
                    </span>
                    <Icon className="size-3.5 text-bronze-600" aria-hidden="true" />
                  </div>
                  <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-[var(--ink-text)]">
                    {inView ? value : 0}
                    <span className="text-sm font-normal text-[var(--ink-text-muted)]">
                      {suffix}
                    </span>
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                    <TrendingUp className="size-3" />
                    <span>{delta}</span>
                  </div>
                  {/* Mini trend progress bar */}
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-bronze-600 to-teal-600"
                      initial={{ width: 0 }}
                      animate={{ width: inView ? `${value}%` : "0%" }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Real-time transcript excerpt with highlighted committee feedback */}
          <div className="mt-8 rounded-2xl border border-[var(--hairline)] bg-white/70 p-5">
            <div className="flex items-center justify-between text-xs font-mono text-[var(--ink-text-muted)]">
              <span>ANNOTATED TRANSCRIPT EXCERPT (TURN 02)</span>
              <span className="text-bronze-700 font-semibold">+18 STAR SCORE</span>
            </div>
            <p className="mt-2.5 text-sm italic leading-relaxed text-[var(--ink-text)]">
              &ldquo;...When our Kafka consumer group started lagging during peak batch ingestion,{" "}
              <mark className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-medium not-italic text-emerald-900">
                I partitioned by tenant_id instead of account_uuid
              </mark>
              , which dropped our p99 lag from{" "}
              <mark className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-medium not-italic text-emerald-900">
                4.2s to 120ms
              </mark>
              ...&rdquo;
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--ink-text-secondary)]">
              <span className="rounded-md border border-emerald-500/30 bg-emerald-50 px-2 py-0.5 text-emerald-800">
                ✓ First-person agency verified
              </span>
              <span className="rounded-md border border-emerald-500/30 bg-emerald-50 px-2 py-0.5 text-emerald-800">
                ✓ Hard metric impact quantified
              </span>
              <span className="rounded-md border border-blue-500/30 bg-blue-50 px-2 py-0.5 text-blue-800">
                ✓ Architecture trade-off anchored
              </span>
            </div>
          </div>

          {/* Strengths & Actionable Drills */}
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--hairline)] bg-white/70 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-text)]">
                <CheckCircle2 className="size-4 text-[var(--teal)]" aria-hidden="true" />
                Strengths & Competitive Highlights
              </p>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--ink-text-secondary)]">
                <li>
                  Demonstrated immediate poise when asked to defend DynamoDB vs PostgreSQL
                  partitioning
                </li>
                <li>Articulated second-order operational costs and replication lag cleanly</li>
                <li>Zero filler words recorded in the final 90 seconds of answer delivery</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-[var(--hairline)] bg-white/70 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-text)]">
                <Activity className="size-4 text-bronze-600" aria-hidden="true" />
                Target Drills Before Your Onsite
              </p>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--ink-text-secondary)]">
                <li>
                  Trim setup context by ~12 seconds: jump directly into the technical constraint
                </li>
                <li>When asked about failure modes, state blast radius boundaries explicitly</li>
                <li>
                  Practice drill #4: Multi-region failover under strict read-after-write consistency
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </TiltCard>
  );
}

/** Conic-gradient score ring with smooth animated value counter */
function ScoreRing({ value }: { value: number }) {
  const display = Math.round(value);
  return (
    <div className="relative grid size-36 shrink-0 place-items-center">
      <div
        className="absolute inset-0 rounded-full transition-[background] duration-1000 ease-out shadow-sm"
        style={{
          background: `conic-gradient(#b78a44 ${value}%, #0d9488 ${value * 0.9}%, rgba(45, 35, 25, 0.08) 0)`,
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-[11px] rounded-full bg-white shadow-inner flex flex-col items-center justify-center"
        aria-hidden="true"
      />
      <div className="relative text-center">
        <p className="font-mono text-3xl font-bold tracking-tight text-[var(--ink-text)]">
          {display}%
        </p>
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-bronze-700">
          Onsite Ready
        </p>
      </div>
    </div>
  );
}
