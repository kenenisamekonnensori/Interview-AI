"use client";

import type { SkillProfile } from "@interviewer-ai/types";
import { CircleAlert, LoaderCircle, Mic2 } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { AnalysisCard } from "@/features/skills/components/analysis-card";
import { SkillCard } from "@/features/skills/components/skill-card";
import { groupSkills } from "@/features/skills/lib/group-skills";
import { apiClient } from "@/lib/api-client";

export default function SkillsPage() {
  const skills = useQuery({
    queryKey: ["analytics", "skills"],
    queryFn: () => apiClient<{ skills: SkillProfile }>("/api/v1/analytics/skills"),
  });

  if (skills.isPending) return <Loading />;
  if (skills.error) return <ErrorState onRetry={() => void skills.refetch()} />;

  const profile = skills.data.skills;
  const hasScored = profile.validReportCount > 0;
  const groups = groupSkills(profile.skills);

  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <p className="eyebrow">Skills &amp; Weaknesses</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">
            Your interview skill profile
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            What you consistently do well and where you repeatedly struggle — learned from your
            completed interviews. A single answer never decides a skill; assessments require
            repeated evidence.
          </p>
        </div>

        <AnalysisCard analysis={profile.analysis} validReportCount={profile.validReportCount} />

        {!hasScored ? (
          <section className="surface p-6">
            <p className="font-semibold">Your skill profile will appear here</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              You need completed interviews before we can identify your strengths and weaknesses.
              Finish a simulation and its scored report will start building your skill profile.
            </p>
            <Link
              href="/interviews/new"
              className="button-primary mt-4 inline-flex h-10 px-3 text-sm"
            >
              <Mic2 className="size-4" /> Start an interview
            </Link>
          </section>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted-foreground">
              {profile.validReportCount} scored{" "}
              {profile.validReportCount === 1 ? "interview" : "interviews"} analyzed. Skills with
              fewer than two observations are marked as needing more evidence rather than judged.
            </p>
            {groups.length ? (
              <div className="space-y-6">
                {groups.map((group) => (
                  <section key={group.key} aria-label={group.title}>
                    <h2 className="text-lg font-semibold">{group.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
                    <div className="mt-3 space-y-3">
                      {group.skills.map((skill) => (
                        <SkillCard
                          key={skill.skillKey}
                          skill={skill}
                          insight={profile.analysis?.insights?.[skill.skillKey]}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <section className="surface p-6">
                <p className="font-semibold">Not enough evidence yet</p>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  Complete a couple more scored interviews and your strengths and weaknesses will
                  appear here.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Loading() {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading your skill
        profile…
      </div>
    </main>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
        <CircleAlert className="size-4 text-amber-300" aria-hidden="true" />
        <p className="mt-2">Your skill profile is unavailable right now.</p>
        <div className="mt-3 flex gap-4">
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Try again
          </button>
          <Link href="/history" className="text-sm font-medium text-primary">
            View interview library
          </Link>
        </div>
      </div>
    </main>
  );
}
