"use client";

import type {
  InterviewDto,
  JobDescriptionDto,
  NextPracticeRecommendation,
  Resume,
} from "@interviewer-ai/types";
import { CircleAlert, LoaderCircle, Mic2, Play, UserRound } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

type History = {
  items: Array<{
    id: string;
    status: string;
    targetRole: string | null;
    overallScore: number | null;
  }>;
};

export default function DashboardPage() {
  const interviews = useQuery({
    queryKey: ["interviews"],
    queryFn: () => apiClient<{ interviews: InterviewDto[] }>("/api/v1/interviews"),
  });
  const recommendation = useQuery({
    queryKey: ["analytics", "next-practice"],
    queryFn: () =>
      apiClient<{ recommendation: NextPracticeRecommendation }>("/api/v1/analytics/next-practice"),
  });
  const resumes = useQuery({
    queryKey: ["resumes"],
    queryFn: () => apiClient<{ resumes: Resume[] }>("/api/v1/resumes"),
  });
  const jobs = useQuery({
    queryKey: ["job-descriptions"],
    queryFn: () => apiClient<{ jobDescriptions: JobDescriptionDto[] }>("/api/v1/job-descriptions"),
  });
  const history = useQuery({
    queryKey: ["analytics", "history", "dashboard"],
    queryFn: () => apiClient<History>("/api/v1/analytics/history?page=1&pageSize=1"),
  });
  const active = interviews.data?.interviews.find(
    (item) => item.status === "IN_PROGRESS" || item.status === "READY",
  );
  const loading =
    interviews.isPending ||
    recommendation.isPending ||
    resumes.isPending ||
    jobs.isPending ||
    history.isPending;
  const failed =
    interviews.error || recommendation.error || resumes.error || jobs.error || history.error;
  const activeResume = resumes.data?.resumes.find(
    (resume) => resume.isActive && ["READY", "ANALYZED"].includes(resume.status),
  );
  const recent = history.data?.items.find(
    (item) => item.status === "COMPLETED" && item.overallScore !== null,
  );
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Practice dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-[2.55rem]">
              What should you do next?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Continue a live session, start a focused practice, or strengthen your context.
            </p>
          </div>
          <Link href="/interviews/new" className="button-primary h-11 px-4 text-sm">
            <Mic2 className="size-4" /> Start a practice
          </Link>
        </div>
        {loading ? (
          <Loading />
        ) : failed ? (
          <ErrorState />
        ) : (
          <div className="mt-8 space-y-5">
            {active ? (
              <section className="rounded-3xl border border-emerald-300/25 bg-emerald-300/[.07] p-6">
                <p className="text-sm font-medium text-emerald-200">Continue your practice</p>
                <h2 className="mt-2 text-xl font-semibold">
                  {active.targetRole ?? "Practice interview"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your session is ready where you left off.
                </p>
                <Link
                  href={`/interviews/${active.id}`}
                  className="button-primary mt-4 inline-flex h-10 px-3 text-sm"
                >
                  <Play className="size-4" />{" "}
                  {active.status === "IN_PROGRESS" ? "Continue interview" : "Start interview"}
                </Link>
              </section>
            ) : null}
            <RecommendationCard recommendation={recommendation.data!.recommendation} />
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="surface p-5">
                <p className="flex items-center gap-2 font-semibold">
                  <UserRound className="size-4 text-primary" /> Profile and context
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {activeResume
                    ? `Active resume: ${activeResume.fileName}.`
                    : "No active resume yet."}{" "}
                  {jobs.data!.jobDescriptions.length
                    ? `${jobs.data!.jobDescriptions.length} saved job description${jobs.data!.jobDescriptions.length === 1 ? "" : "s"}.`
                    : "Add a job description when you want role-specific practice."}
                </p>
                <Link
                  href={activeResume ? "/profile" : "/resumes"}
                  className="mt-4 inline-block text-sm font-medium text-primary"
                >
                  {activeResume ? "Review profile" : "Add career context"}
                </Link>
              </div>
              <div className="surface p-5">
                <p className="font-semibold">Recent completed practice</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {recent
                    ? `${recent.targetRole ?? "Practice interview"}: ${Math.round(recent.overallScore!)} / 100.`
                    : "No completed reports yet."}
                </p>
                <Link
                  href={recent ? `/interviews/${recent.id}/report` : "/history"}
                  className="mt-4 inline-block text-sm font-medium text-primary"
                >
                  {recent ? "Review latest report" : "View interview history"}
                </Link>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
function RecommendationCard({ recommendation }: { recommendation: NextPracticeRecommendation }) {
  return (
    <section className="rounded-3xl border border-primary/25 bg-primary/[.07] p-6">
      <p className="text-sm font-medium text-primary">Recommended next practice</p>
      <h2 className="mt-2 text-xl font-semibold">
        {recommendation.suggestedTargetRole} · {recommendation.interviewType.replaceAll("_", " ")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{recommendation.reasons[0]}</p>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-primary">
        Based on {recommendation.basis === "HISTORY" ? "previous practice" : "your profile"}
      </p>
      <div className="mt-4 flex gap-3">
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
function Loading() {
  return (
    <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" /> Loading your next steps…
    </div>
  );
}
function ErrorState() {
  return (
    <div className="mt-8 rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
      <CircleAlert className="size-4 text-amber-300" />
      <p className="mt-2">
        Your dashboard is unavailable right now. You can still start a practice session.
      </p>
      <Link href="/interviews/new" className="mt-3 inline-block font-medium text-primary">
        Start a practice
      </Link>
    </div>
  );
}
