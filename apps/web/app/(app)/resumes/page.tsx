"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  Layers,
  Play,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { CareerTargetDto, JobDescriptionDto, Resume } from "@interviewer-ai/types";

import { Button } from "@/components/ui/button";
import { JobDescriptionManager } from "@/features/jobs/components/job-description-manager";
import { TargetJobsManager } from "@/features/jobs/components/target-jobs-manager";
import { ResumeManager } from "@/features/resumes/components/resume-manager";
import { apiClient } from "@/lib/api-client";

type TabKey = "all" | "resumes" | "targets" | "jobs";

export default function ResumesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const careerTargetsQuery = useQuery({
    queryKey: ["career-targets"],
    queryFn: () => apiClient<{ careerTargets: CareerTargetDto[] }>("/api/v1/career-targets"),
  });

  const resumesQuery = useQuery({
    queryKey: ["resumes"],
    queryFn: () => apiClient<{ resumes: Resume[] }>("/api/v1/resumes"),
  });

  const jobDescriptionsQuery = useQuery({
    queryKey: ["job-descriptions"],
    queryFn: () => apiClient<{ jobDescriptions: JobDescriptionDto[] }>("/api/v1/job-descriptions"),
  });

  const activeTarget = careerTargetsQuery.data?.careerTargets?.find(
    (target) => target.status === "ACTIVE",
  );
  const activeResume = resumesQuery.data?.resumes?.find((resume) => resume.isActive);
  const jdCount = jobDescriptionsQuery.data?.jobDescriptions?.length ?? 0;
  const isReadyForTailoredPractice = Boolean(activeResume || activeTarget || jdCount > 0);

  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Top Header & Readiness Strip */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow">Career context & preparation</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
              Resume & Jobs
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Define target positions, upload your latest resume, and save job descriptions to ground
              your AI practice interviews in real-world expectations.
            </p>
          </div>

          {isReadyForTailoredPractice ? (
            <Link href="/interviews/new">
              <Button className="h-10 gap-2 shadow-sm">
                <Play className="size-4 fill-primary-foreground" />
                Practice tailored interview
              </Button>
            </Link>
          ) : null}
        </div>

        {/* Readiness Highlights Ribbon */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-card/50 p-3.5 transition-colors hover:border-border">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Target className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Active Target
                </p>
                <p className="truncate text-xs font-semibold text-foreground">
                  {activeTarget ? activeTarget.title : "None selected"}
                </p>
              </div>
            </div>
            {activeTarget ? (
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3" /> Ready for interviews
              </span>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">Add a target role to track progress</p>
            )}
          </div>

          <div className="rounded-xl border border-border/70 bg-card/50 p-3.5 transition-colors hover:border-border">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Active Resume
                </p>
                <p className="truncate text-xs font-semibold text-foreground">
                  {activeResume ? activeResume.fileName : "None active"}
                </p>
              </div>
            </div>
            {activeResume ? (
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <Sparkles className="size-3" /> Grounding AI questions
              </span>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">Upload a resume to personalize</p>
            )}
          </div>

          <div className="rounded-xl border border-border/70 bg-card/50 p-3.5 transition-colors hover:border-border">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <BriefcaseBusiness className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Job Descriptions
                </p>
                <p className="truncate text-xs font-semibold text-foreground">
                  {jdCount} {jdCount === 1 ? "role" : "roles"} saved
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {jdCount > 0 ? "Tailors questions to exact postings" : "Add job postings to compare skills"}
            </p>
          </div>
        </div>

        {/* Tab Switcher Segmented Control */}
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-border/80 bg-muted/30 p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition-all ${
              activeTab === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="size-3.5" />
            All Context
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("targets")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition-all ${
              activeTab === "targets"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Target className="size-3.5" />
            Target Roles
            {careerTargetsQuery.data?.careerTargets?.length ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary">
                {careerTargetsQuery.data.careerTargets.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("resumes")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition-all ${
              activeTab === "resumes"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="size-3.5" />
            Resumes
            {resumesQuery.data?.resumes?.length ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary">
                {resumesQuery.data.resumes.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("jobs")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition-all ${
              activeTab === "jobs"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BriefcaseBusiness className="size-3.5" />
            Job Descriptions
            {jdCount > 0 ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary">
                {jdCount}
              </span>
            ) : null}
          </button>
        </div>

        {/* Tab Content */}
        <div className="space-y-6 animate-in fade-in duration-200">
          {(activeTab === "all" || activeTab === "targets") && <TargetJobsManager />}
          {(activeTab === "all" || activeTab === "resumes") && <ResumeManager />}
          {(activeTab === "all" || activeTab === "jobs") && <JobDescriptionManager />}
        </div>
      </div>
    </main>
  );
}
