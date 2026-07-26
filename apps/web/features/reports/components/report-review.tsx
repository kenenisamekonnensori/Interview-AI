"use client";

import type {
  ConversationTurn,
  EvidenceBackedFinding,
  InterviewEvaluation,
  ReportStatus,
} from "@interviewer-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUpRight, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";

type Report = {
  status: ReportStatus;
  summary: string | null;
  evaluation: InterviewEvaluation | null;
  hiringRecommendation: string | null;
  failureReason: string | null;
};
type Interview = {
  targetRole: string | null;
  interviewType: string;
  difficulty: string;
  conversation: { turns: ConversationTurn[] } | null;
};

export function ReportReview({ interviewId }: { interviewId: string }) {
  const client = useQueryClient();
  const report = useQuery({
    queryKey: ["report", interviewId],
    queryFn: () => apiClient<{ report: Report }>(`/api/v1/interviews/${interviewId}/report`),
    refetchInterval: (query) =>
      ["PENDING", "GENERATING"].includes(query.state.data?.report.status ?? "") ? 3_000 : false,
  });
  const interview = useQuery({
    queryKey: ["interview-review", interviewId],
    queryFn: () => apiClient<{ interview: Interview }>(`/api/v1/interviews/${interviewId}`),
  });
  const retry = useMutation({
    mutationFn: () =>
      apiClient(`/api/v1/interviews/${interviewId}/report/retry`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["report", interviewId] }),
  });
  if (report.isPending || interview.isPending) return <Loading />;
  if (report.error || interview.error || !report.data || !interview.data)
    return <Message text={errorMessage(report.error ?? interview.error)} />;
  const reportData = report.data.report;
  const interviewData = interview.data.interview;
  if (reportData.status === "FAILED")
    return (
      <Shell interview={interviewData}>
        <section className="mx-auto max-w-xl rounded-3xl border border-destructive/30 bg-destructive/10 p-7 text-center">
          <h1 className="text-xl font-semibold">Your interview is complete.</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {reportData.failureReason ?? "Your report needs another try before it can be shown."}
          </p>
          <Button className="mt-5" disabled={retry.isPending} onClick={() => retry.mutate()}>
            <RefreshCw className="size-4" />
            {retry.isPending ? "Retrying…" : "Retry report generation"}
          </Button>
          {retry.error ? (
            <p className="mt-3 text-sm text-destructive">{errorMessage(retry.error)}</p>
          ) : null}
        </section>
      </Shell>
    );
  if (reportData.status !== "READY" || !reportData.evaluation || !reportData.summary)
    return (
      <Shell interview={interviewData}>
        <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card/60 p-8 text-center">
          <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
          <h1 className="mt-4 text-xl font-semibold">Generating your feedback</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your transcript is saved. This page will update automatically when the evidence-based
            report is ready.
          </p>
        </section>
      </Shell>
    );
  return <Ready interview={interviewData} report={reportData} />;
}

function Ready({ interview, report }: { interview: Interview; report: Report }) {
  const evaluation = report.evaluation!;
  const turns = interview.conversation?.turns ?? [];
  const scores: Array<[string, number]> = [
    ["Technical", evaluation.technical.score],
    ["Communication", evaluation.communication.score],
    ["Confidence", evaluation.confidence.score],
    ["Problem solving", evaluation.problemSolving.score],
  ];
  const categories: Array<[string, typeof evaluation.technical]> = [
    ["Technical", evaluation.technical],
    ["Communication", evaluation.communication],
    ["Confidence", evaluation.confidence],
    ["Problem solving", evaluation.problemSolving],
    ...Object.entries(evaluation.categoryScores),
  ];
  return (
    <Shell interview={interview}>
      <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-3xl border border-white/[.08] bg-card/55 p-6 sm:p-8">
          <p className="eyebrow">Interview report</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">
            A clear picture of your practice.
          </h1>
          <p className="mt-5 text-sm leading-7 text-muted-foreground">{report.summary}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              className="inline-flex items-center gap-2 text-sm font-medium text-primary"
              href="#transcript"
            >
              Read transcript <ArrowDown className="size-4" />
            </a>
            <Link
              className="inline-flex items-center gap-1 text-sm font-medium text-primary"
              href="/interviews/new"
            >
              Start another interview <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
        <div className="rounded-3xl border border-primary/25 bg-primary/10 p-6">
          <p className="text-xs font-medium uppercase tracking-[.14em] text-primary">
            Hiring recommendation
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-.04em]">
            {recommendation(report.hiringRecommendation)}
          </p>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Practice feedback grounded in this transcript, not a real hiring decision.
          </p>
        </div>
      </section>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Score label="Overall" score={evaluation.overallScore} />
        {scores.map(([label, score]) => (
          <Score key={label} label={label} score={score} />
        ))}
      </section>
      <section className="mt-7 grid gap-5 lg:grid-cols-2">
        <Findings
          title="Strengths"
          category="Strength"
          items={evaluation.strengths}
          turns={turns}
        />
        <Findings
          title="Improvement areas"
          category="Improvement"
          items={evaluation.weaknesses}
          turns={turns}
        />
        <Findings
          title="Missed opportunities"
          category="Follow-up"
          items={evaluation.missedOpportunities}
          turns={turns}
        />
        <Recommendations items={evaluation.recommendations} />
      </section>
      <section className="mt-7 rounded-3xl border border-white/[.08] bg-card/45 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Category breakdown</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {categories.map(([category, dimension]) => (
            <div key={category} className="rounded-2xl border border-border bg-background/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{category}</p>
                <p className="text-sm font-semibold">{Math.round(dimension.score)}/100</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{dimension.feedback}</p>
              <Evidence ids={dimension.evidenceTurnIds} turns={turns} category={category} />
            </div>
          ))}
        </div>
      </section>
      <Transcript turns={turns} />
    </Shell>
  );
}

