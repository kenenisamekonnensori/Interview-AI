"use client";

import type {
  CareerTargetDto,
  InterviewConfiguration,
  InterviewDto,
  JobDescriptionDto,
  NextPracticeRecommendation,
  Resume,
  UsageLimitErrorDetails,
} from "@interviewer-ai/types";
import { interviewTypes } from "@interviewer-ai/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  CircleAlert,
  Clock,
  Code2,
  Cpu,
  FileText,
  LoaderCircle,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LimitReachedNotice, UpgradeNotice } from "@/features/billing/components/upgrade-notice";
import {
  parseEntitlementError,
  parseUsageLimitError,
} from "@/features/billing/lib/billing-helpers";
import { ResumeUploadDropzone } from "@/features/resumes/components/resume-upload-dropzone";
import { resumeAnalysisGuidance } from "@/features/resumes/lib/resume-analysis-guidance";
import { apiClient } from "@/lib/api-client";

type ProfileDefaults = {
  targetRole: string | null;
  profession: string | null;
  preferredLanguage: string;
  defaultInterviewDuration: number;
  defaultDifficulty: InterviewConfiguration["difficulty"];
};

type InterviewStartInput = Pick<InterviewConfiguration, "interviewType"> &
  Partial<Omit<InterviewConfiguration, "interviewType">>;

