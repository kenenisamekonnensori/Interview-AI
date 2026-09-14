"use client";

import type { CareerTargetDto, JobDescriptionDto, Resume } from "@interviewer-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Star,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isPlanBoundaryError } from "@/features/billing/lib/billing-helpers";
import { apiClient } from "@/lib/api-client";

const queryKey = ["career-targets"] as const;

export function TargetJobsManager() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CareerTargetDto | null>(null);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [location, setLocation] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [jobDescriptionId, setJobDescriptionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The target cap is a plan boundary, so the message gets an upgrade path.
  const [errorUpgrade, setErrorUpgrade] = useState(false);

  const targets = useQuery({
    queryKey,
    queryFn: () => apiClient<{ careerTargets: CareerTargetDto[] }>("/api/v1/career-targets"),
  });
  const resumes = useQuery({
    queryKey: ["resumes"],
    queryFn: () => apiClient<{ resumes: Resume[] }>("/api/v1/resumes"),
  });
  const jobs = useQuery({
    queryKey: ["job-descriptions"],
    queryFn: () => apiClient<{ jobDescriptions: JobDescriptionDto[] }>("/api/v1/job-descriptions"),
  });
  const refresh = () => client.invalidateQueries({ queryKey });

  const resetForm = () => {
    setTitle("");
    setCompany("");
    setJobUrl("");
    setLocation("");
    setResumeId("");
    setJobDescriptionId("");
    setEditing(null);
    setError(null);
    setOpen(false);
  };
  const startCreate = () => {
    resetForm();
    setOpen(true);
  };
  const startEdit = (target: CareerTargetDto) => {
    setEditing(target);
    setTitle(target.title);
    setCompany(target.company ?? "");
    setJobUrl(target.jobUrl ?? "");
    setLocation(target.location ?? "");
    setResumeId(target.resumeId ?? "");
    setJobDescriptionId(target.jobDescriptionId ?? "");
    setError(null);
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(company.trim() ? { company: company.trim() } : {}),
        ...(jobUrl.trim() ? { jobUrl: jobUrl.trim() } : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
        ...(resumeId ? { resumeId } : {}),
        ...(jobDescriptionId ? { jobDescriptionId } : {}),
      };
      if (editing) {
        const response = await apiClient<{ careerTarget: CareerTargetDto }>(
          `/api/v1/career-targets/${editing.id}`,
          { method: "PATCH", body },
        );
        return response.careerTarget;
      }
      const response = await apiClient<{ careerTarget: CareerTargetDto }>(
        "/api/v1/career-targets",
        {
          method: "POST",
          body,
        },
      );
      return response.careerTarget;
    },
    onSuccess: () => {
      resetForm();
      refresh();
    },
    onError: (cause) => {
      setError(
        cause instanceof Error && cause.message ? cause.message : "Could not save this target.",
      );
      setErrorUpgrade(isPlanBoundaryError(cause));
    },
  });

  const activate = useMutation({
    mutationFn: (id: string) =>
      apiClient<{ careerTarget: CareerTargetDto }>(`/api/v1/career-targets/${id}`, {
        method: "PATCH",
        body: { status: "ACTIVE" },
      }),
    onSuccess: refresh,
  });
  const archive = useMutation({
    mutationFn: (id: string) => apiClient(`/api/v1/career-targets/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  const list = targets.data?.careerTargets ?? [];
  const active = list.find((target) => target.status === "ACTIVE");
  const resumeNames = new Map(
    (resumes.data?.resumes ?? []).map((resume) => [resume.id, resume.fileName]),
  );
  const jobTitles = new Map(
    (jobs.data?.jobDescriptions ?? []).map((job) => [job.id, job.title ?? "Saved job description"]),
  );

  return (
    <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Career targets</p>
          <h2 className="mt-1 text-xl font-semibold">Target jobs</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Define the specific job you are preparing for. Interviews you start will be associated
            with your current target.
          </p>
        </div>
        <Button onClick={startCreate} disabled={targets.isPending}>
          <Plus className="size-4" />
          Add target job
        </Button>
      </div>

      {open ? (
        <form
          className="mt-5 space-y-3 rounded-xl border border-border bg-background/50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Job title (required)"
              required
              maxLength={160}
            />
            <Input
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Company (optional)"
              maxLength={160}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={jobUrl}
              onChange={(event) => setJobUrl(event.target.value)}
              placeholder="Job posting URL (optional)"
              type="url"
              maxLength={2048}
            />
            <Input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Location (optional)"
              maxLength={160}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={resumeId}
              onChange={(event) => setResumeId(event.target.value)}
            >
              <option value="">No linked resume</option>
              {(resumes.data?.resumes ?? [])
                .filter((resume) => resume.status !== "DELETED")
                .map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.fileName}
                    {resume.isActive ? " · Active" : ""}
                  </option>
                ))}
            </select>
            <select
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={jobDescriptionId}
              onChange={(event) => setJobDescriptionId(event.target.value)}
            >
              <option value="">No linked job description</option>
              {(jobs.data?.jobDescriptions ?? [])
                .filter((job) => job.status !== "DELETED")
                .map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title ?? "Saved job description"}
                    {job.company ? ` · ${job.company}` : ""}
                  </option>
                ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Job descriptions are stored as-is; no AI analysis runs when you save a target.
          </p>
          {error ? (
            <p className="text-sm text-destructive">
              {error}
              {errorUpgrade ? (
                <>
                  {" "}
                  <Link
                    href="/subscription"
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    See plans
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save changes" : "Add target"}
            </Button>
            <Button type="button" variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mt-5 space-y-3">
        {targets.isPending ? (
          <div className="flex gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading targets…
          </div>
        ) : null}
        {!targets.isPending && list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No target jobs yet</p>
            <p className="mx-auto mt-1 max-w-md">
              Add the job you are preparing for so your practice interviews and future readiness
              tracking stay focused on it.
            </p>
            <Button className="mt-4" variant="outline" size="sm" onClick={startCreate}>
              <Plus className="size-3.5" />
              Add your first target job
            </Button>
          </div>
        ) : null}
        {list.map((target) => {
          const isCurrent = target.status === "ACTIVE";
          return (
            <div key={target.id} className="rounded-xl border border-border bg-background/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <BriefcaseBusiness className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{target.title}</span>
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          <Star className="size-3" /> Current target
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Archived
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {target.company ? <span>{target.company}</span> : null}
                      {target.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" /> {target.location}
                        </span>
                      ) : null}
                      {target.jobDescriptionId ? (
                        <span>
                          Linked to {jobTitles.get(target.jobDescriptionId) ?? "a saved role"}
                        </span>
                      ) : null}
                      {target.resumeId ? (
                        <span>Uses {resumeNames.get(target.resumeId) ?? "a saved resume"}</span>
                      ) : null}
                      {target.jobUrl ? (
                        <a
                          href={target.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Posting <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!isCurrent ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => activate.mutate(target.id)}
                      disabled={activate.isPending}
                    >
                      <CheckCircle2 className="size-3" />
                      Set as current
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => startEdit(target)}>
                    <Pencil className="size-4" />
                    <span className="sr-only">Edit {target.title}</span>
                  </Button>
                  {isCurrent ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Archive ${target.title}`}
                      onClick={() => archive.mutate(target.id)}
                      disabled={archive.isPending}
                    >
                      <Archive className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {list.length > 1 && active ? (
          <p className="text-xs text-muted-foreground">
            Only one target is current at a time. Activating another target archives {active.title}.
          </p>
        ) : null}
      </div>
    </section>
  );
}
