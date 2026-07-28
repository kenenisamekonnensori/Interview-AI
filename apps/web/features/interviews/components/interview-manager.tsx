"use client";

import type {
  InterviewConfiguration,
  InterviewDto,
  JobDescriptionDto,
  NextPracticeRecommendation,
  Resume,
} from "@interviewer-ai/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleAlert,
  Info,
  LoaderCircle,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";

type ProfileDefaults = {
  targetRole: string | null;
  preferredLanguage: string;
  defaultInterviewDuration: number;
  defaultDifficulty: InterviewConfiguration["difficulty"];
};
type InterviewHistory = { items: Array<{ status: string; reportStatus: string | null }> };
type InterviewStartInput = Pick<InterviewConfiguration, "interviewType"> &
  Partial<Omit<InterviewConfiguration, "interviewType">>;

export function InterviewManager() {
  const router = useRouter();
  const [customOpen, setCustomOpen] = useState(false);
  const [role, setRole] = useState("");
  const [difficulty, setDifficulty] = useState<InterviewConfiguration["difficulty"] | "">("");
  const [resumeId, setResumeId] = useState("");
  const [jobDescriptionId, setJobDescriptionId] = useState("");
  const [failure, setFailure] = useState<InterviewStartInput | null>(null);

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiClient<{ profile: ProfileDefaults }>("/api/v1/profile"),
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
    queryKey: ["analytics-history", "recommendation"],
    queryFn: () => apiClient<InterviewHistory>("/api/v1/analytics/history?page=1&pageSize=1"),
  });
  const nextPractice = useQuery({
    queryKey: ["analytics", "next-practice"],
    queryFn: () =>
      apiClient<{ recommendation: NextPracticeRecommendation }>("/api/v1/analytics/next-practice"),
  });

  const activeResume = useMemo(
    () =>
      resumes.data?.resumes.find(
        (resume) => resume.isActive && ["READY", "ANALYZED"].includes(resume.status),
      ),
    [resumes.data],
  );
  const relevantJob = useMemo(
    () =>
      jobs.data?.jobDescriptions.find((job) => job.status === "ANALYZED" || job.status === "READY"),
    [jobs.data],
  );
  const defaults = profile.data?.profile;
  const fallbackRecommendation = useMemo<InterviewConfiguration>(
    () => ({
      interviewType: "MIXED",
      difficulty: defaults?.defaultDifficulty ?? "MEDIUM",
      durationMinutes: defaults?.defaultInterviewDuration ?? 30,
      language: defaults?.preferredLanguage ?? "en",
      targetRole: defaults?.targetRole ?? relevantJob?.title ?? "General interview practice",
      ...(activeResume ? { resumeId: activeResume.id } : {}),
      ...(relevantJob ? { jobDescriptionId: relevantJob.id } : {}),
    }),
    [activeResume, defaults, relevantJob],
  );

  const launch = useMutation({
    mutationFn: async (configuration: InterviewStartInput) => {
      const { interview } = await apiClient<{ interview: InterviewDto }>("/api/v1/interviews", {
        method: "POST",
        body: configuration,
      });
      await apiClient(`/api/v1/interviews/${interview.id}/prepare`, { method: "POST" });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const plan = await apiClient<{ status: InterviewDto["status"] }>(
          `/api/v1/interviews/${interview.id}/plan`,
        );
        if (plan.status === "READY") return interview.id;
        if (plan.status === "FAILED") throw new PreparationError(configuration);
      }
      throw new PreparationError(configuration);
    },
    onSuccess: (id) => router.push(`/interviews/${id}`),
    onError: (cause) =>
      setFailure(cause instanceof PreparationError ? cause.configuration : fallbackRecommendation),
  });

  const customConfiguration = (): InterviewStartInput => ({
    interviewType: "MIXED",
    ...(role.trim() ? { targetRole: role.trim() } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(resumeId ? { resumeId } : {}),
    ...(jobDescriptionId ? { jobDescriptionId } : {}),
  });
  const reasons = [
    activeResume ? `your active resume (${activeResume.fileName})` : null,
    defaults?.targetRole ? `your target role (${defaults.targetRole})` : null,
    relevantJob ? `a saved job description (${relevantJob.title ?? "saved role"})` : null,
    history.data?.items.some((item) => item.status === "COMPLETED" && item.reportStatus === "READY")
      ? "your recent interview feedback"
      : null,
  ].filter(Boolean);
  const recommendation = nextPractice.data?.recommendation;
  const recommended = recommendation
    ? {
        interviewType: recommendation.interviewType,
        difficulty: recommendation.difficulty,
        durationMinutes: recommendation.suggestedDurationMinutes,
        language: defaults?.preferredLanguage ?? "en",
        targetRole: recommendation.suggestedTargetRole,
        ...(recommendation.resumeId ? { resumeId: recommendation.resumeId } : {}),
        ...(recommendation.jobDescriptionId
          ? { jobDescriptionId: recommendation.jobDescriptionId }
          : {}),
      }
    : fallbackRecommendation;

  if (failure)
    return (
      <RecoveryCard
        onRetry={() => {
          setFailure(null);
          launch.mutate(failure);
        }}
        onEdit={() => {
          setFailure(null);
          setCustomOpen(true);
        }}
        onSimple={() => {
          setFailure(null);
          launch.mutate(simpleConfiguration(defaults));
        }}
      />
    );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-primary/30 bg-[radial-gradient(circle_at_100%_0%,oklch(0.7_0.16_280_/_18%),transparent_26rem)] p-6 shadow-xl shadow-black/10 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <Sparkles className="size-4" /> Recommended practice
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-.04em]">
              Practice for {recommended.targetRole}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {recommendation?.reasons.join(" ") ??
                (reasons.length
                  ? `Built from ${reasons.join(", ")}.`
                  : "A focused mixed interview you can start without any documents.")}
            </p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-primary">
              Based on {recommendation?.basis === "HISTORY" ? "previous practice" : "your profile"}
            </p>
          </div>
          <Button size="lg" onClick={() => launch.mutate(recommended)} disabled={launch.isPending}>
            {launch.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {launch.isPending ? "Preparing your interview…" : "Start recommended practice"}
          </Button>
        </div>
        {launch.isPending ? <PreparationProgress /> : null}
      </section>

      <section className="rounded-3xl border border-border bg-card/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <SlidersHorizontal className="size-4 text-primary" /> Custom interview
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose only the context you want to use.
            </p>
          </div>
          <Button variant="outline" onClick={() => setCustomOpen((value) => !value)}>
            Create custom interview <ArrowRight className="size-4" />
          </Button>
        </div>
        {customOpen ? (
          <CustomSetup
            role={role}
            setRole={setRole}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            resumes={resumes.data?.resumes ?? []}
            jobs={jobs.data?.jobDescriptions ?? []}
            resumeId={resumeId}
            setResumeId={setResumeId}
            jobDescriptionId={jobDescriptionId}
            setJobDescriptionId={setJobDescriptionId}
            pending={launch.isPending}
            onStart={() => launch.mutate(customConfiguration())}
          />
        ) : null}
      </section>
      <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <Link className="underline underline-offset-4" href="/profile">
          Manage your resume and job descriptions in Profile
        </Link>
      </p>
    </div>
  );
}

