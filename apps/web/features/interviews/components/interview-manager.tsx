"use client";

import type {
  InterviewConfiguration,
  InterviewDto,
  JobDescriptionDto,
  Resume,
} from "@interviewer-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CircleAlert,
  LoaderCircle,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";

const interviewsKey = ["interviews"] as const;

function configurationFor(interview: InterviewDto): InterviewConfiguration {
  return {
    resumeId: interview.resume?.id,
    jobDescriptionId: interview.jobDescription?.id,
    interviewType: interview.interviewType,
    difficulty: interview.difficulty,
    durationMinutes: interview.durationMinutes,
    language: interview.language,
    targetRole: interview.targetRole ?? undefined,
  };
}

export function InterviewManager() {
  const client = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState("");
  const [jobDescriptionId, setJobDescriptionId] = useState("");
  const [interviewType, setInterviewType] =
    useState<InterviewConfiguration["interviewType"]>("MIXED");
  const [difficulty, setDifficulty] = useState<InterviewConfiguration["difficulty"]>("MEDIUM");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [targetRole, setTargetRole] = useState("");
  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => apiClient<{ resumes: Resume[] }>("/api/v1/resumes"),
    refetchInterval: (query) =>
      query.state.data?.resumes.some((resume) => resume.status === "ANALYZING") ? 3_000 : false,
  });
  const { data: jobs } = useQuery({
    queryKey: ["job-descriptions"],
    queryFn: () => apiClient<{ jobDescriptions: JobDescriptionDto[] }>("/api/v1/job-descriptions"),
    refetchInterval: (query) =>
      query.state.data?.jobDescriptions.some((job) => job.status === "ANALYZING") ? 3_000 : false,
  });
  const { data: interviews, isPending } = useQuery({
    queryKey: interviewsKey,
    queryFn: () => apiClient<{ interviews: InterviewDto[] }>("/api/v1/interviews"),
    refetchInterval: (query) =>
      query.state.data?.interviews.some(
        (interview) => interview.status === "PREPARING" || interview.status === "COMPLETING",
      )
        ? 3_000
        : false,
  });
  const refresh = () => client.invalidateQueries({ queryKey: interviewsKey });
  const showError = (cause: unknown) =>
    setError(
      cause instanceof Error ? cause.message : "The interview action could not be completed.",
    );
  const create = useMutation({
    mutationFn: (configuration?: InterviewConfiguration) =>
      apiClient<{ interview: InterviewDto }>("/api/v1/interviews", {
        method: "POST",
        body:
          configuration ??
          ({
            resumeId: resumeId || undefined,
            jobDescriptionId: jobDescriptionId || undefined,
            interviewType,
            difficulty,
            durationMinutes: Number(durationMinutes),
            targetRole: targetRole || undefined,
            language: "en",
          } satisfies InterviewConfiguration),
      }),
    onSuccess: () => {
      setOpen(false);
      setError(null);
      refresh();
    },
    onError: showError,
  });
  const prepare = useMutation({
    mutationFn: (id: string) => apiClient(`/api/v1/interviews/${id}/prepare`, { method: "POST" }),
    onSuccess: refresh,
    onError: showError,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiClient(`/api/v1/interviews/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: showError,
  });
  const retry = useMutation({
    mutationFn: async (interview: InterviewDto) => {
      const { interview: replacement } = await create.mutateAsync(configurationFor(interview));
      await apiClient(`/api/v1/interviews/${replacement.id}/prepare`, { method: "POST" });
    },
    onSuccess: refresh,
    onError: showError,
  });

  return (
    <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Interview practice</p>
          <h2 className="mt-1 text-xl font-semibold">Your interview plans</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Configure and run a practice session from your career context.
          </p>
        </div>
        <Button onClick={() => setOpen((value) => !value)}>
          <Plus className="size-4" />
          Create interview
        </Button>
      </div>
      {open ? (
        <form
          className="mt-5 grid gap-3 rounded-xl border border-border bg-background/50 p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(undefined);
          }}
        >
          <select
            className="h-11 rounded-xl border border-input bg-card px-3 text-sm"
            value={resumeId}
            onChange={(event) => setResumeId(event.target.value)}
          >
            <option value="">No resume selected</option>
            {resumes?.resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.fileName}
              </option>
            ))}
          </select>
          <select
            className="h-11 rounded-xl border border-input bg-card px-3 text-sm"
            value={jobDescriptionId}
            onChange={(event) => setJobDescriptionId(event.target.value)}
          >
            <option value="">No job description selected</option>
            {jobs?.jobDescriptions.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title ?? "Untitled role"}
                {job.company ? ` · ${job.company}` : ""}
              </option>
            ))}
          </select>
          <select
            className="h-11 rounded-xl border border-input bg-card px-3 text-sm"
            value={interviewType}
            onChange={(event) =>
              setInterviewType(event.target.value as InterviewConfiguration["interviewType"])
            }
          >
            {["MIXED", "BEHAVIORAL", "TECHNICAL", "CODING", "SYSTEM_DESIGN", "HR"].map((type) => (
              <option key={type}>{type.replace("_", " ")}</option>
            ))}
          </select>
          <select
            className="h-11 rounded-xl border border-input bg-card px-3 text-sm"
            value={difficulty}
            onChange={(event) =>
              setDifficulty(event.target.value as InterviewConfiguration["difficulty"])
            }
          >
            {["EASY", "MEDIUM", "HARD", "EXPERT"].map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
          <Input
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            type="number"
            min={10}
            max={120}
            placeholder="Minutes"
            required
          />
          <Input
            value={targetRole}
            onChange={(event) => setTargetRole(event.target.value)}
            placeholder="Target role (optional)"
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Save interview"}
            </Button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-5 space-y-3">
        {isPending ? (
          <div className="flex gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading interviews…
          </div>
        ) : null}
        {!isPending && !interviews?.interviews.length ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
            Create your first interview plan when you are ready.
          </div>
        ) : null}
        {interviews?.interviews.map((interview) => (
          <div
            key={interview.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-4"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <CalendarClock className="size-5" />
              </span>
              <div>
                <p className="font-medium">
                  {interview.targetRole ?? interview.jobDescription?.title ?? "Practice interview"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {interview.interviewType.replace("_", " ")} · {interview.difficulty} ·{" "}
                  {interview.durationMinutes} min
                </p>
                <p className="mt-1 text-xs font-medium text-primary">
                  {statusLabel(interview.status)}
                </p>
              </div>
            </div>
            <InterviewActions
              interview={interview}
              pending={prepare.isPending || cancel.isPending || retry.isPending}
              onPrepare={() => prepare.mutate(interview.id)}
              onCancel={() => cancel.mutate(interview.id)}
              onOpen={() => router.push(`/interviews/${interview.id}`)}
              onReport={() => router.push(`/interviews/${interview.id}/report`)}
              onRetry={() => retry.mutate(interview)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function InterviewActions({
  interview,
  pending,
  onPrepare,
  onCancel,
  onOpen,
  onReport,
  onRetry,
}: {
  interview: InterviewDto;
  pending: boolean;
  onPrepare: () => void;
  onCancel: () => void;
  onOpen: () => void;
  onReport: () => void;
  onRetry: () => void;
}) {
  if (interview.status === "DRAFT")
    return (
      <div className="flex gap-2">
        <Button size="sm" onClick={onPrepare} disabled={pending}>
          <Play className="size-4" />
          Prepare
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          <Trash2 className="size-4" />
          Cancel
        </Button>
      </div>
    );
  if (interview.status === "PREPARING" || interview.status === "COMPLETING")
    return (
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        {interview.status === "PREPARING" ? "Preparing plan…" : "Generating report…"}
      </span>
    );
  if (interview.status === "READY")
    return (
      <Button size="sm" onClick={onOpen}>
        <Play className="size-4" />
        Start interview
      </Button>
    );
  if (interview.status === "IN_PROGRESS")
    return (
      <Button size="sm" onClick={onOpen}>
        Open interview
      </Button>
    );
  if (interview.status === "COMPLETED")
    return (
      <Button size="sm" variant="outline" onClick={onReport}>
        Review report
      </Button>
    );
  if (interview.status === "FAILED")
    return (
      <Button size="sm" variant="outline" onClick={onRetry} disabled={pending}>
        <RotateCcw className="size-4" />
        Create and retry
      </Button>
    );
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <CircleAlert className="size-4" />
      Cancelled
    </span>
  );
}

function statusLabel(status: InterviewDto["status"]) {
  return status === "FAILED"
    ? "Preparation failed. You can safely create a replacement."
    : status.replace("_", " ");
}
