"use client";

import type {
  InterviewConfiguration,
  InterviewDto,
  JobDescriptionDto,
  NextPracticeRecommendation,
  Resume,
} from "@interviewer-ai/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, LoaderCircle, SlidersHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";

type ProfileDefaults = {
  targetRole: string | null;
  preferredLanguage: string;
  defaultInterviewDuration: number;
  defaultDifficulty: InterviewConfiguration["difficulty"];
};
type CustomMode = "ROLE" | "ROLE_RESUME" | "ROLE_JOB" | "RESUME_JOB";
type InterviewHistory = { items: Array<{ status: string; reportStatus: string | null }> };

export function InterviewManager() {
  const router = useRouter();
  const [customOpen, setCustomOpen] = useState(false);
  const [customMode, setCustomMode] = useState<CustomMode>("ROLE");
  const [role, setRole] = useState("");
  const [difficulty, setDifficulty] = useState<InterviewConfiguration["difficulty"]>("MEDIUM");
  const [resumeId, setResumeId] = useState("");
  const [jobDescriptionId, setJobDescriptionId] = useState("");
  const [failure, setFailure] = useState<InterviewConfiguration | null>(null);

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

  useEffect(() => {
    if (!defaults) return;
    setRole((current) => current || defaults.targetRole || "");
    setDifficulty(defaults.defaultDifficulty);
  }, [defaults]);

  const launch = useMutation({
    mutationFn: async (configuration: InterviewConfiguration) => {
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

  const customConfiguration = (): InterviewConfiguration => ({
    interviewType: "MIXED",
    difficulty,
    durationMinutes: defaults?.defaultInterviewDuration ?? 30,
    language: defaults?.preferredLanguage ?? "en",
    ...(role.trim() ? { targetRole: role.trim() } : {}),
    ...((customMode === "ROLE_RESUME" || customMode === "RESUME_JOB") && resumeId
      ? { resumeId }
      : {}),
    ...((customMode === "ROLE_JOB" || customMode === "RESUME_JOB") && jobDescriptionId
      ? { jobDescriptionId }
      : {}),
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
            mode={customMode}
            setMode={setCustomMode}
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
        <Link className="underline underline-offset-4" href="/resumes">
          Manage resumes
        </Link>
        <Link className="underline underline-offset-4" href="/job-descriptions">
          Manage job descriptions
        </Link>
      </p>
    </div>
  );
}

function CustomSetup(props: {
  mode: CustomMode;
  setMode: (mode: CustomMode) => void;
  role: string;
  setRole: (value: string) => void;
  difficulty: InterviewConfiguration["difficulty"];
  setDifficulty: (value: InterviewConfiguration["difficulty"]) => void;
  resumes: Resume[];
  jobs: JobDescriptionDto[];
  resumeId: string;
  setResumeId: (value: string) => void;
  jobDescriptionId: string;
  setJobDescriptionId: (value: string) => void;
  pending: boolean;
  onStart: () => void;
}) {
  const { mode, setMode } = props;
  return (
    <div className="mt-6 space-y-4 border-t border-border pt-5">
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["ROLE", "Role and difficulty only"],
            ["ROLE_RESUME", "Role plus resume"],
            ["ROLE_JOB", "Role plus job description"],
            ["RESUME_JOB", "Resume plus job description"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            onClick={() => setMode(value)}
            className={`rounded-xl border px-3 py-3 text-left text-sm ${mode === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/50"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode !== "RESUME_JOB" ? (
        <Input
          value={props.role}
          onChange={(event) => props.setRole(event.target.value)}
          placeholder="Target role"
        />
      ) : null}
      <select
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        value={props.difficulty}
        onChange={(event) =>
          props.setDifficulty(event.target.value as InterviewConfiguration["difficulty"])
        }
      >
        {["EASY", "MEDIUM", "HARD", "EXPERT"].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      {mode === "ROLE_RESUME" || mode === "RESUME_JOB" ? (
        <select
          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          value={props.resumeId}
          onChange={(event) => props.setResumeId(event.target.value)}
        >
          <option value="">Choose a resume</option>
          {props.resumes
            .filter((resume) => ["READY", "ANALYZED"].includes(resume.status))
            .map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.fileName}
                {resume.isActive ? " · Active" : ""}
              </option>
            ))}
        </select>
      ) : null}
      {mode === "ROLE_JOB" || mode === "RESUME_JOB" ? (
        <select
          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          value={props.jobDescriptionId}
          onChange={(event) => props.setJobDescriptionId(event.target.value)}
        >
          <option value="">Choose a job description</option>
          {props.jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title ?? "Saved job description"}
            </option>
          ))}
        </select>
      ) : null}
      <Button
        onClick={props.onStart}
        disabled={
          props.pending ||
          (mode !== "RESUME_JOB" && !props.role.trim()) ||
          ((mode === "ROLE_RESUME" || mode === "RESUME_JOB") && !props.resumeId) ||
          ((mode === "ROLE_JOB" || mode === "RESUME_JOB") && !props.jobDescriptionId)
        }
      >
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
  constructor(readonly configuration: InterviewConfiguration) {
    super("Preparation failed.");
  }
}
