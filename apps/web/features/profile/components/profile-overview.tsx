"use client";

import type { CareerTargetDto, JobDescriptionDto, Resume } from "@interviewer-ai/types";
import {
  Briefcase,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResumeUploadDropzone } from "@/features/resumes/components/resume-upload-dropzone";
import {
  resumeAnalysisFailureCopy,
  resumeAnalysisFailureLabel,
} from "@/features/resumes/lib/resume-analysis-guidance";
import { formatResumeFileSize } from "@/features/resumes/lib/resume-upload";
import { ApiError, apiClient } from "@/lib/api-client";

type Profile = {
  preferredName: string | null;
  profession: string | null;
  targetRole: string | null;
  seniority: string | null;
  yearsOfExperience: number | null;
  preferredLanguage?: string;
  defaultInterviewDuration?: number;
  defaultDifficulty?: "EASY" | "MEDIUM" | "HARD" | "EXPERT";
};

type ProfileResponse = { profile: Profile };

export function ProfileOverview() {
  const client = useQueryClient();
  const [editingProfile, setEditingProfile] = useState(false);
  const [showResumeUploader, setShowResumeUploader] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiClient<ProfileResponse>("/api/v1/profile"),
  });

  const resumes = useQuery({
    queryKey: ["resumes"],
    queryFn: () => apiClient<{ resumes: Resume[] }>("/api/v1/resumes"),
    // Background analysis is server-owned; poll only while a resume is in flight.
    refetchInterval: (query) =>
      query.state.data?.resumes.some((resume) => resume.status === "ANALYZING") ? 2_500 : false,
  });

  const jobs = useQuery({
    queryKey: ["job-descriptions"],
    queryFn: () => apiClient<{ jobDescriptions: JobDescriptionDto[] }>("/api/v1/job-descriptions"),
  });

  const careerTargets = useQuery({
    queryKey: ["career-targets"],
    queryFn: () => apiClient<{ careerTargets: CareerTargetDto[] }>("/api/v1/career-targets"),
  });

  const saveProfile = useMutation({
    mutationFn: (body: Profile) =>
      apiClient<ProfileResponse>("/api/v1/profile", {
        method: "PUT",
        body: normalizeProfile(body),
      }),
    onSuccess: (response) => {
      client.setQueryData<ProfileResponse>(["profile"], response);
      void client.invalidateQueries({ queryKey: ["profile"] });
      setEditingProfile(false);
      setSaveFeedback("Your profile details have been saved.");
    },
    onError: (cause) => setSaveFeedback(profileSaveErrorMessage(cause)),
  });

  const activateResume = useMutation({
    mutationFn: (id: string) => apiClient(`/api/v1/resumes/${id}/activate`, { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["resumes"] });
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });
  const analyzeResume = useMutation({
    mutationFn: (id: string) => apiClient(`/api/v1/resumes/${id}/analyze`, { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["resumes"] });
      setSaveFeedback("Resume analysis has started. You can continue setting up your profile.");
    },
    onError: (cause) =>
      setSaveFeedback(cause instanceof Error ? cause.message : "We could not start resume analysis."),
  });

  const activeResume = resumes.data?.resumes.find(
    (resume) => resume.isActive && resume.status !== "DELETED",
  );

  useEffect(() => {
    if (activeResume?.status === "ANALYZED") {
      void client.invalidateQueries({ queryKey: ["resume-analysis", activeResume.id] });
    }
  }, [activeResume?.id, activeResume?.status, client]);

  const resumeAnalysis = useQuery({
    queryKey: ["resume-analysis", activeResume?.id],
    queryFn: () =>
      apiClient<{ analysis: { summary: string; skills: string[] } | null }>(
        `/api/v1/resumes/${activeResume!.id}/analysis`,
      ),
    enabled: Boolean(activeResume?.id),
  });

  const activeTarget = careerTargets.data?.careerTargets.find(
    (target) => target.status === "ACTIVE",
  );

  const firstSavedJob = jobs.data?.jobDescriptions?.[0];

  const userProfile = profile.data?.profile;

  if (!userProfile) {
    return (
      <main className="grid min-h-[calc(100vh-5rem)] place-items-center text-sm text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  const hasCompleteContext = Boolean(userProfile.targetRole || activeResume || activeTarget);

  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-7">
        {/* Header & Candidate Identity Card */}
        <section className="rounded-3xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Candidate Profile</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                {userProfile.preferredName ?? "Your Professional Profile"}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {[
                  userProfile.profession,
                  userProfile.seniority,
                  userProfile.yearsOfExperience !== null
                    ? `${userProfile.yearsOfExperience} years experience`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Complete your profile to personalize mock interviews."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSaveFeedback(null);
                  setEditingProfile((current) => !current);
                }}
              >
                <Pencil className="size-4" />
                {editingProfile ? "Cancel" : "Edit Details"}
              </Button>
              <Link href="/interviews/new">
                <Button>
                  <Sparkles className="size-4" />
                  {hasCompleteContext ? "Start Recommended Practice" : "Start General Practice"}
                </Button>
              </Link>
            </div>
          </div>

          {editingProfile ? (
            <ProfileEditor
              initial={userProfile}
              saving={saveProfile.isPending}
              onSave={saveProfile.mutate}
              onCancel={() => setEditingProfile(false)}
            />
          ) : null}

          {saveFeedback ? (
            <p aria-live="polite" className="mt-4 text-sm text-primary font-medium" role="status">
              {saveFeedback}
            </p>
          ) : null}

          {/* Quick Context Summary Badges */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <SummaryCard
              icon={<BriefcaseBusiness className="size-4 text-primary" />}
              label="Target Role"
              value={userProfile.targetRole ?? "Not set yet"}
            />
            <SummaryCard
              icon={<FileText className="size-4 text-primary" />}
              label="Active Resume"
              value={activeResume?.fileName ?? "No resume uploaded"}
            />
            <SummaryCard
              icon={<UserRound className="size-4 text-primary" />}
              label="Target Job"
              value={activeTarget?.title ?? jobs.data?.jobDescriptions[0]?.title ?? "No target job"}
            />
          </div>
        </section>

        {/* Section 2: Resume Setup & Upload Zone */}
        <section className="rounded-3xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="size-5 text-primary" />
                <h2 className="text-xl font-semibold tracking-tight">Your Resume</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Your resume allows the AI interviewer to probe real projects, verify technical
                depth, and tailor questions to your actual achievements.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResumeUploader((open) => !open)}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              {showResumeUploader ? "Close Uploader" : "Upload Resume"}
            </Button>
          </div>

          {/* Inline Resume Upload Zone */}
          {showResumeUploader ? (
            <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/[0.03] p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
                Upload New Resume
              </p>
              <ResumeUploadDropzone
                autoActivate={true}
                analyzeAfterUpload={false}
                onUploadSuccess={(result) => {
                  setShowResumeUploader(false);
                  setSaveFeedback(
                    result.activation === "activated"
                      ? "Resume uploaded and set as active."
                      : `Resume uploaded, but it was not set as active. ${result.activationError ?? "Choose it from your saved resumes."}`,
                  );
                }}
              />
            </div>
          ) : null}

          {/* Active Resume Card */}
          <div className="mt-5">
            {activeResume ? (
              <div className="overflow-hidden rounded-2xl border border-primary/40 bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3.5">
                    <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                      <FileText className="size-5" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {activeResume.fileName}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          <Star className="size-3 fill-current" />
                          Active
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatResumeFileSize(activeResume.fileSize)} · Added{" "}
                        {new Date(activeResume.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {activeResume.status === "ANALYZED" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
                        <CheckCircle2 className="size-3.5" />
                        AI Analysis Ready
                      </span>
                    ) : activeResume.status === "ANALYZING" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-500">
                        <LoaderCircle className="size-3 animate-spin" />
                        AI analysis in progress…
                      </span>
                    ) : activeResume.status === "FAILED" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        {resumeAnalysisFailureLabel(activeResume.analysisFailureCode)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Ready to analyze
                      </span>
                    )}
                  </div>
                </div>

                {activeResume.status !== "ANALYZED" ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/70 pt-4">
                    <p className="max-w-lg text-xs text-muted-foreground">
                      {activeResume.status === "ANALYZING"
                        ? "AI analysis is in progress. Personalized interviews unlock as soon as it finishes."
                        : activeResume.status === "FAILED"
                          ? resumeAnalysisFailureCopy(activeResume.analysisFailureCode).message
                          : "Analyze this resume so the AI can use it to prepare a personalized interview."}
                    </p>
                    {activeResume.status !== "ANALYZING" ? (
                      <Button
                        size="sm"
                        onClick={() => analyzeResume.mutate(activeResume.id)}
                        disabled={analyzeResume.isPending}
                      >
                        {analyzeResume.isPending
                          ? "Starting analysis…"
                          : activeResume.status === "FAILED"
                            ? "Retry analysis"
                            : "Analyze resume"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {/* AI Analysis Summary if available */}
                {resumeAnalysis.data?.analysis ? (
                  <div className="mt-4 border-t border-border/70 pt-4 text-xs">
                    <p className="font-semibold uppercase tracking-wider text-muted-foreground">
                      Extracted Background Summary
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                      {resumeAnalysis.data.analysis.summary}
                    </p>
                    {resumeAnalysis.data.analysis.skills?.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {resumeAnalysis.data.analysis.skills.slice(0, 10).map((skill) => (
                          <span
                            key={skill}
                            className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary border border-primary/20"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                <FileText className="mx-auto size-8 text-muted-foreground/60" />
                <p className="mt-2 text-sm font-medium text-foreground">No resume on file</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload your resume so the AI interviewer calibrates depth, projects, and questions
                  to your actual background.
                </p>
                <div className="mt-4 max-w-md mx-auto">
                  <ResumeUploadDropzone
                    autoActivate={true}
                    analyzeAfterUpload={false}
                    onUploadSuccess={(result) => {
                      setSaveFeedback(
                        result.activation === "activated"
                          ? "Resume uploaded and set as active."
                          : `Resume uploaded, but it was not set as active. ${result.activationError ?? "Choose it from your saved resumes."}`,
                      );
                    }}
                  />
                </div>
              </div>
            )}

            {/* Other Available Resumes */}
            {(resumes.data?.resumes ?? []).filter((r) => !r.isActive && r.status !== "DELETED")
              .length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Other Saved Resumes
                </p>
                <div className="space-y-2">
                  {(resumes.data?.resumes ?? [])
                    .filter((r) => !r.isActive && r.status !== "DELETED")
                    .map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-xl border border-border/70 bg-background/50 p-3 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-muted-foreground" />
                          <span className="font-medium text-foreground">{r.fileName}</span>
                          <span className="text-muted-foreground">
                            ({formatResumeFileSize(r.fileSize)})
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => activateResume.mutate(r.id)}
                          disabled={activateResume.isPending}
                          className="h-7 text-xs"
                        >
                          Set as Active
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* Section 3: Target Job Description */}
        <section className="rounded-3xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <BriefcaseBusiness className="size-5 text-primary" />
                <h2 className="text-xl font-semibold tracking-tight">Target Job Description</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Paste the job description of the role you want to practice for. The AI will align
                its rubric and evaluation to the role’s exact technical requirements.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowJobForm((open) => !open)}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              {showJobForm ? "Cancel" : "Add Job Description"}
            </Button>
          </div>

          {showJobForm ? (
            <JobDescriptionForm
              onCreated={() => {
                setShowJobForm(false);
                setSaveFeedback("Target job description saved successfully!");
                void client.invalidateQueries({ queryKey: ["job-descriptions"] });
                void client.invalidateQueries({ queryKey: ["career-targets"] });
              }}
            />
          ) : null}

          {/* Current Target Job display */}
          <div className="mt-5">
            {activeTarget ? (
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {activeTarget.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {activeTarget.company ?? "General target"}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary border border-primary/20">
                    Active Target
                  </span>
                </div>
              </div>
            ) : firstSavedJob ? (
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Saved Job: {firstSavedJob.title ?? "Target Role"}
                </h3>
                {firstSavedJob.company ? (
                  <p className="text-xs text-muted-foreground">@ {firstSavedJob.company}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground line-clamp-3">
                  {firstSavedJob.rawText}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                <Briefcase className="mx-auto size-8 text-muted-foreground/60" />
                <p className="mt-2 text-sm font-medium text-foreground">
                  No job description added yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste the requirements for your target role to receive company-specific and
                  role-specific practice.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowJobForm(true)}
                  className="mt-4 gap-1.5"
                >
                  <Plus className="size-3.5" /> Paste Job Description
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="surface p-4 rounded-2xl">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ProfileEditor({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: Profile;
  saving: boolean;
  onSave: (value: Profile) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const update = <K extends keyof Profile>(key: K, next: Profile[K]) =>
    setValue((current) => ({ ...current, [key]: next }));

  return (
    <form
      className="mt-6 space-y-4 border-t border-border pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            htmlFor="profile-preferred-name"
          >
            Preferred Name
          </label>
          <Input
            id="profile-preferred-name"
            maxLength={160}
            value={value.preferredName ?? ""}
            placeholder="e.g. Alex"
            onChange={(event) => update("preferredName", event.target.value || null)}
          />
        </div>
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            htmlFor="profile-profession"
          >
            Profession / Discipline
          </label>
          <Input
            id="profile-profession"
            maxLength={160}
            value={value.profession ?? ""}
            placeholder="e.g. Fullstack Software Engineer"
            onChange={(event) => update("profession", event.target.value || null)}
          />
        </div>
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            htmlFor="profile-target-role"
          >
            Target Role
          </label>
          <Input
            id="profile-target-role"
            maxLength={160}
            value={value.targetRole ?? ""}
            placeholder="e.g. Senior Backend Engineer"
            onChange={(event) => update("targetRole", event.target.value || null)}
          />
        </div>
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            htmlFor="profile-seniority"
          >
            Seniority
          </label>
          <Input
            id="profile-seniority"
            maxLength={160}
            value={value.seniority ?? ""}
            placeholder="e.g. Junior, Mid-level, Senior, Staff"
            onChange={(event) => update("seniority", event.target.value || null)}
          />
        </div>
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            htmlFor="profile-yoe"
          >
            Years of Experience
          </label>
          <Input
            id="profile-yoe"
            type="number"
            max={80}
            min={0}
            value={value.yearsOfExperience ?? ""}
            placeholder="e.g. 5"
            onChange={(event) =>
              update("yearsOfExperience", event.target.value ? Number(event.target.value) : null)
            }
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={saving} type="submit">
          {saving ? "Saving…" : "Save Details"}
        </Button>
      </div>
    </form>
  );
}

function JobDescriptionForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createJob = useMutation({
    mutationFn: async () => {
      if (rawText.trim().length < 100) {
        throw new Error("Job description text must be at least 100 characters.");
      }
      const response = await apiClient<{ jobDescription: JobDescriptionDto }>(
        "/api/v1/job-descriptions",
        {
          method: "POST",
          body: {
            title: title.trim() || undefined,
            company: company.trim() || undefined,
            rawText: rawText.trim(),
          },
        },
      );
      // Create career target to set it as current target
      try {
        await apiClient("/api/v1/career-targets", {
          method: "POST",
          body: {
            title: title.trim() || "Target Role",
            company: company.trim() || undefined,
            jobDescriptionId: response.jobDescription.id,
          },
        });
      } catch {
        // Non-fatal if target creation fails
      }
      return response.jobDescription;
    },
    onSuccess: () => {
      onCreated();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not save job description.");
    },
  });

  return (
    <form
      className="mt-5 space-y-4 rounded-2xl border border-primary/30 bg-primary/[0.03] p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        createJob.mutate();
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        Paste Target Job Description
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="job-title">
            Role Title
          </label>
          <Input
            id="job-title"
            value={title}
            placeholder="e.g. Senior Software Engineer"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="job-company">
            Company (optional)
          </label>
          <Input
            id="job-company"
            value={company}
            placeholder="e.g. Acme Corp"
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground" htmlFor="job-text">
          Job Description (Requirements & Responsibilities)
        </label>
        <textarea
          id="job-text"
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          rows={5}
          value={rawText}
          placeholder="Paste requirements, responsibilities, or the full job posting here (minimum 100 characters)..."
          onChange={(e) => setRawText(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {rawText.trim().length} / 100 minimum characters
        </p>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={createJob.isPending || rawText.trim().length < 100}>
          {createJob.isPending ? "Saving Job…" : "Save Job Description"}
        </Button>
      </div>
    </form>
  );
}

function normalizeProfile(profile: Profile): Profile {
  return {
    ...profile,
    preferredName: normalizedText(profile.preferredName),
    profession: normalizedText(profile.profession),
    targetRole: normalizedText(profile.targetRole),
    seniority: normalizedText(profile.seniority),
  };
}

function normalizedText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function profileSaveErrorMessage(cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.code === "VALIDATION_ERROR") {
      return "Check that text fields are no longer than 160 characters and years of experience is between 0 and 80.";
    }
    if (cause.status === 401 || cause.status === 403) {
      return "Your sign-in session needs to be refreshed before your profile can be saved.";
    }
  }
  return "Could not save your profile right now. Please check your connection and try again.";
}
