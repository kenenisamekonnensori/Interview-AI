"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BriefcaseBusiness, ChevronDown, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";

type Job = {
  id: string;
  title: string | null;
  company: string | null;
  rawText: string;
  status: "READY" | "ANALYZING" | "ANALYZED" | "FAILED";
  createdAt: string;
};
type Analysis = {
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  keywords: string[];
  seniority: string | null;
  technologyStack: string[];
};
const queryKey = ["job-descriptions"] as const;

export function JobDescriptionManager() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rawText, setRawText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => apiClient<{ jobDescriptions: Job[] }>("/api/v1/job-descriptions"),
    refetchInterval: (query) =>
      query.state.data?.jobDescriptions.some((job) => job.status === "ANALYZING") ? 3_000 : false,
  });
  const refresh = () => client.invalidateQueries({ queryKey });
  const create = useMutation({
    mutationFn: () =>
      apiClient<{ jobDescription: Job }>("/api/v1/job-descriptions", {
        method: "POST",
        body: { title: title || undefined, company: company || undefined, rawText },
      }),
    onSuccess: () => {
      setTitle("");
      setCompany("");
      setRawText("");
      setOpen(false);
      refresh();
    },
  });
  const analyze = useMutation({
    mutationFn: (id: string) =>
      apiClient(`/api/v1/job-descriptions/${id}/analyze`, { method: "POST" }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient(`/api/v1/job-descriptions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setSelected(null);
      refresh();
    },
  });
  const { data: analysis } = useQuery({
    queryKey: ["job-analysis", selected],
    queryFn: () =>
      apiClient<{ status: Job["status"]; analysis: Analysis | null }>(
        `/api/v1/job-descriptions/${selected}/analysis`,
      ),
    enabled: selected !== null,
    refetchInterval: (query) => (query.state.data?.status === "ANALYZING" ? 3_000 : false),
  });
  const jobs = data?.jobDescriptions ?? [];
  return (
    <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Target role</p>
          <h2 className="mt-1 text-xl font-semibold">Job descriptions</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Add a role to focus interview questions on its actual requirements.
          </p>
        </div>
        <Button onClick={() => setOpen((value) => !value)}>
          <Plus className="size-4" />
          Add job description
        </Button>
      </div>
      {open ? (
        <form
          className="mt-5 space-y-3 rounded-xl border border-border bg-background/50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Role title (optional)"
            />
            <Input
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Company (optional)"
            />
          </div>
          <textarea
            className="min-h-40 w-full rounded-xl border border-input bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="Paste the job description (at least 100 characters)"
            required
            minLength={100}
          />
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Save job description"}
          </Button>
        </form>
      ) : null}
      <div className="mt-5 space-y-3">
        {isPending ? (
          <div className="flex gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading roles…
          </div>
        ) : null}
        {!isPending && jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
            Add a job description to personalize your next interview.
          </div>
        ) : null}
        {jobs.map((job) => (
          <div key={job.id} className="rounded-xl border border-border bg-background/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                className="flex min-w-0 items-center gap-3 text-left"
                onClick={() => setSelected(selected === job.id ? null : job.id)}
              >
                <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <BriefcaseBusiness className="size-5" />
                </span>
                <span>
                  <span className="block font-medium">
                    {job.title ?? "Untitled role"}
                    {job.company ? ` · ${job.company}` : ""}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {job.status === "ANALYZED"
                      ? "Analysis ready"
                      : job.status === "ANALYZING"
                        ? "Analysis in progress"
                        : job.status === "FAILED"
                          ? "Analysis failed"
                          : "Ready to analyze"}
                  </span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => analyze.mutate(job.id)}
                  disabled={analyze.isPending || job.status === "ANALYZING"}
                >
                  <Sparkles className="size-3" />
                  {job.status === "ANALYZING"
                    ? "Analyzing"
                    : job.status === "ANALYZED"
                      ? "Reanalyze"
                      : "Analyze"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete job description"
                  onClick={() => remove.mutate(job.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            {selected === job.id ? (
              <AnalysisView
                analysis={analysis?.analysis ?? null}
                status={analysis?.status ?? job.status}
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function AnalysisView({ analysis, status }: { analysis: Analysis | null; status: Job["status"] }) {
  if (status === "ANALYZING")
    return <p className="mt-4 text-sm text-muted-foreground">Extracting interview priorities…</p>;
  if (status === "FAILED")
    return <p className="mt-4 text-sm text-destructive">Analysis failed. Try again.</p>;
  if (!analysis)
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Run analysis to see the role’s skills and responsibilities.
      </p>
    );
  return (
    <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
      <AnalysisList title="Required skills" values={analysis.requiredSkills} />
      <AnalysisList title="Technology stack" values={analysis.technologyStack} />
      <AnalysisList title="Responsibilities" values={analysis.responsibilities} />
      <AnalysisList title="Keywords" values={analysis.keywords} />
    </div>
  );
}
function AnalysisList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.length ? (
          values.map((value) => (
            <span key={value} className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              {value}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">None identified</span>
        )}
      </div>
    </div>
  );
}
