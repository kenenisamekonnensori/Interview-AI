"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type {
  JobAnalysisDto,
  JobDescriptionDto,
  JobDescriptionStatus,
} from "@interviewer-ai/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";

const queryKey = ["job-descriptions"] as const;

export function JobDescriptionManager() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rawText, setRawText] = useState("");
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => apiClient<{ jobDescriptions: JobDescriptionDto[] }>("/api/v1/job-descriptions"),
    refetchInterval: (query) =>
      query.state.data?.jobDescriptions.some((job) => job.status === "ANALYZING") ? 3_000 : false,
  });

  const refresh = () => client.invalidateQueries({ queryKey });

  const analyze = useMutation({
    mutationFn: (id: string) =>
      apiClient(`/api/v1/job-descriptions/${id}/analyze`, { method: "POST" }),
    onSuccess: refresh,
  });

  const create = useMutation({
    mutationFn: () =>
      apiClient<{ jobDescription: JobDescriptionDto }>("/api/v1/job-descriptions", {
        method: "POST",
        body: { title: title || undefined, company: company || undefined, rawText },
      }),
    onSuccess: async (res) => {
      const newId = res.jobDescription?.id;
      setTitle("");
      setCompany("");
      setRawText("");
      setOpen(false);
      refresh();

      if (autoAnalyze && newId) {
        setSelected(newId);
        try {
          await analyze.mutateAsync(newId);
        } catch {
          // Non-blocking fallback
        }
      }
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient(`/api/v1/job-descriptions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setSelected(null);
      refresh();
    },
  });

  const { data: analysis, isPending: analysisPending } = useQuery({
    queryKey: ["job-analysis", selected],
    queryFn: () =>
      apiClient<{ status: JobDescriptionStatus; analysis: JobAnalysisDto | null }>(
        `/api/v1/job-descriptions/${selected}/analysis`,
      ),
    enabled: selected !== null,
    refetchInterval: (query) => (query.state.data?.status === "ANALYZING" ? 3_000 : false),
  });

  const jobs = data?.jobDescriptions ?? [];
  const textValid = rawText.trim().length >= 100;

  return (
    <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Target role</p>
          <h2 className="mt-1 text-xl font-semibold">Job descriptions</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Save real job posts. The AI extracts requirements and skills to ground your practice
            interviews and simulations.
          </p>
        </div>
        <Button
          onClick={() => setOpen((value) => !value)}
          variant={open ? "outline" : "default"}
          className="gap-2"
        >
          <Plus className={`size-4 transition-transform duration-200 ${open ? "rotate-45" : ""}`} />
          {open ? "Cancel" : "Add job description"}
        </Button>
      </div>

      {open ? (
        <form
          className="mt-5 space-y-4 rounded-xl border border-border/80 bg-background/60 p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Role title
              </label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Senior Frontend Engineer"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Company (optional)
              </label>
              <Input
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="e.g. Acme Corp"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label className="font-medium text-muted-foreground">Job description paste</label>
              <span
                className={`font-mono text-xs transition-colors ${
                  textValid
                    ? "font-semibold text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                {rawText.length} / 100 characters {textValid ? "✓ ready" : "minimum"}
              </span>
            </div>
            <textarea
              className="min-h-44 w-full rounded-xl border border-input bg-card/60 p-3 text-sm leading-relaxed outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="Paste the full job posting text here (responsibilities, required qualifications, tech stack)..."
              required
              minLength={100}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={autoAnalyze}
                onChange={(e) => setAutoAnalyze(e.target.checked)}
                className="size-4 rounded border-border accent-primary"
              />
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Sparkles className="size-3.5 text-primary" />
                Auto-extract skills & tech stack with AI
              </span>
            </label>

            <Button type="submit" disabled={create.isPending || !textValid} className="gap-2">
              {create.isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Saving & Analyzing…
                </>
              ) : (
                "Save job description"
              )}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mt-5 space-y-3">
        {isPending ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin text-primary" />
            Loading saved roles…
          </div>
        ) : null}

        {!isPending && jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground">
            <BriefcaseBusiness className="mx-auto mb-2 size-6 text-muted-foreground/60" />
            <p className="font-medium text-foreground">No job descriptions added yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a real target role description to get questions tailored to exact company
              expectations.
            </p>
          </div>
        ) : null}

        {jobs.map((job) => {
          const isSelected = selected === job.id;
          return (
            <div
              key={job.id}
              className={`rounded-xl border transition-all duration-200 ${
                isSelected
                  ? "border-primary/50 bg-background/90 shadow-sm ring-1 ring-primary/20"
                  : "border-border bg-background/50 hover:border-border/80"
              } p-4`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none"
                  onClick={() => setSelected(isSelected ? null : job.id)}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <BriefcaseBusiness className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {job.title ?? "Untitled role"}
                      </span>
                      {job.company ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Building2 className="size-3" />
                          {job.company}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {job.status === "ANALYZED" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3" />
                          AI Analyzed
                        </span>
                      ) : job.status === "ANALYZING" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <LoaderCircle className="size-3 animate-spin" />
                          Extracting requirements…
                        </span>
                      ) : job.status === "FAILED" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                          Analysis failed
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Ready to analyze</span>
                      )}
                      <span className="text-xs text-muted-foreground/60">
                        • Click to view details
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform duration-200 ${
                      isSelected ? "rotate-180 text-foreground" : ""
                    }`}
                  />
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/interviews/new?jobDescriptionId=${job.id}&targetRole=${encodeURIComponent(job.title ?? "")}`}
                  >
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                      <Play className="size-3 fill-primary text-primary" />
                      Practice
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => analyze.mutate(job.id)}
                    disabled={analyze.isPending || job.status === "ANALYZING"}
                  >
                    <Sparkles className="size-3 text-primary" />
                    {job.status === "ANALYZING"
                      ? "Analyzing"
                      : job.status === "ANALYZED"
                        ? "Reanalyze"
                        : "Analyze"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    aria-label="Delete job description"
                    onClick={() => remove.mutate(job.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {isSelected ? (
                <div className="mt-4 border-t border-border/70 pt-4">
                  {analysisPending ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <LoaderCircle className="size-3.5 animate-spin text-primary" />
                      Loading AI analysis…
                    </div>
                  ) : (
                    <AnalysisView
                      analysis={analysis?.analysis ?? null}
                      status={analysis?.status ?? job.status}
                      jobId={job.id}
                      jobTitle={job.title ?? "this role"}
                    />
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AnalysisView({
  analysis,
  status,
  jobId,
  jobTitle,
}: {
  analysis: JobAnalysisDto | null;
  status: JobDescriptionStatus;
  jobId: string;
  jobTitle: string;
}) {
  if (status === "ANALYZING")
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
        <LoaderCircle className="size-4 animate-spin" />
        AI is extracting skills, technology requirements, and responsibilities for this role…
      </div>
    );

  if (status === "FAILED")
    return (
      <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
        Analysis failed. Please click "Reanalyze" above to retry.
      </p>
    );

  if (!analysis)
    return (
      <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        Click "Analyze" to extract key skills and tech stack from this job description.
      </div>
    );

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="grid gap-4 sm:grid-cols-2">
        <AnalysisList
          title="Required skills"
          values={analysis.requiredSkills}
          pillClassName="bg-primary/10 text-primary border border-primary/20"
        />
        <AnalysisList
          title="Technology stack"
          values={analysis.technologyStack}
          pillClassName="bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
        />
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Key Responsibilities
          </p>
          <div className="mt-2 space-y-1.5">
            {analysis.responsibilities && analysis.responsibilities.length > 0 ? (
              analysis.responsibilities.map((resp, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 rounded-lg bg-background/60 p-2 text-xs text-foreground/90"
                >
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{resp}</span>
                </div>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">None identified</span>
            )}
          </div>
        </div>
        <div className="sm:col-span-2">
          <AnalysisList
            title="Interview Keywords & Topics"
            values={analysis.keywords}
            pillClassName="bg-secondary text-secondary-foreground text-[11px]"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-primary/5 p-3.5 border border-primary/15">
        <div>
          <p className="text-xs font-semibold text-foreground">Ready to test yourself?</p>
          <p className="text-xs text-muted-foreground">
            Generate customized interview questions matching {jobTitle}.
          </p>
        </div>
        <Link
          href={`/interviews/new?jobDescriptionId=${jobId}&targetRole=${encodeURIComponent(jobTitle)}`}
        >
          <Button size="sm" className="gap-1.5 shadow-sm text-xs">
            <Play className="size-3 fill-primary-foreground" />
            Launch Practice Session
          </Button>
        </Link>
      </div>
    </div>
  );
}

function AnalysisList({
  title,
  values,
  pillClassName = "bg-primary/10 text-primary",
}: {
  title: string;
  values: string[];
  pillClassName?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.length ? (
          values.map((value) => (
            <span
              key={value}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${pillClassName}`}
            >
              {value}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">None identified</span>
        )}
      </div>
    </div>
  );
}
