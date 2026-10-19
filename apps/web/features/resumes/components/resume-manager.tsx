"use client";

import type { Resume, ResumeUploadRequest, ResumeUploadResponse } from "@interviewer-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  FileText,
  FileUp,
  GraduationCap,
  LoaderCircle,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { apiBinaryClient, apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

const resumesQueryKey = ["resumes"] as const;
const maximumFileSize = 10 * 1024 * 1024;
const acceptedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 1 : 0)} MB`;
}

function validateResumeFile(file: File) {
  if (!acceptedMimeTypes.has(file.type)) return "Please select a PDF or DOCX file.";
  if (file.size > maximumFileSize) return "Your resume must be 10 MB or smaller.";
  return null;
}

async function uploadResume(file: File) {
  const payload: ResumeUploadRequest = {
    fileName: file.name,
    mimeType: file.type as ResumeUploadRequest["mimeType"],
    fileSize: file.size,
  };
  const { resume, upload } = await apiClient<ResumeUploadResponse>("/api/v1/resumes/uploads", {
    method: "POST",
    body: payload,
  });

  let response: Response | null = null;
  try {
    response = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: file });
  } catch {
    // Authenticated API fallback if direct storage origin is blocked
    await apiBinaryClient<{ resume: Resume }>(`/api/v1/resumes/${resume.id}/content`, {
      body: file,
      contentType: file.type,
    });
  }

  if (response && !response.ok) {
    throw new Error("Your file could not be uploaded. Please try again.");
  }

  const completed = await apiClient<{ resume: Resume }>(`/api/v1/resumes/${resume.id}/complete`, {
    method: "POST",
  });

  // Automatically start AI skill analysis right after upload
  try {
    await apiClient(`/api/v1/resumes/${resume.id}/analyze`, { method: "POST" });
  } catch {
    // Best effort background trigger; candidate can re-trigger if needed
  }

  return completed;
}

type ResumeAnalysisData = {
  summary: string;
  skills: string[];
  technologies: string[];
  experience: Array<{
    company: string | null;
    title: string | null;
    highlights: string[];
  }>;
  education: string[];
  projects: string[];
  certifications: string[];
};

export function ResumeManager() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedResumeId, setExpandedResumeId] = useState<string | null>(null);
  const [uploadingName, setUploadingName] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: resumesQueryKey,
    queryFn: () => apiClient<{ resumes: Resume[] }>("/api/v1/resumes"),
    refetchInterval: (query) =>
      query.state.data?.resumes.some((resume) => resume.status === "ANALYZING") ? 2_500 : false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: resumesQueryKey });

  const upload = useMutation({
    mutationFn: uploadResume,
    onMutate: (file) => {
      setUploadingName(file.name);
      setError(null);
    },
    onSuccess: (result) => {
      setUploadingName(null);
      setExpandedResumeId(result.resume.id);
      refresh();
    },
    onError: (cause) => {
      setUploadingName(null);
      setError(cause instanceof Error ? cause.message : "Your file could not be uploaded.");
    },
  });

  const activate = useMutation({
    mutationFn: (id: string) => apiClient(`/api/v1/resumes/${id}/activate`, { method: "POST" }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient(`/api/v1/resumes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Your resume could not be deleted."),
  });

  const analyze = useMutation({
    mutationFn: (id: string) => apiClient(`/api/v1/resumes/${id}/analyze`, { method: "POST" }),
    onSuccess: refresh,
  });

  function handleFileSelected(file: File) {
    const validationError = validateResumeFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    upload.mutate(file);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) handleFileSelected(file);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    // Only unset if leaving the drop container itself
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  }

  const resumes = (data?.resumes ?? []).filter((resume) => resume.status !== "DELETED");
  const activeResume = resumes.find((resume) => resume.isActive);

  return (
    <section className="rounded-3xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur-sm sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Candidate materials</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Your Resumes</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Upload your resume so the AI interviewer calibrates depth, projects, and questions to
            your actual background.
          </p>
        </div>
        {activeResume && (
          <div className="flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/10 px-3.5 py-2 text-xs font-medium text-primary">
            <Star className="size-3.5 fill-current" />
            <span>Active: {activeResume.fileName}</span>
          </div>
        )}
      </div>

      {/* Modern Drag and Drop Upload Zone */}
      <div
        className={`group relative mt-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 cursor-pointer ${
          isDragging
            ? "border-primary bg-primary/10 ring-4 ring-primary/20 scale-[1.01]"
            : "border-border/80 bg-background/40 hover:border-primary/50 hover:bg-card/80"
        } ${upload.isPending ? "pointer-events-none opacity-80" : ""}`}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label="Upload resume by dragging and dropping or browsing"
      >
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onFileChange}
        />

        {upload.isPending ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="relative">
              <LoaderCircle className="size-10 animate-spin text-primary" />
              <Sparkles className="absolute -top-1 -right-1 size-4 text-primary animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Uploading {uploadingName ?? "resume"}…
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Uploading and automatically starting AI skill extraction
              </p>
            </div>
            <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-border">
              <div className="h-full w-full animate-pulse rounded-full bg-primary" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div
              className={`grid size-12 place-items-center rounded-2xl transition-transform duration-200 ${
                isDragging
                  ? "bg-primary text-primary-foreground scale-110 shadow-lg"
                  : "bg-primary/10 text-primary group-hover:scale-110"
              }`}
            >
              {isDragging ? <FileUp className="size-6" /> : <Upload className="size-6" />}
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">
                {isDragging ? (
                  "Drop your resume to upload"
                ) : (
                  <>
                    <span className="text-primary hover:underline">Click to browse</span> or drag
                    and drop your resume here
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Supports PDF or DOCX up to 10 MB · AI extracts skills automatically
              </p>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <div
          aria-live="polite"
          className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <span>{error}</span>
        </div>
      ) : null}

      {/* Resumes List */}
      <div className="mt-6 space-y-3.5">
        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin text-primary" />
            Loading your resumes…
          </div>
        ) : null}

        {!isPending && resumes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            No resume on file yet. Drop your PDF or DOCX resume above to personalize your mock
            interviews.
          </div>
        ) : null}

        {resumes.map((resume) => {
          const isExpanded = expandedResumeId === resume.id;
          const isAnalyzing = resume.status === "ANALYZING";

          return (
            <div
              key={resume.id}
              className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                resume.isActive
                  ? "border-primary/40 bg-card shadow-sm"
                  : "border-border/80 bg-background/50 hover:border-border"
              }`}
            >
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span
                    className={`grid size-11 shrink-0 place-items-center rounded-xl ${
                      resume.isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    <FileText className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {resume.fileName}
                      </p>
                      {resume.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          <Star className="size-3 fill-current" />
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatFileSize(resume.fileSize)} · Added{" "}
                      {new Date(resume.createdAt).toLocaleDateString()}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      {isAnalyzing ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-500">
                          <LoaderCircle className="size-3 animate-spin" />
                          AI is extracting skills & experience…
                        </span>
                      ) : resume.status === "ANALYZED" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
                          <CheckCircle2 className="size-3" />
                          AI Analysis Ready
                        </span>
                      ) : resume.status === "FAILED" ? (
                        <span className="text-xs text-destructive">Analysis failed</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Ready for analysis</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
                  {resume.status === "ANALYZED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedResumeId(isExpanded ? null : resume.id)}
                      className="gap-1.5"
                    >
                      <Sparkles className="size-3 text-primary" />
                      {isExpanded ? "Hide Insights" : "View Insights"}
                      {isExpanded ? (
                        <ChevronUp className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                    </Button>
                  ) : null}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => analyze.mutate(resume.id)}
                    disabled={analyze.isPending || isAnalyzing}
                  >
                    <Sparkles className="size-3" />
                    {isAnalyzing
                      ? "Analyzing…"
                      : resume.status === "ANALYZED"
                        ? "Re-analyze"
                        : "Analyze"}
                  </Button>

                  {!resume.isActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => activate.mutate(resume.id)}
                      disabled={activate.isPending}
                    >
                      Use for interviews
                    </Button>
                  ) : null}

                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${resume.fileName}`}
                    onClick={() => remove.mutate(resume.id)}
                    disabled={remove.isPending && remove.variables === resume.id}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Expandable AI Analysis Insights Drawer */}
              {isExpanded ? <ResumeAnalysisSection resumeId={resume.id} /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ResumeAnalysisSection({ resumeId }: { resumeId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["resume-analysis", resumeId],
    queryFn: () =>
      apiClient<{ status: string; analysis: ResumeAnalysisData | null }>(
        `/api/v1/resumes/${resumeId}/analysis`,
      ),
  });

  const analysis = data?.analysis;

  if (isPending) {
    return (
      <div className="border-t border-border bg-card/40 p-5 text-center text-xs text-muted-foreground">
        <LoaderCircle className="mx-auto size-4 animate-spin text-primary" />
        <span className="mt-2 block">Loading AI resume insights…</span>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="border-t border-border bg-card/40 p-5 text-center text-xs text-muted-foreground">
        No analysis data available yet. Click "Analyze" above to extract your skills and experience.
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t border-border/70 bg-card/30 p-5 sm:p-6">
      {/* Executive Summary */}
      {analysis.summary && (
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <FileText className="size-3.5 text-primary" /> Executive Summary
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90 bg-background/50 p-3.5 rounded-xl border border-border/50">
            {analysis.summary}
          </p>
        </div>
      )}

      {/* Core Skills & Tech Stack */}
      <div className="grid gap-4 sm:grid-cols-2">
        {analysis.skills?.length ? (
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" /> Core Competencies (
              {analysis.skills.length})
            </h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {analysis.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary border border-primary/20"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {analysis.technologies?.length ? (
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Code2 className="size-3.5 text-primary" /> Technology Stack (
              {analysis.technologies.length})
            </h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {analysis.technologies.map((tech) => (
                <span
                  key={tech}
                  className="rounded-lg bg-secondary/80 px-2.5 py-1 text-xs font-medium text-secondary-foreground border border-border"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Experience Highlights */}
      {analysis.experience?.length ? (
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Briefcase className="size-3.5 text-primary" /> Experience Milestones (
            {analysis.experience.length})
          </h4>
          <div className="mt-2 space-y-2.5">
            {analysis.experience.slice(0, 4).map((exp, index) => (
              <div
                key={index}
                className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1 font-semibold text-foreground">
                  <span>{exp.title ?? "Role"}</span>
                  {exp.company && (
                    <span className="text-muted-foreground font-normal">@ {exp.company}</span>
                  )}
                </div>
                {exp.highlights?.length ? (
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                    {exp.highlights.slice(0, 3).map((hl, i) => (
                      <li key={i}>{hl}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Projects & Education */}
      {analysis.projects?.length || analysis.education?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          {analysis.projects?.length ? (
            <div>
              <h5 className="font-semibold text-muted-foreground">Key Projects</h5>
              <div className="mt-1 flex flex-wrap gap-1">
                {analysis.projects.slice(0, 5).map((project, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-background px-2 py-0.5 text-xs text-foreground/80 border border-border/50"
                  >
                    {project}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {analysis.education?.length ? (
            <div>
              <h5 className="flex items-center gap-1 font-semibold text-muted-foreground">
                <GraduationCap className="size-3 text-primary" /> Education
              </h5>
              <p className="mt-1 text-muted-foreground">{analysis.education.join(" · ")}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