function CustomSetup(props: {
  role: string;
  setRole: (value: string) => void;
  difficulty: InterviewConfiguration["difficulty"] | "";
  setDifficulty: (value: InterviewConfiguration["difficulty"] | "") => void;
  resumes: Resume[];
  jobs: JobDescriptionDto[];
  resumeId: string;
  setResumeId: (value: string) => void;
  jobDescriptionId: string;
  setJobDescriptionId: (value: string) => void;
  pending: boolean;
  onStart: () => void;
}) {
  const usesProfileOnly =
    !props.role.trim() && !props.difficulty && !props.resumeId && !props.jobDescriptionId;
  return (
    <div className="mt-6 space-y-4 border-t border-border pt-5">
      <p className="text-sm text-muted-foreground">
        Every option is optional. Add any combination that helps, or leave them blank for a
        profile-based practice session.
      </p>
      <Input
        value={props.role}
        onChange={(event) => props.setRole(event.target.value)}
        placeholder="Target role (optional)"
      />
      <select
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        value={props.difficulty}
        onChange={(event) =>
          props.setDifficulty(event.target.value as InterviewConfiguration["difficulty"] | "")
        }
      >
        <option value="">Use your profile difficulty (or Medium)</option>
        {["EASY", "MEDIUM", "HARD", "EXPERT"].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        value={props.resumeId}
        onChange={(event) => props.setResumeId(event.target.value)}
      >
        <option value="">No resume for this interview</option>
        {props.resumes
          .filter((resume) => ["READY", "ANALYZED"].includes(resume.status))
          .map((resume) => (
            <option key={resume.id} value={resume.id}>
              {resume.fileName}
              {resume.isActive ? " · Active" : ""}
            </option>
          ))}
      </select>
      <select
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        value={props.jobDescriptionId}
        onChange={(event) => props.setJobDescriptionId(event.target.value)}
      >
        <option value="">No job description for this interview</option>
        {props.jobs.map((job) => (
          <option key={job.id} value={job.id}>
            {job.title ?? "Saved job description"}
          </option>
        ))}
      </select>
      {usesProfileOnly ? (
        <p className="flex gap-2 rounded-xl border border-primary/25 bg-primary/10 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          No custom context was added. This interview will use your saved profile settings. You can
          still start now.
        </p>
      ) : null}
      <Button onClick={props.onStart} disabled={props.pending}>
        {props.pending ? "Preparing your interview…" : "Start interview"}{" "}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function PreparationProgress() {
  return (
    <p className="mt-5 flex items-center gap-2 rounded-xl bg-background/50 p-3 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" /> Personalizing your practice questions. This
      usually takes a moment.
    </p>
  );
}
function RecoveryCard({
  onRetry,
  onEdit,
  onSimple,
}: {
  onRetry: () => void;
  onEdit: () => void;
  onSimple: () => void;
}) {
  return (
    <section className="rounded-3xl border border-amber-300/25 bg-amber-300/[.07] p-6">
      <CircleAlert className="size-5 text-amber-300" />
      <h2 className="mt-3 text-xl font-semibold">We couldn’t prepare that interview.</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your setup is still safe. You can try again, adjust it, or start with a simpler role-based
        session.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={onRetry}>Try again</Button>
        <Button variant="outline" onClick={onEdit}>
          Edit setup
        </Button>
        <Button variant="ghost" onClick={onSimple}>
          Create a simpler session
        </Button>
      </div>
    </section>
  );
}
function simpleConfiguration(profile?: ProfileDefaults): InterviewConfiguration {
  return {
    interviewType: "MIXED",
    difficulty: profile?.defaultDifficulty ?? "MEDIUM",
    durationMinutes: profile?.defaultInterviewDuration ?? 30,
    language: profile?.preferredLanguage ?? "en",
    ...(profile?.targetRole ? { targetRole: profile.targetRole } : {}),
  };
}
class PreparationError extends Error {
  constructor(readonly configuration: InterviewStartInput) {
    super("Preparation failed.");
  }
}
