"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, CheckCircle2, Mic, Timer } from "lucide-react";

type Metric = {
  icon: typeof Activity;
  label: string;
  value: number;
  suffix: string;
};

/**
 * A composite preview of the post-interview feedback report.
 * Values count up when scrolled into view — communicates "structured,
 * quantitative feedback" without a real screenshot.
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
      { rootMargin: "-80px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const metrics: Metric[] = [
    { icon: Activity, label: "Communication", value: 87, suffix: "%" },
    { icon: Mic, label: "Technical depth", value: 74, suffix: "%" },
    { icon: Timer, label: "Answer pacing", value: 92, suffix: "%" },
  ];

  return (
    <div ref={ref} className="glass-panel relative overflow-hidden rounded-2xl p-6 sm:p-8">
      {/* Warm key light echoing the moon scene */}
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-bronze-500/12 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-16 h-40 w-40 rounded-full bg-bronze-400/8 blur-3xl" />

      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-text-muted)]">
            Feedback report — Senior Frontend Engineer
          </p>
          <span className="badge-live shrink-0">Completed</span>
        </div>

        {/* Overall score ring */}
        <div className="mt-7 flex flex-col items-center gap-7 sm:flex-row sm:items-center sm:gap-10">
          <ScoreRing value={inView ? 82 : 0} />

          <div className="grid flex-1 gap-4 sm:grid-cols-3">
            {metrics.map(({ icon: Icon, label, value, suffix }) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--hairline)] bg-[var(--ink-canvas)]/60 p-4"
              >
                <div className="flex items-center gap-2 text-[var(--ink-text-muted)]">
                  <Icon className="size-3.5" aria-hidden="true" />
                  <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold text-[var(--ink-text)]">
                  {value}
                  <span className="text-sm text-[var(--ink-text-muted)]">{suffix}</span>
                </p>
                {/* Mini trend bar */}
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-bronze-600 to-bronze-300 transition-[width] duration-1000 ease-out"
                    style={{ width: inView ? `${value}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Strengths + improvements, mirroring the real report structure */}
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--hairline)] bg-[var(--ink-canvas)]/60 p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--ink-text)]">
              <CheckCircle2 className="size-4 text-[var(--teal)]" aria-hidden="true" />
              Strengths
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
              <li>Consistent STAR structure across behavioral answers</li>
              <li>Quantified outcomes — latency numbers, adoption rates</li>
              <li>Handled the ambiguous follow-up without losing the thread</li>
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--hairline)] bg-[var(--ink-canvas)]/60 p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--ink-text)]">
              <Activity className="size-4 text-bronze-300" aria-hidden="true" />
              Work on next
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
              <li>Lead with the outcome; context can come second</li>
              <li>Reduce filler words under pressure — practice the 15-second opener</li>
              <li>Probe the trade-off before proposing a solution</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Conic-gradient score ring, animating from 0 when scrolled into view. */
function ScoreRing({ value }: { value: number }) {
  const display = Math.round(value);
  return (
    <div className="relative grid size-32 shrink-0 place-items-center">
      <div
        className="absolute inset-0 rounded-full transition-[background] duration-1000 ease-out"
        style={{
          background: `conic-gradient(var(--bronze) ${value}%, rgba(255,255,255,0.07) 0)`,
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-[10px] rounded-full bg-[var(--ink-raised)]"
        aria-hidden="true"
      />
      <div className="relative text-center">
        <p className="font-mono text-3xl font-semibold text-[var(--ink-text)]">{display}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-text-muted)]">
          Overall
        </p>
      </div>
    </div>
  );
}
