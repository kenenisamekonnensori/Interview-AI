"use client";

import type { JobDescriptionDto, NextPracticeRecommendation, Resume } from "@interviewer-ai/types";
import { Mic2 } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { AnalyticsOverview } from "@/features/analytics/components/history";
import { apiClient } from "@/lib/api-client";

export default function DashboardPage() {
  const resumes = useQuery({
    queryKey: ["resumes"],
    queryFn: () => apiClient<{ resumes: Resume[] }>("/api/v1/resumes"),
  });
  const jobs = useQuery({
    queryKey: ["job-descriptions"],
    queryFn: () => apiClient<{ jobDescriptions: JobDescriptionDto[] }>("/api/v1/job-descriptions"),
  });
  const hasContext = Boolean(resumes.data?.resumes.length && jobs.data?.jobDescriptions.length);
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Practice dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-[2.55rem]">
              Build momentum from real practice.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Review completed feedback, resume active sessions, and keep the next interview
              focused.
            </p>
          </div>
          <Link href="/interviews/new" className="button-primary h-11 px-4 text-sm">
            <Mic2 className="size-4" /> Start a practice
          </Link>
        </div>
        <NextPracticeCard />
        <section className="mt-8 rounded-3xl border border-violet-300/15 bg-card/55 p-6">
          <p className="text-base font-semibold">Interview context</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasContext
              ? "Your resume and role context are ready for a tailored session."
              : "Add a resume and target role to make the next session more relevant."}
          </p>
          <Link
            href="/interviews/new"
            className="mt-4 inline-flex text-sm font-medium text-primary"
          >
            {hasContext ? "Create interview" : "Finish setup"}
          </Link>
        </section>
        <section className="mt-8">
          <AnalyticsOverview limit={6} />
        </section>
      </div>
    </main>
  );
}

function NextPracticeCard() {
  const recommendation = useQuery({
    queryKey: ["analytics", "next-practice"],
    queryFn: () =>
      apiClient<{ recommendation: NextPracticeRecommendation }>("/api/v1/analytics/next-practice"),
  });
  if (recommendation.isPending || recommendation.error || !recommendation.data) return null;
  const value = recommendation.data.recommendation;
  return (
    <section className="mt-8 rounded-3xl border border-primary/25 bg-primary/[.07] p-6">
      <p className="text-sm font-medium text-primary">Next recommended practice</p>
      <h2 className="mt-2 text-xl font-semibold">
        {value.suggestedTargetRole} · {value.interviewType.replaceAll("_", " ")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{value.reasons[0]}</p>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-primary">
        Based on {value.basis === "HISTORY" ? "previous practice" : "your profile"}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/interviews/new" className="button-primary h-10 px-3 text-sm">
          Start this practice
        </Link>
        <Link href="/interviews/new" className="text-sm font-medium text-primary">
          Customize
        </Link>
      </div>
    </section>
  );
}
