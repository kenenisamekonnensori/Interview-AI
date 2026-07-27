"use client";

import type { JobDescriptionDto, Resume } from "@interviewer-ai/types";
import { BriefcaseBusiness, FileText, Pencil, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";

type Profile = {
  preferredName: string | null;
  profession: string | null;
  targetRole: string | null;
  seniority: string | null;
  yearsOfExperience: number | null;
};
type History = { items: Array<{ overallScore: number | null }> };

export function ProfileOverview() {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiClient<{ profile: Profile }>("/api/v1/profile"),
  });
  const resumes = useQuery({
    queryKey: ["resumes"],
    queryFn: () => apiClient<{ resumes: Resume[] }>("/api/v1/resumes"),
  });
  const jobs = useQuery({
    queryKey: ["job-descriptions"],
    queryFn: () => apiClient<{ jobDescriptions: JobDescriptionDto[] }>("/api/v1/job-descriptions"),
  });
  const history = useQuery({
    queryKey: ["analytics", "history", "profile"],
    queryFn: () => apiClient<History>("/api/v1/analytics/history?page=1&pageSize=1"),
  });
  const save = useMutation({
    mutationFn: (body: Profile) => apiClient("/api/v1/profile", { method: "PUT", body }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["profile"] });
      setEditing(false);
    },
  });
  const value = profile.data?.profile;
  if (!value)
    return <main className="p-8 text-sm text-muted-foreground">Loading your profile…</main>;
  const activeResume = resumes.data?.resumes.find((resume) => resume.isActive);
  const resumeAnalysis = useQuery({
    queryKey: ["resume-analysis", activeResume?.id],
    queryFn: () =>
      apiClient<{ analysis: { summary: string; skills: string[] } | null }>(
        `/api/v1/resumes/${activeResume!.id}/analysis`,
      ),
    enabled: Boolean(activeResume?.id),
  });
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-border bg-card/60 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Candidate profile</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">
                {value.preferredName ?? "Your professional profile"}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {[
                  value.profession,
                  value.seniority,
                  value.yearsOfExperience !== null
                    ? `${value.yearsOfExperience} years experience`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Add professional context to personalize practice."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing((current) => !current)}>
                <Pencil className="size-4" /> Edit profile
              </Button>
              <Link href="/interviews/new">
                <Button>
                  <Sparkles className="size-4" /> Start recommended practice
                </Button>
              </Link>
            </div>
          </div>
          {editing ? <Editor initial={value} saving={save.isPending} onSave={save.mutate} /> : null}
        </section>
        <section className="grid gap-4 sm:grid-cols-3">
          <Card
            icon={<BriefcaseBusiness className="size-4" />}
            label="Target role"
            value={value.targetRole ?? "Not set"}
          />
          <Card
            icon={<FileText className="size-4" />}
            label="Active resume"
            value={activeResume?.fileName ?? "No active resume"}
          />
          <Card
            icon={<UserRound className="size-4" />}
            label="Career context"
            value={`${jobs.data?.jobDescriptions.length ?? 0} saved job descriptions`}
          />
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="surface p-5">
            <h2 className="font-semibold">Resume context</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {resumeAnalysis.data?.analysis
                ? `${resumeAnalysis.data.analysis.summary.slice(0, 180)}${resumeAnalysis.data.analysis.summary.length > 180 ? "…" : ""}`
                : activeResume?.status === "ANALYZED"
                  ? "Your active resume is analyzed and ready for tailored questions."
                  : activeResume
                    ? "Your active resume is ready to use."
                    : "Add an active resume to personalize future practice."}
            </p>
          </div>
          <div className="surface p-5">
            <h2 className="font-semibold">Recent practice</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {history.data?.items[0]?.overallScore !== null &&
              history.data?.items[0]?.overallScore !== undefined
                ? `Latest completed practice: ${Math.round(history.data.items[0].overallScore)}/100.`
                : "Complete a practice interview to see your latest insight here."}
            </p>
          </div>
        </section>
        <p className="text-sm">
          <Link className="text-primary underline underline-offset-4" href="/resumes">
            Manage resumes
          </Link>
          <span className="mx-3 text-muted-foreground">·</span>
          <Link className="text-primary underline underline-offset-4" href="/job-descriptions">
            Manage job descriptions
          </Link>
        </p>
      </div>
    </main>
  );
}
function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="surface p-5">
      <p className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </p>
      <p className="mt-2 truncate text-sm text-muted-foreground">{value}</p>
    </div>
  );
}
function Editor({
  initial,
  saving,
  onSave,
}: {
  initial: Profile;
  saving: boolean;
  onSave: (value: Profile) => void;
}) {
  const [value, setValue] = useState(initial);
  const update = <K extends keyof Profile>(key: K, next: Profile[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  return (
    <form
      className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value);
      }}
    >
      <Input
        value={value.preferredName ?? ""}
        placeholder="Preferred name"
        onChange={(event) => update("preferredName", event.target.value || null)}
      />
      <Input
        value={value.profession ?? ""}
        placeholder="Professional identity"
        onChange={(event) => update("profession", event.target.value || null)}
      />
      <Input
        value={value.targetRole ?? ""}
        placeholder="Target role"
        onChange={(event) => update("targetRole", event.target.value || null)}
      />
      <Input
        value={value.seniority ?? ""}
        placeholder="Seniority"
        onChange={(event) => update("seniority", event.target.value || null)}
      />
      <Input
        type="number"
        value={value.yearsOfExperience ?? ""}
        placeholder="Years of experience"
        onChange={(event) =>
          update("yearsOfExperience", event.target.value ? Number(event.target.value) : null)
        }
      />
      <Button disabled={saving} type="submit">
        Save profile
      </Button>
    </form>
  );
}
