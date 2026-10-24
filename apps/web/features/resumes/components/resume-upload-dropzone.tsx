"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, LoaderCircle, Sparkles, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

import {
  uploadResumeFile,
  validateResumeFile,
  type ResumeUploadResult,
} from "@/features/resumes/lib/resume-upload";

type ResumeUploadDropzoneProps = {
  onUploadSuccess?: (result: ResumeUploadResult) => void;
  variant?: "default" | "compact";
  autoActivate?: boolean;
  analyzeAfterUpload?: boolean;
};

export function ResumeUploadDropzone({
  onUploadSuccess,
  variant = "default",
  autoActivate = false,
  analyzeAfterUpload = true,
}: ResumeUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadResumeFile(file, { activate: autoActivate, analyze: analyzeAfterUpload }),
    onMutate: (file) => {
      setFileName(file.name);
      setError(null);
      setSuccess(null);
    },
    onSuccess: (result) => {
      setFileName(null);
      void queryClient.invalidateQueries({ queryKey: ["resumes"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      setSuccess(uploadSuccessMessage(result, autoActivate, analyzeAfterUpload));
      onUploadSuccess?.(result);
    },
    onError: (cause) => {
      setFileName(null);
      setError(cause instanceof Error ? cause.message : "Your resume could not be uploaded.");
    },
  });

  function handleFileSelected(file: File) {
    const validationError = validateResumeFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSuccess(null);
    uploadMutation.mutate(file);
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

  const isCompact = variant === "compact";

  return (
    <div className="w-full">
      <div
        className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer ${
          isCompact ? "p-4" : "p-6 sm:p-8"
        } ${
          isDragging
            ? "border-primary bg-primary/10 ring-4 ring-primary/20 scale-[1.01]"
            : "border-border/80 bg-background/50 hover:border-primary/50 hover:bg-card/80"
        } ${uploadMutation.isPending ? "pointer-events-none opacity-85" : ""}`}
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
        aria-label="Upload resume"
      >
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onFileChange}
        />

        {uploadMutation.isPending ? (
          <div className="flex flex-col items-center gap-2.5 py-1 text-center">
            <div className="relative">
              <LoaderCircle className="size-8 animate-spin text-primary" />
              <Sparkles className="absolute -top-1 -right-1 size-3.5 text-primary animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Uploading {fileName ?? "resume"}…
              </p>
              <p className="text-xs text-muted-foreground">Storing resume and extracting skills</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <div
              className={`grid place-items-center rounded-xl transition-transform duration-200 ${
                isCompact ? "size-9" : "size-11"
              } ${
                isDragging
                  ? "bg-primary text-primary-foreground scale-110 shadow-md"
                  : "bg-primary/10 text-primary group-hover:scale-110"
              }`}
            >
              {isDragging ? (
                <FileUp className={isCompact ? "size-5" : "size-5"} />
              ) : (
                <Upload className={isCompact ? "size-5" : "size-5"} />
              )}
            </div>
            <div>
              <p className={`font-medium text-foreground ${isCompact ? "text-xs" : "text-sm"}`}>
                {isDragging ? (
                  "Drop resume to upload"
                ) : (
                  <>
                    <span className="text-primary hover:underline">Click to browse</span> or drag &
                    drop
                  </>
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">PDF or DOCX up to 10 MB</p>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <div
          aria-live="polite"
          className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[11px] font-semibold hover:underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {success ? (
        <div
          aria-live="polite"
          className="mt-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400"
          role="status"
        >
          {success}
        </div>
      ) : null}
    </div>
  );
}

function uploadSuccessMessage(
  result: ResumeUploadResult,
  autoActivate: boolean,
  analyzeAfterUpload: boolean,
) {
  if (result.activation === "failed") {
    return `Resume uploaded, but it was not set as active. ${result.activationError ?? "Choose it from your saved resumes."}`;
  }
  if (!analyzeAfterUpload) {
    return `Resume uploaded${autoActivate ? " and set as active" : ""}. Analyze it before using it for a personalized interview.`;
  }
  if (result.analysis === "not-started") {
    return `Resume uploaded${autoActivate ? " and set as active" : ""}. AI analysis could not start; you can retry it from your saved resumes.`;
  }
  return autoActivate
    ? "Resume uploaded and set as active. AI analysis is in progress."
    : "Resume uploaded. AI analysis is in progress.";
}
