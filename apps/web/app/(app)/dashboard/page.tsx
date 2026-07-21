"use client";

import { Sparkles } from "lucide-react";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { authClient } from "@/lib/auth-client";
import { ResumeManager } from "@/features/resumes/components/resume-manager";
import { JobDescriptionManager } from "@/features/jobs/components/job-description-manager";
import { InterviewManager } from "@/features/interviews/components/interview-manager";

export default function DashboardPage() {
  const { data: session } = authClient.useSession();
  const firstName = session?.user.name.split(" ")[0] ?? "there";

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="text-sm font-semibold">Interviewer AI</span>
        </div>
        <SignOutButton />
      </header>
      <section className="py-12 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">Career profile</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Start with your experience, {firstName}.
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            Your resume gives each interview a meaningful, personal starting point.
          </p>
        </div>
        <div className="mt-10">
          <ResumeManager />
        </div>
        <div className="mt-6">
          <JobDescriptionManager />
        </div>
        <div className="mt-6">
          <InterviewManager />
        </div>
      </section>
    </main>
  );
}
