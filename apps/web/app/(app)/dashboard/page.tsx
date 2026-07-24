"use client";

import type { Resume } from "@interviewer-ai/types";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BriefcaseBusiness,
  FileText,
  Plus,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { authClient } from "@/lib/auth-client";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

type Job = { id: string; title: string | null; company: string | null };
type Interview = {
  id: string;
  status: string;
  interviewType: string;
  difficulty: string;
  durationMinutes: number;
  targetRole: string | null;
  createdAt: string;
  jobDescription: { title: string | null } | null;
};

export default function DashboardPage() {
  const { data: session } = authClient.useSession();
  const firstName = session?.user.name.split(" ")[0] ?? "there";
  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => apiClient<{ resumes: Resume[] }>("/api/v1/resumes"),
  });
  const { data: jobs } = useQuery({
    queryKey: ["job-descriptions"],
    queryFn: () => apiClient<{ jobDescriptions: Job[] }>("/api/v1/job-descriptions"),
  });
  const { data: interviews } = useQuery({
    queryKey: ["interviews"],
    queryFn: () => apiClient<{ interviews: Interview[] }>("/api/v1/interviews"),
  });
  const hasProfile = Boolean(resumes?.resumes.length || jobs?.jobDescriptions.length);
  const recent = interviews?.interviews.slice(0, 4) ?? [];
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Sparkles className="size-5" />
          </span>
          <span className="font-semibold">Interviewer AI</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" aria-label="Settings">
            <Settings className="size-4" />
          </Button>
          <SignOutButton />
        </div>
      </header>
      <section className="mt-10 overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_top_right,oklch(0.72_0.16_238_/_18%),transparent_35%),linear-gradient(135deg,oklch(0.22_0.025_260),oklch(0.17_0.018_260))] p-7 sm:p-10">
        <p className="text-sm font-medium text-primary">Your interview workspace</p>
        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Good to see you, {firstName}.
            </h1>
            <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
              {hasProfile
                ? "You have the context you need. Create a tailored practice session whenever you’re ready."
                : "Add your resume and a target role, then we’ll build your first realistic interview."}
            </p>
          </div>
          <Link href="/interviews/new">
            <Button size="lg">
              <Plus className="size-4" />
              Start a new interview
            </Button>
          </Link>
        </div>
      </section>
      {!hasProfile ? (
        <section className="mt-6 rounded-3xl border border-primary/30 bg-primary/10 p-6 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Your first interview starts with your story.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a resume and add a job description to make every question personal.
            </p>
          </div>
          <a className="mt-4 inline-flex text-sm font-medium text-primary sm:mt-0" href="#career">
            Build your profile <ArrowRight className="ml-1 size-4" />
          </a>
        </section>
      ) : null}
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <OverviewCard
          icon={<FileText />}
          label="Resumes"
          value={resumes?.resumes.length ?? 0}
          detail={
            resumes?.resumes.find((item) => item.isActive)?.fileName ?? "Add your first resume"
          }
        />
        <OverviewCard
          icon={<BriefcaseBusiness />}
          label="Target roles"
          value={jobs?.jobDescriptions.length ?? 0}
          detail={jobs?.jobDescriptions[0]?.title ?? "Add a job description"}
        />
        <OverviewCard
          icon={<Target />}
          label="Practice sessions"
          value={interviews?.interviews.length ?? 0}
          detail={
            recent[0]?.status ? `Latest: ${recent[0].status}` : "Your history will appear here"
          }
        />
      </section>
      <section className="mt-10 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Recent interviews</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick up a plan or review your practice history.
              </p>
            </div>
            <Link href="/interviews/new" className="text-sm font-medium text-primary">
              New interview
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {recent.length ? (
              recent.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card/60 p-4"
                >
                  <div>
                    <p className="font-medium">
                      {item.targetRole ?? item.jobDescription?.title ?? "Practice interview"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.interviewType.replace("_", " ")} · {item.difficulty} ·{" "}
                      {item.durationMinutes} min
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {item.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No interviews yet. Your first session is one good question away.
              </div>
            )}
          </div>
        </div>
        <aside id="career" className="rounded-3xl border border-border bg-card/60 p-6">
          <h2 className="text-xl font-semibold">Career context</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Keep your interview materials current so every plan stays relevant.
          </p>
          <div className="mt-5 space-y-3">
            <a
              href="#resumes"
              className="flex items-center justify-between rounded-xl bg-background/50 p-3 text-sm"
            >
              Manage resumes <ArrowRight className="size-4 text-primary" />
            </a>
            <a
              href="#roles"
              className="flex items-center justify-between rounded-xl bg-background/50 p-3 text-sm"
            >
              Manage target roles <ArrowRight className="size-4 text-primary" />
            </a>
          </div>
        </aside>
      </section>
    </main>
  );
}
function OverviewCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <p className="mt-4 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
