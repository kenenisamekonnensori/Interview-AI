"use client";

import type { Resume, ResumeUploadRequest, ResumeUploadResponse } from "@interviewer-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, LoaderCircle, Sparkles, Star, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

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
  if (!acceptedMimeTypes.has(file.type)) return "Choose a PDF or DOCX file.";
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
    // Some networks or browser privacy settings cannot reach the storage origin directly.
    // Use the authenticated API fallback, which applies the same ownership metadata and verification.
    return apiBinaryClient<{ resume: Resume }>(`/api/v1/resumes/${resume.id}/content`, {
      body: file,
      contentType: file.type,
    });
  }
  if (!response.ok) throw new Error("Your file could not be uploaded. Please try again.");
  return apiClient<{ resume: Resume }>(`/api/v1/resumes/${resume.id}/complete`, { method: "POST" });
}

export function ResumeManager() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data, isPending } = useQuery({
    queryKey: resumesQueryKey,
    queryFn: () => apiClient<{ resumes: Resume[] }>("/api/v1/resumes"),
    refetchInterval: (query) =>
      query.state.data?.resumes.some((resume) => resume.status === "ANALYZING") ? 3_000 : false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: resumesQueryKey });
  const upload = useMutation({
    mutationFn: uploadResume,
    onSuccess: refresh,
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Your file could not be uploaded."),
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

  function chooseFile() {
    inputRef.current?.click();
  }
  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validationError = validateResumeFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    upload.mutate(file);
  }

  const resumes = data?.resumes ?? [];
  return (
    <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Career profile</p>
          <h2 className="mt-1 text-xl font-semibold">Your resumes</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Add the resume you want the interviewer to use. Your active resume will personalize
            future interview plans.
          </p>
        </div>
        <Button onClick={chooseFile} disabled={upload.isPending}>
          <Upload className="size-4" />
          {upload.isPending ? "Uploading…" : "Upload resume"}
        </Button>
      </div>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={onFileChange}
      />
      {error ? (
        <p
          aria-live="polite"
          className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-5 space-y-3">
        {isPending ? (
          <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading your resumes…
          </div>
        ) : null}
        {!isPending && resumes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
            Upload a PDF or DOCX file (up to 10 MB) to get started.
          </div>
        ) : null}
        {resumes.map((resume) => (
          <div
            key={resume.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-background/50 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{resume.fileName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatFileSize(resume.fileSize)} · Added{" "}
                  {new Date(resume.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {resume.status === "ANALYZED"
                    ? "Analysis ready"
                    : resume.status === "ANALYZING"
                      ? "Analysis in progress"
                      : resume.status === "FAILED"
                        ? "Analysis failed"
                        : "Ready to analyze"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => analyze.mutate(resume.id)}
                disabled={analyze.isPending || resume.status === "ANALYZING"}
              >
                <Sparkles className="size-3" />
                {resume.status === "ANALYZING"
                  ? "Analyzing"
                  : resume.status === "ANALYZED"
                    ? "Reanalyze"
                    : "Analyze"}
              </Button>
              {resume.isActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Star className="size-3 fill-current" />
                  Active
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => activate.mutate(resume.id)}
                  disabled={activate.isPending}
                >
                  Use for interviews
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${resume.fileName}`}
                onClick={() => remove.mutate(resume.id)}
                disabled={remove.isPending && remove.variables === resume.id}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
