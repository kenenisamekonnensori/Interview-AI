"use client";

import type { ConversationDto, InterviewPlan, InterviewStatus } from "@interviewer-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Clock3, LoaderCircle, Radio, ShieldCheck, Square, Wifi } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { InterviewMicrophone } from "@/features/conversation/components/microphone";
import { apiClient } from "@/lib/api-client";

type InterviewDetails = {
  id: string;
  status: InterviewStatus;
  targetRole: string | null;
  interviewType: string;
  difficulty: string;
  durationMinutes: number;
  startedAt: string | null;
  completedAt: string | null;
  plan: InterviewPlan | null;
  conversation: ConversationDto | null;
};

export default function LiveInterviewPage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const queryKey = ["interview", id] as const;
  const { data, isPending, error } = useQuery({
    queryKey,
    queryFn: () => apiClient<{ interview: InterviewDetails }>(`/api/v1/interviews/${id}`),
    refetchInterval: (query) =>
      query.state.data?.interview.status === "COMPLETING" ? 3_000 : false,
  });
  const end = useMutation({
    mutationFn: () =>
      apiClient(`/api/v1/interviews/${id}/conversation/complete`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });

  useEffect(() => {
    if (!data?.interview.startedAt || data.interview.status === "COMPLETED") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [data?.interview.startedAt, data?.interview.status]);

  if (isPending) return <PageMessage message="Loading your interview…" loading />;
  if (error || !data)
    return (
      <PageMessage
        message={error instanceof Error ? error.message : "This interview could not be found."}
      />
    );
  const interview = data.interview;
  if (!interview.plan)
    return (
      <PageMessage message="This interview does not have a valid plan yet. Return to your interviews and wait for preparation to finish." />
    );
  if (interview.status === "COMPLETED")
    return (
      <PageMessage
        message="This interview is complete."
        action={
          <Link href={`/interviews/${id}/report`}>
            <Button>Review report</Button>
          </Link>
        }
      />
    );
  if (
    interview.status !== "READY" &&
    interview.status !== "IN_PROGRESS" &&
    interview.status !== "COMPLETING"
  )
    return (
      <PageMessage message="This interview is not available to open. Return to your interviews to choose a ready or active session." />
    );

  const elapsed = interview.startedAt
    ? Math.max(0, Math.floor((now - new Date(interview.startedAt).getTime()) / 1_000))
    : 0;
  const remaining = Math.max(0, interview.durationMinutes * 60 - elapsed);
  const completing = interview.status === "COMPLETING";
  return (
    <main className="min-h-[calc(100vh-5rem)] bg-[radial-gradient(circle_at_50%_0%,oklch(0.3_0.08_275_/_20%),transparent_35rem)] px-5 py-7 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Live interview</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] sm:text-3xl">
              {interview.targetRole ?? "Your practice session"}
            </h1>
            <p className="mt-3 text-muted-foreground">
              {interview.interviewType.replace("_", " ")} · {interview.difficulty} ·{" "}
              {interview.durationMinutes} minutes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-rose-400/10 px-3 py-1.5 text-xs font-medium text-rose-300">
              <Radio className="size-3" /> Recording
            </span>
            <span className="grid size-8 place-items-center rounded-lg bg-white/[.05] text-emerald-300">
              <Wifi className="size-3.5" />
            </span>
          </div>
        </div>
        <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-3xl border border-white/[.08] bg-card/55 p-5 shadow-2xl shadow-black/20 sm:p-7">
            <div className="flex items-center justify-between border-b border-white/[.07] pb-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-violet-300 to-indigo-500 text-slate-950">
                  <Radio className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">Your AI interviewer</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Listening for a thoughtful response
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                Question 1 of {interview.plan.topics.length}
              </span>
            </div>
            {completing ? (
              <p className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Your conversation is saved. Generating your evaluation and report…
              </p>
            ) : (
              <div className="mt-6">
                <InterviewMicrophone
                  interviewId={id}
                  disabled={end.isPending}
                  onStarted={() => client.invalidateQueries({ queryKey })}
                />
              </div>
            )}
            {end.error ? (
              <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {end.error instanceof Error
                  ? end.error.message
                  : "The interview could not be ended. You can try again."}
              </p>
            ) : null}
            {interview.status === "IN_PROGRESS" ? (
              <div className="mt-6 flex justify-end border-t border-white/[.07] pt-5">
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => end.mutate()}
                  disabled={end.isPending}
                >
                  <Square className="size-4" />
                  {end.isPending ? "Ending…" : "End interview"}
                </Button>
              </div>
            ) : null}
          </div>
          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/[.08] bg-card/45 p-5">
              <p className="text-xs font-medium uppercase tracking-[.13em] text-muted-foreground">
                Time remaining
              </p>
              <p className="mt-2 text-4xl font-semibold tracking-[-.05em]">
                {formatDuration(remaining)}
              </p>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[.08]">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.max(3, (remaining / (interview.durationMinutes * 60)) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-white/[.08] bg-card/45 p-5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-emerald-300" /> Session signals
              </p>
              <div className="mt-4 space-y-3 text-xs text-muted-foreground">
                <p className="flex justify-between">
                  <span>Microphone</span>
                  <span className="text-emerald-300">Ready</span>
                </p>
                <p className="flex justify-between">
                  <span>Network</span>
                  <span className="text-emerald-300">Strong</span>
                </p>
                <p className="flex justify-between">
                  <span>Mode</span>
                  <span className="text-foreground">Practice</span>
                </p>
              </div>
            </div>
            <TimeCard label="Elapsed" seconds={elapsed} />
          </aside>
        </div>
      </div>
    </main>
  );
}

function TimeCard({ label, seconds }: { label: string; seconds: number }) {
  return (
    <div className="rounded-2xl border border-white/[.08] bg-card/45 p-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock3 className="size-4" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{formatDuration(seconds)}</p>
    </div>
  );
}

function PageMessage({
  message,
  loading = false,
  action,
}: {
  message: string;
  loading?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <main className="mx-auto grid min-h-screen max-w-3xl place-items-center px-5 py-10">
      <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <p className="flex justify-center">
          {loading ? (
            <LoaderCircle className="size-6 animate-spin text-primary" />
          ) : (
            <CircleAlert className="size-6 text-destructive" />
          )}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        {action ? (
          <div className="mt-5">{action}</div>
        ) : (
          <Link
            className="mt-5 inline-block text-sm font-medium text-primary"
            href="/interviews/new"
          >
            Back to interviews
          </Link>
        )}
      </div>
    </main>
  );
}

function formatDuration(totalSeconds: number) {
  return `${Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0")}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
}
