import type { SpeechDelivery } from "@interviewer-ai/types";
import { Activity, Gauge, Mic, Timer } from "lucide-react";

export function SpeechDeliveryCard({
  speechDelivery,
}: {
  speechDelivery?: SpeechDelivery | null | undefined;
}) {
  if (!speechDelivery) {
    return (
      <section className="rounded-3xl border border-white/[.08] bg-card/45 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Speech delivery & cadence</h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Timing data unavailable for this interview. Spoken delivery analytics require voice turns.
        </p>
      </section>
    );
  }

  const {
    overallWpm,
    fillerWordCounts,
    totalFillerWords,
    talkRatio,
    averageResponseLatencyMs,
  } = speechDelivery;

  const sortedFillers = Object.entries(fillerWordCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <section className="rounded-3xl border border-white/[.08] bg-card/45 p-5 sm:p-6" data-testid="speech-delivery-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Speech delivery & cadence</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted-foreground">
          Voice Delivery Diagnostics
        </span>
      </div>

      {/* 3-column metric row on desktop (lg/xl), wrapping cleanly on tablet/mobile */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Metric 1: WPM Gauge */}
        <div className="rounded-2xl border border-border bg-background/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-[.12em] text-muted-foreground">
              Speaking Pace
            </span>
            <Gauge className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {overallWpm !== null ? (
              <>
                <span className={`text-4xl font-semibold tracking-[-.05em] ${getPaceColor(overallWpm)}`}>
                  {overallWpm}
                </span>
                <span className="text-sm font-medium text-muted-foreground">WPM</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">N/A — timing data unavailable</span>
            )}
          </div>
          <p className="mt-2 text-xs font-medium text-muted-foreground">
            {getPaceDescription(overallWpm)}
          </p>
        </div>

        {/* Metric 2: Talk-to-Listen Ratio */}
        <div className="rounded-2xl border border-border bg-background/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-[.12em] text-muted-foreground">
              Talk-to-Listen Ratio
            </span>
            <Mic className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tracking-[-.03em]">
              {talkRatio.candidatePercentage}%
            </span>
            <span className="text-xs text-muted-foreground">
              Candidate {talkRatio.candidatePercentage}% / Interviewer {100 - talkRatio.candidatePercentage}%
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, talkRatio.candidatePercentage))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDurationMinutes(talkRatio.candidateDurationMs)} candidate speaking time
          </p>
        </div>

        {/* Metric 3: Response Latency */}
        <div className="rounded-2xl border border-border bg-background/30 p-4 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-[.12em] text-muted-foreground">
              Average Response Pause
            </span>
            <Timer className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {averageResponseLatencyMs !== null ? (
              <>
                <span className="text-3xl font-semibold tracking-[-.04em] text-foreground">
                  {(averageResponseLatencyMs / 1000).toFixed(1)}
                </span>
                <span className="text-sm font-medium text-muted-foreground">seconds</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">N/A — no turn pauses recorded</span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Average pause before answer onset
          </p>
        </div>
      </div>

      {/* Filler Words Breakdown */}
      <div className="mt-5 rounded-2xl border border-border bg-background/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Filler word frequency</h3>
          <span className="text-xs font-medium text-muted-foreground">
            Total count: {totalFillerWords}
          </span>
        </div>
        {sortedFillers.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {sortedFillers.map(([word, count]) => (
              <span
                key={word}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium"
              >
                <span className="text-foreground">{word}</span>
                <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                  {count}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Zero filler words detected. Clean, direct responses!
          </p>
        )}
      </div>
    </section>
  );
}

function getPaceColor(wpm: number | null): string {
  if (wpm === null) return "text-muted-foreground";
  if (wpm < 120) return "text-amber-500";
  if (wpm >= 120 && wpm <= 129) return "text-amber-400";
  if (wpm >= 130 && wpm <= 160) return "text-emerald-500";
  if (wpm >= 161 && wpm <= 170) return "text-amber-400";
  return "text-rose-500";
}

function getPaceDescription(wpm: number | null): string {
  if (wpm === null) return "Duration metrics unavailable";
  if (wpm < 120) return "Slow — consider picking up momentum (<120 WPM)";
  if (wpm >= 120 && wpm <= 129) return "Slightly below target (120–129 WPM)";
  if (wpm >= 130 && wpm <= 160) return "Ideal pace — clear and conversational (130–160 WPM)";
  if (wpm >= 161 && wpm <= 170) return "Slightly above target (161–170 WPM)";
  return "Fast — try pausing to aid listener comprehension (>170 WPM)";
}

function formatDurationMinutes(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