export function InterviewManager() {
  const router = useRouter();
  const [customOpen, setCustomOpen] = useState(false);
  const [failure, setFailure] = useState<InterviewStartInput | null>(null);
  const [resumeGuidance, setResumeGuidance] = useState<string | null>(null);
  const [planBoundary, setPlanBoundary] = useState<{
    limit: UsageLimitErrorDetails | null;
    feature: string | null;
  } | null>(null);

  // Custom setup states
  const [selectedType, setSelectedType] =
    useState<InterviewConfiguration["interviewType"]>("MIXED");
  const [role, setRole] = useState("");
  const [difficulty, setDifficulty] = useState<InterviewConfiguration["difficulty"] | "">("");
  const [duration, setDuration] = useState<number>(30);

  // Resume selection mode: "active" | "upload" | "saved" | "none"
  const [resumeMode, setResumeMode] = useState<"active" | "upload" | "saved" | "none">("active");
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [uploadedResumeId, setUploadedResumeId] = useState<string | null>(null);

  // Job description selection mode: "active" | "paste" | "saved" | "none"
  const [jobMode, setJobMode] = useState<"active" | "paste" | "saved" | "none">("active");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [careerTargetId, setCareerTargetId] = useState("");
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobCompany, setNewJobCompany] = useState("");
  const [newJobText, setNewJobText] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    const paramRole = params.get("targetRole");
    const paramResumeId = params.get("resumeId");
    const paramJobId = params.get("jobDescriptionId");
    const paramTargetId = params.get("careerTargetId");

    let shouldOpenCustom = false;
    if (type && (interviewTypes as readonly string[]).includes(type)) {
      setSelectedType(type as InterviewConfiguration["interviewType"]);
      shouldOpenCustom = true;
    }
    if (paramRole) {
      setRole(paramRole);
      shouldOpenCustom = true;
    }
    if (paramResumeId) {
      setSelectedResumeId(paramResumeId);
      setResumeMode("saved");
      shouldOpenCustom = true;
    }
    if (paramJobId) {
      setSelectedJobId(paramJobId);
      setJobMode("saved");
      shouldOpenCustom = true;
    }
    if (paramTargetId) {
      setCareerTargetId(paramTargetId);
      shouldOpenCustom = true;
    }
    if (shouldOpenCustom) {
      setCustomOpen(true);
    }
  }, []);

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
  const careerTargets = useQuery({
    queryKey: ["career-targets"],
    queryFn: () => apiClient<{ careerTargets: CareerTargetDto[] }>("/api/v1/career-targets"),
  });
  const nextPractice = useQuery({
    queryKey: ["analytics", "next-practice"],
    queryFn: () =>
      apiClient<{ recommendation: NextPracticeRecommendation }>("/api/v1/analytics/next-practice"),
  });

  const activeResume = useMemo(
    () =>
      resumes.data?.resumes.find(
        (resume) => resume.isActive && ["READY", "ANALYZING", "ANALYZED"].includes(resume.status),
      ),
    [resumes.data],
  );
  const activeTarget = useMemo(
    () => careerTargets.data?.careerTargets.find((target) => target.status === "ACTIVE"),
    [careerTargets.data],
  );
  const relevantJob = useMemo(
    () =>
      jobs.data?.jobDescriptions.find((job) => job.status === "ANALYZED" || job.status === "READY"),
    [jobs.data],
  );

  const defaults = profile.data?.profile;

  // Determine if the user has set up a profile context
  const hasProfile = Boolean(
    (defaults?.targetRole && defaults.targetRole.trim() !== "") ||
    defaults?.profession ||
    activeResume ||
    relevantJob ||
    activeTarget,
  );

  const fallbackRecommendation = useMemo<InterviewConfiguration>(
    () => ({
      interviewType: "MIXED",
      difficulty: defaults?.defaultDifficulty ?? "MEDIUM",
      durationMinutes: defaults?.defaultInterviewDuration ?? 30,
      language: defaults?.preferredLanguage ?? "en",
      targetRole:
        defaults?.targetRole ??
        defaults?.profession ??
        relevantJob?.title ??
        "General interview practice",
      ...(activeResume ? { resumeId: activeResume.id } : {}),
      ...(relevantJob ? { jobDescriptionId: relevantJob.id } : {}),
      ...(activeTarget ? { careerTargetId: activeTarget.id } : {}),
    }),
    [activeResume, activeTarget, defaults, relevantJob],
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
    onError: (cause) => {
      const usageLimit = parseUsageLimitError(cause);
      if (usageLimit) {
        setPlanBoundary({ limit: usageLimit, feature: null });
        return;
      }
      const entitlement = parseEntitlementError(cause);
      if (entitlement) {
        setPlanBoundary({ limit: null, feature: entitlement.feature });
        return;
      }
      setFailure(cause instanceof PreparationError ? cause.configuration : fallbackRecommendation);
    },
  });

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
        ...(recommendation.careerTargetId ? { careerTargetId: recommendation.careerTargetId } : {}),
      }
    : fallbackRecommendation;

  const startInterview = (configuration: InterviewStartInput) => {
    const resume = configuration.resumeId
      ? resumes.data?.resumes.find((candidate) => candidate.id === configuration.resumeId)
      : null;
    if (resume && resume.status !== "ANALYZED") {
      setResumeGuidance(resumeAnalysisGuidance(resume));
      setCustomOpen(true);
      return;
    }
    setResumeGuidance(null);
    launch.mutate(configuration);
  };

  const handleStartCustom = async () => {
    let finalJobId: string | undefined = undefined;

    // If user typed a new job description inline
    if (jobMode === "paste" && newJobText.trim().length >= 100) {
      try {
        const res = await apiClient<{ jobDescription: JobDescriptionDto }>(
          "/api/v1/job-descriptions",
          {
            method: "POST",
            body: {
              title: newJobTitle.trim() || undefined,
              company: newJobCompany.trim() || undefined,
              rawText: newJobText.trim(),
            },
          },
        );
        finalJobId = res.jobDescription.id;
      } catch (err) {
        console.error("Failed to create inline job description", err);
      }
    } else if (jobMode === "active" && relevantJob) {
      finalJobId = relevantJob.id;
    } else if (jobMode === "saved" && selectedJobId) {
      finalJobId = selectedJobId;
    }

    let finalResumeId: string | undefined = undefined;
    if (resumeMode === "active" && activeResume) {
      finalResumeId = activeResume.id;
    } else if (resumeMode === "upload" && uploadedResumeId) {
      finalResumeId = uploadedResumeId;
    } else if (resumeMode === "saved" && selectedResumeId) {
      finalResumeId = selectedResumeId;
    }

    const config: InterviewStartInput = {
      interviewType: selectedType,
      difficulty: difficulty || defaults?.defaultDifficulty || "MEDIUM",
      durationMinutes: duration || defaults?.defaultInterviewDuration || 30,
      language: defaults?.preferredLanguage || "en",
      ...(role.trim()
        ? { targetRole: role.trim() }
        : defaults?.targetRole
          ? { targetRole: defaults.targetRole }
          : {}),
      ...(finalResumeId ? { resumeId: finalResumeId } : {}),
      ...(finalJobId ? { jobDescriptionId: finalJobId } : {}),
      ...(careerTargetId && jobMode === "active" ? { careerTargetId } : {}),
    };

    startInterview(config);
  };

  if (planBoundary) {
    return (
      <div className="space-y-4">
        {planBoundary.limit ? (
          <LimitReachedNotice
            details={planBoundary.limit}
            onDismiss={() => setPlanBoundary(null)}
          />
        ) : planBoundary.feature ? (
          <UpgradeNotice feature={planBoundary.feature} />
        ) : null}
        <button
          type="button"
          onClick={() => setPlanBoundary(null)}
          className="text-sm font-medium text-muted-foreground underline underline-offset-4"
        >
          Back to practice options
        </button>
      </div>
    );
  }

  if (failure) {
    return (
      <RecoveryCard
        onRetry={() => {
          setFailure(null);
          startInterview(failure);
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
  }

  return (
    <div className="space-y-6">
      {/* Recommended Practice Card */}
      <section className="rounded-3xl border border-primary/30 bg-[radial-gradient(circle_at_100%_0%,oklch(0.7_0.16_280_/_18%),transparent_26rem)] p-6 shadow-xl shadow-black/10 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="size-3.5" />
                {hasProfile ? "Profile-based recommendation" : "Intake & Discovery Session"}
              </span>
            </div>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {hasProfile
                ? `Practice for ${recommended.targetRole}`
                : "General Practice Interview (Get to Know You)"}
            </h2>

            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
              {hasProfile
                ? (recommendation?.reasons.join(" ") ??
                  `Tailored to ${[
                    activeTarget ? `your target (${activeTarget.title})` : null,
                    activeResume ? `your resume (${activeResume.fileName})` : null,
                    defaults?.targetRole ? `role (${defaults.targetRole})` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}.`)
                : "Start right away! Since you haven't set up your profile yet, the AI interviewer will begin with a conversational get-to-know-you session to learn about your background, career goals, and experience."}
            </p>

            {!hasProfile ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Want role-specific practice instead?{" "}
                <Link
                  href="/profile"
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  Set up your profile first
                </Link>
              </p>
            ) : null}
          </div>

          <Button
            size="lg"
            onClick={() => startInterview(recommended)}
            disabled={launch.isPending}
            className="shrink-0 h-12 px-6 text-base shadow-md"
          >
            {launch.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {launch.isPending
              ? "Preparing your interview…"
              : hasProfile
                ? "Start Recommended Practice"
                : "Start General Practice"}
          </Button>
        </div>
        {launch.isPending ? <PreparationProgress /> : null}
      </section>

      {/* Custom Interview Section */}
      <section className="rounded-3xl border border-border bg-card/60 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <SlidersHorizontal className="size-4 text-primary" /> Custom Interview
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure a brand new interview from scratch, or choose specific pieces of your
              profile.
            </p>
          </div>
          <Button
            variant={customOpen ? "default" : "outline"}
            onClick={() => setCustomOpen((value) => !value)}
          >
            {customOpen ? "Collapse Setup" : "Create Custom Interview"}
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>

        {customOpen ? (
          <div className="mt-7 space-y-6 border-t border-border pt-6">
            {/* Interview Type Selector */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Select Interview Type
              </label>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { id: "MIXED", label: "Mixed", icon: Sparkles, desc: "Technical & behavioral" },
                  {
                    id: "TECHNICAL",
                    label: "Technical",
                    icon: Cpu,
                    desc: "Concepts & architecture",
                  },
                  {
                    id: "BEHAVIORAL",
                    label: "Behavioral",
                    icon: Users,
                    desc: "STAR stories & culture",
                  },
                  { id: "CODING", label: "Coding", icon: Code2, desc: "Algorithms & logic" },
                  {
                    id: "SYSTEM_DESIGN",
                    label: "System Design",
                    icon: Target,
                    desc: "Scale & trade-offs",
                  },
                  {
                    id: "HR",
                    label: "HR / Fit",
                    icon: UserCheck,
                    desc: "Career goals & background",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = selectedType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setSelectedType(item.id as InterviewConfiguration["interviewType"])
                      }
                      className={`flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                          : "border-border bg-background/50 hover:border-border hover:bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon
                          className={`size-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                        />
                        <span className="text-xs font-semibold text-foreground">{item.label}</span>
                      </div>
                      <span className="mt-1 text-[11px] text-muted-foreground leading-tight line-clamp-1">
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Role & Level */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    htmlFor="custom-target-role"
                  >
                    2. Target Role
                  </label>
                  {defaults?.targetRole && role !== defaults.targetRole ? (
                    <button
                      type="button"
                      onClick={() => setRole(defaults.targetRole!)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Use Profile Role ({defaults.targetRole})
                    </button>
                  ) : null}
                </div>
                <Input
                  id="custom-target-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder={defaults?.targetRole ?? "e.g. Senior Frontend Engineer"}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  htmlFor="custom-difficulty"
                >
                  Difficulty Level
                </label>
                <select
                  id="custom-difficulty"
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={difficulty}
                  onChange={(e) =>
                    setDifficulty(e.target.value as InterviewConfiguration["difficulty"] | "")
                  }
                >
                  <option value="">
                    Profile default ({defaults?.defaultDifficulty ?? "MEDIUM"})
                  </option>
                  {["EASY", "MEDIUM", "HARD", "EXPERT"].map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Duration Selector */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Session Duration
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDuration(mins)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-all ${
                      duration === mins
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background hover:bg-card text-foreground"
                    }`}
                  >
                    <Clock className="size-3.5" />
                    {mins} minutes
                  </button>
                ))}
              </div>
            </div>

            {/* Resume Source Choice */}
            <div className="space-y-3 rounded-2xl border border-border/80 bg-background/40 p-4 sm:p-5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <FileText className="size-4 text-primary" /> 3. Candidate Resume Context
              </label>

              <div className="flex flex-wrap gap-2">
                {activeResume ? (
                  <button
                    type="button"
                    onClick={() => setResumeMode("active")}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                      resumeMode === "active"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Use Profile Resume ({activeResume.fileName})
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setResumeMode("upload")}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                    resumeMode === "upload"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Plus className="inline size-3 mr-1" /> Upload Brand New Resume
                </button>

                {(resumes.data?.resumes ?? []).length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setResumeMode("saved")}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                      resumeMode === "saved"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Select From Saved ({resumes.data?.resumes.length})
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setResumeMode("none")}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                    resumeMode === "none"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  No Resume (General)
                </button>
              </div>

              {resumeMode === "upload" ? (
                <div className="mt-3">
                  <ResumeUploadDropzone
                    variant="compact"
                    onUploadSuccess={(result) => {
                      setUploadedResumeId(result.resume.id);
                      setResumeGuidance(
                        result.analysis === "started"
                          ? "AI analysis has started for this resume. Wait until it is ready before starting the interview."
                          : "The resume uploaded, but analysis could not start. Use Analyze resume from your profile and try again.",
                      );
                    }}
                  />
                  {uploadedResumeId ? (
                    <p className="mt-2 text-xs font-medium text-emerald-500 flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5" /> Resume uploaded and selected for this
                      session!
                    </p>
                  ) : null}
                </div>
              ) : resumeMode === "saved" ? (
                <select
                  className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={selectedResumeId}
                  onChange={(e) => setSelectedResumeId(e.target.value)}
                >
                  <option value="">Select a saved resume</option>
                  {(resumes.data?.resumes ?? [])
                    .filter((r) => r.status !== "DELETED" && r.status !== "PENDING_UPLOAD")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.fileName} {r.isActive ? "· (Active)" : ""}{" "}
                        {r.status === "ANALYZING"
                          ? "· (Extracting skills…)"
                          : r.status === "FAILED"
                            ? "· (Analysis incomplete)"
                            : ""}
                      </option>
                    ))}
                </select>
              ) : null}

              {resumeGuidance ? (
                <div
                  className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground"
                  role="alert"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <span>{resumeGuidance}</span>
                </div>
              ) : null}
            </div>

            {/* Job Description Source Choice */}
            <div className="space-y-3 rounded-2xl border border-border/80 bg-background/40 p-4 sm:p-5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Briefcase className="size-4 text-primary" /> 4. Job Description & Requirements
              </label>

              <div className="flex flex-wrap gap-2">
                {relevantJob ? (
                  <button
                    type="button"
                    onClick={() => setJobMode("active")}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                      jobMode === "active"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Use Saved Job ({relevantJob.title ?? "Current Target"})
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setJobMode("paste")}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                    jobMode === "paste"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Plus className="inline size-3 mr-1" /> Paste Brand New Job Description
                </button>

                {(jobs.data?.jobDescriptions ?? []).length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setJobMode("saved")}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                      jobMode === "saved"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Select From Saved ({jobs.data?.jobDescriptions.length})
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setJobMode("none")}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                    jobMode === "none"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  No Job Description
                </button>
              </div>

              {jobMode === "paste" ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Role Title (e.g. Senior Backend Engineer)"
                      value={newJobTitle}
                      onChange={(e) => setNewJobTitle(e.target.value)}
                    />
                    <Input
                      placeholder="Company Name (e.g. Stripe, Google)"
                      value={newJobCompany}
                      onChange={(e) => setNewJobCompany(e.target.value)}
                    />
                  </div>
                  <textarea
                    className="w-full rounded-xl border border-input bg-background p-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    rows={4}
                    placeholder="Paste the job description and requirements here (minimum 100 characters)..."
                    value={newJobText}
                    onChange={(e) => setNewJobText(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {newJobText.trim().length} / 100 minimum characters
                  </p>
                </div>
              ) : jobMode === "saved" ? (
                <select
                  className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                >
                  <option value="">Select a saved job description</option>
                  {(jobs.data?.jobDescriptions ?? []).map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title ?? "Job description"} {j.company ? `@ ${j.company}` : ""}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            {/* Launch CTA */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <p className="text-xs text-muted-foreground">
                Session will start with a {selectedType.toLowerCase().replace("_", " ")} focus for{" "}
                {role.trim() || defaults?.targetRole || "general practice"}.
              </p>
              <Button
                size="lg"
                onClick={handleStartCustom}
                disabled={
                  launch.isPending ||
                  (jobMode === "paste" &&
                    newJobText.trim().length > 0 &&
                    newJobText.trim().length < 100)
                }
                className="h-11 px-6 gap-2"
              >
                {launch.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                {launch.isPending ? "Preparing custom interview…" : "Start Custom Interview"}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <Link className="underline underline-offset-4" href="/profile">
          Manage your candidate profile
        </Link>
        <span>·</span>
        <Link className="underline underline-offset-4" href="/resumes">
          Manage your resumes and target jobs
        </Link>
      </p>
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
        Your setup is still safe. You can try again, adjust it, or start with a simpler session.
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
