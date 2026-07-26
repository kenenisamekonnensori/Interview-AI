"use client";

import type { InterviewDto, JobDescriptionDto, Resume } from "@interviewer-ai/types";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Flame, Mic2, Sparkles, Target, TrendingUp } from "lucide-react";
import Link from "next/link";

import { apiClient } from "@/lib/api-client";

export default function DashboardPage() {
  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => apiClient<{ resumes: Resume[] }>("/api/v1/resumes"),
  });
  const { data: jobs } = useQuery({
    queryKey: ["job-descriptions"],
    queryFn: () => apiClient<{ jobDescriptions: JobDescriptionDto[] }>("/api/v1/job-descriptions"),
  });
  const { data: interviews } = useQuery({
    queryKey: ["interviews"],
    queryFn: () => apiClient<{ interviews: InterviewDto[] }>("/api/v1/interviews"),
  });
  const recent = interviews?.interviews.slice(0, 3) ?? [];
  const hasContext = Boolean(resumes?.resumes.length && jobs?.jobDescriptions.length);
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Sunday, July 26</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-[2.55rem]">
              Make your next answer count.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Your focused space for practicing the conversations that move your career forward.
            </p>
          </div>
          <Link href="/interviews/new" className="button-primary h-11 px-4 text-sm">
            <Mic2 className="size-4" /> Start a practice
          </Link>
        </div>
        <section className="relative mt-9 overflow-hidden rounded-3xl border border-violet-300/15 bg-[linear-gradient(110deg,rgba(107,86,224,.24),rgba(26,28,48,.68)_55%,rgba(32,172,166,.12))] p-6 sm:p-8">
          <div className="absolute -right-10 -top-20 size-72 rounded-full bg-violet-400/20 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1 text-xs text-violet-100">
                <Sparkles className="size-3.5" /> Today’s recommendation
              </span>
              <h2 className="mt-5 max-w-xl text-2xl font-semibold tracking-[-.035em] sm:text-3xl">
                Warm up with a 15-minute product sense interview.
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-violet-100/65">
                You’ve sharpened structure lately. Practice balancing customer signals with business
                tradeoffs.
              </p>
              <Link
                href="/interviews/new"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-white"
              >
                Set up this session <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="flex min-w-[190px] items-center gap-4 rounded-2xl border border-white/10 bg-black/15 p-4 backdrop-blur">
              <div className="grid size-12 place-items-center rounded-xl bg-white/10">
                <Target className="size-5 text-violet-200" />
              </div>
              <div>
                <p className="text-xs text-violet-100/60">Focus area</p>
                <p className="mt-1 text-sm font-medium">Strategic thinking</p>
                <p className="mt-1 text-xs text-emerald-300">+12% this month</p>
              </div>
            </div>
          </div>
        </section>
        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={Flame}
            label="Current streak"
            value="3 days"
            detail="Best: 7 days"
            tint="text-orange-300"
          />
          <Metric
            icon={TrendingUp}
            label="Readiness score"
            value="72"
            detail="Up 8 points this month"
            tint="text-emerald-300"
          />
          <Metric
            icon={CalendarDays}
            label="Practice time"
            value="2h 14m"
            detail="This week"
            tint="text-sky-300"
          />
          <Metric
            icon={Target}
            label="Interviews"
            value={String(interviews?.interviews.length ?? 0)}
            detail="Sessions completed"
            tint="text-violet-300"
          />
        </section>
        <section className="mt-9 grid gap-7 lg:grid-cols-[1.45fr_.9fr]">
          <div className="surface p-5 sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base font-semibold">Continue where you left off</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your recent practice sessions and feedback.
                </p>
              </div>
              <Link href="/interviews/new" className="text-xs font-medium text-primary">
                View all
              </Link>
            </div>
            <div className="mt-5 divide-y divide-white/[.06]">
              {recent.length ? (
                recent.map((item) => (
                  <Link
                    href={`/interviews/${item.id}`}
                    className="group flex items-center gap-4 py-4 first:pt-0"
                    key={item.id}
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-white/[.05] text-violet-300">
                      <Mic2 className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {item.targetRole ?? item.jobDescription?.title ?? "Practice interview"}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {item.interviewType.replace("_", " ")} · {item.durationMinutes} min ·{" "}
                        {item.difficulty.toLowerCase()}
                      </span>
                    </span>
                    <span className="rounded-full bg-white/[.05] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {item.status.replace("_", " ")}
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
                  </Link>
                ))
              ) : (
                <EmptyRecent />
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="surface p-5">
              <p className="text-base font-semibold">Build your interview context</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A resume and target role make every question much more relevant.
              </p>
              <div className="mt-5 space-y-3">
                <ContextStep complete={Boolean(resumes?.resumes.length)} label="Resume added" />
                <ContextStep
                  complete={Boolean(jobs?.jobDescriptions.length)}
                  label="Target role added"
                />
              </div>
              <Link
                href="/interviews/new"
                className="mt-5 inline-flex text-sm font-medium text-primary"
              >
                {hasContext ? "Create an interview" : "Finish your profile"}{" "}
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </div>
            <div className="rounded-2xl bg-white/[.035] p-5">
              <p className="text-sm font-medium">A small win for today</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Record one answer using the STAR framework. Aim for a crisp 90 seconds.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tint,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  detail: string;
  tint: string;
}) {
  return (
    <div className="surface p-5">
      <Icon className={`size-4 ${tint}`} />
      <p className="mt-5 text-2xl font-semibold tracking-[-.04em]">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
function ContextStep({ complete, label }: { complete: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        className={`grid size-5 place-items-center rounded-full text-[10px] ${complete ? "bg-emerald-400 text-slate-950" : "border border-white/15 text-muted-foreground"}`}
      >
        {complete ? "✓" : ""}
      </span>
      <span className={complete ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
function EmptyRecent() {
  return (
    <div className="py-8 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-white/[.05] text-violet-300">
        <Mic2 className="size-5" />
      </span>
      <p className="mt-3 text-sm font-medium">Your first practice is waiting</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Choose a role and we’ll prepare the room.
      </p>
      <Link href="/interviews/new" className="mt-4 inline-flex text-xs font-medium text-primary">
        Create a session <ArrowRight className="ml-1 size-3.5" />
      </Link>
    </div>
  );
}
