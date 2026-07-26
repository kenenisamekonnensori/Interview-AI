"use client";

import type { InterviewEvaluation, InterviewStatus } from "@interviewer-ai/types";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Download, LoaderCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";

type ReportDetails = {
  id: string;
  status: InterviewStatus;
  report: { summary: string; evaluation: InterviewEvaluation; generatedAt: string } | null;
};

export default function InterviewReportPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, error } = useQuery({
    queryKey: ["interview", id],
    queryFn: () => apiClient<{ interview: ReportDetails }>(`/api/v1/interviews/${id}`),
    refetchInterval: (query) =>
      query.state.data?.interview.status === "COMPLETING" ? 3_000 : false,
  });
  if (isPending)
    return (
      <main className="grid min-h-screen place-items-center">
        <LoaderCircle className="size-6 animate-spin text-primary" />
      </main>
    );
  if (error || !data)
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-center text-muted-foreground">
        {error instanceof Error ? error.message : "Report not found."}
      </main>
    );
  const { interview } = data;
  if (!interview.report)
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-center">
        <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">
          Your report is still being generated. This page will update automatically.
        </p>
      </main>
    );
  const { evaluation } = interview.report;
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Interview report</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
              A clear picture of your practice.
            </h1>
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card/60 px-3 text-xs font-medium">
            <Download className="size-3.5" /> Download report
          </button>
        </div>
        <p className="mt-7 rounded-2xl border border-white/[.08] bg-card/50 p-5 text-sm leading-7 text-muted-foreground">
          {interview.report.summary}
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Score label="Overall" score={evaluation.overallScore} />
          <Score label="Technical" score={evaluation.technical.score} />
          <Score label="Communication" score={evaluation.communication.score} />
        </div>
        <section className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <Feedback title="Strengths" items={evaluation.strengths} />
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" /> Your next best session
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Practice one concise example that demonstrates a trade-off. Aim for clear context,
              decision, and outcome.
            </p>
            <Link
              href="/interviews/new"
              className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              Create next practice <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </section>
        <section className="mt-5">
          <Feedback title="Focus next" items={evaluation.recommendations} />
        </section>
        <div className="mt-8">
          <Link href="/interviews/new">
            <Button variant="outline">Back to interviews</Button>
          </Link>
        </div>
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
function Feedback({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/[.08] bg-card/40 p-5">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li className="flex gap-3" key={item}>
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