function Shell({ interview, children }: { interview: Interview; children: React.ReactNode }) {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="mb-5 text-sm text-muted-foreground">
          {interview.targetRole ?? "Practice interview"} ·{" "}
          {interview.interviewType.replaceAll("_", " ")} · {interview.difficulty}
        </p>
        {children}
      </div>
    </main>
  );
}
function Score({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-2xl border border-white/[.08] bg-card/55 p-5">
      <p className="text-xs font-medium uppercase tracking-[.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-4xl font-semibold tracking-[-.05em]">
        {Math.round(score)}
        <span className="text-base text-muted-foreground">/100</span>
      </p>
    </div>
  );
}
function Findings({
  title,
  category,
  items,
  turns,
}: {
  title: string;
  category: string;
  items: EvidenceBackedFinding[];
  turns: ConversationTurn[];
}) {
  return (
    <section className="rounded-3xl border border-white/[.08] bg-card/45 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 space-y-5">
        {items.length ? (
          items.map((item) => (
            <article key={item.text}>
              <p className="text-sm leading-6">{item.text}</p>
              <Evidence ids={item.evidenceTurnIds} turns={turns} category={category} />
            </article>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No specific feedback was generated for this area.
          </p>
        )}
      </div>
    </section>
  );
}
function Recommendations({ items }: { items: string[] }) {
  return (
    <section className="rounded-3xl border border-primary/20 bg-primary/10 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <CheckCircle2 className="size-5 text-primary" /> Actionable next steps
      </h2>
      <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
        {items.map((item, index) => (
          <li className="flex gap-3" key={item}>
            <span className="font-medium text-primary">{index + 1}.</span>
            {item}
          </li>
        ))}
      </ol>
    </section>
  );
}
function Evidence({
  ids,
  turns,
  category,
}: {
  ids: string[];
  turns: ConversationTurn[];
  category: string;
}) {
  return (
    <div className="mt-3 space-y-2">
      {ids.map((id) => {
        const turn = turns.find((item) => item.id === id);
        return turn ? (
          <a
            className="block rounded-lg border border-border bg-background/30 p-2 text-xs leading-5 text-muted-foreground hover:border-primary/50"
            href={`#turn-${id}`}
            key={id}
          >
            <span className="font-medium text-primary">
              {category} evidence · {speaker(turn.speaker)}
            </span>
            <br />“{truncate(turn.text, 180)}”
          </a>
        ) : null;
      })}
    </div>
  );
}
function Transcript({ turns }: { turns: ConversationTurn[] }) {
  return (
    <section
      className="mt-7 scroll-mt-8 rounded-3xl border border-white/[.08] bg-card/45 p-5 sm:p-6"
      id="transcript"
    >
      <h2 className="text-lg font-semibold">Interview transcript</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Feedback links point to persisted final turns. Audio playback is unavailable because
        recordings are not stored.
      </p>
      <div className="mt-5 space-y-4">
        {turns.map((turn) => (
          <article
            className="scroll-mt-8 rounded-2xl border border-border bg-background/25 p-4"
            id={`turn-${turn.id}`}
            key={turn.id}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-primary">
                {speaker(turn.speaker)} · {turn.type.replaceAll("_", " ")}
              </span>
              <time className="text-muted-foreground">{time(turn.createdAt)}</time>
            </div>
            <p className="mt-2 text-sm leading-6">{turn.text}</p>
          </article>
        ))}
        {!turns.length ? (
          <p className="text-sm text-muted-foreground">
            No persisted transcript turns are available.
          </p>
        ) : null}
      </div>
    </section>
  );
}
function Loading() {
  return (
    <main className="grid min-h-screen place-items-center">
      <LoaderCircle className="size-6 animate-spin text-primary" />
    </main>
  );
}
function Message({ text }: { text: string }) {
  return (
    <main className="mx-auto max-w-xl px-5 py-16 text-center text-muted-foreground">{text}</main>
  );
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "This report could not be loaded.";
}
function speaker(value: ConversationTurn["speaker"]) {
  return value === "USER" ? "You" : value === "AI" ? "AI interviewer" : "System";
}
function recommendation(value: string | null) {
  return value
    ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Not available";
}
function time(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}
function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
